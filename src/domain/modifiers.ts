import type { FaceId, ModifierAxis, Piece, Vec3Tuple, WoodModifier } from "./types.ts";

export interface LocalCopy {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
}

const MAX_COPIES = 48;

export function localCopies(piece: Piece): LocalCopy[] {
  let copies: LocalCopy[] = [{ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }];
  for (const modifier of piece.modifiers ?? []) {
    if (!modifier.enabled) continue;
    if (modifier.type === "array") copies = arrayCopies(piece, copies, modifier);
    if (modifier.type === "mirror") copies = copies.flatMap((copy) => [copy, mirrorCopy(piece, copy, modifier.axis, modifier.across)]);
    if (copies.length > MAX_COPIES) copies = copies.slice(0, MAX_COPIES);
  }
  return copies;
}

export function instanceCount(piece: Piece): number {
  return Math.max(1, localCopies(piece).length);
}

export function axisExtent(piece: Piece, axis: ModifierAxis): number {
  if (axis === "x") return Math.max(piece.widthStart || piece.width, piece.widthEnd || piece.width, piece.width);
  if (axis === "y") return piece.thickness;
  return piece.length;
}

function arrayCopies(piece: Piece, copies: LocalCopy[], modifier: Extract<WoodModifier, { type: "array" }>): LocalCopy[] {
  const count = Math.max(1, Math.min(24, Math.round(modifier.count)));
  if (modifier.layout === "radial") {
    const next: LocalCopy[] = [];
    for (const copy of copies) {
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        next.push({
          position: [
            copy.position[0] + Math.cos(angle) * modifier.spacing,
            copy.position[1],
            copy.position[2] + Math.sin(angle) * modifier.spacing,
          ],
          rotation: [copy.rotation[0], copy.rotation[1] + angle, copy.rotation[2]],
          scale: copy.scale,
        });
      }
    }
    return next;
  }
  const extent = axisExtent(piece, modifier.axis);
  const step = modifier.fitLength && count > 1 ? (modifier.fitLength - extent) / (count - 1) : modifier.spacing;
  const next: LocalCopy[] = [];
  const index = axisIndex(modifier.axis);
  for (const copy of copies) {
    for (let i = 0; i < count; i += 1) {
      const position: Vec3Tuple = [...copy.position];
      position[index] += step * i;
      next.push({ ...copy, position });
    }
  }
  return next;
}

function mirrorCopy(piece: Piece, copy: LocalCopy, axis: ModifierAxis, across: "edge" | "centre"): LocalCopy {
  const index = axisIndex(axis);
  if (across === "centre") {
    const scale: Vec3Tuple = [...copy.scale];
    scale[index] *= -1;
    const position: Vec3Tuple = [...copy.position];
    position[index] *= -1;
    return { ...copy, position, scale };
  }
  const shift = axisExtent(piece, axis);
  const position: Vec3Tuple = [...copy.position];
  position[index] += shift;
  return { ...copy, position };
}

function axisIndex(axis: ModifierAxis): 0 | 1 | 2 {
  if (axis === "x") return 0;
  if (axis === "y") return 1;
  return 2;
}

export function faceExtent(face: FaceId, piece: Piece): { u: number; v: number } {
  if (face === "top" || face === "bottom") return { u: piece.width, v: piece.length };
  if (face === "left" || face === "right") return { u: piece.length, v: piece.thickness };
  return { u: piece.width, v: piece.thickness };
}
