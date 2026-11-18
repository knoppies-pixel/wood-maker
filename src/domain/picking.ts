import type { FaceId, FacePoint, PencilMark, Piece } from "./types.ts";

type Sized = Pick<Piece, "length" | "width" | "thickness">;

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

const REACH = 6;
const MARK_REACH = 12;

/** The board edge closest to a hit, measured on the face that was actually clicked. */
export function nearestPieceEdge(piece: Sized, face: FaceId, u: number, v: number): PieceEdge {
  const size = faceSizeOf(piece, face);
  const toU0 = u;
  const toU1 = size.u - u;
  const toV0 = v;
  const toV1 = size.v - v;
  const nearest = Math.min(toU0, toU1, toV0, toV1);
  if (face === "top" || face === "bottom") {
    if (nearest === toU0) return "left";
    if (nearest === toU1) return "right";
    if (nearest === toV0) return "start";
    return "end";
  }
  if (face === "left" || face === "right") {
    if (nearest === toU0) return "start";
    if (nearest === toU1) return "end";
    return face;
  }
  if (nearest === toU0) return "left";
  if (nearest === toU1) return "right";
  return face;
}

/** Which arris a round-over, chamfer, or cove should sit on. */
export function profileTarget(piece: Sized, face: FaceId, u: number, v: number): { edge: PieceEdge; side: "top" | "bottom" } {
  const size = faceSizeOf(piece, face);
  const toU0 = u;
  const toU1 = size.u - u;
  const toV0 = v;
  const toV1 = size.v - v;
  const nearest = Math.min(toU0, toU1, toV0, toV1);
  const upper = v >= size.v / 2;
  if (face === "top" || face === "bottom") {
    const edge: PieceEdge = nearest === toU0 ? "left" : nearest === toU1 ? "right" : nearest === toV0 ? "start" : "end";
    return { edge, side: face };
  }
  if (face === "left" || face === "right") {
    if (nearest === toV0) return { edge: face, side: "bottom" };
    if (nearest === toV1) return { edge: face, side: "top" };
    return { edge: nearest === toU0 ? "start" : "end", side: upper ? "top" : "bottom" };
  }
  if (nearest === toV0) return { edge: face, side: "bottom" };
  if (nearest === toV1) return { edge: face, side: "top" };
  return { edge: nearest === toU0 ? "left" : "right", side: upper ? "top" : "bottom" };
}

/** Slider units: from the reference end, or from the far end when that toggle is on. */
export function sawDistanceFromStation(length: number, mode: "crosscut" | "rip", from: "start" | "end", station: number, consumed: number): number {
  if (mode === "rip" || from === "start") return station;
  return length - station - consumed;
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
      for (const point of mark.points) add(point, mark.label ? `mark “${mark.label}”` : "pencil mark", MARK_REACH);
    }
  }
  for (const point of extra) add(point, "dimension", MARK_REACH);
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
    const distance = Math.hypot(snapped.u - u, snapped.v - v);
    const gridReach = Math.min(settings.gridSize / 2, REACH);
    if (distance > 0.05 && distance <= gridReach) {
      return { ...snapped, edge: nearestPieceEdge(piece, face, snapped.u, snapped.v), snap: "grid" };
    }
  }
  return { u, v, edge: rawEdge, snap: null };
}

export interface LocalBox {
  position: [number, number, number];
  size: [number, number, number];
}

/** Axis-aligned slot in piece space. Depth bites into the clicked face. */
export function routeLocalBox(
  piece: Sized,
  route: { kind: "dado" | "groove" | "rebate"; face: FaceId; u: number; v: number; width: number; depth: number; edge?: PieceEdge },
  reveal = 0,
): LocalBox {
  const length = piece.length;
  const width = piece.width;
  const thickness = piece.thickness;
  const slot = Math.max(route.width, 0.5);
  const depth = Math.max(route.depth, 0.2);
  const edge = route.edge ?? nearestPieceEdge(piece, route.face, route.u, route.v);
  let box: LocalBox;
  if (route.face === "top" || route.face === "bottom") {
    const y = route.face === "top" ? thickness / 2 - depth / 2 : -thickness / 2 + depth / 2;
    if (route.kind === "groove") box = { position: [-width / 2 + route.u, y, 0], size: [slot, depth, length] };
    else if (route.kind === "rebate") box = horizontalRebate(width, length, y, depth, slot, edge);
    else box = { position: [0, y, -length / 2 + route.v], size: [width, depth, slot] };
  } else if (route.face === "left" || route.face === "right") {
    const outward = route.face === "left" ? -1 : 1;
    const x = (route.face === "left" ? -width / 2 : width / 2) - outward * depth / 2;
    if (route.kind === "groove") box = { position: [x, -thickness / 2 + route.v, 0], size: [depth, slot, length] };
    else if (route.kind === "rebate") box = sideRebate(route.face, width, length, thickness, depth, slot, edge, route.v);
    else box = { position: [x, 0, -length / 2 + route.u], size: [depth, thickness, slot] };
  } else {
    const outward = route.face === "start" ? -1 : 1;
    const z = (route.face === "start" ? -length / 2 : length / 2) - outward * depth / 2;
    if (route.kind === "groove") box = { position: [-width / 2 + route.u, 0, z], size: [slot, thickness, depth] };
    else if (route.kind === "rebate") box = endRebate(route.face, width, length, thickness, depth, slot, edge, route.v);
    else box = { position: [0, -thickness / 2 + route.v, z], size: [width, slot, depth] };
  }
  return revealOut(box, route.face, reveal);
}

