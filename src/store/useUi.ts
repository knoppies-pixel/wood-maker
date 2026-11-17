import { create } from "zustand";
import type { FaceId, Vec3Tuple } from "../domain/types.ts";

export type ToolId = "select" | "saw" | "drill" | "screw";
export type InspectorTab = "piece" | "cuts" | "shop" | "screws";

export interface DragPose {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
}

export interface HoverHit {
  pieceId: string;
  face: FaceId;
  u: number;
  v: number;
  point: Vec3Tuple;
  normal: Vec3Tuple;
}

interface UiState {
  tool: ToolId;
  transformMode: "translate" | "rotate";
  space: "world" | "local";
  selection: string | null;
  snapGrid: boolean;
  snapFaces: boolean;
  snapRotate: boolean;
  gridSize: number;
  sawDistance: number;
  sawMitre: number;
  sawFrom: "start" | "end";
  sawMode: "crosscut" | "rip";
  drillDiameter: number;
  drillDepth: number;
  drillThrough: boolean;
  screwDiameter: number;
  screwLength: number;
  stockOpen: boolean;
  inspectorOpen: boolean;
  tab: InspectorTab;
  drag: Record<string, DragPose> | null;
  hover: HoverHit | null;
  sceneEpoch: number;
  setTool: (tool: ToolId) => void;
  setTransformMode: (mode: "translate" | "rotate") => void;
  setSpace: (space: "world" | "local") => void;
  select: (id: string | null) => void;
  setSnapGrid: (on: boolean) => void;
  setSnapFaces: (on: boolean) => void;
  setSnapRotate: (on: boolean) => void;
  setGridSize: (size: number) => void;
  setSawDistance: (distance: number) => void;
  setSawMitre: (mitre: number) => void;
  setSawFrom: (from: "start" | "end") => void;
  setSawMode: (mode: "crosscut" | "rip") => void;
  setDrillDiameter: (diameter: number) => void;
  setDrillDepth: (depth: number) => void;
  setDrillThrough: (through: boolean) => void;
  setScrewDiameter: (diameter: number) => void;
  setScrewLength: (length: number) => void;
  setStockOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setTab: (tab: InspectorTab) => void;
  setDrag: (drag: Record<string, DragPose> | null) => void;
  setHover: (hover: HoverHit | null) => void;
  bumpScene: () => void;
}

export const useUi = create<UiState>((set) => ({
  tool: "select",
  transformMode: "translate",
  space: "world",
  selection: null,
  snapGrid: true,
  snapFaces: true,
  snapRotate: true,
  gridSize: 10,
  sawDistance: 300,
  sawMitre: 0,
  sawFrom: "start",
  sawMode: "crosscut",
  drillDiameter: 5,
  drillDepth: 18,
  drillThrough: false,
  screwDiameter: 4,
  screwLength: 50,
  stockOpen: false,
  inspectorOpen: false,
  tab: "piece",
  drag: null,
  hover: null,
  sceneEpoch: 0,
  setTool: (tool) => set({ tool, hover: null }),
  setTransformMode: (transformMode) => set({ transformMode }),
  setSpace: (space) => set({ space }),
  select: (selection) => set({ selection }),
  setSnapGrid: (snapGrid) => set({ snapGrid }),
  setSnapFaces: (snapFaces) => set({ snapFaces }),
  setSnapRotate: (snapRotate) => set({ snapRotate }),
  setGridSize: (gridSize) => set({ gridSize }),
  setSawDistance: (sawDistance) => set({ sawDistance }),
  setSawMitre: (sawMitre) => set({ sawMitre }),
  setSawFrom: (sawFrom) => set({ sawFrom }),
  setSawMode: (sawMode) => set({ sawMode }),
  setDrillDiameter: (drillDiameter) => set({ drillDiameter }),
  setDrillDepth: (drillDepth) => set({ drillDepth }),
  setDrillThrough: (drillThrough) => set({ drillThrough }),
  setScrewDiameter: (screwDiameter) => set({ screwDiameter }),
  setScrewLength: (screwLength) => set({ screwLength }),
  setStockOpen: (stockOpen) => set({ stockOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setTab: (tab) => set({ tab, inspectorOpen: true }),
  setDrag: (drag) => set({ drag }),
  setHover: (hover) => set({ hover }),
  bumpScene: () => set((state) => ({ sceneEpoch: state.sceneEpoch + 1 })),
}));
