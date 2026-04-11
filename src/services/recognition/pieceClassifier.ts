/**
 * Piece classifier — identifies the type and color of an occupied square.
 *
 * Uses a TFLite MobileNetV3-Small model loaded via react-native-fast-tflite.
 * Input: 224x224 RGB normalized crop of an occupied square
 * Output: 12-class softmax (wK, wQ, wR, wB, wN, wP, bK, bQ, bR, bB, bN, bP)
 */

import type { Piece, PieceColor, PieceType } from '../../types/chess';

/** The 12 piece classes in alphabetical order (matching ImageFolder ordering) */
export const PIECE_CLASSES: { color: PieceColor; type: PieceType }[] = [
  { color: 'b', type: 'b' }, // bB
  { color: 'b', type: 'k' }, // bK
  { color: 'b', type: 'n' }, // bN
  { color: 'b', type: 'p' }, // bP
  { color: 'b', type: 'q' }, // bQ
  { color: 'b', type: 'r' }, // bR
  { color: 'w', type: 'b' }, // wB
  { color: 'w', type: 'k' }, // wK
  { color: 'w', type: 'n' }, // wN
  { color: 'w', type: 'p' }, // wP
  { color: 'w', type: 'q' }, // wQ
  { color: 'w', type: 'r' }, // wR
];

export interface PieceResult {
  piece: Piece;
  confidence: number;
}

/**
 * Classify a batch of occupied square crops into piece types.
 *
 * NOTE: This is a stub until TFLite models are trained and bundled.
 * The actual implementation will:
 * 1. Load model from assets/models/piece_classifier.tflite
 * 2. Preprocess each crop (resize to 224x224, normalize to ImageNet stats)
 * 3. Run inference
 * 4. Map the argmax class index to PIECE_CLASSES
 * 5. Return piece + confidence per square
 */
export async function classifyPieces(
  _occupiedSquareCrops: ArrayBuffer[],
): Promise<PieceResult[]> {
  throw new Error(
    'Piece inference is not implemented in this build. Export and bundle the TFLite model before calling classifyPieces().',
  );
}
