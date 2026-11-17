import {
  faceSize,
  holeLocalPoint,
  localToWorld,
  placementFor,
} from "./geometry.ts";
import { DEG, clamp, uid, v } from "./math.ts";
import { MIN_PART_MM, type Board, type Fastener, type Hole, type Piece, type StockItem } from "./types.ts";

export interface CutOk {
  ok: true;
  pieces: [Piece, Piece];
  droppedFasteners: number;
}

export interface CutErr {
  ok: false;
  reason: string;
}

export function kerfAlong(kerf: number, mitreDeg: number): number {
  const cosine = Math.cos(clamp(mitreDeg, -70, 70) * DEG);
  return kerf / Math.max(0.3, Math.abs(cosine));
}

export function addStockPiece(
  stock: StockItem,
  length: number,
  existing: Piece[],
): { board: Board; piece: Piece } | { error: string } {
  const offer = stock.lengths.find((item) => item.length === length);
  if (!offer) return { error: "That length is not in the catalogue." };
  if (stock.thickness <= 0 || stock.width <= 0 || length <= 0) {
    return { error: "Stock dimensions must be greater than zero." };
  }
  const boardId = uid("board");
  const position = placementFor(existing, stock.width, stock.thickness);
  const board: Board = {
    id: boardId,
    stockId: stock.id,
    name: stock.name,
    species: stock.species,
    thickness: stock.thickness,
    width: stock.width,
    length,
    price: offer.price,
    sheet: Boolean(stock.sheet),
  };
  const piece: Piece = {
    id: uid("piece"),
    name: uniqueName(stock.name, existing),
    boardId,
    stockId: stock.id,
    species: stock.species,
    profileName: stock.name,
    thickness: stock.thickness,
    width: stock.width,
    length,
    mitreStart: 0,
    mitreEnd: 0,
    position,
    rotation: [0, 0, 0],
    holes: [],
    spanStart: 0,
    spanEnd: length,
  };
  return { board, piece };
}

export function crosscut(piece: Piece, distanceFromStart: number, mitreDeg: number, kerf: number): CutOk | CutErr {
  const angle = clamp(mitreDeg, -60, 60);
  const consumed = kerfAlong(kerf, angle);
  const remain = piece.length - distanceFromStart - consumed;
  if (!(distanceFromStart >= MIN_PART_MM && remain >= MIN_PART_MM)) {
    return {
      ok: false,
      reason: `Both pieces need at least ${MIN_PART_MM} mm. With a ${trim(kerf)} mm kerf this board can be marked between ${MIN_PART_MM} and ${trim(piece.length - consumed - MIN_PART_MM)} mm.`,
    };
  }
  const len2 = remain;
  const off1 = -piece.length / 2 + distanceFromStart / 2;
  const off2 = -piece.length / 2 + distanceFromStart + consumed + len2 / 2;
  const pos1 = localToWorld(piece, v(0, 0, off1));
  const pos2 = localToWorld(piece, v(0, 0, off2));
  const holes = splitHolesCross(piece, distanceFromStart, consumed);
  const a = makeChild(piece, {
    length: distanceFromStart,
    mitreEnd: angle,
    position: [pos1.x, pos1.y, pos1.z],
    holes: holes.a,
    spanEnd: piece.spanStart + distanceFromStart,
    name: partName(piece.name, distanceFromStart),
  });
  const b = makeChild(piece, {
    length: len2,
    mitreStart: angle,
    position: [pos2.x, pos2.y, pos2.z],
    holes: holes.b,
    spanStart: piece.spanStart + distanceFromStart + consumed,
    name: partName(piece.name, len2),
  });
  return { ok: true, pieces: [a, b], droppedFasteners: 0 };
}

export function rip(piece: Piece, distanceFromLeft: number, kerf: number): CutOk | CutErr {
  const remain = piece.width - distanceFromLeft - kerf;
  if (!(distanceFromLeft >= MIN_PART_MM && remain >= MIN_PART_MM)) {
    return {
      ok: false,
      reason: `Both rips need at least ${MIN_PART_MM} mm of width after the ${trim(kerf)} mm kerf.`,
    };
  }
  const off1 = -piece.width / 2 + distanceFromLeft / 2;
  const off2 = -piece.width / 2 + distanceFromLeft + kerf + remain / 2;
  const pos1 = localToWorld(piece, v(off1, 0, 0));
  const pos2 = localToWorld(piece, v(off2, 0, 0));
  const holes = splitHolesRip(piece, distanceFromLeft, kerf);
  const a = makeChild(piece, {
    width: distanceFromLeft,
    position: [pos1.x, pos1.y, pos1.z],
    holes: holes.a,
    name: partName(piece.name, piece.length),
  });
  const b = makeChild(piece, {
    width: remain,
    position: [pos2.x, pos2.y, pos2.z],
    holes: holes.b,
    name: partName(piece.name, piece.length),
  });
  if (a.name === b.name) b.name = `${b.name} b`;
  return { ok: true, pieces: [a, b], droppedFasteners: 0 };
}

