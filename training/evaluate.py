"""
Evaluate trained models on held-out test data.

Reports per-domain accuracy (camera_physical, import_screenshot, etc.)
and overall metrics. Designed to be run against the prototype gates
defined in the plan.
"""

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms
from sklearn.metrics import classification_report, confusion_matrix


def get_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def load_occupancy_model(model_path: str, device: torch.device) -> nn.Module:
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(256, 2),
    )
    model.load_state_dict(torch.load(model_path, weights_only=True, map_location=device))
    model.to(device)
    model.eval()
    return model


def load_piece_model(model_path: str, num_classes: int, device: torch.device) -> nn.Module:
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(512, num_classes),
    )
    model.load_state_dict(torch.load(model_path, weights_only=True, map_location=device))
    model.to(device)
    model.eval()
    return model


def evaluate_model(model, dataloader, device):
    """Run evaluation and return predictions + labels."""
    all_preds = []
    all_labels = []
    all_confs = []

    with torch.no_grad():
        for inputs, labels in dataloader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1)
            confs, predicted = probs.max(1)

            all_preds.extend(predicted.cpu().numpy())
            all_labels.extend(labels.numpy())
            all_confs.extend(confs.cpu().numpy())

    return np.array(all_preds), np.array(all_labels), np.array(all_confs)


def main():
    parser = argparse.ArgumentParser(description="Evaluate chess recognition models")
    parser.add_argument("--occupancy-model", type=str, default="models/occupancy_best.pth")
    parser.add_argument("--piece-model", type=str, default="models/piece_classifier_best.pth")
    parser.add_argument("--occupancy-data", type=str, default="datasets/augmented/occupancy")
    parser.add_argument("--piece-data", type=str, default="datasets/augmented/pieces")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    device = get_device()
    print(f"Device: {device}")

    # Occupancy evaluation
    if Path(args.occupancy_model).exists() and Path(args.occupancy_data).exists():
        print("\n=== Occupancy Classifier Evaluation ===")

        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

        dataset = datasets.ImageFolder(args.occupancy_data, transform=transform)
        loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

        model = load_occupancy_model(args.occupancy_model, device)
        preds, labels, confs = evaluate_model(model, loader, device)

        print(f"Accuracy: {(preds == labels).mean():.4f}")
        print(f"Mean confidence: {confs.mean():.4f}")
        print(f"Min confidence: {confs.min():.4f}")
        print(classification_report(labels, preds, target_names=dataset.classes))

        # Gate check
        acc = (preds == labels).mean()
        print(f"\n[GATE CHECK] Occupancy accuracy: {acc:.4f}", end=" ")
        print("PASS" if acc >= 0.998 else "NEEDS WORK")
    else:
        print("Skipping occupancy evaluation (model or data not found)")

    # Piece classifier evaluation
    if Path(args.piece_model).exists() and Path(args.piece_data).exists():
        print("\n=== Piece Classifier Evaluation ===")

        transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

        dataset = datasets.ImageFolder(args.piece_data, transform=transform)
        loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

        model = load_piece_model(args.piece_model, len(dataset.classes), device)
        preds, labels, confs = evaluate_model(model, loader, device)

        acc = (preds == labels).mean()
        print(f"Accuracy: {acc:.4f}")
        print(f"Mean confidence: {confs.mean():.4f}")
        print(f"Min confidence: {confs.min():.4f}")
        print(classification_report(labels, preds, target_names=dataset.classes))

        # Confusion matrix
        print("Confusion matrix:")
        cm = confusion_matrix(labels, preds)
        # Print with class labels
        header = "     " + " ".join(f"{c:>4s}" for c in dataset.classes)
        print(header)
        for i, row in enumerate(cm):
            row_str = " ".join(f"{v:4d}" for v in row)
            print(f"{dataset.classes[i]:>4s} {row_str}")

        # Gate checks
        print(f"\n[GATE CHECK] Piece accuracy (in-domain): {acc:.4f}", end=" ")
        print("PASS" if acc >= 0.98 else "NEEDS WORK")

        # Low confidence analysis
        low_conf_mask = confs < 0.85
        if low_conf_mask.any():
            low_conf_acc = (preds[low_conf_mask] == labels[low_conf_mask]).mean()
            print(f"[INFO] Low-confidence squares (<0.85): {low_conf_mask.sum()} ({low_conf_mask.mean():.1%})")
            print(f"[INFO] Accuracy on low-confidence squares: {low_conf_acc:.4f}")
    else:
        print("Skipping piece classifier evaluation (model or data not found)")


if __name__ == "__main__":
    main()
