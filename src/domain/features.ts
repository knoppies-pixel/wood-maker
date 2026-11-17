import { holeLocalPoint, localToWorld, sectionWidths } from "./geometry.ts";
import { rotateEuler, sub, uid, v } from "./math.ts";
import {
  BARE_FINISH,
  MIN_PART_MM,
  type EdgeProfile,
  type FaceId,
  type Finish,
  type HardwareItem,
  type HardwareKind,
  type JoineryFeature,
  type Piece,
  type ProfileName,
  type RouterCut,
  type XZPoint,
} from "./types.ts";

export interface HardwareOffer {
  id: string;
  kind: HardwareKind;
  name: string;
  width: number;
  height: number;
  depth: number;
  price: number;
}

export const HARDWARE_CATALOG: HardwareOffer[] = [
  { id: "butt-hinge-60", kind: "hinge", name: "Butt hinge 60 mm", width: 32, height: 60, depth: 2.5, price: 28 },
  { id: "butt-hinge-75", kind: "hinge", name: "Butt hinge 75 mm", width: 40, height: 75, depth: 2.5, price: 36 },
  { id: "slide-350", kind: "drawer-slide", name: "Ball-bearing slide 350 mm", width: 12.7, height: 350, depth: 12.7, price: 85 },
  { id: "slide-450", kind: "drawer-slide", name: "Ball-bearing slide 450 mm", width: 12.7, height: 450, depth: 12.7, price: 98 },
  { id: "pull-128", kind: "handle", name: "Bar pull 128 mm", width: 12, height: 168, depth: 30, price: 48 },
  { id: "knob-30", kind: "handle", name: "Round knob 30 mm", width: 30, height: 30, depth: 26, price: 22 },
];

export const FINISH_PRESETS: Finish[] = [
  BARE_FINISH,
  { grain: "length", treatment: "stain", color: "#c9854a", label: "Golden oak stain" },
  { grain: "length", treatment: "stain", color: "#8a4b2a", label: "Walnut stain" },
  { grain: "length", treatment: "stain", color: "#5c3317", label: "Jacobean stain" },
  { grain: "length", treatment: "paint", color: "#f4f1ea", label: "White paint" },
  { grain: "length", treatment: "paint", color: "#2c3338", label: "Black paint" },
  { grain: "length", treatment: "paint", color: "#7d8c74", label: "Sage paint" },
];

export function shapeDefaults(width: number): Pick<Piece, "bevelStart" | "bevelEnd" | "widthStart" | "widthEnd" | "outline" | "routes" | "profiles" | "joinery" | "finish"> {
  return {
    bevelStart: 0,
    bevelEnd: 0,
    widthStart: width,
    widthEnd: width,
    outline: null,
    routes: [],
    profiles: [],
    joinery: [],
    finish: { ...BARE_FINISH },
  };
}

export function normalizePiece(piece: Piece): Piece {
  const width = piece.width;
  return {
    ...shapeDefaults(width),
    ...piece,
    bevelStart: piece.bevelStart || 0,
    bevelEnd: piece.bevelEnd || 0,
    widthStart: piece.widthStart || width,
    widthEnd: piece.widthEnd || width,
    outline: piece.outline ?? null,
    routes: piece.routes ?? [],
    profiles: piece.profiles ?? [],
    joinery: piece.joinery ?? [],
    finish: piece.finish ?? { ...BARE_FINISH },
    holes: (piece.holes ?? []).map((hole) => ({ ...hole, style: hole.style ?? "twist" })),
  };
}

export function taperPiece(piece: Piece, widthAtStart: number, widthAtEnd: number): { piece: Piece } | { error: string } {
  if (piece.outline) return { error: "A curved piece keeps the outline from the saw. Taper a square section." };
  if (widthAtStart < MIN_PART_MM || widthAtEnd < MIN_PART_MM) return { error: `Each end needs at least ${MIN_PART_MM} mm of width.` };
  const limit = Math.max(piece.width, piece.widthStart || piece.width, piece.widthEnd || piece.width);
  if (widthAtStart > limit + 0.1 || widthAtEnd > limit + 0.1) {
    return { error: "A taper has to fit inside the board you already have." };
  }
  return {
    piece: {
      ...piece,
      widthStart: widthAtStart,
      widthEnd: widthAtEnd,
      width: Math.max(widthAtStart, widthAtEnd),
    },
  };
}

export function curveCut(piece: Piece, points: Array<{ u: number; v: number }>, waste: "left" | "right"): { piece: Piece } | { error: string } {
  if (points.length < 2) return { error: "Draw at least two points on the face." };
  const outline = keptOutline(piece, points, waste);
  if ("error" in outline) return outline;
  return {
    piece: {
      ...piece,
      outline: outline.outline,
      mitreStart: 0,
      mitreEnd: 0,
      bevelStart: 0,
      bevelEnd: 0,
      widthStart: piece.width,
      widthEnd: piece.width,
    },
  };
}

