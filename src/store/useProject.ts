import { temporal } from "zundo";
import { create } from "zustand";
import { defaultCatalog } from "../domain/catalog.ts";
import { sampleFrame } from "../domain/example.ts";
import { uid } from "../domain/math.ts";
import { circleOutline, curveCut, edgeProfile, HARDWARE_CATALOG, placeHardware, planJoint, plungeCut, profileOpening, routeCut, taperPiece } from "../domain/features.ts";
import { keepBottom, localToWorld } from "../domain/geometry.ts";
import { localCopies } from "../domain/modifiers.ts";
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
import type { FaceId, Fastener, FastenerType, Finish, Guide, Hole, Piece, PlanBillLine, ProfileName, ProjectData, RouterCut, StockItem, Vec3Tuple, XZPoint } from "../domain/types.ts";

type Snapshot = Pick<ProjectData, "name" | "kerf" | "catalog" | "boards" | "pieces" | "fasteners" | "hardware" | "dimensions" | "planBill"> & { guides: Guide[] };

export type ActionResult = { ok: true; message?: string; selectId?: string } | { ok: false; message: string };

interface ProjectState extends Snapshot {
  addStock: (stockId: string, length: number) => ActionResult;
  cutPiece: (pieceId: string, mode: "crosscut" | "rip", distance: number, mitre: number, bevel?: number) => ActionResult;
  taper: (pieceId: string, widthAtStart: number, widthAtEnd: number) => ActionResult;
  curve: (pieceId: string, points: Array<{ u: number; v: number }>, waste: "left" | "right") => ActionResult;
  plunge: (pieceId: string, opening: { x: number; z: number; width: number; length: number; ends?: "square" | "round" }, keepOffcut?: boolean) => ActionResult;
  drillHole: (pieceId: string, input: Omit<Hole, "id">) => ActionResult;
  addRoute: (pieceId: string, input: Omit<RouterCut, "id">) => ActionResult;
  addProfile: (pieceId: string, profile: "round-over" | "chamfer" | "cove", edge: "left" | "right" | "start" | "end", radius: number, side?: "top" | "bottom") => ActionResult;
  profileOpening: (pieceId: string, openingId: string, profile: ProfileName, radius: number) => ActionResult;
  join: (kind: "mortise-tenon" | "half-lap" | "dovetail" | "dowels", firstId: string, firstFace: FaceId, firstUv: { u: number; v: number }, secondId: string, secondFace: FaceId, secondUv: { u: number; v: number }, dowelDiameter?: number) => ActionResult;
  addScrew: (input: Omit<Fastener, "id" | "type"> & { type?: FastenerType }) => ActionResult;
  addHardware: (catalogId: string, pieceId: string, face: FaceId, uv: { u: number; v: number }) => ActionResult;
  setFinish: (pieceId: string, finish: Finish) => void;
  removeRoute: (pieceId: string, routeId: string) => void;
  removeHardware: (hardwareId: string) => void;
  duplicatePiece: (pieceId: string) => ActionResult;
  resizePiece: (pieceId: string, size: { length?: number; width?: number; thickness?: number }) => void;
  addMark: (pieceId: string, mark: Omit<import("../domain/types.ts").PencilMark, "id">) => void;
  removeMark: (pieceId: string, markId: string) => void;
  addModifier: (pieceId: string, modifier: import("../domain/types.ts").WoodModifier) => void;
  updateModifier: (pieceId: string, modifier: import("../domain/types.ts").WoodModifier) => void;
  applyModifiers: (pieceId: string) => ActionResult;
  toggleModifier: (pieceId: string, modifierId: string, enabled: boolean) => void;
  removeModifier: (pieceId: string, modifierId: string) => void;
  reorderModifier: (pieceId: string, modifierId: string, direction: -1 | 1) => void;
  pastePiece: (source: Piece) => ActionResult;
  addDimension: (note: Omit<import("../domain/types.ts").DimensionNote, "id">) => void;
  removeDimension: (id: string) => void;
  removeHole: (pieceId: string, holeId: string) => void;
  removeFastener: (fastenerId: string) => void;
  deletePiece: (pieceId: string) => void;
  renamePiece: (pieceId: string, name: string) => void;
  makeComponent: (pieceId: string) => ActionResult;
  makeUnique: (pieceId: string) => ActionResult;
  addGuide: (guide: Guide) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
  renameProject: (name: string) => void;
  setKerf: (kerf: number) => void;
  setPlanBill: (planBill: PlanBillLine[]) => void;
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
      hardware: restored.hardware ?? [],
      dimensions: restored.dimensions ?? [],
      guides: restored.guides ?? [],
      planBill: restored.planBill,

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

