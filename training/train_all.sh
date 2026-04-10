#!/bin/bash
# Train both models sequentially, then export to ONNX.
# Run this and go to sleep — it chains everything.

set -e
cd "$(dirname "$0")"
source .venv/bin/activate

echo "=== $(date) === Starting full training pipeline"

# Step 1: Check if occupancy already trained
if [ ! -f models/occupancy_classes.txt ]; then
  echo "=== $(date) === Training occupancy classifier..."
  PYTHONUNBUFFERED=1 python3 train_occupancy.py \
    --data datasets/augmented/occupancy \
    --epochs 15 \
    --batch-size 64 \
    --output models
else
  echo "=== $(date) === Occupancy model already exists, skipping"
fi

# Step 2: Train piece classifier
if [ ! -f models/piece_classes.txt ]; then
  echo "=== $(date) === Training piece classifier..."
  PYTHONUNBUFFERED=1 python3 train_piece_classifier.py \
    --data datasets/augmented/pieces \
    --epochs 30 \
    --batch-size 32 \
    --output models
else
  echo "=== $(date) === Piece classifier already exists, skipping"
fi

# Step 3: Export to ONNX
echo "=== $(date) === Exporting to ONNX..."
PYTHONUNBUFFERED=1 python3 export_tflite.py --models-dir models --output exported

# Step 4: Evaluate
echo "=== $(date) === Running evaluation..."
PYTHONUNBUFFERED=1 python3 evaluate.py \
  --occupancy-model models/occupancy_best.pth \
  --piece-model models/piece_classifier_best.pth \
  --occupancy-data datasets/augmented/occupancy \
  --piece-data datasets/augmented/pieces

echo "=== $(date) === Pipeline complete!"
echo "Check models/ for .pth files and exported/ for .onnx files"
