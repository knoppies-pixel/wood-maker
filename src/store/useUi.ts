import { create } from "zustand";
import type { AnchorPoint, FaceId, FacePoint, FastenerType, HoleStyle, Piece, ProfileName, Vec3Tuple } from "../domain/types.ts";

export type ToolId = "select" | "saw" | "drill" | "screw" | "router" | "joint" | "hardware" | "pencil" | "measure";
export type PencilMode = "line" | "freehand" | "erase";
export type MeasureMode = "tape" | "angle" | "offset";
export type ModalOp = "grab" | "rotate" | "scale";
export type ViewKind = "front" | "side" | "top" | "frame" | "reset";

export interface TransformModal {
  op: ModalOp;
  axis: "x" | "y" | "z" | null;
  text: string;
  pieceId: string;
  originPosition: Vec3Tuple;
  originRotation: Vec3Tuple;
  delta: Vec3Tuple;
  scale: Vec3Tuple;
}

export interface ViewRequest {
  kind: ViewKind;
  nonce: number;
}
export type SawMode = "crosscut" | "rip" | "taper" | "curve" | "plunge";
export type RouterMode = "dado" | "groove" | "rebate" | "profile";
export type JointMode = "mortise-tenon" | "half-lap" | "dovetail" | "dowels";
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
  edge: "left" | "right" | "start" | "end";
  snap: string | null;
  valid: boolean;
}

