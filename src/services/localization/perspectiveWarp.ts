/**
 * Perspective warp using react-native-fast-opencv.
 *
 * Takes a source image and 4 corner points, warps to a top-down 512x512 view.
 */

import type { BoardQuad } from '../../types/chess';

// OpenCV will be imported dynamically since it requires native module
let OpenCV: typeof import('react-native-fast-opencv') | null = null;

/**
 * Initialize the OpenCV module.
 * Call this once before using any warp functions.
 */
export async function initOpenCV(): Promise<void> {
  if (!OpenCV) {
    OpenCV = await import('react-native-fast-opencv');
  }
}

/**
 * Warp a board region to a top-down 512x512 image.
 *
 * @param imageUri - URI of the source image
 * @param quad - Four corner points of the board in the source image
 * @returns URI of the warped 512x512 image, or null if warp fails
 */
export async function warpBoard(
  imageUri: string,
  quad: BoardQuad,
): Promise<string | null> {
  try {
    await initOpenCV();
    if (!OpenCV) return null;

    // Source points: the user-confirmed quad corners
    const srcPoints = [
      [quad.topLeft.x, quad.topLeft.y],
      [quad.topRight.x, quad.topRight.y],
      [quad.bottomRight.x, quad.bottomRight.y],
      [quad.bottomLeft.x, quad.bottomLeft.y],
    ];

    // Destination points: 512x512 square
    const dstPoints = [
      [0, 0],
      [512, 0],
      [512, 512],
      [0, 512],
    ];

    // TODO: Implement actual OpenCV warp when react-native-fast-opencv
    // API for image loading and getPerspectiveTransform is confirmed.
    // The actual API depends on the specific version installed.
    //
    // Pseudocode:
    // const mat = OpenCV.imread(imageUri);
    // const srcMat = OpenCV.matFromArray(4, 2, srcPoints.flat());
    // const dstMat = OpenCV.matFromArray(4, 2, dstPoints.flat());
    // const M = OpenCV.getPerspectiveTransform(srcMat, dstMat);
    // const warped = OpenCV.warpPerspective(mat, M, { width: 512, height: 512 });
    // return OpenCV.imwrite(warped);

    console.warn('[perspectiveWarp] OpenCV warp not yet implemented, returning null');
    return null;
  } catch (error) {
    console.error('[perspectiveWarp] Warp failed:', error);
    return null;
  }
}