      cutPiece: (pieceId, mode, distance, mitre, bevel = 0) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece first." };
        const result = mode === "rip" ? rip(piece, distance, get().kerf) : crosscut(piece, distance, mitre, get().kerf, bevel);
        if (!result.ok) return { ok: false, message: result.reason };
        const dropped = dropFasteners(get().fasteners, pieceId);
        const made = result.pieces.map((item) => ({ ...item, componentId: undefined }));
        set({
          pieces: get().pieces.flatMap((item) => (item.id === pieceId ? made : [item])),
          fasteners: dropped.fasteners,
        });
        const note = dropped.dropped > 0 ? " Screws in that piece were removed." : "";
        return {
          ok: true,
          selectId: result.pieces[0].id,
          message: mode === "rip" ? `Ripped into ${Math.round(result.pieces[0].width)} mm and ${Math.round(result.pieces[1].width)} mm.${note}` : `Crosscut into ${Math.round(result.pieces[0].length)} mm and ${Math.round(result.pieces[1].length)} mm.${note}`,
        };
      },

      taper: (pieceId, widthAtStart, widthAtEnd) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece to taper." };
        const result = taperPiece(piece, widthAtStart, widthAtEnd);
        if ("error" in result) return { ok: false, message: result.error };
        set({ pieces: get().pieces.map((item) => (item.id === pieceId ? { ...result.piece, componentId: undefined } : item)) });
        return { ok: true, message: `Tapered from ${Math.round(widthAtStart)} mm to ${Math.round(widthAtEnd)} mm.` };
      },

      plunge: (pieceId, opening, keepOffcut = true) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece to plunge." };
        const result = plungeCut(piece, opening);
        if ("error" in result) return { ok: false, message: result.error };
        const offcut = keepOffcut
          ? { ...result.offcut, componentId: undefined, position: [result.offcut.position[0] + result.offcut.width / 2 + 30, result.offcut.position[1], result.offcut.position[2]] as Vec3Tuple }
          : null;
        set({
          pieces: mirrorInstances([
            ...get().pieces.map((item) => (item.id === pieceId ? result.piece : item)),
            ...(offcut ? [offcut] : []),
          ], pieceId),
        });
        return {
          ok: true,
          selectId: offcut?.id,
          message: offcut ? "Opening cut. The piece that came out is beside it." : "Opening cut.",
        };
      },

      curve: (pieceId, points, waste) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece, then draw the cut on its face." };
        const result = curveCut(piece, points, waste);
        if ("error" in result) return { ok: false, message: result.error };
        set({ pieces: get().pieces.map((item) => (item.id === pieceId ? { ...result.piece, componentId: undefined } : item)) });
        return { ok: true, message: "Curved cut. The waste side is off the piece." };
      },

      drillHole: (pieceId, input) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Click a piece to drill." };
        const result = makeHole(piece, input);
        if ("error" in result) return { ok: false, message: result.error };
        const extra = input.style === "hole-saw" ? holeSawDisc(piece, result.hole) : null;
        set({
          pieces: mirrorInstances([
            ...get().pieces.map((item) => (item.id === pieceId ? { ...item, holes: [...item.holes, result.hole] } : item)),
            ...(extra ? [extra] : []),
          ], pieceId),
        });
        const label = input.style === "countersink" ? "Countersink" : input.style === "forstner" ? "Forstner" : input.style === "hole-saw" ? "Hole saw" : "Hole";
        return { ok: true, selectId: extra?.id, message: `${label} ⌀${trim(input.diameter)}${extra ? ". The plug is a separate piece." : "."}` };
      },

      addRoute: (pieceId, input) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece to rout." };
        const result = routeCut(piece, input);
        if ("error" in result) return { ok: false, message: result.error };
        set({ pieces: mirrorInstances(get().pieces.map((item) => (item.id === pieceId ? { ...item, routes: [...(item.routes ?? []), result.route] } : item)), pieceId) });
        return { ok: true, message: `${input.kind[0].toUpperCase()}${input.kind.slice(1)} cut, ${trim(input.width)} mm wide and ${trim(input.depth)} mm deep.` };
      },

      addProfile: (pieceId, profile, edge, radius, side = "top") => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece for the edge profile." };
        const result = edgeProfile({ profile, edge, radius, side }, piece.thickness);
        if ("error" in result) return { ok: false, message: result.error };
        set({ pieces: mirrorInstances(get().pieces.map((item) => (item.id === pieceId ? { ...item, profiles: [...(item.profiles ?? []), result.profile] } : item)), pieceId) });
        return { ok: true, message: `${profile} on the ${side} ${edge} arris.` };
      },

      profileOpening: (pieceId, openingId, profile, radius) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece for the hole profile." };
        const result = profileOpening(piece, openingId, profile, radius);
        if ("error" in result) return { ok: false, message: result.error };
        set({ pieces: mirrorInstances(get().pieces.map((item) => (item.id === pieceId ? result.piece : item)), pieceId) });
        return { ok: true, message: `${profile} around the opening.` };
      },

      join: (kind, firstId, firstFace, firstUv, secondId, secondFace, secondUv, dowelDiameter = 8) => {
        const first = get().pieces.find((item) => item.id === firstId);
        const second = get().pieces.find((item) => item.id === secondId);
        if (!first || !second) return { ok: false, message: "Click two pieces." };
        const plan = planJoint(kind, first, firstFace, firstUv, second, secondFace, secondUv, dowelDiameter);
        if ("error" in plan) return { ok: false, message: plan.error };
        const byId = new Map(plan.pieces.map((item) => [item.id, item]));
        set({ pieces: get().pieces.map((item) => byId.get(item.id) ?? item) });
        return { ok: true, message: jointMessage(kind) };
      },

      addScrew: (input) => {
        if (input.type !== "glue" && input.pieceAId === input.pieceBId) return { ok: false, message: "That fastener needs two pieces." };
        const screw: Fastener = { ...input, id: uid(input.type ?? "screw"), type: input.type ?? "screw" };
        set({ fasteners: [...get().fasteners, screw] });
        const verb = screw.type === "glue" ? "Glued" : screw.type === "bolt" ? "Bolted" : screw.type === "pocket-screw" ? "Pocket-screwed" : "Screwed";
        return { ok: true, message: `${verb}. Those pieces now move as one.` };
      },

      addHardware: (catalogId, pieceId, face, uv) => {
        const offer = HARDWARE_CATALOG.find((item) => item.id === catalogId);
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!offer || !piece) return { ok: false, message: "Pick a piece of hardware and a face." };
        const mate = nearestMate(piece, get().pieces);
        const item = placeHardware(offer, piece, face, uv, mate);
        set({ hardware: [...get().hardware, item] });
        return { ok: true, message: `${offer.name} placed${mate ? ` against ${mate.name}` : ""}.` };
      },

      setFinish: (pieceId, finish) => {
        set({ pieces: mirrorInstances(get().pieces.map((item) => (item.id === pieceId ? { ...item, finish } : item)), pieceId) });
      },

      removeRoute: (pieceId, routeId) => {
        set({
          pieces: mirrorInstances(get().pieces.map((item) => (item.id === pieceId ? { ...item, routes: (item.routes ?? []).filter((route) => route.id !== routeId), profiles: (item.profiles ?? []).filter((profile) => profile.id !== routeId) } : item)), pieceId),
        });
      },

      removeHardware: (hardwareId) => set({ hardware: get().hardware.filter((item) => item.id !== hardwareId) }),

      duplicatePiece: (pieceId) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece to duplicate." };
        const copy = clonePiece(piece, 40);
        set({ pieces: [...get().pieces, copy] });
        return { ok: true, selectId: copy.id, message: piece.componentId ? `Another ${piece.name}. Edits apply to every one.` : `Duplicated ${piece.name}.` };
      },

      resizePiece: (pieceId, size) => {
        const resized = get().pieces.map((piece) => {
            if (piece.id !== pieceId) return piece;
            const length = clampSize(size.length ?? piece.length);
            const width = clampSize(size.width ?? piece.width);
            const thickness = clampSize(size.thickness ?? piece.thickness);
            const scaleX = piece.width ? width / piece.width : 1;
            return {
              ...piece,
              length,
              width,
              thickness,
              widthStart: (piece.widthStart || piece.width) * scaleX,
              widthEnd: (piece.widthEnd || piece.width) * scaleX,
              position: [piece.position[0], keepBottom(piece.position[1], piece.thickness, thickness), piece.position[2]] as Vec3Tuple,
            };
          });
        set({ pieces: mirrorInstances(resized, pieceId) });
      },

      addMark: (pieceId, mark) => {
        set({
          pieces: mirrorInstances(get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, marks: [...(piece.marks ?? []), { ...mark, id: uid("mark") }] } : piece,
          ), pieceId),
        });
      },

      removeMark: (pieceId, markId) => {
        set({
          pieces: mirrorInstances(get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, marks: (piece.marks ?? []).filter((mark) => mark.id !== markId) } : piece,
          ), pieceId),
        });
      },

      addModifier: (pieceId, modifier) => {
        set({
          pieces: get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, modifiers: [...(piece.modifiers ?? []), modifier] } : piece,
          ),
        });
      },

      updateModifier: (pieceId, modifier) => {
        set({
          pieces: get().pieces.map((piece) =>
            piece.id === pieceId
              ? { ...piece, modifiers: (piece.modifiers ?? []).map((item) => (item.id === modifier.id ? modifier : item)) }
              : piece,
          ),
        });
      },

      applyModifiers: (pieceId) => {
        const pieces = get().pieces;
        const piece = pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece." };
        const copies = localCopies(piece, pieces).slice(1);
        if (copies.length === 0) return { ok: false, message: "Nothing to apply. Turn a modifier on first." };
        const spawned = copies.map((copy) => {
          const world = localToWorld(piece, { x: copy.position[0], y: copy.position[1], z: copy.position[2] });
          const clone = clonePiece(piece, 0);
          clone.position = [world.x, Math.max(clone.thickness / 2, world.y), world.z];
          clone.modifiers = [];
          return clone;
        });
        set({
          pieces: [...pieces.map((item) => (item.id === pieceId ? { ...item, modifiers: [] } : item)), ...spawned],
        });
        return { ok: true, message: `Applied ${spawned.length} ${spawned.length === 1 ? "copy" : "copies"} as real pieces.` };
      },

      pastePiece: (source) => {
        const copy = clonePiece(source, 40);
        set({ pieces: [...get().pieces, copy] });
        return { ok: true, selectId: copy.id, message: `Pasted ${copy.name}.` };
      },

      toggleModifier: (pieceId, modifierId, enabled) => {
        set({
          pieces: get().pieces.map((piece) =>
            piece.id === pieceId
              ? { ...piece, modifiers: (piece.modifiers ?? []).map((modifier) => (modifier.id === modifierId ? { ...modifier, enabled } : modifier)) }
              : piece,
          ),
        });
      },

      removeModifier: (pieceId, modifierId) => {
        set({
          pieces: get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, modifiers: (piece.modifiers ?? []).filter((modifier) => modifier.id !== modifierId) } : piece,
          ),
        });
      },

      reorderModifier: (pieceId, modifierId, direction) => {
        set({
          pieces: get().pieces.map((piece) => {
            if (piece.id !== pieceId) return piece;
            const modifiers = [...(piece.modifiers ?? [])];
            const index = modifiers.findIndex((modifier) => modifier.id === modifierId);
            const next = index + direction;
            if (index < 0 || next < 0 || next >= modifiers.length) return piece;
            const [item] = modifiers.splice(index, 1);
            if (!item) return piece;
            modifiers.splice(next, 0, item);
            return { ...piece, modifiers };
          }),
        });
      },

      addDimension: (note) => set({ dimensions: [...get().dimensions, { ...note, id: uid("dim") }] }),

      removeDimension: (id) => set({ dimensions: get().dimensions.filter((note) => note.id !== id) }),

      removeHole: (pieceId, holeId) => {
        set({
          pieces: mirrorInstances(get().pieces.map((piece) =>
            piece.id === pieceId ? { ...piece, holes: piece.holes.filter((hole) => hole.id !== holeId) } : piece,
          ), pieceId),
        });
      },

      removeFastener: (fastenerId) => {
        set({ fasteners: get().fasteners.filter((item) => item.id !== fastenerId) });
      },

      deletePiece: (pieceId) => {
        const next = withoutPiece(get().pieces, get().boards, get().fasteners, pieceId, get().hardware);
        set(next);
      },

      renamePiece: (pieceId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          pieces: mirrorInstances(get().pieces.map((piece) => (piece.id === pieceId ? { ...piece, name: trimmed } : piece)), pieceId),
        });
      },

      makeComponent: (pieceId) => {
        const piece = get().pieces.find((item) => item.id === pieceId);
        if (!piece) return { ok: false, message: "Select a piece first." };
        if (piece.componentId) return { ok: true, message: `${piece.name} is already a component.` };
        const componentId = uid("cmp");
        set({ pieces: get().pieces.map((item) => (item.id === pieceId ? { ...item, componentId } : item)) });
        return { ok: true, message: `${piece.name} is a component. Duplicates stay in step.` };
      },

      makeUnique: (pieceId) => {
        set({ pieces: get().pieces.map((item) => (item.id === pieceId ? { ...item, componentId: undefined } : item)) });
        return { ok: true, message: "This piece is on its own now." };
      },

      addGuide: (guide) => set({ guides: [...get().guides, guide] }),

      removeGuide: (id) => set({ guides: get().guides.filter((guide) => guide.id !== id) }),

      clearGuides: () => set({ guides: [] }),

      renameProject: (name) => set({ name: name.trim() || "Untitled bench" }),

      setKerf: (kerf) => set({ kerf: Math.min(12, Math.max(0.5, kerf)) }),

      setPlanBill: (planBill) => set({ planBill }),

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
          hardware: project.hardware ?? [],
          dimensions: project.dimensions ?? [],
          guides: project.guides ?? [],
          planBill: project.planBill,
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
          hardware: [],
          dimensions: [],
          guides: [],
          planBill: undefined,
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
          hardware: frame.hardware ?? [],
          dimensions: frame.dimensions ?? [],
          guides: frame.guides ?? [],
          planBill: frame.planBill,
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
        hardware: get().hardware,
        dimensions: get().dimensions,
        guides: get().guides,
        planBill: get().planBill,
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
        hardware: state.hardware,
        dimensions: state.dimensions,
        guides: state.guides,
        planBill: state.planBill,
      }),
      equality: (past, current) =>
        past.boards === current.boards &&
        past.pieces === current.pieces &&
        past.fasteners === current.fasteners &&
        past.hardware === current.hardware &&
        past.dimensions === current.dimensions &&
        past.guides === current.guides &&
        past.planBill === current.planBill &&
        past.catalog === current.catalog &&
        past.name === current.name &&
        past.kerf === current.kerf,
    },
  ),
);