export function keptOutline(
  piece: Pick<Piece, "width" | "length" | "widthStart" | "widthEnd">,
  points: Array<{ u: number; v: number }>,
  waste: "left" | "right",
): { outline: XZPoint[] } | { error: string } {
  const width = Math.max(piece.width, sectionWidths(piece).start, sectionWidths(piece).end);
  const halfW = width / 2;
  const halfL = piece.length / 2;
  const path = points.map((point) => ({ x: point.u - halfW, z: point.v - halfL }));
  const start = snapBoundary(path[0], halfW, halfL);
  const end = snapBoundary(path[path.length - 1], halfW, halfL);
  if (!start || !end) return { error: "Start and finish the cut on an edge of the face." };
  if (start.edge === end.edge) return { error: "The cut has to run from one edge to a different edge." };
  const snapped = path.map((point, index) => (index === 0 ? start.point : index === path.length - 1 ? end.point : clampInside(point, halfW, halfL)));
  const forward = boundaryWalk(end, start, 1, halfW, halfL);
  const backward = boundaryWalk(end, start, -1, halfW, halfL);
  const withPath = (walk: XZPoint[]) => [...snapped, ...walk];
  const left = leftOfPath(snapped);
  const forwardPoly = withPath(forward);
  const backwardPoly = withPath(backward);
  const forwardHoldsLeft = pointInPolygon(left, forwardPoly);
  const keep = waste === "left" ? (forwardHoldsLeft ? backwardPoly : forwardPoly) : forwardHoldsLeft ? forwardPoly : backwardPoly;
  if (keep.length < 3) return { error: "That path does not leave a solid piece." };
  const area = Math.abs(polygonArea(keep));
  if (area < MIN_PART_MM * MIN_PART_MM) return { error: "The offcut would take almost the whole piece." };
  return { outline: stripDuplicates(keep) };
}

export function circleOutline(diameter: number, segments = 24): XZPoint[] {
  const radius = diameter / 2;
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  });
}

export function routeCut(
  piece: Piece,
  input: Omit<RouterCut, "id">,
): { route: RouterCut } | { error: string } {
  if (input.depth < 0.5 || input.depth >= piece.thickness) return { error: "Router depth has to stop short of cutting through." };
  if (input.width < 2) return { error: "The bit needs at least 2 mm of width." };
  return { route: { ...input, id: uid("route") } };
}

export function edgeProfile(input: Omit<EdgeProfile, "id">, thickness: number): { profile: EdgeProfile } | { error: string } {
  if (input.radius < 1 || input.radius > thickness / 2) {
    return { error: `Use a radius between 1 mm and ${Math.floor(thickness / 2)} mm so the profile stays on the corner.` };
  }
  return { profile: { ...input, id: uid("profile") } };
}

export interface JointPlan {
  pieces: Piece[];
  movedId?: string;
}

export function planJoint(
  kind: "mortise-tenon" | "half-lap" | "dovetail" | "dowels",
  first: Piece,
  firstFace: FaceId,
  firstUv: { u: number; v: number },
  second: Piece,
  secondFace: FaceId,
  secondUv: { u: number; v: number } = { u: second.width / 2, v: second.thickness / 2 },
  dowelDiameter = 8,
): JointPlan | { error: string } {
  const pairId = uid("joint");
  if (kind === "mortise-tenon") return mortiseAndTenon(first, firstFace, firstUv, second, secondFace, pairId);
  if (kind === "half-lap") return halfLap(first, firstFace, second, secondFace, pairId);
  if (kind === "dovetail") return dovetail(first, firstFace, second, secondFace, pairId);
  return dowels(first, firstFace, firstUv, second, secondFace, secondUv, pairId, dowelDiameter);
}

function mortiseAndTenon(stile: Piece, stileFace: FaceId, uv: { u: number; v: number }, rail: Piece, railFace: FaceId, pairId: string): JointPlan | { error: string } {
  if (railFace !== "start" && railFace !== "end") return { error: "Click the end of the rail for the tenon." };
  const tenonThickness = Math.max(6, Math.round(rail.thickness / 3));
  const tenonWidth = Math.max(10, rail.width - 12);
  const tenonLength = Math.min(30, Math.max(12, stile.thickness * 0.6));
  const mortise: JoineryFeature = {
    id: uid("join"),
    pairId,
    matePieceId: rail.id,
    kind: "mortise",
    face: stileFace,
    u: uv.u,
    v: uv.v,
    width: tenonWidth,
    height: tenonThickness,
    depth: tenonLength,
  };
  const tenon: JoineryFeature = {
    id: uid("join"),
    pairId,
    matePieceId: stile.id,
    kind: "tenon",
    face: railFace,
    u: rail.width / 2,
    v: rail.thickness / 2,
    width: tenonWidth,
    height: tenonThickness,
    depth: tenonLength,
  };
  const moved = fitEndToFace(rail, railFace, stile, stileFace, uv);
  return { pieces: [withJoinery(stile, mortise), withJoinery(moved, tenon)], movedId: rail.id };
}

