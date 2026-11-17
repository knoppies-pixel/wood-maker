import type { FaceId, Piece, Vec3Tuple } from "./types.ts";
import {
  DEG,
  add,
  clamp,
  cross,
  dot,
  len,
  mul,
  normalize,
  rotateEuler,
  sub,
  v,
  type Quad,
  type Vec3,
} from "./math.ts";

export interface LocalFace {
  id: FaceId;
  normal: Vec3;
  corners: Quad;
}

export interface WorldFace {
  id: FaceId;
  normal: Vec3;
  corners: Quad;
  center: Vec3;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** 0 = face grain, 1 = edge / end grain. Each group counts indices. */
  groups: Array<{ start: number; count: number; materialIndex: number }>;
}

export function tuple(p: Vec3): Vec3Tuple {
  return [p.x, p.y, p.z];
}

export function fromTuple(t: Vec3Tuple): Vec3 {
  return { x: t[0], y: t[1], z: t[2] };
}

/** Z of an end face at a given local X and Y. Length is the centreline. */
export function endZ(
  piece: Pick<Piece, "length" | "mitreStart" | "mitreEnd" | "bevelStart" | "bevelEnd">,
  end: "start" | "end",
  x: number,
  y = 0,
): number {
  const mitre = ((end === "start" ? piece.mitreStart : piece.mitreEnd) || 0) * DEG;
  const bevel = ((end === "start" ? piece.bevelStart : piece.bevelEnd) || 0) * DEG;
  const base = end === "start" ? -piece.length / 2 : piece.length / 2;
  return base + x * Math.tan(mitre) + y * Math.tan(bevel);
}

export function sectionWidths(piece: Pick<Piece, "width" | "widthStart" | "widthEnd">): { start: number; end: number } {
  const start = piece.widthStart || piece.width;
  const end = piece.widthEnd || piece.width;
  return { start, end };
}

export function localToWorld(piece: Pick<Piece, "position" | "rotation">, local: Vec3): Vec3 {
  return add(rotateEuler(local, piece.rotation), fromTuple(piece.position));
}

