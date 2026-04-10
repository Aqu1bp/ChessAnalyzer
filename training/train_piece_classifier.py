"""
Train the piece classifier (12 classes: wK, wQ, wR, wB, wN, wP, bK, bQ, bR, bB, bN, bP).

Architecture: MobileNetV3-Small with custom classification head.
Input: 100x200 RGB piece crops (rectangular, extending upward from square)
Output: 12-class softmax

Only runs on squares classified as occupied by the occupancy model.
Uses MPS (Apple Silicon GPU) when available, falls back to CPU.
"""

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import classification_report, confusion_matrix
from tqdm import tqdm


def get_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def create_model(num_classes: int = 12, pretrained: bool = True) -> nn.Module:
    """Create MobileNetV3-Small with custom head for piece classification."""
    weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    model = models.mobilenet_v3_small(weights=weights)

    # Replace classifier head
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(512, num_classes),
    )
    return model


def get_transforms():
    """Training and validation transforms for 100x200 piece crops."""
    # MobileNetV3 expects 224x224; we resize the 100x200 crops
    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.3),
        transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.15, hue=0.05),
        transforms.RandomRotation(5),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    return train_transform, val_transform


def train_epoch(model, dataloader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, labels in dataloader:
        inputs, labels = inputs.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * inputs.size(0)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

    return running_loss / total, correct / total


def validate(model, dataloader, criterion, device):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for inputs, labels in dataloader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * inputs.size(0)
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

            all_preds.extend(predicted.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

    return running_loss / total, correct / total, np.array(all_preds), np.array(all_labels)


def main():
    parser = argparse.ArgumentParser(description="Train piece classifier")
    parser.add_argument("--data", type=str, default="datasets/augmented/pieces", help="Dataset directory")
    parser.add_argument("--epochs", type=int, default=40, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--output", type=str, default="models", help="Output directory")
    parser.add_argument("--val-split", type=float, default=0.15, help="Validation split ratio")
    parser.add_argument("--freeze-epochs", type=int, default=5, help="Epochs to train head only before unfreezing")
    args = parser.parse_args()

    device = get_device()
    print(f"Device: {device}")

    data_dir = Path(args.data)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_transform, val_transform = get_transforms()

    # Load dataset
    full_dataset = datasets.ImageFolder(str(data_dir), transform=train_transform)
    class_names = full_dataset.classes
    print(f"Classes ({len(class_names)}): {class_names}")
    print(f"Total samples: {len(full_dataset)}")

    # Print class distribution
    class_counts = {}
    for _, label in full_dataset.samples:
        name = class_names[label]
        class_counts[name] = class_counts.get(name, 0) + 1
    for name, count in sorted(class_counts.items()):
        print(f"  {name}: {count}")

    # Split
    val_size = int(len(full_dataset) * args.val_split)
    train_size = len(full_dataset) - val_size
    train_dataset, val_dataset = torch.utils.data.random_split(
        full_dataset, [train_size, val_size],
        generator=torch.Generator().manual_seed(42),
    )

    # Override val transform
    val_dataset.dataset = datasets.ImageFolder(str(data_dir), transform=val_transform)

    print(f"Train: {train_size}, Val: {val_size}")

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Create model
    model = create_model(num_classes=len(class_names)).to(device)

    # Class weights for imbalanced data
    total_samples = sum(class_counts.values())
    weights = torch.tensor(
        [total_samples / (len(class_names) * class_counts.get(name, 1)) for name in class_names],
        dtype=torch.float32,
    ).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)

    # Phase 1: Train head only
    print(f"\n--- Phase 1: Head-only training ({args.freeze_epochs} epochs) ---")
    for param in model.features.parameters():
        param.requires_grad = False

    optimizer = optim.Adam(model.classifier.parameters(), lr=args.lr)

    for epoch in range(args.freeze_epochs):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc, _, _ = validate(model, val_loader, criterion, device)
        print(
            f"Epoch {epoch+1}/{args.freeze_epochs} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f}"
        )

    # Phase 2: Unfreeze and fine-tune full model
    print(f"\n--- Phase 2: Full model fine-tuning ({args.epochs - args.freeze_epochs} epochs) ---")
    for param in model.features.parameters():
        param.requires_grad = True

    optimizer = optim.Adam(model.parameters(), lr=args.lr * 0.1)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5, factor=0.5)

    best_val_acc = 0.0

    for epoch in range(args.freeze_epochs, args.epochs):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc, val_preds, val_labels = validate(model, val_loader, criterion, device)
        scheduler.step(val_loss)

        lr = optimizer.param_groups[0]["lr"]
        print(
            f"Epoch {epoch+1}/{args.epochs} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} | "
            f"LR: {lr:.6f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), output_dir / "piece_classifier_best.pth")
            print(f"  -> Saved best model (val_acc={val_acc:.4f})")

    # Final evaluation
    print("\n--- Final Evaluation ---")
    model.load_state_dict(torch.load(output_dir / "piece_classifier_best.pth", weights_only=True))
    _, final_acc, final_preds, final_labels = validate(model, val_loader, criterion, device)
    print(f"Best validation accuracy: {final_acc:.4f}")
    print(classification_report(final_labels, final_preds, target_names=class_names))
    print("Confusion matrix:")
    print(confusion_matrix(final_labels, final_preds))

    # Save class names
    with open(output_dir / "piece_classes.txt", "w") as f:
        for i, name in enumerate(class_names):
            f.write(f"{i},{name}\n")

    print(f"\nModel saved to {output_dir / 'piece_classifier_best.pth'}")


if __name__ == "__main__":
    main()
