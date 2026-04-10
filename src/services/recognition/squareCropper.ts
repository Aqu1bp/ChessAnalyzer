/**
 * Square cropper — divides a 512x512 warped board into 64 individual square crops.
 *
 * Index mapping: index 0 = a8 (top-left), index 7 = h8, index 63 = h1 (bottom-right)
 * This matches FEN convention (rank 8 first, file a first).
 */

import type { Point } from '../../types/chess';

/** Size of the warped board image */
export const BOARD_SIZE = 512;

/** Size of each square in the warped image */
export const SQUARE_SIZE = BOARD_SIZE / 8; // 64px

/**
 * Get the crop region for a given square index in a 512x512 warped board.
 *
 * @param squareIndex - 0 to 63 (0=a8, 7=h8, 8=a7, ..., 63=h1)
 * @returns The crop region as {x, y, width, height}
 */
export function getSquareRegion(squareIndex: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (squareIndex < 0 || squareIndex > 63) {
    throw new Error(`Invalid square index: ${squareIndex}`);
  }

  const rank = Math.floor(squareIndex / 8); // 0 = rank 8 (top), 7 = rank 1 (bottom)
  const file = squareIndex % 8; // 0 = file a (left), 7 = file h (right)

  return {
    x: file * SQUARE_SIZE,
    y: rank * SQUARE_SIZE,
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
  };
}

/**
 * Get the center point of a square.
 */
export function getSquareCenter(squareIndex: number): Point {
  const region = getSquareRegion(squareIndex);
  return {
    x: region.x + region.width / 2,
    y: region.y + region.height / 2,
  };
}

/**
 * Convert a square index to algebraic notation.
 * Index 0 = a8, index 7 = h8, index 63 = h1.
 */
export function squareIndexToAlgebraic(index: number): string {
  const file = index % 8;
  const rank = 7 - Math.floor(index / 8);
  return String.fromCharCode(97 + file) + (rank + 1);
}

/**
 * Convert algebraic notation to square index.
 * a8 = 0, h8 = 7, a1 = 56, h1 = 63.
 */
export function algebraicToSquareIndex(algebraic: string): number {
  const file = algebraic.charCodeAt(0) - 97;
  const rank = parseInt(algebraic[1]) - 1;
  return (7 - rank) * 8 + file;
}
