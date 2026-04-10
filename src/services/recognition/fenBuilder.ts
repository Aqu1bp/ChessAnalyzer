import type { BoardState, FenMetadata, Piece, SquarePrediction } from '../../types/chess';

/**
 * Convert a Piece to its FEN character.
 * White pieces are uppercase, black pieces are lowercase.
 */
function pieceToFenChar(piece: Piece): string {
  const ch = piece.type;
  return piece.color === 'w' ? ch.toUpperCase() : ch;
}

/**
 * Convert a 64-element BoardState array to FEN piece placement string.
 *
 * Board index 0 = a8, index 7 = h8, index 8 = a7, ..., index 63 = h1.
 * Empty squares are counted and represented as digits.
 * Ranks are separated by '/'.
 */
export function buildPiecePlacement(board: BoardState): string {
  const ranks: string[] = [];

  for (let rank = 0; rank < 8; rank++) {
    let rankStr = '';
    let emptyCount = 0;

    for (let file = 0; file < 8; file++) {
      const index = rank * 8 + file;
      const square = board[index];

      if (square === null || square === undefined) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rankStr += emptyCount.toString();
          emptyCount = 0;
        }
        rankStr += pieceToFenChar(square);
      }
    }

    if (emptyCount > 0) {
      rankStr += emptyCount.toString();
    }

    ranks.push(rankStr);
  }

  return ranks.join('/');
}

/**
 * Build a complete FEN string from board state and metadata.
 */
export function buildFullFen(board: BoardState, metadata: FenMetadata): string {
  const placement = buildPiecePlacement(board);

  let castlingStr = '';
  if (metadata.castling.K) castlingStr += 'K';
  if (metadata.castling.Q) castlingStr += 'Q';
  if (metadata.castling.k) castlingStr += 'k';
  if (metadata.castling.q) castlingStr += 'q';
  if (castlingStr === '') castlingStr = '-';

  return [
    placement,
    metadata.activeColor,
    castlingStr,
    metadata.enPassant,
    metadata.halfmoveClock.toString(),
    metadata.fullmoveNumber.toString(),
  ].join(' ');
}

/**
 * Convert 64 SquarePrediction entries to a BoardState array.
 * Each prediction's piece field is used if the square is occupied.
 */
export function predictionsToBoard(predictions: SquarePrediction[]): BoardState {
  return predictions.map((prediction) => {
    if (prediction.occupied && prediction.piece !== null) {
      return prediction.piece;
    }
    return null;
  });
}