function halfLap(a: Piece, aFace: FaceId, b: Piece, bFace: FaceId, pairId: string): JointPlan | { error: string } {
  const lapA = Math.min(a.length * 0.45, Math.max(b.thickness, b.width) );
  const lapB = Math.min(b.length * 0.45, Math.max(a.thickness, a.width));
  const feature = (piece: Piece, mate: Piece, face: FaceId, depth: number): JoineryFeature => ({
    id: uid("join"),
    pairId,
    matePieceId: mate.id,
    kind: "half-lap",
    face,
    u: piece.width / 2,
    v: piece.thickness / 2,
    width: piece.width,
    height: piece.thickness / 2,
    depth,
  });
  return {
    pieces: [withJoinery(a, feature(a, b, aFace, lapA)), withJoinery(b, feature(b, a, bFace, lapB))],
  };
}

function dovetail(tailPiece: Piece, tailFace: FaceId, pinPiece: Piece, pinFace: FaceId, pairId: string): JointPlan | { error: string } {
  if ((tailFace !== "start" && tailFace !== "end") || (pinFace !== "start" && pinFace !== "end")) {
    return { error: "Dovetails are cut on the ends. Click an end of each piece." };
  }
  const angle = 10;
  const width = Math.max(12, tailPiece.width * 0.45);
  const height = tailPiece.thickness;
  const depth = Math.min(pinPiece.thickness, 18);
  const tail: JoineryFeature = {
    id: uid("join"),
    pairId,
    matePieceId: pinPiece.id,
    kind: "dovetail-tail",
    face: tailFace,
    u: tailPiece.width / 2,
    v: tailPiece.thickness / 2,
    width,
    height,
    depth,
    angle,
  };
  const pin: JoineryFeature = {
    id: uid("join"),
    pairId,
    matePieceId: tailPiece.id,
    kind: "dovetail-pin",
    face: pinFace,
    u: pinPiece.width / 2,
    v: pinPiece.thickness / 2,
    width,
    height,
    depth,
    angle,
  };
  const moved = fitEndToFace(tailPiece, tailFace, pinPiece, pinFace, { u: pin.width / 2, v: pin.height / 2 });
  return { pieces: [withJoinery(moved, tail), withJoinery(pinPiece, pin)], movedId: tailPiece.id };
}

function dowels(
  a: Piece,
  aFace: FaceId,
  uv: { u: number; v: number },
  b: Piece,
  bFace: FaceId,
  bUv: { u: number; v: number },
  pairId: string,
  diameter: number,
): JointPlan | { error: string } {
  const spacing = Math.max(diameter * 3, 24);
  const offsets = [-spacing / 2, spacing / 2];
  const depth = Math.min(20, a.thickness * 0.7, b.thickness * 0.7);
  const features = (mate: Piece, face: FaceId, origin: { u: number; v: number }): JoineryFeature[] =>
    offsets.map((offset) => ({
      id: uid("join"),
      pairId,
      matePieceId: mate.id,
      kind: "dowel" as const,
      face,
      u: origin.u + offset,
      v: origin.v,
      width: diameter,
      height: diameter,
      depth,
    }));
  const onA = features(b, aFace, uv);
  const onB = features(a, bFace, bUv);
  let nextA = a;
  let nextB = b;
  for (const feature of onA) nextA = withJoinery(nextA, feature);
  for (const feature of onB) nextB = withJoinery(nextB, feature);
  return { pieces: [nextA, nextB] };
}

export function placeHardware(
  offer: HardwareOffer,
  piece: Piece,
  face: FaceId,
  uv: { u: number; v: number },
  mate?: Piece,
): HardwareItem {
  return {
    id: uid("hw"),
    catalogId: offer.id,
    kind: offer.kind,
    name: offer.name,
    pieceId: piece.id,
    matePieceId: mate?.id,
    face,
    u: uv.u,
    v: uv.v,
    width: offer.width,
    height: offer.height,
    depth: offer.depth,
    price: offer.price,
  };
}

function withJoinery(piece: Piece, feature: JoineryFeature): Piece {
  return { ...piece, joinery: [...(piece.joinery ?? []), feature] };
}