interface UiState {
  tool: ToolId;
  transformMode: "translate" | "rotate";
  space: "world" | "local";
  selection: string | null;
  snapGrid: boolean;
  snapFaces: boolean;
  snapRotate: boolean;
  snapVertices: boolean;
  snapMidpoints: boolean;
  snapEdges: boolean;
  snapCentres: boolean;
  snapMarks: boolean;
  snapDimensions: boolean;
  ctrlDown: boolean;
  gridSize: number;
  sawDistance: number;
  sawMitre: number;
  sawFrom: "start" | "end";
  sawMode: SawMode;
  sawBevel: number;
  sawLongPoint: boolean;
  plungeWidth: number;
  plungeLength: number;
  plungeEnds: "square" | "round";
  taperStart: number;
  taperEnd: number;
  curvePoints: Array<{ u: number; v: number }>;
  curveWaste: "left" | "right";
  drillDiameter: number;
  drillDepth: number;
  drillThrough: boolean;
  drillStyle: HoleStyle;
  countersinkDiameter: number;
  screwDiameter: number;
  screwLength: number;
  fastenerKind: FastenerType;
  routerKind: RouterMode;
  routerWidth: number;
  routerDepth: number;
  routerLength: number;
  profile: ProfileName;
  profileEdge: "left" | "right" | "start" | "end";
  profileRadius: number;
  jointKind: JointMode;
  jointFirst: { pieceId: string; face: FaceId; u: number; v: number } | null;
  hardwareId: string;
  pencilMode: PencilMode;
  pencilDraft: FacePoint[] | null;
  pencilFace: FaceId | null;
  pencilPieceId: string | null;
  pencilDrawing: boolean;
  measureMode: MeasureMode;
  measureAnchor: AnchorPoint | null;
  angleDegrees: number;
  offsetMm: number;
  offsetEdge: "left" | "right" | "start" | "end";
  modal: TransformModal | null;
  viewRequest: ViewRequest | null;
  ortho: boolean;
  explode: number;
  assemblyStep: number | null;
  cheatOpen: boolean;
  clipboard: Piece | null;
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
  setSnapVertices: (on: boolean) => void;
  setSnapMidpoints: (on: boolean) => void;
  setSnapEdges: (on: boolean) => void;
  setSnapCentres: (on: boolean) => void;
  setSnapMarks: (on: boolean) => void;
  setSnapDimensions: (on: boolean) => void;
  setCtrlDown: (down: boolean) => void;
  setGridSize: (size: number) => void;
  setSawDistance: (distance: number) => void;
  setSawMitre: (mitre: number) => void;
  setSawFrom: (from: "start" | "end") => void;
  setSawMode: (mode: SawMode) => void;
  setSawBevel: (bevel: number) => void;
  setSawLongPoint: (on: boolean) => void;
  setPlungeWidth: (width: number) => void;
  setPlungeLength: (length: number) => void;
  setPlungeEnds: (ends: "square" | "round") => void;
  setTaperStart: (width: number) => void;
  setTaperEnd: (width: number) => void;
  setCurvePoints: (points: Array<{ u: number; v: number }>) => void;
  setCurveWaste: (waste: "left" | "right") => void;
  setDrillDiameter: (diameter: number) => void;
  setDrillDepth: (depth: number) => void;
  setDrillThrough: (through: boolean) => void;
  setDrillStyle: (style: HoleStyle) => void;
  setCountersinkDiameter: (diameter: number) => void;
  setScrewDiameter: (diameter: number) => void;
  setScrewLength: (length: number) => void;
  setFastenerKind: (kind: FastenerType) => void;
  setRouterKind: (kind: RouterMode) => void;
  setRouterWidth: (width: number) => void;
  setRouterDepth: (depth: number) => void;
  setRouterLength: (length: number) => void;
  setProfile: (profile: ProfileName) => void;
  setProfileEdge: (edge: "left" | "right" | "start" | "end") => void;
  setProfileRadius: (radius: number) => void;
  setJointKind: (kind: JointMode) => void;
  setJointFirst: (hit: { pieceId: string; face: FaceId; u: number; v: number } | null) => void;
  setHardwareId: (id: string) => void;
  setPencilMode: (mode: PencilMode) => void;
  setPencilDraft: (points: FacePoint[] | null, pieceId?: string | null, face?: FaceId | null) => void;
  setPencilDrawing: (drawing: boolean) => void;
  setMeasureMode: (mode: MeasureMode) => void;
  setMeasureAnchor: (anchor: AnchorPoint | null) => void;
  setAngleDegrees: (degrees: number) => void;
  setOffsetMm: (mm: number) => void;
  setOffsetEdge: (edge: "left" | "right" | "start" | "end") => void;
  setModal: (modal: TransformModal | null) => void;
  requestView: (kind: ViewKind) => void;
  setOrtho: (ortho: boolean) => void;
  setExplode: (explode: number) => void;
  setAssemblyStep: (step: number | null) => void;
  setCheatOpen: (open: boolean) => void;
  setClipboard: (piece: Piece | null) => void;
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
  snapVertices: true,
  snapMidpoints: true,
  snapEdges: true,
  snapCentres: true,
  snapMarks: true,
  snapDimensions: true,
  ctrlDown: false,
  gridSize: 10,
  sawDistance: 300,
  sawMitre: 0,
  sawFrom: "start",
  sawMode: "crosscut",
  sawBevel: 0,
  sawLongPoint: false,
  plungeWidth: 80,
  plungeLength: 40,
  plungeEnds: "square",
  taperStart: 76,
  taperEnd: 38,
  curvePoints: [],
  curveWaste: "left",
  drillDiameter: 5,
  drillDepth: 18,
  drillThrough: false,
  drillStyle: "twist",
  countersinkDiameter: 12,
  screwDiameter: 4,
  screwLength: 50,
  fastenerKind: "screw",
  routerKind: "dado",
  routerWidth: 12,
  routerDepth: 6,
  routerLength: 80,
  profile: "round-over",
  profileEdge: "left",
  profileRadius: 6,
  jointKind: "mortise-tenon",
  jointFirst: null,
  hardwareId: "butt-hinge-60",
  pencilMode: "line",
  pencilDraft: null,
  pencilFace: null,
  pencilPieceId: null,
  pencilDrawing: false,
  measureMode: "tape",
  measureAnchor: null,
  angleDegrees: 45,
  offsetMm: 20,
  offsetEdge: "left",
  modal: null,
  viewRequest: null,
  ortho: false,
  explode: 0,
  assemblyStep: null,
  cheatOpen: false,
  clipboard: null,
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
  setSnapVertices: (snapVertices) => set({ snapVertices }),
  setSnapMidpoints: (snapMidpoints) => set({ snapMidpoints }),
  setSnapEdges: (snapEdges) => set({ snapEdges }),
  setSnapCentres: (snapCentres) => set({ snapCentres }),
  setSnapMarks: (snapMarks) => set({ snapMarks }),
  setSnapDimensions: (snapDimensions) => set({ snapDimensions }),
  setCtrlDown: (ctrlDown) => set({ ctrlDown }),
  setGridSize: (gridSize) => set({ gridSize }),
  setSawDistance: (sawDistance) => set({ sawDistance }),
  setSawMitre: (sawMitre) => set({ sawMitre }),
  setSawFrom: (sawFrom) => set({ sawFrom }),
  setSawMode: (sawMode) => set({ sawMode }),
  setSawBevel: (sawBevel) => set({ sawBevel }),
  setSawLongPoint: (sawLongPoint) => set({ sawLongPoint }),
  setPlungeWidth: (plungeWidth) => set({ plungeWidth }),
  setPlungeLength: (plungeLength) => set({ plungeLength }),
  setPlungeEnds: (plungeEnds) => set({ plungeEnds }),
  setTaperStart: (taperStart) => set({ taperStart }),
  setTaperEnd: (taperEnd) => set({ taperEnd }),
  setCurvePoints: (curvePoints) => set({ curvePoints }),
  setCurveWaste: (curveWaste) => set({ curveWaste }),
  setDrillDiameter: (drillDiameter) => set({ drillDiameter }),
  setDrillDepth: (drillDepth) => set({ drillDepth }),
  setDrillThrough: (drillThrough) => set({ drillThrough }),
  setDrillStyle: (drillStyle) => set({ drillStyle }),
  setCountersinkDiameter: (countersinkDiameter) => set({ countersinkDiameter }),
  setScrewDiameter: (screwDiameter) => set({ screwDiameter }),
  setScrewLength: (screwLength) => set({ screwLength }),
  setFastenerKind: (fastenerKind) => set({ fastenerKind }),
  setRouterKind: (routerKind) => set({ routerKind }),
  setRouterWidth: (routerWidth) => set({ routerWidth }),
  setRouterDepth: (routerDepth) => set({ routerDepth }),
  setRouterLength: (routerLength) => set({ routerLength }),
  setProfile: (profile) => set({ profile }),
  setProfileEdge: (profileEdge) => set({ profileEdge }),
  setProfileRadius: (profileRadius) => set({ profileRadius }),
  setJointKind: (jointKind) => set({ jointKind, jointFirst: null }),
  setJointFirst: (jointFirst) => set({ jointFirst }),
  setHardwareId: (hardwareId) => set({ hardwareId }),
  setPencilMode: (pencilMode) => set({ pencilMode, pencilDraft: null, pencilDrawing: false }),
  setPencilDraft: (pencilDraft, pieceId, face) => set({
    pencilDraft,
    pencilPieceId: pieceId === undefined ? useUi.getState().pencilPieceId : pieceId,
    pencilFace: face === undefined ? useUi.getState().pencilFace : face,
  }),
  setPencilDrawing: (pencilDrawing) => set({ pencilDrawing }),
  setMeasureMode: (measureMode) => set({ measureMode, measureAnchor: null }),
  setMeasureAnchor: (measureAnchor) => set({ measureAnchor }),
  setAngleDegrees: (angleDegrees) => set({ angleDegrees }),
  setOffsetMm: (offsetMm) => set({ offsetMm }),
  setOffsetEdge: (offsetEdge) => set({ offsetEdge }),
  setModal: (modal) => set({ modal }),
  requestView: (kind) => set({ viewRequest: { kind, nonce: Date.now() } }),
  setOrtho: (ortho) => set({ ortho }),
  setExplode: (explode) => set({ explode }),
  setAssemblyStep: (assemblyStep) => set({ assemblyStep }),
  setCheatOpen: (cheatOpen) => set({ cheatOpen }),
  setClipboard: (clipboard) => set({ clipboard }),
  setStockOpen: (stockOpen) => set({ stockOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setTab: (tab) => set({ tab, inspectorOpen: true }),
  setDrag: (drag) => set({ drag }),
  setHover: (hover) => set({ hover }),
  bumpScene: () => set((state) => ({ sceneEpoch: state.sceneEpoch + 1 })),
}));
