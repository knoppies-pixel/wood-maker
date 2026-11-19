import { faceUvFromLocal, holeLocalPoint, localFaces, localToWorld, worldToLocal } from "./geometry.ts";
import { add, cross, len, mul, normalize, rotateEuler, sub, v, type Vec3 } from "./math.ts";
import type { FaceId, Guide, Piece, Vec3Tuple } from "./types.ts";

export type InferenceKind =
  | "Endpoint"
  | "Midpoint"
  | "Intersection"
  | "Center"
  | "Guide"
  | "On Edge"
  | "On Guide"
  | "On Face"
  | "On Red Axis"
  | "On Green Axis"
  | "On Blue Axis"
  | "Parallel to Edge"
  | "Perpendicular to Edge";

export interface Inference {
  kind: InferenceKind;
  point: Vec3Tuple;
  direction?: Vec3Tuple;
  normal?: Vec3Tuple;
  color: string;
}

export interface InferenceLock {
  kind: InferenceKind;
  point: Vec3Tuple;
  direction?: Vec3Tuple;
  normal?: Vec3Tuple;
}

interface Anchor {
  kind: "Endpoint" | "Midpoint" | "Center" | "Guide";
  point: Vec3;
}

interface EdgeLine {
  a: Vec3;
  b: Vec3;
  direction: Vec3;
  infinite: boolean;
  guide: boolean;
}

interface FacePlane {
  origin: Vec3;
  normal: Vec3;
  corners: Vec3[];
}

const POINT_RANK: Record<Anchor["kind"], number> = { Endpoint: 0, Guide: 1, Midpoint: 2, Center: 3 };
const AXIS_DOT = Math.cos((5 * Math.PI) / 180);

const AXIS_LINES: Array<{ kind: InferenceKind; axis: Vec3; color: string }> = [
  { kind: "On Red Axis", axis: v(1, 0, 0), color: "#e03131" },
  { kind: "On Green Axis", axis: v(0, 0, 1), color: "#2f9e44" },
  { kind: "On Blue Axis", axis: v(0, 1, 0), color: "#1c7ed6" },
];

export function inferenceColor(kind: InferenceKind): string {
  if (kind === "Endpoint") return "#2f9e44";
  if (kind === "Midpoint") return "#15aabf";
  if (kind === "Intersection") return "#e03131";
  if (kind === "Center") return "#ae3ec9";
  if (kind === "Guide" || kind === "On Guide") return "#868e96";
  if (kind === "On Edge") return "#e8590c";
  if (kind === "On Face") return "#4c6ef5";
  if (kind === "Parallel to Edge") return "#f08c00";
  if (kind === "Perpendicular to Edge") return "#d6336c";
  return AXIS_LINES.find((axis) => axis.kind === kind)?.color ?? "#f6efe4";
}

let scenePieces: Piece[] | null = null;
let sceneGuides: Guide[] | null = null;
let sceneCache: { anchors: Anchor[]; edges: EdgeLine[]; faces: FacePlane[] } | null = null;

export function sceneInference(pieces: Piece[], guides: Guide[] = []): { anchors: Anchor[]; edges: EdgeLine[]; faces: FacePlane[] } {
  if (sceneCache && pieces === scenePieces && guides === sceneGuides) return sceneCache;
  const anchors: Anchor[] = [];
  const edges: EdgeLine[] = [];
  const faces: FacePlane[] = [];
  for (const piece of pieces) {
    for (const face of localFaces(piece)) {
      const corners = face.corners.map((corner) => localToWorld(piece, corner));
      const center = corners.reduce((sum, corner) => add(sum, corner), v(0, 0, 0));
      const origin = mul(center, 1 / corners.length);
      faces.push({ origin, normal: normalize(rotateEuler(face.normal, piece.rotation)), corners });
      anchors.push({ kind: "Center", point: origin });
      for (let index = 0; index < corners.length; index += 1) {
        const a = corners[index];
        const b = corners[(index + 1) % corners.length];
        const span = sub(b, a);
        if (len(span) < 0.5) continue;
        anchors.push({ kind: "Endpoint", point: a });
        anchors.push({ kind: "Midpoint", point: mul(add(a, b), 0.5) });
        edges.push({ a, b, direction: normalize(span), infinite: false, guide: false });
      }
    }
  }
  for (const guide of guides) {
    if (guide.kind === "point") anchors.push({ kind: "Guide", point: from(guide.point) });
    else {
      const direction = normalize(from(guide.direction));
      if (len(direction) < 0.5) continue;
      edges.push({ a: from(guide.origin), b: add(from(guide.origin), direction), direction, infinite: true, guide: true });
    }
  }
  sceneCache = { anchors: dedupe(anchors), edges, faces };
  scenePieces = pieces;
  sceneGuides = guides;
  return sceneCache;
}