/** Centre of an edge profile, on the top or bottom arris. */
export function profileLocal(
  piece: Sized,
  profile: { edge: PieceEdge; side?: "top" | "bottom" },
): { position: [number, number, number]; alongLength: boolean } {
  const side = profile.side ?? "top";
  const y = (side === "top" ? 1 : -1) * piece.thickness / 2;
  const alongLength = profile.edge === "left" || profile.edge === "right";
  const x = profile.edge === "left" ? -piece.width / 2 : profile.edge === "right" ? piece.width / 2 : 0;
  const z = profile.edge === "start" ? -piece.length / 2 : profile.edge === "end" ? piece.length / 2 : 0;
  return { position: [x, y, z], alongLength };
}

function horizontalRebate(width: number, length: number, y: number, depth: number, slot: number, edge: PieceEdge): LocalBox {
  if (edge === "left") return { position: [-width / 2 + slot / 2, y, 0], size: [slot, depth, length] };
  if (edge === "right") return { position: [width / 2 - slot / 2, y, 0], size: [slot, depth, length] };
  if (edge === "start") return { position: [0, y, -length / 2 + slot / 2], size: [width, depth, slot] };
  return { position: [0, y, length / 2 - slot / 2], size: [width, depth, slot] };
}

function sideRebate(face: "left" | "right", width: number, length: number, thickness: number, depth: number, slot: number, edge: PieceEdge, v: number): LocalBox {
  const outward = face === "left" ? -1 : 1;
  const x = (face === "left" ? -width / 2 : width / 2) - outward * depth / 2;
  if (edge === "start" || edge === "end") {
    const z = edge === "start" ? -length / 2 + slot / 2 : length / 2 - slot / 2;
    return { position: [x, 0, z], size: [depth, thickness, slot] };
  }
  const fromTop = v >= thickness / 2;
  const y = fromTop ? thickness / 2 - slot / 2 : -thickness / 2 + slot / 2;
  return { position: [x, y, 0], size: [depth, slot, length] };
}

function endRebate(face: "start" | "end", width: number, length: number, thickness: number, depth: number, slot: number, edge: PieceEdge, v: number): LocalBox {
  const outward = face === "start" ? -1 : 1;
  const z = (face === "start" ? -length / 2 : length / 2) - outward * depth / 2;
  if (edge === "left" || edge === "right") {
    const x = edge === "left" ? -width / 2 + slot / 2 : width / 2 - slot / 2;
    return { position: [x, 0, z], size: [slot, thickness, depth] };
  }
  const fromTop = v >= thickness / 2;
  const y = fromTop ? thickness / 2 - slot / 2 : -thickness / 2 + slot / 2;
  return { position: [0, y, z], size: [width, slot, depth] };
}

function revealOut(box: LocalBox, face: FaceId, reveal: number): LocalBox {
  if (reveal <= 0) return box;
  const position: [number, number, number] = [...box.position];
  const size: [number, number, number] = [...box.size];
  const axis = face === "left" || face === "right" ? 0 : face === "start" || face === "end" ? 2 : 1;
  const outward = face === "top" || face === "right" || face === "end" ? 1 : -1;
  size[axis] += reveal;
  position[axis] += outward * (reveal / 2);
  return { position, size };
}

function faceSizeOf(piece: Sized, face: FaceId): { u: number; v: number } {
  if (face === "top" || face === "bottom") return { u: piece.width, v: piece.length };
  if (face === "left" || face === "right") return { u: piece.length, v: piece.thickness };
  return { u: piece.width, v: piece.thickness };
}

export function routeFits(piece: Piece, depth: number): boolean {
  return depth > 0 && depth < piece.thickness - 0.2;
}