/** Inverse of `rotateEuler` for the same XYZ convention. */
export function worldToLocal(piece: Pick<Piece, "position" | "rotation">, world: Vec3): Vec3 {
  const p = sub(world, fromTuple(piece.position));
  const [rx, ry, rz] = piece.rotation;
  const cx = Math.cos(-rx);
  const sx = Math.sin(-rx);
  const y1 = p.y * cx - p.z * sx;
  const z1 = p.y * sx + p.z * cx;
  const x1 = p.x;
  const cy = Math.cos(-ry);
  const sy = Math.sin(-ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;
  const cz = Math.cos(-rz);
  const sz = Math.sin(-rz);
  return {
    x: x2 * cz - y2 * sz,
    y: x2 * sz + y2 * cz,
    z: z2,
  };
}

export function pointLengths(piece: Pick<Piece, "length" | "width" | "mitreStart" | "mitreEnd">): {
  center: number;
  long: number;
  short: number;
} {
  const delta = Math.tan(piece.mitreEnd * DEG) - Math.tan(piece.mitreStart * DEG);
  const extra = (piece.width / 2) * delta;
  return {
    center: piece.length,
    long: piece.length + Math.abs(extra),
    short: piece.length - Math.abs(extra),
  };
}

export function localFaces(
  piece: Pick<Piece, "length" | "width" | "widthStart" | "widthEnd" | "thickness" | "mitreStart" | "mitreEnd" | "bevelStart" | "bevelEnd">,
): LocalFace[] {
  const widths = sectionWidths(piece);
  const ws = widths.start / 2;
  const we = widths.end / 2;
  const t = piece.thickness / 2;
  const zs = (x: number, y: number) => endZ(piece, "start", x, y);
  const ze = (x: number, y: number) => endZ(piece, "end", x, y);
  const face = (id: FaceId, corners: Quad): LocalFace => ({ id, corners, normal: outwardNormal(corners) });

  return [
    face("top", [v(-ws, t, zs(-ws, t)), v(ws, t, zs(ws, t)), v(we, t, ze(we, t)), v(-we, t, ze(-we, t))]),
    face("bottom", [v(-ws, -t, zs(-ws, -t)), v(-we, -t, ze(-we, -t)), v(we, -t, ze(we, -t)), v(ws, -t, zs(ws, -t))]),
    face("left", [v(-ws, -t, zs(-ws, -t)), v(-ws, t, zs(-ws, t)), v(-we, t, ze(-we, t)), v(-we, -t, ze(-we, -t))]),
    face("right", [v(ws, -t, zs(ws, -t)), v(we, -t, ze(we, -t)), v(we, t, ze(we, t)), v(ws, t, zs(ws, t))]),
    face("start", [v(-ws, -t, zs(-ws, -t)), v(ws, -t, zs(ws, -t)), v(ws, t, zs(ws, t)), v(-ws, t, zs(-ws, t))]),
    face("end", [v(-we, -t, ze(-we, -t)), v(-we, t, ze(-we, t)), v(we, t, ze(we, t)), v(we, -t, ze(we, -t))]),
  ];
}

function outwardNormal(corners: Quad): Vec3 {
  const guessed = normalize(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
  const center = mul(corners.reduce((sum, corner) => add(sum, corner), v(0, 0, 0)), 0.25);
  return dot(guessed, center) < 0 ? mul(guessed, -1) : guessed;
}

export function worldFaces(piece: Piece): WorldFace[] {
  return localFaces(piece).map((face) => {
    const corners = face.corners.map((corner) => localToWorld(piece, corner)) as Quad;
    const normal = normalize(rotateEuler(face.normal, piece.rotation));
    const center = mul(corners.reduce((sum, corner) => add(sum, corner), v(0, 0, 0)), 0.25);
    return { id: face.id, normal, corners, center };
  });
}

export function worldCorners(piece: Piece): Vec3[] {
  const seen = new Map<string, Vec3>();
  for (const face of worldFaces(piece)) {
    for (const corner of face.corners) {
      const key = `${corner.x.toFixed(3)},${corner.y.toFixed(3)},${corner.z.toFixed(3)}`;
      seen.set(key, corner);
    }
  }
  return [...seen.values()];
}

/** UV in millimetres so a repeating grain texture stays a constant size. */
function uvOf(face: FaceId, p: Vec3, grain: "length" | "width"): [number, number] {
  let u = p.x;
  let vv = p.z;
  if (face === "left" || face === "right") {
    u = p.z;
    vv = p.y;
  } else if (face === "start" || face === "end") {
    u = p.x;
    vv = p.y;
  }
  return grain === "width" ? [vv, u] : [u, vv];
}

function wind(corners: Quad, outward: Vec3): Quad {
  const n = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
  if (dot(n, outward) < 0) return [corners[0], corners[3], corners[2], corners[1]];
  return corners;
}

export function buildMesh(piece: Piece): MeshData {
  if (piece.outline && piece.outline.length >= 3) return extrudeOutline(piece.outline, piece.thickness, piece.finish?.grain ?? "length");
  const faces = localFaces(piece);
  const positions = new Float32Array(faces.length * 4 * 3);
  const normals = new Float32Array(faces.length * 4 * 3);
  const uvs = new Float32Array(faces.length * 4 * 2);
  const indices = new Uint32Array(faces.length * 6);
  const groups: MeshData["groups"] = [];

  faces.forEach((face, faceIndex) => {
    const corners = wind(face.corners, face.normal);
    const base = faceIndex * 4;
    corners.forEach((corner, i) => {
      const p = base * 3 + i * 3;
      positions[p] = corner.x;
      positions[p + 1] = corner.y;
      positions[p + 2] = corner.z;
      normals[p] = face.normal.x;
      normals[p + 1] = face.normal.y;
      normals[p + 2] = face.normal.z;
      const [u, vv] = uvOf(face.id, corner, piece.finish?.grain ?? "length");
      uvs[(base + i) * 2] = u / 180;
      uvs[(base + i) * 2 + 1] = vv / 180;
    });
    const indexBase = faceIndex * 6;
    indices[indexBase] = base;
    indices[indexBase + 1] = base + 1;
    indices[indexBase + 2] = base + 2;
    indices[indexBase + 3] = base;
    indices[indexBase + 4] = base + 2;
    indices[indexBase + 5] = base + 3;
    const edge = face.id === "top" || face.id === "bottom" ? 0 : 1;
    groups.push({ start: indexBase, count: 6, materialIndex: edge });
  });

  return { positions, normals, uvs, indices, groups };
}

/** Extrude a simple XZ polygon through the thickness. The outline is the bandsaw path. */
export function extrudeOutline(outline: Array<{ x: number; z: number }>, thickness: number, grain: "length" | "width" = "length"): MeshData {
  const triangles = triangulate(outline);
  const n = outline.length;
  const vertexCount = n * 6;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  const half = thickness / 2;
  const write = (index: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    normals[index * 3] = nx;
    normals[index * 3 + 1] = ny;
    normals[index * 3 + 2] = nz;
    const uv = grain === "width" ? [z, x] : [x, z];
    uvs[index * 2] = uv[0] / 180;
    uvs[index * 2 + 1] = uv[1] / 180;
  };
  outline.forEach((point, index) => {
    write(index, point.x, half, point.z, 0, 1, 0);
    write(n + index, point.x, -half, point.z, 0, -1, 0);
  });
  for (let i = 0; i < triangles.length; i += 3) {
    indices.push(triangles[i], triangles[i + 1], triangles[i + 2]);
    indices.push(n + triangles[i], n + triangles[i + 2], n + triangles[i + 1]);
  }
  const topIndexCount = indices.length;
  for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n;
    const edge = sub(v(outline[next].x, 0, outline[next].z), v(outline[i].x, 0, outline[i].z));
    const normal = mul(normalize(cross(edge, v(0, 1, 0))), -1);
    const base = n * 2 + i * 4;
    const quad = [
      v(outline[i].x, -half, outline[i].z),
      v(outline[next].x, -half, outline[next].z),
      v(outline[next].x, half, outline[next].z),
      v(outline[i].x, half, outline[i].z),
    ];
    quad.forEach((corner, cornerIndex) => write(base + cornerIndex, corner.x, corner.y, corner.z, normal.x, normal.y, normal.z));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    positions,
    normals,
    uvs,
    indices: new Uint32Array(indices),
    groups: [
      { start: 0, count: topIndexCount, materialIndex: 0 },
      { start: topIndexCount, count: indices.length - topIndexCount, materialIndex: 1 },
    ],
  };
}

function triangulate(poly: Array<{ x: number; z: number }>): number[] {
  const index = poly.map((_, i) => i);
  const triangles: number[] = [];
  const ccw = signedArea(poly) > 0;
  let guard = 0;
  while (index.length > 3 && guard < 800) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < index.length; i += 1) {
      const i0 = index[(i + index.length - 1) % index.length];
      const i1 = index[i];
      const i2 = index[(i + 1) % index.length];
      if (!isEar(poly, index, i0, i1, i2, ccw)) continue;
      triangles.push(i0, i1, i2);
      index.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (index.length === 3) triangles.push(index[0], index[1], index[2]);
  return triangles;
}

function signedArea(poly: Array<{ x: number; z: number }>): number {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const next = poly[(i + 1) % poly.length];
    area += poly[i].x * next.z - next.x * poly[i].z;
  }
  return area / 2;
}