export function resolveInference(input: {
  cursor: Vec3Tuple;
  origin?: Vec3Tuple | null;
  pieces: Piece[];
  guides?: Guide[];
  tolerance?: number;
  lock?: InferenceLock | null;
}): Inference | null {
  const tolerance = input.tolerance ?? 14;
  const cursor = from(input.cursor);
  const origin = input.origin ? from(input.origin) : null;
  if (input.lock) return locked(input.lock, cursor, origin);
  const scene = sceneInference(input.pieces, input.guides ?? []);
  const point = nearestPoint(scene, cursor, tolerance);
  if (point) return point;
  const crossing = nearestIntersection(scene.edges, cursor, tolerance);
  if (crossing) return crossing;
  const edge = nearestEdge(scene.edges, cursor, tolerance);
  if (edge) return edge;
  const face = nearestFace(scene.faces, cursor, tolerance);
  if (face) return face;
  if (!origin) return null;
  return directionLock(scene.edges, origin, cursor);
}

function locked(lock: InferenceLock, cursor: Vec3, origin: Vec3 | null): Inference {
  const color = inferenceColor(lock.kind);
  const alongEdge = lock.kind === "On Edge" || lock.kind === "On Guide";
  if (lock.direction && alongEdge) {
    const direction = normalize(from(lock.direction));
    const travel = dot(sub(cursor, from(lock.point)), direction);
    return { kind: lock.kind, point: tuple(add(from(lock.point), mul(direction, travel))), direction: tuple(direction), color };
  }
  if (lock.direction && origin) {
    const direction = normalize(from(lock.direction));
    const travel = dot(sub(cursor, origin), direction);
    return { kind: lock.kind, point: tuple(add(origin, mul(direction, travel))), direction: tuple(direction), color };
  }
  if (lock.normal) {
    const normal = normalize(from(lock.normal));
    const distance = dot(sub(cursor, from(lock.point)), normal);
    return { kind: lock.kind, point: tuple(sub(cursor, mul(normal, distance))), normal: tuple(normal), color };
  }
  return { kind: lock.kind, point: lock.point, color };
}

function nearestPoint(scene: { anchors: Anchor[] }, cursor: Vec3, tolerance: number): Inference | null {
  let best: Anchor | null = null;
  let bestDistance = tolerance;
  for (const anchor of scene.anchors) {
    const distance = len(sub(anchor.point, cursor));
    const better = distance < bestDistance - 0.01 || (best && Math.abs(distance - bestDistance) <= 0.01 && POINT_RANK[anchor.kind] < POINT_RANK[best.kind]);
    if (distance <= tolerance && (best === null || better)) {
      best = anchor;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  return { kind: best.kind, point: tuple(best.point), color: inferenceColor(best.kind) };
}

function nearestIntersection(edges: EdgeLine[], cursor: Vec3, tolerance: number): Inference | null {
  const near = edges.filter((edge) => len(sub(closestOnEdge(edge, cursor), cursor)) <= tolerance + 2);
  let best: Vec3 | null = null;
  let bestDistance = tolerance;
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      const hit = segmentCrossing(near[i], near[j]);
      if (!hit) continue;
      const distance = len(sub(hit, cursor));
      if (distance <= bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    }
  }
  if (!best) return null;
  return { kind: "Intersection", point: tuple(best), color: inferenceColor("Intersection") };
}

function nearestEdge(edges: EdgeLine[], cursor: Vec3, tolerance: number): Inference | null {
  let best: { point: Vec3; guide: boolean; direction: Vec3 } | null = null;
  let bestDistance = tolerance;
  for (const edge of edges) {
    const point = closestOnEdge(edge, cursor);
    const distance = len(sub(point, cursor));
    if (distance <= bestDistance) {
      best = { point, guide: edge.guide, direction: edge.direction };
      bestDistance = distance;
    }
  }
  if (!best) return null;
  const kind: InferenceKind = best.guide ? "On Guide" : "On Edge";
  return { kind, point: tuple(best.point), direction: tuple(best.direction), color: inferenceColor(kind) };
}

function nearestFace(faces: FacePlane[], cursor: Vec3, tolerance: number): Inference | null {
  let best: Vec3 | null = null;
  let bestNormal: Vec3 | null = null;
  let bestDistance = tolerance;
  for (const face of faces) {
    const distance = dot(sub(cursor, face.origin), face.normal);
    if (Math.abs(distance) > tolerance) continue;
    const projected = sub(cursor, mul(face.normal, distance));
    if (!insideQuad(projected, face.corners)) continue;
    if (Math.abs(distance) <= bestDistance) {
      best = projected;
      bestNormal = face.normal;
      bestDistance = Math.abs(distance);
    }
  }
  if (!best || !bestNormal) return null;
  return { kind: "On Face", point: tuple(best), normal: tuple(bestNormal), color: inferenceColor("On Face") };
}

function directionLock(edges: EdgeLine[], origin: Vec3, cursor: Vec3): Inference | null {
  const travel = sub(cursor, origin);
  const distance = len(travel);
  if (distance < 4) return null;
  const heading = mul(travel, 1 / distance);
  for (const axis of AXIS_LINES) {
    if (Math.abs(dot(heading, axis.axis)) >= AXIS_DOT) {
      const along = dot(travel, axis.axis);
      return {
        kind: axis.kind,
        point: tuple(add(origin, mul(axis.axis, along))),
        direction: tuple(axis.axis),
        color: axis.color,
      };
    }
  }
  let parallel: EdgeLine | null = null;
  let perpendicular: EdgeLine | null = null;
  for (const edge of edges) {
    if (edge.guide) continue;
    const alignment = Math.abs(dot(heading, edge.direction));
    if (!parallel && alignment >= AXIS_DOT) parallel = edge;
    if (!perpendicular && alignment <= Math.sin((5 * Math.PI) / 180)) perpendicular = edge;
  }
  if (parallel) {
    const along = dot(travel, parallel.direction);
    return {
      kind: "Parallel to Edge",
      point: tuple(add(origin, mul(parallel.direction, along))),
      direction: tuple(parallel.direction),
      color: inferenceColor("Parallel to Edge"),
    };
  }
  if (perpendicular) {
    const along = dot(travel, perpendicular.direction);
    const point = sub(cursor, mul(perpendicular.direction, along));
    const direction = normalize(sub(point, origin));
    return {
      kind: "Perpendicular to Edge",
      point: tuple(point),
      direction: tuple(direction),
      color: inferenceColor("Perpendicular to Edge"),
    };
  }
  return null;
}

function insideQuad(point: Vec3, corners: Vec3[]): boolean {
  if (corners.length < 3) return false;
  const winding = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (dot(cross(sub(b, a), sub(point, a)), winding) < -1) return false;
  }
  return true;
}