function fitEndToFace(moving: Piece, movingFace: FaceId, target: Piece, targetFace: FaceId, uv: { u: number; v: number }): Piece {
  const mouth = localToWorld(target, holeLocalPoint(target, targetFace, uv.u, uv.v));
  const endLocal = v(0, 0, movingFace === "end" ? moving.length / 2 : -moving.length / 2);
  const rotated = rotateEuler(endLocal, moving.rotation);
  const position = sub(mouth, rotated);
  return { ...moving, position: [position.x, position.y, position.z] };
}

function snapBoundary(point: XZPoint, halfW: number, halfL: number): { point: XZPoint; edge: number } | null {
  const slack = 14;
  const candidates = [
    { edge: 0, dist: Math.abs(point.z + halfL), point: { x: clamp(point.x, -halfW, halfW), z: -halfL } },
    { edge: 1, dist: Math.abs(point.x - halfW), point: { x: halfW, z: clamp(point.z, -halfL, halfL) } },
    { edge: 2, dist: Math.abs(point.z - halfL), point: { x: clamp(point.x, -halfW, halfW), z: halfL } },
    { edge: 3, dist: Math.abs(point.x + halfW), point: { x: -halfW, z: clamp(point.z, -halfL, halfL) } },
  ].sort((a, b) => a.dist - b.dist);
  const best = candidates[0];
  if (!best || best.dist > slack) return null;
  return { point: best.point, edge: best.edge };
}

function clampInside(point: XZPoint, halfW: number, halfL: number): XZPoint {
  return { x: clamp(point.x, -halfW, halfW), z: clamp(point.z, -halfL, halfL) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boundaryWalk(from: { point: XZPoint; edge: number }, to: { point: XZPoint; edge: number }, direction: 1 | -1, halfW: number, halfL: number): XZPoint[] {
  const corners = [
    { x: -halfW, z: -halfL },
    { x: halfW, z: -halfL },
    { x: halfW, z: halfL },
    { x: -halfW, z: halfL },
  ];
  const points: XZPoint[] = [];
  let edge = from.edge;
  let guard = 0;
  while (edge !== to.edge && guard < 6) {
    const cornerIndex = direction === 1 ? (edge + 1) % 4 : edge;
    points.push(corners[cornerIndex]);
    edge = (edge + direction + 4) % 4;
    guard += 1;
  }
  points.push(to.point);
  return points;
}

function leftOfPath(path: XZPoint[]): XZPoint {
  const a = path[0];
  const b = path[path.length - 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const mid = path[Math.floor(path.length / 2)];
  return { x: mid.x + (-dz / length) * 3, z: mid.z + (dx / length) * 3 };
}

function pointInPolygon(point: XZPoint, poly: XZPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const yi = poly[i].z;
    const yj = poly[j].z;
    const xi = poly[i].x;
    const xj = poly[j].x;
    const intersect = yi > point.z !== yj > point.z && point.x < ((xj - xi) * (point.z - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: XZPoint[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const next = poly[(i + 1) % poly.length];
    area += poly[i].x * next.z - next.x * poly[i].z;
  }
  return area / 2;
}

function stripDuplicates(poly: XZPoint[]): XZPoint[] {
  return poly.filter((point, index) => {
    const prev = poly[(index + poly.length - 1) % poly.length];
    return Math.hypot(point.x - prev.x, point.z - prev.z) > 0.2;
  });
}

export function describePiece(piece: Piece): string {
  const notes: string[] = [];
  if ((piece.bevelStart || 0) !== 0 || (piece.bevelEnd || 0) !== 0) notes.push(`bevel ${piece.bevelStart || 0}° / ${piece.bevelEnd || 0}°`);
  if (piece.widthStart && piece.widthEnd && (piece.widthStart !== piece.widthEnd)) notes.push(`taper ${Math.round(piece.widthStart)}→${Math.round(piece.widthEnd)}`);
  if (piece.outline) notes.push("curved saw cut");
  const styles = new Map<string, number>();
  for (const hole of piece.holes ?? []) styles.set(hole.style ?? "twist", (styles.get(hole.style ?? "twist") ?? 0) + 1);
  for (const [style, count] of styles) {
    if (style === "twist") notes.push(`${count} hole${count === 1 ? "" : "s"}`);
    else notes.push(`${count} ${style}`);
  }
  for (const route of piece.routes ?? []) notes.push(route.kind);
  for (const profile of piece.profiles ?? []) notes.push(profile.profile);
  const joints = new Set((piece.joinery ?? []).map((feature) => feature.kind));
  for (const joint of joints) notes.push(joint);
  if (piece.finish && piece.finish.treatment !== "bare") notes.push(piece.finish.label);
  return notes.join(" · ");
}

export function profileLabelName(profile: ProfileName): string {
  if (profile === "round-over") return "Round-over";
  if (profile === "chamfer") return "Chamfer";
  return "Cove";
}
