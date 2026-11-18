import type { Piece, Vec3Tuple } from "./types.ts";

/** Where a piece is drawn. A later assembly step is hidden. Explode pushes each piece away from the group centre. */
export function explodedPosition(piece: Piece, pieces: Piece[], explode: number, step: number | null): Vec3Tuple | null {
  if (step != null && (piece.step ?? 1) > step) return null;
  if (explode <= 0.001) return piece.position;
  const visible = pieces.filter((item) => step == null || (item.step ?? 1) <= step);
  const count = Math.max(1, visible.length);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const item of visible) {
    cx += item.position[0];
    cy += item.position[1];
    cz += item.position[2];
  }
  cx /= count;
  cy /= count;
  cz /= count;
  const amount = Math.min(1.5, Math.max(0, explode));
  return [
    piece.position[0] + (piece.position[0] - cx) * amount,
    piece.position[1] + (piece.position[1] - cy) * amount,
    piece.position[2] + (piece.position[2] - cz) * amount,
  ];
}
