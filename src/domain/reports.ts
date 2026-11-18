import { describePiece } from "./features.ts";
import { pointLengths } from "./geometry.ts";
import { formatMm } from "./math.ts";
import { instanceCount } from "./modifiers.ts";
import type { Board, Fastener, HardwareItem, Piece, PlanBillLine } from "./types.ts";

export interface CutPart {
  pieceId: string;
  name: string;
  length: number;
  width: number;
  thickness: number;
  mitreStart: number;
  mitreEnd: number;
  longPoint: number;
  shortPoint: number;
  holes: number;
  quantity: number;
  notes: string;
  spanStart: number;
  spanEnd: number;
}

export interface CutBoard {
  boardId: string;
  stockName: string;
  species: string;
  thickness: number;
  width: number;
  boardLength: number;
  price: number;
  sheet: boolean;
  parts: CutPart[];
  /** Board length not represented by a remaining part: kerf and deleted offcuts. */
  discarded: number;
}

export interface ShopLine {
  key: string;
  name: string;
  species: string;
  thickness: number;
  width: number;
  length: number;
  sheet: boolean;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface FastenerLine {
  key: string;
  label: string;
  diameter: number;
  length: number;
  quantity: number;
  joints: string[];
}

export function cutList(boards: Board[], pieces: Piece[]): CutBoard[] {
  return boards.map((board) => {
    const parts = pieces
      .filter((piece) => piece.boardId === board.id)
      .map((piece) => {
        const points = pointLengths(piece);
        return {
          pieceId: piece.id,
          name: piece.name,
          length: piece.length,
          width: piece.width,
          thickness: piece.thickness,
          mitreStart: piece.mitreStart,
          mitreEnd: piece.mitreEnd,
          longPoint: points.long,
          shortPoint: points.short,
          holes: piece.holes.length,
          quantity: instanceCount(piece, pieces),
          notes: describePiece(piece),
          spanStart: piece.spanStart,
          spanEnd: piece.spanEnd,
        } satisfies CutPart;
      })
      .sort((a, b) => a.spanStart - b.spanStart || a.name.localeCompare(b.name));
    const covered = unionLength(parts.map((part) => ({ start: part.spanStart, end: part.spanEnd })));
    return {
      boardId: board.id,
      stockName: board.name,
      species: board.species,
      thickness: board.thickness,
      width: board.width,
      boardLength: board.length,
      price: board.price,
      sheet: board.sheet,
      parts,
      discarded: Math.max(0, board.length - covered),
    };
  });
}

export function shoppingList(boards: Board[], hardware: HardwareItem[] = [], pieces: Piece[] = []): { lines: ShopLine[]; total: number } {
  const groups = new Map<string, ShopLine>();
  for (const board of boards) {
    const key = `${board.stockId}|${board.length}|${board.price}`;
    const needed = boardsNeeded(board, pieces);
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += needed;
      existing.total = existing.unitPrice * existing.quantity;
    } else {
      groups.set(key, {
        key,
        name: board.name,
        species: board.species,
        thickness: board.thickness,
        width: board.width,
        length: board.length,
        sheet: board.sheet,
        quantity: needed,
        unitPrice: board.price,
        total: board.price * needed,
      });
    }
  }
  const hardwareGroups = new Map<string, ShopLine>();
  for (const item of hardware) {
    if (item.reference) continue;
    const key = `hw|${item.catalogId}|${item.price}`;
    const existing = hardwareGroups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.total += item.price;
    } else {
      hardwareGroups.set(key, {
        key,
        name: item.name,
        species: "Hardware",
        thickness: item.depth,
        width: item.width,
        length: item.height,
        sheet: false,
        quantity: 1,
        unitPrice: item.price,
        total: item.price,
      });
    }
  }
  const lines = [...groups.values(), ...hardwareGroups.values()].sort((a, b) => a.species.localeCompare(b.species) || a.name.localeCompare(b.name) || a.length - b.length);
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  return { lines, total };
}