function isEar(poly: Array<{ x: number; z: number }>, live: number[], i0: number, i1: number, i2: number, ccw: boolean): boolean {
  const a = poly[i0];
  const b = poly[i1];
  const c = poly[i2];
  const cross2 = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  if (ccw ? cross2 <= 1e-6 : cross2 >= -1e-6) return false;
  for (const index of live) {
    if (index === i0 || index === i1 || index === i2) continue;
    if (pointInTriangle(poly[index], a, b, c)) return false;
  }
  return true;
}

function pointInTriangle(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
): boolean {
  const ab = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const bc = (c.x - b.x) * (p.z - b.z) - (c.z - b.z) * (p.x - b.x);
  const ca = (a.x - c.x) * (p.z - c.z) - (a.z - c.z) * (p.x - c.x);
  return (ab >= -1e-6 && bc >= -1e-6 && ca >= -1e-6) || (ab <= 1e-6 && bc <= 1e-6 && ca <= 1e-6);
}

export interface FaceUv {
  face: FaceId;
  u: number;
  v: number;
  /** Local point on the face. */
  local: Vec3;
  normal: Vec3;
}

/** Map a local-space point to face coordinates. Picks the face whose outward normal best matches. */
export function faceUvFromLocal(piece: Piece, local: Vec3, localNormal: Vec3): FaceUv | null {
  let best: LocalFace | null = null;
  let bestDot = -Infinity;
  for (const face of localFaces(piece)) {
    const d = dot(normalize(localNormal), face.normal);
    if (d > bestDot) {
      bestDot = d;
      best = face;
    }
  }
  if (!best || bestDot < 0.6) return null;

  const w = piece.width;
  const t = piece.thickness;
  const length = piece.length;
  let u = 0;
  let vCoord = 0;
  if (best.id === "top" || best.id === "bottom") {
    u = local.x + w / 2;
    vCoord = local.z + length / 2;
  } else if (best.id === "left" || best.id === "right") {
    u = local.z + length / 2;
    vCoord = local.y + t / 2;
  } else {
    u = local.x + w / 2;
    vCoord = local.y + t / 2;
  }
  return { face: best.id, u, v: vCoord, local, normal: best.normal };
}

