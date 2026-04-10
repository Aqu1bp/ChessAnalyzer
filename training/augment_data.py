"""
Augment chess square training data using albumentations.

Reads from one or more source dataset directories and produces augmented
copies. Designed to run on the output of generate_synthetic_data.py and
generate_screen_data.py.

Augmentations are tuned for chess square crops:
- Color jitter (lighting variation)
- Slight rotation (imperfect alignment)
- Gaussian blur/noise (camera quality)
- Minor perspective warp (overlay misalignment)
- Brightness/contrast (screen vs physical variation)
"""

import argparse
import os
import random
from pathlib import Path

import albumentations as A
import cv2
import numpy as np
from tqdm import tqdm


# Augmentation pipeline for occupancy crops (100x100)
occupancy_transform = A.Compose([
    A.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.05, p=0.8),
    A.Rotate(limit=5, border_mode=cv2.BORDER_REFLECT_101, p=0.5),
    A.GaussianBlur(blur_limit=(3, 5), p=0.3),
    A.GaussNoise(std_range=(0.02, 0.1), p=0.3),
    A.Perspective(scale=(0.02, 0.05), p=0.3),
    A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.5),
    A.ImageCompression(quality_range=(60, 95), p=0.2),
])

# Augmentation pipeline for piece crops (100x200)
piece_transform = A.Compose([
    A.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3, hue=0.05, p=0.8),
    A.Rotate(limit=5, border_mode=cv2.BORDER_REFLECT_101, p=0.5),
    A.GaussianBlur(blur_limit=(3, 5), p=0.3),
    A.GaussNoise(std_range=(0.02, 0.1), p=0.3),
    A.Perspective(scale=(0.02, 0.05), p=0.3),
    A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.5),
    A.ImageCompression(quality_range=(60, 95), p=0.2),
    A.ShiftScaleRotate(shift_limit=0.05, scale_limit=0.05, rotate_limit=3, p=0.3),
])


def augment_directory(
    src_dir: Path,
    dst_dir: Path,
    transform: A.Compose,
    augments_per_image: int = 5,
    max_per_class: int = 0,
):
    """Augment all images in src_dir and save to dst_dir."""
    dst_dir.mkdir(parents=True, exist_ok=True)

    images = list(src_dir.glob("*.png")) + list(src_dir.glob("*.jpg"))
    if not images:
        return 0

    # If max_per_class is set and we'd exceed it, reduce augments
    if max_per_class > 0:
        total_target = len(images) * (1 + augments_per_image)
        if total_target > max_per_class:
            augments_per_image = max(0, (max_per_class // len(images)) - 1)

    count = 0
    for img_path in images:
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Copy original
        stem = img_path.stem
        out_path = dst_dir / f"{stem}_orig.png"
        cv2.imwrite(str(out_path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        count += 1

        # Generate augmented copies
        for aug_idx in range(augments_per_image):
            augmented = transform(image=img)["image"]
            out_path = dst_dir / f"{stem}_aug{aug_idx}.png"
            cv2.imwrite(str(out_path), cv2.cvtColor(augmented, cv2.COLOR_RGB2BGR))
            count += 1

    return count


def main():
    parser = argparse.ArgumentParser(description="Augment chess training data")
    parser.add_argument(
        "--sources",
        nargs="+",
        default=["datasets/synthetic", "datasets/screen"],
        help="Source dataset directories",
    )
    parser.add_argument("--output", type=str, default="datasets/augmented", help="Output directory")
    parser.add_argument("--augments-per-image", type=int, default=5, help="Augmented copies per original")
    parser.add_argument("--max-per-class", type=int, default=10000, help="Max samples per class (0=unlimited)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    output = Path(args.output)

    print(f"Sources: {args.sources}")
    print(f"Augments per image: {args.augments_per_image}")
    print(f"Output: {output}")

    # Process occupancy data
    print("\n--- Occupancy Augmentation ---")
    for label in ["empty", "occupied"]:
        all_sources = []
        for src in args.sources:
            src_dir = Path(src) / "occupancy" / label
            if src_dir.exists():
                all_sources.append(src_dir)

        # Merge sources into a temp staging area, then augment
        staging = output / "occupancy_staging" / label
        staging.mkdir(parents=True, exist_ok=True)

        for src_dir in all_sources:
            for img_path in src_dir.glob("*.png"):
                # Copy with source prefix to avoid name collisions
                dst = staging / f"{src_dir.parent.parent.name}_{img_path.name}"
                if not dst.exists():
                    import shutil
                    shutil.copy2(img_path, dst)

        dst_dir = output / "occupancy" / label
        count = augment_directory(staging, dst_dir, occupancy_transform, args.augments_per_image, args.max_per_class)
        print(f"  {label}: {count} samples")

    # Process piece data
    print("\n--- Piece Augmentation ---")
    piece_labels = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]
    for piece_label in piece_labels:
        all_sources = []
        for src in args.sources:
            src_dir = Path(src) / "pieces" / piece_label
            if src_dir.exists():
                all_sources.append(src_dir)

        staging = output / "pieces_staging" / piece_label
        staging.mkdir(parents=True, exist_ok=True)

        for src_dir in all_sources:
            for img_path in src_dir.glob("*.png"):
                dst = staging / f"{src_dir.parent.parent.name}_{img_path.name}"
                if not dst.exists():
                    import shutil
                    shutil.copy2(img_path, dst)

        dst_dir = output / "pieces" / piece_label
        count = augment_directory(staging, dst_dir, piece_transform, args.augments_per_image, args.max_per_class)
        print(f"  {piece_label}: {count} samples")

    # Cleanup staging
    import shutil
    staging_occ = output / "occupancy_staging"
    staging_pieces = output / "pieces_staging"
    if staging_occ.exists():
        shutil.rmtree(staging_occ)
    if staging_pieces.exists():
        shutil.rmtree(staging_pieces)

    print("\nDone! Staging directories cleaned up.")


if __name__ == "__main__":
    main()