export function assemblyOf(pieceId: string | null): string[] {
  if (!pieceId) return [];
  return connectedIds(useProject.getState().fasteners, pieceId, useProject.getState().pieces);
}

const SHARED_FIELDS = ["name", "species", "profileName", "thickness", "width", "length", "widthStart", "widthEnd", "holes", "routes", "profiles", "openings", "marks", "finish", "mitreStart", "mitreEnd", "bevelStart", "bevelEnd", "outline", "section"] as const;

function mirrorInstances(pieces: Piece[], sourceId: string): Piece[] {
  const source = pieces.find((piece) => piece.id === sourceId);
  if (!source?.componentId) return pieces;
  return pieces.map((piece) => {
    if (piece.id === source.id || piece.componentId !== source.componentId) return piece;
    const next: Piece = { ...piece };
    for (const key of SHARED_FIELDS) {
      (next as unknown as Record<string, unknown>)[key] = source[key];
    }
    if (piece.thickness !== source.thickness) {
      next.position = [piece.position[0], keepBottom(piece.position[1], piece.thickness, source.thickness), piece.position[2]];
    }
    return next;
  });
}

function sameTuple(a: Vec3Tuple, b: Vec3Tuple): boolean {
  return Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05 && Math.abs(a[2] - b[2]) < 0.05;
}