export function holeLocalPoint(piece: Piece, face: FaceId, u: number, vCoord: number): Vec3 {
  const w = piece.width;
  const t = piece.thickness;
  const length = piece.length;
  if (face === "top") return v(u - w / 2, t / 2, vCoord - length / 2);
  if (face === "bottom") return v(u - w / 2, -t / 2, vCoord - length / 2);
  if (face === "left") return v(-w / 2, vCoord - t / 2, u - length / 2);
  if (face === "right") return v(w / 2, vCoord - t / 2, u - length / 2);
  if (face === "start") {
    const x = u - w / 2;
    return v(x, vCoord - t / 2, endZ(piece, "start", x));
  }
  const x = u - w / 2;
  return v(x, vCoord - t / 2, endZ(piece, "end", x));
}

export function faceSize(piece: Piece, face: FaceId): { u: number; v: number; depth: number } {
  if (face === "top" || face === "bottom") {
    return { u: piece.width, v: piece.length, depth: piece.thickness };
  }
  if (face === "left" || face === "right") {
    return { u: piece.length, v: piece.thickness, depth: piece.width };
  }
  return { u: piece.width, v: piece.thickness, depth: piece.length };
}

export function inwardNormal(face: FaceId, piece: Piece): Vec3 {
  const found = localFaces(piece).find((item) => item.id === face);
  if (!found) return v(0, -1, 0);
  return mul(found.normal, -1);
}

