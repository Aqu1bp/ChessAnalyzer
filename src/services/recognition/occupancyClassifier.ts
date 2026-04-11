/**
 * Occupancy classifier — determines if a square is empty or occupied.
 *
 * Uses a TFLite MobileNetV3-Small model loaded via react-native-fast-tflite.
 * Input: 100x100 RGB normalized square crop
 * Output: 2-class softmax (empty, occupied)
 */

// react-native-fast-tflite will be loaded at runtime
// import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

export interface OccupancyResult {
  occupied: boolean;
  confidence: number;
}

/**
 * Classify a batch of square images as empty or occupied.
 *
 * NOTE: This is a stub until TFLite models are trained and bundled.
 * The actual implementation will:
 * 1. Load the model from assets/models/occupancy_classifier.tflite
 * 2. Preprocess each crop (resize to 100x100, normalize to ImageNet stats)
 * 3. Run inference
 * 4. Return occupancy prediction + confidence per square
 */
export async function classifyOccupancy(
  _squareCrops: ArrayBuffer[],
): Promise<OccupancyResult[]> {
  throw new Error(
    'Occupancy inference is not implemented in this build. Export and bundle the TFLite model before calling classifyOccupancy().',
  );
}

/**
 * ImageNet normalization constants.
 * Used to preprocess input before feeding to the MobileNetV3 model.
 */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];