export function fastenerList(fasteners: Fastener[], pieces: Piece[]): FastenerLine[] {
  const names = new Map(pieces.map((piece) => [piece.id, piece.name]));
  const groups = new Map<string, FastenerLine>();
  for (const fastener of fasteners) {
    const diameter = trimNumber(fastener.diameter);
    const length = Math.round(fastener.length);
    const key = fastener.type === "glue" ? "Glue joint" : fastener.type === "pocket-screw" ? `Pocket ${diameter}×${length}` : fastener.type === "bolt" ? `Bolt M${diameter}×${length}` : `${diameter}×${length}`;
    const joint = `${names.get(fastener.pieceAId) ?? "?"} → ${names.get(fastener.pieceBId) ?? "?"}`;
    const host = pieces.find((item) => item.id === fastener.pieceAId);
    const copies = host ? instanceCount(host, pieces) : 1;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += copies;
      existing.joints.push(joint);
    } else {
      groups.set(key, {
        key,
        label: key,
        diameter: fastener.diameter,
        length: fastener.length,
        quantity: copies,
        joints: [joint],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.length - b.length || a.diameter - b.diameter);
}

export function profileLabel(thickness: number, width: number): string {
  return `${formatMm(thickness)}×${formatMm(width)}`;
}

function unionLength(spans: Array<{ start: number; end: number }>): number {
  const sorted = spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let cursor = -Infinity;
  let end = -Infinity;
  for (const span of sorted) {
    if (span.start > end) {
      total += end - cursor > 0 && cursor !== -Infinity ? end - cursor : 0;
      cursor = span.start;
      end = span.end;
    } else {
      end = Math.max(end, span.end);
    }
  }
  if (cursor !== -Infinity) total += end - cursor;
  return total;
}

function boardsNeeded(board: Board, pieces: Piece[]): number {
  const mine = pieces.filter((piece) => piece.boardId === board.id);
  if (mine.length === 0) return 1;
  // Identical spans are one rip, counted once. A later crosscut of one rip sits inside the
  // other rip's span, so the lengths are unioned rather than added. An array repeats its span.
  const groups = new Map<string, { start: number; end: number; copies: number }>();
  for (const piece of mine) {
    if (piece.spanEnd <= piece.spanStart) continue;
    const key = `${piece.spanStart.toFixed(2)}|${piece.spanEnd.toFixed(2)}`;
    const copies = instanceCount(piece, pieces);
    const existing = groups.get(key);
    if (existing) existing.copies = Math.max(existing.copies, copies);
    else groups.set(key, { start: piece.spanStart, end: piece.spanEnd, copies });
  }
  const spans = [...groups.values()];
  if (spans.length === 0) return 1;
  const maxCopies = spans.reduce((max, span) => Math.max(max, span.copies), 1);
  let millimetres = 0;
  for (let copy = 1; copy <= maxCopies; copy += 1) {
    millimetres += unionLength(spans.filter((span) => span.copies >= copy));
  }
  return Math.max(1, Math.ceil(millimetres / board.length));
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export interface PlanMismatch {
  label: string;
  kind: PlanBillLine["kind"];
  key: string;
  expected: number;
  actual: number;
}

/** Compare a typed or attached materials list with the cut, fastener and hardware totals. */
export function checkPlan(
  bill: PlanBillLine[],
  boards: Board[],
  hardware: HardwareItem[],
  fasteners: Fastener[],
  pieces: Piece[],
): { mismatches: PlanMismatch[]; extras: PlanMismatch[] } {
  const actual = new Map<string, number>();
  const shop = shoppingList(boards, hardware, pieces);
  for (const line of shop.lines) {
    if (line.species === "Hardware") {
      const catalogId = line.key.split("|")[1] ?? line.name;
      addCount(actual, `hardware:${catalogId}`, line.quantity);
    } else {
      addCount(actual, `board:${trimNumber(line.thickness)}×${trimNumber(line.width)}×${trimNumber(line.length)}`, line.quantity);
    }
  }
  for (const line of fastenerList(fasteners, pieces)) addCount(actual, `fastener:${line.label}`, line.quantity);

  const mismatches: PlanMismatch[] = [];
  const seen = new Set<string>();
  for (const line of bill) {
    const id = `${line.kind}:${line.key}`;
    seen.add(id);
    const got = actual.get(id) ?? 0;
    if (got !== line.quantity) {
      mismatches.push({ label: line.label, kind: line.kind, key: line.key, expected: line.quantity, actual: got });
    }
  }
  const extras: PlanMismatch[] = [];
  for (const [id, quantity] of actual) {
    if (seen.has(id) || quantity <= 0) continue;
    const split = id.indexOf(":");
    const kind = id.slice(0, split) as PlanBillLine["kind"];
    const key = id.slice(split + 1);
    extras.push({ label: key, kind, key, expected: 0, actual: quantity });
  }
  return { mismatches, extras };
}

function addCount(map: Map<string, number>, key: string, quantity: number): void {
  map.set(key, (map.get(key) ?? 0) + quantity);
}