export function canPlaceHole(piece: Piece, hole: Pick<Hole, "face" | "u" | "v" | "diameter" | "depth">): string | null {
  const size = faceSize(piece, hole.face);
  const radius = hole.diameter / 2;
  if (hole.diameter < 1) return "Drill at least 1 mm.";
  if (hole.diameter > Math.min(size.u, size.v) - 1) return "That bit is wider than the face.";
  if (hole.u < radius || hole.v < radius || hole.u > size.u - radius || hole.v > size.v - radius) {
    return "The hole would break out of the face. Move it in from the edge.";
  }
  if (hole.depth < 1) return "Depth must be at least 1 mm.";
  if ((hole.face === "top" || hole.face === "bottom") && Math.abs(piece.mitreStart) + Math.abs(piece.mitreEnd) > 0.1) {
    const local = holeLocalPoint(piece, hole.face, hole.u, hole.v);
    const x = local.x;
    const start = -piece.length / 2 + x * Math.tan(piece.mitreStart * DEG);
    const end = piece.length / 2 + x * Math.tan(piece.mitreEnd * DEG);
    if (local.z - radius < start || local.z + radius > end) {
      return "The hole runs off the mitred face.";
    }
  }
  return null;
}

export function makeHole(
  piece: Piece,
  input: Pick<Hole, "face" | "u" | "v" | "diameter" | "depth" | "through">,
): { hole: Hole } | { error: string } {
  const size = faceSize(piece, input.face);
  const depth = input.through ? size.depth : Math.min(input.depth, size.depth);
  const hole: Hole = {
    id: uid("hole"),
    face: input.face,
    u: input.u,
    v: input.v,
    diameter: input.diameter,
    depth,
    through: input.through || depth >= size.depth - 0.1,
  };
  const problem = canPlaceHole(piece, hole);
  if (problem) return { error: problem };
  return { hole };
}

export function connectedIds(fasteners: Fastener[], pieceId: string): string[] {
  const adjacent = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a)?.add(b);
    adjacent.get(b)?.add(a);
  };
  for (const fastener of fasteners) link(fastener.pieceAId, fastener.pieceBId);
  const seen = new Set<string>();
  const stack = [pieceId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacent.get(id) ?? []) stack.push(next);
  }
  return [...seen];
}

export function dropFasteners(fasteners: Fastener[], pieceId: string): { fasteners: Fastener[]; dropped: number } {
  const next = fasteners.filter((item) => item.pieceAId !== pieceId && item.pieceBId !== pieceId);
  return { fasteners: next, dropped: fasteners.length - next.length };
}

export function withoutPiece(
  pieces: Piece[],
  boards: Board[],
  fasteners: Fastener[],
  pieceId: string,
): { pieces: Piece[]; boards: Board[]; fasteners: Fastener[] } {
  const nextPieces = pieces.filter((piece) => piece.id !== pieceId);
  const used = new Set(nextPieces.map((piece) => piece.boardId));
  return {
    pieces: nextPieces,
    boards: boards.filter((board) => used.has(board.id)),
    fasteners: fasteners.filter((item) => item.pieceAId !== pieceId && item.pieceBId !== pieceId),
  };
}

function makeChild(piece: Piece, patch: Partial<Piece>): Piece {
  return {
    ...piece,
    ...patch,
    id: uid("piece"),
    holes: patch.holes ?? [],
  };
}

function uniqueName(base: string, pieces: Piece[]): string {
  const names = new Set(pieces.map((piece) => piece.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function partName(name: string, length: number): string {
  const base = name.replace(/ · \d+(\.\d+)? mm$/, "");
  return `${base} · ${Math.round(length)} mm`;
}

function splitHolesCross(piece: Piece, distance: number, consumed: number): { a: Hole[]; b: Hole[] } {
  const a: Hole[] = [];
  const b: Hole[] = [];
  for (const hole of piece.holes) {
    if (hole.face === "start") {
      a.push({ ...hole, id: uid("hole") });
      continue;
    }
    if (hole.face === "end") {
      b.push({ ...hole, id: uid("hole") });
      continue;
    }
    const along = hole.face === "top" || hole.face === "bottom" ? hole.v : hole.u;
    if (along <= distance) {
      a.push({ ...hole, id: uid("hole") });
    } else if (along >= distance + consumed) {
      const shift = distance + consumed;
      if (hole.face === "top" || hole.face === "bottom") b.push({ ...hole, id: uid("hole"), v: hole.v - shift });
      else b.push({ ...hole, id: uid("hole"), u: hole.u - shift });
    }
  }
  return { a, b };
}

function splitHolesRip(piece: Piece, distance: number, kerf: number): { a: Hole[]; b: Hole[] } {
  const a: Hole[] = [];
  const b: Hole[] = [];
  for (const hole of piece.holes) {
    if (hole.face === "left") {
      a.push({ ...hole, id: uid("hole") });
      continue;
    }
    if (hole.face === "right") {
      b.push({ ...hole, id: uid("hole") });
      continue;
    }
    if (hole.u <= distance) a.push({ ...hole, id: uid("hole") });
    else if (hole.u >= distance + kerf) b.push({ ...hole, id: uid("hole"), u: hole.u - distance - kerf });
  }
  return { a, b };
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function screwLabel(diameter: number, length: number): string {
  const gauge = Number.isInteger(diameter) ? String(diameter) : diameter.toFixed(1);
  return `${gauge}×${Math.round(length)}`;
}
