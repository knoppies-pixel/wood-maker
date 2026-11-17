import { temporal } from "zundo";
import { create } from "zustand";
import { defaultCatalog } from "../domain/catalog.ts";
import { sampleFrame } from "../domain/example.ts";
import { uid } from "../domain/math.ts";
import {
  addStockPiece,
  connectedIds,
  crosscut,
  dropFasteners,
  makeHole,
  rip,
  withoutPiece,
} from "../domain/operations.ts";
import { emptyProject, loadStoredProject } from "../domain/project-io.ts";
import type { Fastener, Hole, ProjectData, StockItem, Vec3Tuple } from "../domain/types.ts";

type Snapshot = Pick<ProjectData, "name" | "kerf" | "catalog" | "boards" | "pieces" | "fasteners">;

export type ActionResult = { ok: true; message?: string; selectId?: string } | { ok: false; message: string };

interface ProjectState extends Snapshot {
  addStock: (stockId: string, length: number) => ActionResult;
  cutPiece: (pieceId: string, mode: "crosscut" | "rip", distance: number, mitre: number) => ActionResult;
  drillHole: (pieceId: string, input: Omit<Hole, "id">) => ActionResult;
  addScrew: (input: Omit<Fastener, "id" | "type">) => ActionResult;
  removeHole: (pieceId: string, holeId: string) => void;
  removeFastener: (fastenerId: string) => void;
  deletePiece: (pieceId: string) => void;
  renamePiece: (pieceId: string, name: string) => void;
  renameProject: (name: string) => void;
  setKerf: (kerf: number) => void;
  setTransforms: (updates: Array<{ id: string; position: Vec3Tuple; rotation: Vec3Tuple }>) => void;
  setCatalog: (catalog: StockItem[]) => void;
  resetCatalog: () => void;
  replaceProject: (project: ProjectData) => void;
  newProject: () => void;
  loadSample: () => void;
  snapshot: () => ProjectData;
}

const starterCatalog = defaultCatalog();
const restored = loadStoredProject(starterCatalog) ?? emptyProject(starterCatalog);

