/** Millimetres, right-handed. Length runs along local Z, width along X, thickness along Y. */

export type Vec3Tuple = [number, number, number];

export type FaceId = "top" | "bottom" | "left" | "right" | "start" | "end";

export interface StockLength {
  length: number;
  price: number;
}

export interface StockItem {
  id: string;
  name: string;
  species: string;
  /** mm, the dimension that stands up off the bench when the piece is laid flat. */
  thickness: number;
  /** mm, the other cross-section dimension. */
  width: number;
  lengths: StockLength[];
  /** Sheet goods (plywood, MDF): width × length is the face. */
  sheet?: boolean;
  /** Round stock (dowel, pipe). Diameter is `width`, and thickness matches it. */
  section?: "rect" | "round";
}

/** A length bought from the catalogue. Cut parts keep a reference to this board. */
export interface Board {
  id: string;
  stockId: string;
  name: string;
  species: string;
  thickness: number;
  width: number;
  /** Purchased length, mm. */
  length: number;
  price: number;
  sheet: boolean;
}

export type HoleStyle = "twist" | "countersink" | "forstner" | "hole-saw";

export interface Hole {
  id: string;
  face: FaceId;
  /**
   * Millimetres across the face from its left / start origin.
   * Top & bottom: u from the left edge, v from the reference (start) end along the centreline.
   * Left & right: u from the reference end, v from the bottom face.
   * Start & end: u from the left edge, v from the bottom face.
   */
  u: number;
  v: number;
  diameter: number;
  /** mm into the face, along the inward normal. */
  depth: number;
  through: boolean;
  /** Twist bit unless a countersink, Forstner or hole saw was chosen. */
  style: HoleStyle;
  /** Countersink mouth, Forstner rim, or hole-saw pilot, in mm. */
  secondaryDiameter?: number;
}

/** A slot or step left by a router. */
export interface RouterCut {
  id: string;
  kind: "dado" | "groove" | "rebate";
  face: FaceId;
  /** Across-face position of the slot centre, mm from the face origin. */
  u: number;
  /** Along-face position of the slot start, mm from the face origin. */
  v: number;
  length: number;
  width: number;
  depth: number;
  /** Rebate only: which edge the step is taken from. */
  edge?: "left" | "right" | "start" | "end";
}

export type ProfileName = "round-over" | "chamfer" | "cove";

export interface EdgeProfile {
  id: string;
  profile: ProfileName;
  edge: "left" | "right" | "start" | "end";
  /** Which arris of that edge. Older files omit this and mean the top. */
  side?: "top" | "bottom";
  radius: number;
}

export interface XZPoint {
  x: number;
  z: number;
}

export type JointKind = "mortise" | "tenon" | "half-lap" | "dovetail-tail" | "dovetail-pin" | "dowel";

/** One half of a paired joint. The mate carries the same pairId. */
export interface JoineryFeature {
  id: string;
  pairId: string;
  matePieceId: string;
  kind: JointKind;
  face: FaceId;
  u: number;
  v: number;
  width: number;
  height: number;
  depth: number;
  /** Dovetail slope, degrees from square. */
  angle?: number;
}

export interface Finish {
  grain: "length" | "width";
  treatment: "bare" | "stain" | "paint";
  /** Multiplies the wood texture. Bare is white so the species colour shows through. */
  color: string;
  label: string;
}

export const BARE_FINISH: Finish = { grain: "length", treatment: "bare", color: "#ffffff", label: "Bare" };

