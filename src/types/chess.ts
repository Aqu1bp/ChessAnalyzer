/** Piece color */
export type PieceColor = 'w' | 'b';

/** Piece type (lowercase = standard FEN notation for black, but we use separate color field) */
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

/** A piece on the board */
export interface Piece {
  color: PieceColor;
  type: PieceType;
}

/** A square can be empty or contain a piece */
export type SquareContent = Piece | null;

/** 64-element board representation, index 0 = a8, index 63 = h1 */
export type BoardState = SquareContent[];

/** Castling availability */
export interface CastlingRights {
  K: boolean; // White kingside
  Q: boolean; // White queenside
  k: boolean; // Black kingside
  q: boolean; // Black queenside
}

/** FEN metadata that cannot be inferred from a photo */
export interface FenMetadata {
  activeColor: PieceColor;
  castling: CastlingRights;
  enPassant: string; // square like "e3" or "-"
  halfmoveClock: number;
  fullmoveNumber: number;
}

/** A point in 2D space */
export interface Point {
  x: number;
  y: number;
}

/** Four corners defining a board quadrilateral */
export interface BoardQuad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

/** Classification result for a single square */
export interface SquarePrediction {
  occupied: boolean;
  occupancyConfidence: number;
  piece: Piece | null;
  pieceConfidence: number;
}

/** Input mode for how the image was acquired */
export type InputMode = 'camera' | 'import';
