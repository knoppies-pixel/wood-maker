import { faceExtent } from "./modifiers.ts";
import type { FaceId, FacePoint, PencilMark, Piece } from "./types.ts";

const SNAP_MM = 8;

export interface SnapResult extends FacePoint {
  label: string | null;
}

export function snapFacePoint(piece: Piece, face: FaceId, u: number, v: number, marks: PencilMark[] = piece.marks ?? []): SnapResult {
  const size = faceExtent(face, piece);
  const targets: SnapResult[] = [
    { u: 0, v: 0, label: "corner" },
    { u: size.u, v: 0, label: "corner" },
    { u: 0, v: size.v, label: "corner" },
    { u: size.u, v: size.v, label: "corner" },
    { u: size.u / 2, v: 0, label: "midpoint" },
    { u: size.u / 2, v: size.v, label: "midpoint" },
    { u: 0, v: size.v / 2, label: "midpoint" },
    { u: size.u, v: size.v / 2, label: "midpoint" },
    { u: size.u / 2, v: size.v / 2, label: "centre" },
  ];
  for (const mark of marks.filter((item) => item.face === face)) {
    for (const point of mark.points) targets.push({ ...point, label: mark.label ?? "mark" });
  }
  let best: SnapResult | null = null;
  let bestDistance = SNAP_MM;
  for (const target of targets) {
    const distance = Math.hypot(target.u - u, target.v - v);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  if (best) return best;
  if (Math.abs(u) <= SNAP_MM) return { u: 0, v, label: "edge" };
  if (Math.abs(u - size.u) <= SNAP_MM) return { u: size.u, v, label: "edge" };
  if (Math.abs(v) <= SNAP_MM) return { u, v: 0, label: "edge" };
  if (Math.abs(v - size.v) <= SNAP_MM) return { u, v: size.v, label: "edge" };
  return { u, v, label: null };
}

/** A combination-square line, offset from the nearest boundary of the face under the cursor. */
export function offsetOnFace(face: FaceId, piece: Piece, u: number, v: number, offset: number): FacePoint[] {
  const size = faceExtent(face, piece);
  const toU0 = u;
  const toU1 = size.u - u;
  const toV0 = v;
  const toV1 = size.v - v;
  const nearest = Math.min(toU0, toU1, toV0, toV1);
  if (nearest === toU0) return parallelMark(face, piece, "left", offset);
  if (nearest === toU1) return parallelMark(face, piece, "right", offset);
  if (nearest === toV0) return parallelMark(face, piece, "start", offset);
  return parallelMark(face, piece, "end", offset);
}

export function parallelMark(face: FaceId, piece: Piece, edge: "left" | "right" | "start" | "end", offset: number): FacePoint[] {
  const size = faceExtent(face, piece);
  const clamped = Math.max(0, Math.min(offset, edge === "left" || edge === "right" ? size.u : size.v));
  if (edge === "left") return [{ u: clamped, v: 0 }, { u: clamped, v: size.v }];
  if (edge === "right") return [{ u: size.u - clamped, v: 0 }, { u: size.u - clamped, v: size.v }];
  if (edge === "start") return [{ u: 0, v: clamped }, { u: size.u, v: clamped }];
  return [{ u: 0, v: size.v - clamped }, { u: size.u, v: size.v - clamped }];
}

export function angleMark(piece: Piece, face: FaceId, degrees: number): FacePoint[] {
  const size = faceExtent(face, piece);
  const radians = (Math.max(0, Math.min(90, degrees)) * Math.PI) / 180;
  const length = Math.min(size.u, size.v) * 0.85;
  return [
    { u: 0, v: 0 },
    { u: Math.cos(radians) * length, v: Math.sin(radians) * length },
  ];
}

export function anchorDistance(a: FacePoint, b: FacePoint): number {
  return Math.hypot(a.u - b.u, a.v - b.v);
}
