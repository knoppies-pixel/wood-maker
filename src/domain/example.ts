import { shapeDefaults } from "./features.ts";
import { uid } from "./math.ts";
import type { Board, Fastener, Piece, ProjectData, StockItem } from "./types.ts";

/** A 600 × 400 mm butt-jointed pine frame, already cut and screwed, to poke at. */
export function sampleFrame(catalog: StockItem[]): ProjectData {
  const stock = catalog.find((item) => item.id === "pine-22x69") ?? catalog[0];
  const offer = stock.lengths.find((item) => item.length === 2400) ?? stock.lengths[0];
  const boardId = uid("board");
  const board: Board = {
    id: boardId,
    stockId: stock.id,
    name: stock.name,
    species: stock.species,
    thickness: stock.thickness,
    width: stock.width,
    length: offer.length,
    price: offer.price,
    sheet: Boolean(stock.sheet),
  };

  const thickness = stock.thickness;
  const width = stock.width;
  const outsideX = 600;
  const outsideZ = 400;
  const y = thickness / 2;
  const stileLength = outsideZ;
  const railLength = outsideX - width * 2;
  const leftX = -outsideX / 2 + width / 2;
  const rightX = outsideX / 2 - width / 2;
  const bottomZ = -outsideZ / 2 + width / 2;
  const topZ = outsideZ / 2 - width / 2;

  const base = {
    boardId,
    stockId: stock.id,
    species: stock.species,
    profileName: stock.name,
    thickness,
    width,
    mitreStart: 0,
    mitreEnd: 0,
    holes: [],
    ...shapeDefaults(width),
  };
  const kerf = 3;
  const rightStart = stileLength + kerf;
  const bottomStart = rightStart + stileLength + kerf;
  const topStart = bottomStart + railLength + kerf;

  const left: Piece = {
    ...base,
    id: uid("piece"),
    name: "Left stile",
    length: stileLength,
    position: [leftX, y, 0],
    rotation: [0, 0, 0],
    spanStart: 0,
    spanEnd: stileLength,
  };
  const right: Piece = {
    ...base,
    id: uid("piece"),
    name: "Right stile",
    length: stileLength,
    position: [rightX, y, 0],
    rotation: [0, 0, 0],
    spanStart: rightStart,
    spanEnd: rightStart + stileLength,
  };
  const quarter = Math.PI / 2;
  const bottom: Piece = {
    ...base,
    id: uid("piece"),
    name: "Bottom rail",
    length: railLength,
    position: [0, y, bottomZ],
    rotation: [0, quarter, 0],
    spanStart: bottomStart,
    spanEnd: bottomStart + railLength,
  };
  const top: Piece = {
    ...base,
    id: uid("piece"),
    name: "Top rail",
    length: railLength,
    position: [0, y, topZ],
    rotation: [0, quarter, 0],
    spanStart: topStart,
    spanEnd: topStart + railLength,
  };

  const screw = (piece: Piece, localX: number, localZ: number, directionX: number, other: Piece): Fastener => ({
    id: uid("screw"),
    type: "screw",
    pieceAId: piece.id,
    pieceBId: other.id,
    localPosition: [localX, 0, localZ],
    localDirection: [directionX, 0, 0],
    diameter: 5,
    length: 90,
  });

  const half = width / 2;
  return {
    format: "benchwork-project",
    version: 1,
    name: "Butt-joint frame",
    units: "mm",
    kerf: 3,
    catalog,
    boards: [board],
    pieces: [left, right, bottom, top],
    hardware: [],
    dimensions: [],
    fasteners: [
      screw(left, -half, bottomZ, 1, bottom),
      screw(left, -half, topZ, 1, top),
      screw(right, half, bottomZ, -1, bottom),
      screw(right, half, topZ, -1, top),
    ],
  };
}