/** Translation that butts `piece` against other pieces or the floor. Null when nothing is in range. */
export function faceSnapDelta(piece: Piece, others: Piece[], threshold = 28, edgeThreshold = 18): Vec3 | null {
  const faces = worldFaces(piece);
  let floor: Vec3 | null = null;
  let bestFace: { score: number; delta: Vec3 } | null = null;

  for (const face of faces) {
    if (dot(face.normal, v(0, -1, 0)) < 0.985) continue;
    const planeY = face.corners.reduce((sum, corner) => sum + corner.y, 0) / 4;
    if (Math.abs(planeY) > 0.4 && Math.abs(planeY) <= Math.min(threshold, 20) && faceIsLevel(face)) {
      floor = v(0, -planeY, 0);
    }
  }

  for (const other of others) {
    if (other.id === piece.id) continue;
    for (const moving of faces) {
      for (const fixed of worldFaces(other)) {
        if (dot(moving.normal, fixed.normal) > -0.985) continue;
        const gap = dot(sub(moving.center, fixed.center), fixed.normal);
        if (Math.abs(gap) > threshold) continue;
        const normalDelta = mul(fixed.normal, -gap);
        const moved = moving.corners.map((corner) => add(corner, normalDelta)) as Quad;
        if (!quadsOverlap(moved, fixed.corners, fixed.normal, 1.5)) continue;
        const edgeDelta = edgeAlign(moved, fixed.corners, fixed.normal, edgeThreshold);
        const delta = add(normalDelta, edgeDelta);
        const score = len(delta);
        if (!bestFace || score < bestFace.score) bestFace = { score, delta };
      }
    }
  }

  const face = bestFace && len(bestFace.delta) >= 0.05 ? bestFace.delta : null;
  if (floor && face) return overlayAxes(floor, face);
  return face ?? floor;
}

/** Face snap wins on any axis it moves; the floor fills the rest. */
function overlayAxes(base: Vec3, override: Vec3): Vec3 {
  return {
    x: Math.abs(override.x) > 0.05 ? override.x : base.x,
    y: Math.abs(override.y) > 0.05 ? override.y : base.y,
    z: Math.abs(override.z) > 0.05 ? override.z : base.z,
  };
}

export function snapTranslation(
  piece: Piece,
  others: Piece[],
  options: { grid: boolean; gridSize: number; faces: boolean },
): Vec3 {
  const face = options.faces ? faceSnapDelta(piece, others) : null;
  const grid = options.grid ? gridSnapDelta(piece, options.gridSize) : v(0, 0, 0);
  if (face) return overlayAxes(grid, face);
  return grid;
}

function faceIsLevel(face: WorldFace): boolean {
  const y = face.corners[0].y;
  return face.corners.every((corner) => Math.abs(corner.y - y) < 0.4);
}