export const useProject = create<ProjectState>()(
  temporal(
    (set, get) => ({
      name: restored.name,
      kerf: restored.kerf,
      catalog: restored.catalog,
      boards: restored.boards,
      pieces: restored.pieces,
      fasteners: restored.fasteners,

      addStock: (stockId, length) => {
        const stock = get().catalog.find((item) => item.id === stockId);
        if (!stock) return { ok: false, message: "That stock is no longer in the catalogue." };
        const created = addStockPiece(stock, length, get().pieces);
        if ("error" in created) return { ok: false, message: created.error };
        set({
          boards: [...get().boards, created.board],
          pieces: [...get().pieces, created.piece],
        });
        return { ok: true, selectId: created.piece.id, message: `${created.piece.name} is on the bench.` };
      },

      cutPiece: (pieceId, mode, distance, mitre) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece first." };
        const result = mode === "rip" ? rip(piece, distance, get().kerf) : crosscut(piece, distance, mitre, get().kerf);
        if (!result.ok) return { ok: false, message: result.reason };
        const dropped = dropFasteners(get().fasteners, pieceId);
        set({
          pieces: get().pieces.flatMap((item) => (item.id === pieceId ? result.pieces : [item])),
          fasteners: dropped.fasteners,
        });
        const note = dropped.dropped > 0 ? " Screws in that piece were removed." : "";
        return {
          ok: true,
          selectId: result.pieces[0].id,
          message: mode === "rip" ? `Ripped into ${Math.round(result.pieces[0].width)} mm and ${Math.round(result.pieces[1].width)} mm.${note}` : `Crosscut into ${Math.round(result.pieces[0].length)} mm and ${Math.round(result.pieces[1].length)} mm.${note}`,
        };
      },

      drillHole: (pieceId, input) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Click a piece to drill." };
        const result = makeHole(piece, input);
        if ("error" in result) return { ok: false, message: result.error };
        set({
          pieces: get().pieces.map((item) => (item.id === pieceId ? { ...item, holes: [...item.holes, result.hole] } : item)),
        });
        return { ok: true, message: `⌀${trim(input.diameter)} hole, ${input.through ? "through" : `${trim(result.hole.depth)} mm deep`}.` };
      },

      addScrew: (input) => {
        if (input.pieceAId === input.pieceBId) return { ok: false, message: "A screw needs two pieces." };
        const screw: Fastener = { ...input, id: uid("screw"), type: "screw" };
        set({ fasteners: [...get().fasteners, screw] });
        return { ok: true, message: "Screwed. Those pieces now move as one." };
      },

      removeHole: (pieceId, holeId) => {
        set({
          pieces: get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, holes: piece.holes.filter((hole) => hole.id !== holeId) } : piece,
          ),
        });
      },

      removeFastener: (fastenerId) => {
        set({ fasteners: get().fasteners.filter((item) => item.id !== fastenerId) });
      },

      deletePiece: (pieceId) => {
        const next = withoutPiece(get().pieces, get().boards, get().fasteners, pieceId);
        set(next);
      },

      renamePiece: (pieceId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          pieces: get().pieces.map((piece) => (piece.id === pieceId ? { ...piece, name: trimmed } : piece)),
        });
      },

      renameProject: (name) => set({ name: name.trim() || "Untitled bench" }),

      setKerf: (kerf) => set({ kerf: Math.min(12, Math.max(0.5, kerf)) }),

      setTransforms: (updates) => {
        const byId = new Map(updates.map((update) => [update.id, update]));
        let changed = false;
        const pieces = get().pieces.map((piece) => {
          const update = byId.get(piece.id);
          if (!update) return piece;
          if (sameTuple(piece.position, update.position) && sameTuple(piece.rotation, update.rotation)) return piece;
          changed = true;
          return { ...piece, position: update.position, rotation: update.rotation };
        });
        if (changed) set({ pieces });
      },

      setCatalog: (catalog) => set({ catalog }),

      resetCatalog: () => set({ catalog: defaultCatalog() }),

      replaceProject: (project) => {
        set({
          name: project.name,
          kerf: project.kerf,
          catalog: project.catalog.length > 0 ? project.catalog : get().catalog,
          boards: project.boards,
          pieces: project.pieces,
          fasteners: project.fasteners,
        });
      },

      newProject: () => {
        const blank = emptyProject(get().catalog);
        set({
          name: blank.name,
          kerf: blank.kerf,
          boards: [],
          pieces: [],
          fasteners: [],
        });
      },

      loadSample: () => {
        const frame = sampleFrame(get().catalog);
        set({
          name: frame.name,
          kerf: frame.kerf,
          boards: frame.boards,
          pieces: frame.pieces,
          fasteners: frame.fasteners,
        });
      },

      snapshot: () => ({
        format: "benchwork-project",
        version: 1,
        units: "mm",
        name: get().name,
        kerf: get().kerf,
        catalog: get().catalog,
        boards: get().boards,
        pieces: get().pieces,
        fasteners: get().fasteners,
      }),
    }),
    {
      limit: 80,
      partialize: (state): Snapshot => ({
        name: state.name,
        kerf: state.kerf,
        catalog: state.catalog,
        boards: state.boards,
        pieces: state.pieces,
        fasteners: state.fasteners,
      }),
      equality: (past, current) =>
        past.boards === current.boards &&
        past.pieces === current.pieces &&
        past.fasteners === current.fasteners &&
        past.catalog === current.catalog &&
        past.name === current.name &&
        past.kerf === current.kerf,
    },
  ),
);

export function assemblyOf(pieceId: string | null): string[] {
  if (!pieceId) return [];
  return connectedIds(useProject.getState().fasteners, pieceId);
}

function sameTuple(a: Vec3Tuple, b: Vec3Tuple): boolean {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05 && Math.abs(a[2] - b[2]) < 0.05;
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

