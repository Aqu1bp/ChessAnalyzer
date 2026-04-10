"""
Export trained PyTorch models to ONNX and then to TFLite.

Exports both occupancy and piece classifier models.
The TFLite files are the artifacts that get bundled into the mobile app.
"""

import argparse
import glob
import os
import shutil
from pathlib import Path

import torch
import torch.nn as nn
from torchvision import models
import onnx


def create_occupancy_model(num_classes: int = 2) -> nn.Module:
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 256),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(256, num_classes),
    )
    return model


def create_piece_model(num_classes: int = 12) -> nn.Module:
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[0].in_features
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.Hardswish(),
        nn.Dropout(p=0.3),
        nn.Linear(512, num_classes),
    )
    return model


def export_to_onnx(model: nn.Module, input_shape: tuple, output_path: Path):
    """Export a PyTorch model to ONNX format."""
    model.eval()
    dummy_input = torch.randn(*input_shape)

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        export_params=True,
        opset_version=13,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    )

    # Verify
    onnx_model = onnx.load(str(output_path))
    onnx.checker.check_model(onnx_model)
    print(f"  ONNX export verified: {output_path}")


def onnx_to_tflite(onnx_path: Path, tflite_path: Path):
    """Convert ONNX model to TFLite.

    Requires onnx2tf or ai_edge_torch. Falls back to instructions if not available.
    """
    try:
        import ai_edge_torch
        # ai_edge_torch can convert directly from PyTorch, but we go via ONNX for now
        raise ImportError("Using onnx2tf path instead")
    except ImportError:
        pass

    try:
        import onnx2tf
        saved_model_dir = str(tflite_path.parent / "tf_saved_model")
        onnx2tf.convert(
            input_onnx_file_path=str(onnx_path),
            output_folder_path=saved_model_dir,
            non_verbose=True,
        )
        # onnx2tf writes into a folder; find the .tflite file and copy it
        import glob
        tflite_files = glob.glob(os.path.join(saved_model_dir, "**", "*.tflite"), recursive=True)
        if tflite_files:
            shutil.copy2(tflite_files[0], str(tflite_path))
            print(f"  TFLite converted via onnx2tf: {tflite_path} ({Path(tflite_path).stat().st_size / 1024 / 1024:.1f} MB)")
        else:
            # Fallback: use TF to convert the saved model
            import tensorflow as tf
            converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
            tflite_model = converter.convert()
            with open(tflite_path, "wb") as f:
                f.write(tflite_model)
            print(f"  TFLite converted via onnx2tf+TF: {tflite_path} ({len(tflite_model) / 1024 / 1024:.1f} MB)")
        return
    except ImportError:
        pass

    # Manual TF path
    try:
        import tensorflow as tf
        import onnx
        from onnx_tf.backend import prepare

        onnx_model = onnx.load(str(onnx_path))
        tf_rep = prepare(onnx_model)
        tf_rep.export_graph(str(tflite_path.parent / "tf_saved_model"))

        converter = tf.lite.TFLiteConverter.from_saved_model(str(tflite_path.parent / "tf_saved_model"))
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()

        with open(tflite_path, "wb") as f:
            f.write(tflite_model)
        print(f"  TFLite export done: {tflite_path} ({len(tflite_model) / 1024 / 1024:.1f} MB)")
        return
    except ImportError:
        pass

    print(f"\n  WARNING: No TFLite converter available.")
    print(f"  ONNX model exported to: {onnx_path}")
    print(f"  To convert to TFLite, install one of:")
    print(f"    pip install onnx2tf")
    print(f"    pip install tensorflow onnx-tf")
    print(f"  Or use Google Colab with ai_edge_torch:")
    print(f"    pip install ai-edge-torch")


def main():
    parser = argparse.ArgumentParser(description="Export models to ONNX/TFLite")
    parser.add_argument("--models-dir", type=str, default="models", help="Directory with .pth files")
    parser.add_argument("--output", type=str, default="exported", help="Output directory")
    args = parser.parse_args()

    models_dir = Path(args.models_dir)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Export occupancy model
    occ_pth = models_dir / "occupancy_best.pth"
    if occ_pth.exists():
        print("\n--- Exporting Occupancy Classifier ---")
        model = create_occupancy_model(num_classes=2)
        model.load_state_dict(torch.load(occ_pth, weights_only=True, map_location="cpu"))
        model.eval()

        onnx_path = output_dir / "occupancy_classifier.onnx"
        tflite_path = output_dir / "occupancy_classifier.tflite"

        # Input: batch x 3 x 224 x 224 (matches training transforms)
        export_to_onnx(model, (1, 3, 224, 224), onnx_path)
        onnx_to_tflite(onnx_path, tflite_path)
    else:
        print(f"Skipping occupancy: {occ_pth} not found")

    # Export piece classifier
    piece_pth = models_dir / "piece_classifier_best.pth"
    if piece_pth.exists():
        print("\n--- Exporting Piece Classifier ---")

        # Read class count from classes file
        classes_file = models_dir / "piece_classes.txt"
        num_classes = 12
        if classes_file.exists():
            with open(classes_file) as f:
                num_classes = len(f.readlines())

        model = create_piece_model(num_classes=num_classes)
        model.load_state_dict(torch.load(piece_pth, weights_only=True, map_location="cpu"))
        model.eval()

        onnx_path = output_dir / "piece_classifier.onnx"
        tflite_path = output_dir / "piece_classifier.tflite"

        # Input: batch x 3 x 224 x 224 (resized from 100x200)
        export_to_onnx(model, (1, 3, 224, 224), onnx_path)
        onnx_to_tflite(onnx_path, tflite_path)
    else:
        print(f"Skipping piece classifier: {piece_pth} not found")

    print("\n--- Export Complete ---")
    for f in output_dir.iterdir():
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"  {f.name}: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
