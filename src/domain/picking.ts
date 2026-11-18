import { holeLocalPoint } from "./geometry.ts";
import type { FaceId, FacePoint, PencilMark, Piece } from "./types.ts";

export type PieceEdge = "left" | "right" | "start" | "end";

export interface PickSettings {
  enabled: boolean;
  vertices: boolean;
  midpoints: boolean;
  edges: boolean;
  centres: boolean;
  grid: boolean;
  marks: boolean;
  gridSize: number;
}

export interface PickResult extends FacePoint {
  edge: PieceEdge;
  snap: string | null;
}

const REACH = 12;

/** The board edge closest to a hit, in millimetres on that face. */
export function nearestPieceEdge(piece: Piece, face: FaceId, u: number, v: number): PieceEdge {
  const point = holeLocalPoint(piece, face, u, v);
  const halfW = piece.width / 2;
  const halfL = piece.length / 2;
  const ranked: Array<{ edge: PieceEdge; distance: number }> = [
    { edge: "left", distance: Math.abs(point.x + halfW) },
    { edge: "right", distance: Math.abs(point.x - halfW) },
    { edge: "start", distance: Math.abs(point.z + halfL) },
    { edge: "end", distance: Math.abs(point.z - halfL) },
  ];
  ranked.sort((a, b) => a.distance - b.distance);
  return ranked[0]?.edge ?? "left";
}

/** Where a crosscut or rip should sit, measured from the reference end or the left edge. */
export function stationFromHit(piece: Piece, face: FaceId, u: number, v: number, mode: "crosscut" | "rip"): number {
  if (mode === "rip") {
    if (face === "left") return 0;
    if (face === "right") return piece.width;
    return u;
  }
  if (face === "start") return 0;
  if (face === "end") return piece.length;
  if (face === "left" || face === "right") return u;
  return v;
}

export function snapFaceHit(
  piece: Piece,
  face: FaceId,
  u: number,
  v: number,
  settings: PickSettings,
  marks: PencilMark[] = piece.marks ?? [],
  extra: FacePoint[] = [],
): PickResult {
  const rawEdge = nearestPieceEdge(piece, face, u, v);
  if (!settings.enabled) return { u, v, edge: rawEdge, snap: null };
  const size = faceSizeOf(piece, face);
  const candidates: Array<FacePoint & { snap: string; reach: number }> = [];
  const add = (point: FacePoint, snap: string, reach = REACH) => candidates.push({ ...point, snap, reach });
  if (settings.vertices) {
    add({ u: 0, v: 0 }, "vertex");
    add({ u: size.u, v: 0 }, "vertex");
    add({ u: 0, v: size.v }, "vertex");
    add({ u: size.u, v: size.v }, "vertex");
  }
  if (settings.midpoints) {
    add({ u: size.u / 2, v: 0 }, "midpoint");
    add({ u: size.u / 2, v: size.v }, "midpoint");
    add({ u: 0, v: size.v / 2 }, "midpoint");
    add({ u: size.u, v: size.v / 2 }, "midpoint");
  }
  if (settings.centres) add({ u: size.u / 2, v: size.v / 2 }, "face centre");
  if (settings.marks) {
    for (const mark of marks.filter((item) => item.face === face)) {
      for (const point of mark.points) add(point, mark.label ? `mark “${mark.label}”` : "pencil mark");
    }
  }
  for (const point of extra) add(point, "dimension");
  let best: (typeof candidates)[number] | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.u - u, candidate.v - v);
    if (distance <= candidate.reach && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best) {
    return { u: best.u, v: best.v, edge: nearestPieceEdge(piece, face, best.u, best.v), snap: best.snap };
  }
  if (settings.edges) {
    const toLeft = u;
    const toRight = size.u - u;
    const toStart = v;
    const toEnd = size.v - v;
    const nearest = Math.min(toLeft, toRight, toStart, toEnd);
    if (nearest <= REACH) {
      const snapped = { u, v };
      if (nearest === toLeft) snapped.u = 0;
      else if (nearest === toRight) snapped.u = size.u;
      else if (nearest === toStart) snapped.v = 0;
      else snapped.v = size.v;
      return { ...snapped, edge: nearestPieceEdge(piece, face, snapped.u, snapped.v), snap: "edge" };
    }
  }
  if (settings.grid && settings.gridSize > 0) {
    const snapped = {
      u: Math.min(size.u, Math.max(0, Math.round(u / settings.gridSize) * settings.gridSize)),
      v: Math.min(size.v, Math.max(0, Math.round(v / settings.gridSize) * settings.gridSize)),
    };
    if (Math.hypot(snapped.u - u, snapped.v - v) > 0.05) {
      return { ...snapped, edge: nearestPieceEdge(piece, face, snapped.u, snapped.v), snap: "grid" };
    }
  }
  return { u, v, edge: rawEdge, snap: null };
}

function faceSizeOf(piece: Piece, face: FaceId): { u: number; v: number } {
  if (face === "top" || face === "bottom") return { u: piece.width, v: piece.length };
  if (face === "left" || face === "right") return { u: piece.length, v: piece.thickness };
  return { u: piece.width, v: piece.thickness };
}

export function routeFits(piece: Piece, depth: number): boolean {
  return depth > 0 && depth < piece.thickness - 0.2;
}