export function gridSnapDelta(piece: Piece, gridSize: number): Vec3 {
  if (gridSize <= 0) return v(0, 0, 0);
  const corners = worldCorners(piece);
  const minX = Math.min(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const minZ = Math.min(...corners.map((corner) => corner.z));
  const snap = (value: number) => Math.round(value / gridSize) * gridSize;
  return v(snap(minX) - minX, snap(minY) - minY, snap(minZ) - minZ);
}

function planeBasis(normal: Vec3, corners: Quad): { u: Vec3; v: Vec3 } {
  const u = normalize(sub(corners[1], corners[0]));
  const fallback = Math.abs(normal.y) < 0.9 ? v(0, 1, 0) : v(1, 0, 0);
  const uAxis = len(u) > 1e-6 ? u : normalize(cross(fallback, normal));
  const vAxis = normalize(cross(normal, uAxis));
  return { u: uAxis, v: vAxis };
}

function project2(points: Vec3[], basis: { u: Vec3; v: Vec3 }, origin: Vec3): Array<{ u: number; v: number }> {
  return points.map((point) => {
    const d = sub(point, origin);
    return { u: dot(d, basis.u), v: dot(d, basis.v) };
  });
}

function quadsOverlap(a: Quad, b: Quad, normal: Vec3, padding: number): boolean {
  const basis = planeBasis(normal, b);
  const origin = b[0];
  return polygonsOverlap(project2(a, basis, origin), project2(b, basis, origin), padding);
}

function polygonsOverlap(
  a: Array<{ u: number; v: number }>,
  b: Array<{ u: number; v: number }>,
  padding: number,
): boolean {
  const axes = [...edgeAxes(a), ...edgeAxes(b)];
  for (const axis of axes) {
    const pa = projectInterval(a, axis);
    const pb = projectInterval(b, axis);
    if (pa.max < pb.min - padding || pb.max < pa.min - padding) return false;
  }
  return true;
}

function edgeAxes(poly: Array<{ u: number; v: number }>): Array<{ u: number; v: number }> {
  const axes: Array<{ u: number; v: number }> = [];
  for (let i = 0; i < poly.length; i += 1) {
    const next = poly[(i + 1) % poly.length];
    const current = poly[i];
    const dx = next.u - current.u;
    const dy = next.v - current.v;
    const length = Math.hypot(dx, dy) || 1;
    axes.push({ u: -dy / length, v: dx / length });
  }
  return axes;
}

function projectInterval(poly: Array<{ u: number; v: number }>, axis: { u: number; v: number }): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const point of poly) {
    const value = point.u * axis.u + point.v * axis.v;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function edgeAlign(moving: Quad, fixed: Quad, normal: Vec3, threshold: number): Vec3 {
  const basis = planeBasis(normal, fixed);
  const origin = fixed[0];
  const a = project2(moving, basis, origin);
  const b = project2(fixed, basis, origin);
  const ab = bbox(a);
  const bb = bbox(b);
  const du = smallestShift([bb.minU - ab.minU, bb.maxU - ab.maxU, bb.minU - ab.maxU, bb.maxU - ab.minU], threshold);
  const dv = smallestShift([bb.minV - ab.minV, bb.maxV - ab.maxV, bb.minV - ab.maxV, bb.maxV - ab.minV], threshold);
  return add(mul(basis.u, du), mul(basis.v, dv));
}

function bbox(points: Array<{ u: number; v: number }>): { minU: number; maxU: number; minV: number; maxV: number } {
  return {
    minU: Math.min(...points.map((point) => point.u)),
    maxU: Math.max(...points.map((point) => point.u)),
    minV: Math.min(...points.map((point) => point.v)),
    maxV: Math.max(...points.map((point) => point.v)),
  };
}

function smallestShift(candidates: number[], threshold: number): number {
  let best = 0;
  let bestAbs = threshold + 1e-6;
  for (const candidate of candidates) {
    const abs = Math.abs(candidate);
    if (abs <= threshold && abs < bestAbs) {
      best = candidate;
      bestAbs = abs;
    }
  }
  return bestAbs <= threshold ? best : 0;
}

export function translatePiece(piece: Piece, delta: Vec3): Piece {
  return {
    ...piece,
    position: [piece.position[0] + delta.x, piece.position[1] + delta.y, piece.position[2] + delta.z],
  };
}

/** Distance in millimetres from the reference end to where a ray passes the centreline. */
export function rayDistanceOnAxis(piece: Piece, rayOrigin: Vec3, rayDir: Vec3, axis: "length" | "width"): number {
  const span = axis === "length" ? piece.length : piece.width;
  const originLocal = axis === "length" ? v(0, 0, -piece.length / 2) : v(-piece.width / 2, 0, 0);
  const axisLocal = axis === "length" ? v(0, 0, 1) : v(1, 0, 0);
  const start = localToWorld(piece, originLocal);
  const direction = normalize(rotateEuler(axisLocal, piece.rotation));
  const ray = normalize(rayDir);
  const w0 = sub(start, rayOrigin);
  const b = dot(direction, ray);
  const d = dot(direction, w0);
  const e = dot(ray, w0);
  const denom = 1 - b * b;
  const t = Math.abs(denom) < 1e-6 ? 0 : (b * e - d) / denom;
  return clamp(t, 0, span);
}

export function placementFor(existing: Piece[], width: number, thickness: number): Vec3Tuple {
  if (existing.length === 0) return [0, thickness / 2, 0];
  let maxX = -Infinity;
  for (const piece of existing) {
    for (const corner of worldCorners(piece)) maxX = Math.max(maxX, corner.x);
  }
  return [maxX + 40 + width / 2, thickness / 2, 0];
}
