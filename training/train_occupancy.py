"""
Train the occupancy classifier (binary: empty / occupied).

Architecture: MobileNetV3-Small with custom classification head.
Input: 100x100 RGB square crops
Output: 2-class softmax

Uses MPS (Apple Silicon GPU) when available, falls back to CPU.
"""

import argparse
import os
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


def create_model(num_classes: int = 2, pretrained: bool = True) -> nn.Module:
    """Create MobileNetV3-Small with custom head."""
    weights = models.MobileNet_V3_Small_Weights.DEFAULT if pretrained else None
    model = models.mobilenet_v3_small(weights=weights)

    # Replace classifier head
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(256, num_classes),
    )
    return model


def get_transforms(input_size: int = 224):
    """Training and validation transforms.

    Uses 224x224 to match MobileNetV3 pretrained weights (ImageNet resolution).
    """
    train_transform = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    val_transform = transforms.Compose([
        transforms.Resize((input_size, input_size)),
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
    parser = argparse.ArgumentParser(description="Train occupancy classifier")
    parser.add_argument("--data", type=str, default="datasets/augmented/occupancy", help="Dataset directory")
    parser.add_argument("--epochs", type=int, default=30, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size")
    parser.add_argument("--lr", type=float, default=1e-3, help="Learning rate")
    parser.add_argument("--output", type=str, default="models", help="Output directory for saved model")
    parser.add_argument("--val-split", type=float, default=0.15, help="Validation split ratio")
    args = parser.parse_args()

    device = get_device()
    print(f"Device: {device}")

    data_dir = Path(args.data)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_transform, val_transform = get_transforms(input_size=224)

    # Create two separate ImageFolder instances to avoid shared .dataset corruption
    train_full = datasets.ImageFolder(str(data_dir), transform=train_transform)
    val_full = datasets.ImageFolder(str(data_dir), transform=val_transform)
    class_names = train_full.classes
    print(f"Classes: {class_names}")
    print(f"Total samples: {len(train_full)}")

    # Generate the same split indices for both
    val_size = int(len(train_full) * args.val_split)
    train_size = len(train_full) - val_size
    indices = torch.randperm(len(train_full), generator=torch.Generator().manual_seed(42)).tolist()
    train_indices = indices[:train_size]
    val_indices = indices[train_size:]

    train_dataset = torch.utils.data.Subset(train_full, train_indices)
    val_dataset = torch.utils.data.Subset(val_full, val_indices)

    print(f"Train: {train_size}, Val: {val_size}")

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    # Create model
    model = create_model(num_classes=2).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="min", patience=5, factor=0.5)

    best_val_acc = 0.0

    for epoch in range(args.epochs):
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
            torch.save(model.state_dict(), output_dir / "occupancy_best.pth")
            print(f"  -> Saved best model (val_acc={val_acc:.4f})")

    # Final evaluation
    print("\n--- Final Evaluation ---")
    model.load_state_dict(torch.load(output_dir / "occupancy_best.pth", weights_only=True))
    _, final_acc, final_preds, final_labels = validate(model, val_loader, criterion, device)
    print(f"Best validation accuracy: {final_acc:.4f}")
    print(classification_report(final_labels, final_preds, target_names=class_names))
    print("Confusion matrix:")
    print(confusion_matrix(final_labels, final_preds))

    # Save class names mapping
    with open(output_dir / "occupancy_classes.txt", "w") as f:
        for i, name in enumerate(class_names):
            f.write(f"{i},{name}\n")

    print(f"\nModel saved to {output_dir / 'occupancy_best.pth'}")


if __name__ == "__main__":
    main()