export interface Piece {
  id: string;
  name: string;
  boardId: string;
  stockId: string;
  species: string;
  profileName: string;
  thickness: number;
  width: number;
  /** Centreline length, mm. Mitre long/short points are derived from this. */
  length: number;
  /** Degrees from square at the reference end (local −Z). Positive tilts the +X corner toward +Z. */
  mitreStart: number;
  /** Degrees from square at the far end (local +Z). */
  mitreEnd: number;
  /** Bevel at the reference end. Positive lifts the top corner toward +Z. Degrees. */
  bevelStart: number;
  bevelEnd: number;
  /** Width at the reference end and the far end. Equal when the piece is not tapered. */
  widthStart: number;
  widthEnd: number;
  /** Bandsaw or jigsaw outline in local XZ. Null keeps the rectangular section. */
  outline: XZPoint[] | null;
  /** Round stock is a cylinder along local Z. Omitted means a rectangular section. */
  section?: "rect" | "round";
  /** Through-holes and edge notches left by a plunge or jigsaw cut. */
  openings?: Opening[];
  /** World position of the piece centre, mm. */
  position: Vec3Tuple;
  /** Euler XYZ radians, matching three.js. */
  rotation: Vec3Tuple;
  holes: Hole[];
  routes: RouterCut[];
  profiles: EdgeProfile[];
  joinery: JoineryFeature[];
  finish: Finish;
  marks: PencilMark[];
  modifiers: WoodModifier[];
  /**
   * Interval this part still occupies on the purchased board's length.
   * Kerf gaps are not included. Rips share a span.
   */
  spanStart: number;
  spanEnd: number;
}

export type FastenerType = "screw" | "pocket-screw" | "bolt" | "glue";

export interface Fastener {
  id: string;
  type: FastenerType;
  /** Piece the head sits on. Glue uses the face that was brushed. */
  pieceAId: string;
  pieceBId: string;
  /** Head centre in piece A local space. */
  localPosition: Vec3Tuple;
  /** Unit direction the fastener travels, in piece A local space. */
  localDirection: Vec3Tuple;
  diameter: number;
  length: number;
  /** Pocket-screw angle down from the face, degrees. */
  angle?: number;
}

export type HardwareKind = "hinge" | "drawer-slide" | "handle" | "bracket" | "castor" | "latch";

/** A rectangular bite from a jigsaw or plunge cut, in local XZ. The centre may sit past an edge, which makes a notch. */
export interface Opening {
  id: string;
  x: number;
  z: number;
  /** Along local X. */
  width: number;
  /** Along local Z. */
  length: number;
}

export interface HardwareItem {
  id: string;
  catalogId: string;
  kind: HardwareKind;
  name: string;
  pieceId: string;
  matePieceId?: string;
  face: FaceId;
  u: number;
  v: number;
  width: number;
  height: number;
  depth: number;
  price: number;
}

export interface ProjectData {
  format: "benchwork-project";
  version: 1;
  name: string;
  units: "mm";
  kerf: number;
  catalog: StockItem[];
  boards: Board[];
  pieces: Piece[];
  fasteners: Fastener[];
  hardware: HardwareItem[];
  dimensions: DimensionNote[];
}

export interface FacePoint {
  u: number;
  v: number;
}

export interface PencilMark {
  id: string;
  face: FaceId;
  kind: "freehand" | "line";
  points: FacePoint[];
  label?: string;
}

export type ModifierAxis = "x" | "y" | "z";

export type WoodModifier =
  | {
      id: string;
      type: "array";
      enabled: boolean;
      layout: "linear" | "radial";
      count: number;
      /** Centre-to-centre step in mm. Ignored when fitLength is set. */
      spacing: number;
      axis: ModifierAxis;
      fitLength: number | null;
    }
  | {
      id: string;
      type: "mirror";
      enabled: boolean;
      axis: ModifierAxis;
      /** Edge places a touching copy. Centre flips through the piece origin. */
      across: "edge" | "centre";
    }
  | {
      id: string;
      type: "space";
      enabled: boolean;
      /** Extra copies placed between this piece and the target. */
      count: number;
      axis: ModifierAxis;
      targetId: string;
    };

export interface AnchorPoint {
  pieceId: string;
  face: FaceId;
  u: number;
  v: number;
}

export interface DimensionNote {
  id: string;
  a: AnchorPoint;
  b: AnchorPoint;
}

export const MIN_PART_MM = 5;
export const PROJECT_FORMAT = "benchwork-project" as const;