function closestOnEdge(edge: EdgeLine, cursor: Vec3): Vec3 {
  const span = sub(edge.b, edge.a);
  const length = edge.infinite ? 1 : len(span);
  const axis = edge.infinite ? edge.direction : length < 1e-8 ? edge.direction : mul(span, 1 / length);
  let t = dot(sub(cursor, edge.a), axis);
  if (!edge.infinite) t = Math.min(length, Math.max(0, t));
  return add(edge.a, mul(axis, t));
}

function segmentCrossing(a: EdgeLine, b: EdgeLine): Vec3 | null {
  if (Math.abs(dot(a.direction, b.direction)) > 0.995) return null;
  const pa = closestOnEdge(a, b.a);
  const pb = closestOnEdge(b, pa);
  const back = closestOnEdge(a, pb);
  if (len(sub(back, pb)) > 1.5) return null;
  return mul(add(back, pb), 0.5);
}

function dedupe(anchors: Anchor[]): Anchor[] {
  const kept: Anchor[] = [];
  for (const anchor of anchors) {
    const match = kept.find((item) => len(sub(item.point, anchor.point)) < 0.4);
    if (!match) kept.push(anchor);
    else if (POINT_RANK[anchor.kind] < POINT_RANK[match.kind]) {
      match.kind = anchor.kind;
      match.point = anchor.point;
    }
  }
  return kept;
}

/** Pull a pencil, saw or drill hit onto a guide that lands on the same face. */
export function guideFaceSnap(
  piece: Piece,
  face: FaceId,
  u: number,
  v: number,
  guides: Guide[],
): { u: number; v: number; label: "Guide" | "On Guide" } | null {
  if (guides.length === 0) return null;
  const here = localToWorld(piece, holeLocalPoint(piece, face, u, v));
  let best: { point: Vec3; label: "Guide" | "On Guide"; dist: number } | null = null;
  for (const guide of guides) {
    if (guide.kind === "point") {
      const point = from(guide.point);
      const dist = len(sub(point, here));
      if (dist <= 12 && (!best || dist < best.dist)) best = { point, label: "Guide", dist };
    } else {
      const origin = from(guide.origin);
      const direction = normalize(from(guide.direction));
      const point = add(origin, mul(direction, dot(sub(here, origin), direction)));
      const dist = len(sub(point, here));
      if (dist <= 10 && (!best || dist < best.dist)) best = { point, label: "On Guide", dist };
    }
  }
  if (!best) return null;
  const normal = localFaces(piece).find((item) => item.id === face)?.normal;
  if (!normal) return null;
  const uv = faceUvFromLocal(piece, worldToLocal(piece, best.point), normal);
  if (!uv || uv.face !== face) return null;
  return { u: uv.u, v: uv.v, label: best.label };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function from(value: Vec3Tuple): Vec3 {
  return v(value[0], value[1], value[2]);
}

function tuple(value: Vec3): Vec3Tuple {
  return [value.x, value.y, value.z];
}