function clonePiece(piece: Piece, offset: number): Piece {
  const stamp = (prefix: string) => uid(prefix);
  return {
    ...piece,
    id: stamp("piece"),
    name: piece.componentId ? piece.name : `${piece.name} copy`,
    position: [piece.position[0] + offset, piece.position[1], piece.position[2]],
    holes: piece.holes.map((hole) => ({ ...hole, id: stamp("hole") })),
    openings: (piece.openings ?? []).map((opening) => ({ ...opening, id: stamp("open") })),
    marks: (piece.marks ?? []).map((mark) => ({ ...mark, id: stamp("mark") })),
    modifiers: (piece.modifiers ?? []).map((modifier) => ({ ...modifier, id: stamp("mod") })),
    routes: (piece.routes ?? []).map((route) => ({ ...route, id: stamp("route") })),
    profiles: (piece.profiles ?? []).map((profile) => ({ ...profile, id: stamp("profile") })),
    joinery: [],
  };
}

function clampSize(value: number): number {
  return Math.min(6000, Math.max(5, value));
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function holeSawDisc(piece: Piece, hole: Hole): Piece {
  const beside = localToWorld(piece, { x: piece.width / 2 + hole.diameter / 2 + 20, y: piece.thickness / 2, z: hole.v - piece.length / 2 });
  const outline: XZPoint[] = circleOutline(hole.diameter);
  return {
    ...piece,
    id: uid("piece"),
    componentId: undefined,
    name: `${piece.name} plug ⌀${Math.round(hole.diameter)}`,
    width: hole.diameter,
    widthStart: hole.diameter,
    widthEnd: hole.diameter,
    length: hole.diameter,
    outline,
    holes: [],
    routes: [],
    profiles: [],
    joinery: [],
    mitreStart: 0,
    mitreEnd: 0,
    bevelStart: 0,
    bevelEnd: 0,
    position: [beside.x, beside.y, beside.z],
    spanStart: piece.spanStart,
    spanEnd: piece.spanStart,
  };
}

function nearestMate(piece: Piece, pieces: Piece[]): Piece | undefined {
  let best: Piece | undefined;
  let bestDistance = 40;
  for (const other of pieces) {
    if (other.id === piece.id) continue;
    const distance = Math.hypot(other.position[0] - piece.position[0], other.position[1] - piece.position[1], other.position[2] - piece.position[2]);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

function jointMessage(kind: "mortise-tenon" | "half-lap" | "dovetail" | "dowels"): string {
  if (kind === "mortise-tenon") return "Mortise and tenon. The rail moved so the tenon meets the mortise.";
  if (kind === "half-lap") return "Half-laps cut. Each piece lost half its thickness.";
  if (kind === "dovetail") return "One dovetail tail and its pin socket.";
  return "Two dowels, paired on both faces.";
}

