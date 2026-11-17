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
}

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
  /** World position of the piece centre, mm. */
  position: Vec3Tuple;
  /** Euler XYZ radians, matching three.js. */
  rotation: Vec3Tuple;
  holes: Hole[];
  /**
   * Interval this part still occupies on the purchased board's length.
   * Kerf gaps are not included. Rips share a span.
   */
  spanStart: number;
  spanEnd: number;
}

export interface Fastener {
  id: string;
  type: "screw";
  /** Piece the head sits on. */
  pieceAId: string;
  pieceBId: string;
  /** Head centre in piece A local space. */
  localPosition: Vec3Tuple;
  /** Unit direction the screw travels, in piece A local space. */
  localDirection: Vec3Tuple;
  diameter: number;
  length: number;
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
}

export const MIN_PART_MM = 5;
export const PROJECT_FORMAT = "benchwork-project" as const;
