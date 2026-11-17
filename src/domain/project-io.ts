import { parseCatalog } from "./catalog.ts";
import type { Board, Fastener, Hole, Piece, ProjectData, StockItem, Vec3Tuple } from "./types.ts";

const STORAGE_KEY = "benchwork.project.v1";

export function emptyProject(catalog: StockItem[]): ProjectData {
  return {
    format: "benchwork-project",
    version: 1,
    name: "Untitled bench",
    units: "mm",
    kerf: 3,
    catalog,
    boards: [],
    pieces: [],
    fasteners: [],
  };
}

export function serializeProject(project: ProjectData): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(input: unknown, fallbackCatalog: StockItem[]): { project: ProjectData } | { error: string } {
  if (!input || typeof input !== "object") return { error: "That file is not a Benchwork project." };
  const record = input as Partial<ProjectData>;
  if (record.format && record.format !== "benchwork-project") {
    return { error: "That JSON is not a Benchwork project file." };
  }
  const catalogParsed = record.catalog ? parseCatalog(record.catalog) : { items: fallbackCatalog };
  if ("error" in catalogParsed) return { error: catalogParsed.error };
  const boards = Array.isArray(record.boards) ? record.boards.filter(isBoard) : [];
  const pieces = Array.isArray(record.pieces) ? record.pieces.filter(isPiece) : [];
  const fasteners = Array.isArray(record.fasteners) ? record.fasteners.filter(isFastener) : [];
  const kerf = typeof record.kerf === "number" && record.kerf >= 0 && record.kerf < 20 ? record.kerf : 3;
  return {
    project: {
      format: "benchwork-project",
      version: 1,
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Untitled bench",
      units: "mm",
      kerf,
      catalog: catalogParsed.items,
      boards,
      pieces,
      fasteners,
    },
  };
}

export function loadStoredProject(fallbackCatalog: StockItem[]): ProjectData | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseProject(JSON.parse(raw), fallbackCatalog);
    return "error" in parsed ? null : parsed.project;
  } catch {
    return null;
  }
}

export function saveStoredProject(project: ProjectData): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, serializeProject(project));
}

export function downloadText(filename: string, contents: string, type = "application/json"): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function isTuple(value: unknown): value is Vec3Tuple {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== "object") return false;
  const board = value as Board;
  return typeof board.id === "string" && typeof board.length === "number" && typeof board.price === "number" && typeof board.thickness === "number" && typeof board.width === "number";
}

function isHole(value: unknown): value is Hole {
  if (!value || typeof value !== "object") return false;
  const hole = value as Hole;
  return typeof hole.id === "string" && typeof hole.face === "string" && typeof hole.diameter === "number";
}

function isPiece(value: unknown): value is Piece {
  if (!value || typeof value !== "object") return false;
  const piece = value as Piece;
  return (
    typeof piece.id === "string" &&
    typeof piece.boardId === "string" &&
    typeof piece.length === "number" &&
    typeof piece.width === "number" &&
    typeof piece.thickness === "number" &&
    isTuple(piece.position) &&
    isTuple(piece.rotation) &&
    Array.isArray(piece.holes) &&
    piece.holes.every(isHole)
  );
}

function isFastener(value: unknown): value is Fastener {
  if (!value || typeof value !== "object") return false;
  const fastener = value as Fastener;
  return fastener.type === "screw" && typeof fastener.pieceAId === "string" && typeof fastener.pieceBId === "string" && isTuple(fastener.localPosition) && isTuple(fastener.localDirection);
}
