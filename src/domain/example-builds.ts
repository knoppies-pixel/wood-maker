/**
 * Builds the two example projects by driving Benchwork's own cut, drill,
 * plunge, taper and fastener operations. The numbers are the finished
 * millimetre sizes of the model. Nothing here is copied from a plan.
 */
import * as THREE from "three";
import { edgeProfile, FINISH_PRESETS, HARDWARE_CATALOG, placeHardware, plungeCut, taperPiece } from "./features.ts";
import { holeLocalPoint, inwardNormal, localFaces, longPointAllowance, pointLengths } from "./geometry.ts";
import { DEG, uid, v, type Vec3 } from "./math.ts";
import { addStockPiece, crosscut, makeHole, rip } from "./operations.ts";
import { checkPlan, cutList, fastenerList, shoppingList } from "./reports.ts";
import type { Board, FaceId, Fastener, FastenerType, HardwareItem, Piece, PlanBillLine, ProjectData, StockItem, Vec3Tuple } from "./types.ts";

const KERF = 3;

class Shop {
  boards: Board[] = [];
  pieces: Piece[] = [];
  pool: Piece[] = [];
  fasteners: Fastener[] = [];
  hardware: HardwareItem[] = [];
  planBill: PlanBillLine[] = [];
  step = 1;
  readonly kerf = KERF;
  catalog: StockItem[];

  constructor(catalog: StockItem[]) {
    this.catalog = catalog;
  }

  buy(stockId: string, length: number): Piece {
    const created = addStockPiece(this.stock(stockId), length, [...this.pieces, ...this.pool]);
    if ("error" in created) throw new Error(created.error);
    this.boards.push(created.board);
    return created.piece;
  }

  /** Crosscut a length off rectangular stock. Leftovers stay in the offcut pool. */
  take(stockId: string, length: number, name: string, boardLength: number, minWidth = 0): Piece {
    const index = this.pool.findIndex((piece) => piece.width + 0.2 >= minWidth && this.canCut(piece, stockId, piece.length, length));
    const source = index >= 0 ? this.pool.splice(index, 1)[0] : this.buy(stockId, boardLength);
    if (source.length <= length + 0.5) {
      source.name = name;
      source.step = this.step;
      this.pieces.push(source);
      return source;
    }
    const cut = crosscut(source, length, 0, this.kerf, 0);
    if (!cut.ok) throw new Error(`${name}: ${cut.reason}`);
    cut.pieces[0].name = name;
    cut.pieces[0].step = this.step;
    this.pieces.push(cut.pieces[0]);
    this.pool.push(cut.pieces[1]);
    return cut.pieces[0];
  }

  /** Guillotine a rectangle out of a sheet. Width is the rip, length the crosscut. */
  takeRect(stockId: string, width: number, length: number, name: string, boardLength: number): Piece {
    let bestIndex = -1;
    let bestArea = Infinity;
    this.pool.forEach((piece, index) => {
      const usable = piece.stockId === stockId && piece.section !== "round" && this.blank(piece) && piece.width + 0.2 >= width && piece.length + 0.2 >= length && this.fits(piece.width, width) && this.fits(piece.length, length);
      const area = piece.width * piece.length;
      if (usable && area < bestArea) {
        bestArea = area;
        bestIndex = index;
      }
    });
    let source = bestIndex >= 0 ? this.pool.splice(bestIndex, 1)[0] : this.buy(stockId, boardLength);
    if (source.width + 0.2 < width || source.length + 0.2 < length) {
      throw new Error(`${name} needs ${width}×${length} and the blank is ${source.width}×${source.length}`);
    }
    if (source.width > width + 0.5) {
      const ripped = rip(source, width, this.kerf);
      if (!ripped.ok) throw new Error(`${name}: ${ripped.reason}`);
      this.pool.push(ripped.pieces[1]);
      source = ripped.pieces[0];
    }
    if (source.length > length + 0.5) {
      const cut = crosscut(source, length, 0, this.kerf, 0);
      if (!cut.ok) throw new Error(`${name}: ${cut.reason}`);
      this.pool.push(cut.pieces[1]);
      source = cut.pieces[0];
    }
    source.name = name;
    source.step = this.step;
    this.pieces.push(source);
    return source;
  }

  /** Drop leftovers of one stock so the next group buys fresh lengths. */
  seal(stockId: string): void {
    this.pool = this.pool.filter((piece) => piece.stockId !== stockId);
  }

  ripTo(piece: Piece, width: number): Piece {
    if (piece.width <= width + 0.5) return piece;
    const ripped = rip(piece, width, this.kerf);
    if (!ripped.ok) throw new Error(ripped.reason);
    this.pool.push(ripped.pieces[1]);
    this.replace(piece, ripped.pieces[0]);
    return ripped.pieces[0];
  }

  taper(piece: Piece, start: number, end: number): Piece {
    const result = taperPiece(piece, start, end);
    if ("error" in result) throw new Error(result.error);
    this.replace(piece, result.piece);
    return result.piece;
  }

  plunge(piece: Piece, opening: { x: number; z: number; width: number; length: number; ends?: "square" | "round" }, offcutName?: string): { piece: Piece; offcut: Piece } {
    const result = plungeCut(piece, opening);
    if ("error" in result) throw new Error(`${piece.name}: ${result.error}`);
    this.replace(piece, result.piece);
    if (offcutName) {
      result.offcut.name = offcutName;
      this.pieces.push(result.offcut);
    }
    return result;
  }

  screw(a: Piece, b: Piece, face: FaceId, u: number, vPos: number, length: number, diameter = 4.5, type: FastenerType = "screw"): void {
    const head = holeLocalPoint(a, face, u, vPos);
    this.fasteners.push({
      id: uid(type),
      type,
      pieceAId: a.id,
      pieceBId: b.id,
      localPosition: [head.x, head.y, head.z],
      localDirection: unit(inwardNormal(face, a)),
      diameter,
      length,
    });
  }

  hole(piece: Piece, face: FaceId, u: number, vPos: number, diameter: number): void {
    const result = makeHole(piece, { face, u, v: vPos, diameter, depth: piece.thickness, through: true, style: "twist" });
    if ("error" in result) return;
    piece.holes.push(result.hole);
  }

  project(name: string, planBill: PlanBillLine[] = this.planBill): ProjectData {
    for (const piece of this.pieces) {
      if (piece.position.some((value) => !Number.isFinite(value)) || piece.rotation.some((value) => !Number.isFinite(value))) {
        throw new Error(`${piece.name} has a bad transform`);
      }
    }
    return {
      format: "benchwork-project",
      version: 1,
      name,
      units: "mm",
      kerf: this.kerf,
      catalog: this.catalog,
      boards: this.boards,
      pieces: this.pieces,
      fasteners: this.fasteners,
      hardware: this.hardware,
      dimensions: [],
      planBill,
    };
  }

  private stock(id: string): StockItem {
    const item = this.catalog.find((row) => row.id === id);
    if (!item) throw new Error(`Missing stock ${id}`);
    return item;
  }

  private replace(previous: Piece, next: Piece): void {
    const index = this.pieces.indexOf(previous);
    if (index >= 0) this.pieces[index] = next;
  }

  private canCut(piece: Piece, stockId: string, have: number, need: number): boolean {
    return piece.stockId === stockId && piece.section !== "round" && this.blank(piece) && have + 0.2 >= need && this.fits(have, need);
  }

  private fits(have: number, need: number): boolean {
    return have <= need + 0.5 || have - need >= this.kerf + 5;
  }

  private blank(piece: Piece): boolean {
    return Math.abs(piece.mitreStart) < 0.1 && Math.abs(piece.mitreEnd) < 0.1 && Math.abs(piece.bevelStart) < 0.1 && Math.abs(piece.bevelEnd) < 0.1 && !piece.outline && (piece.openings?.length ?? 0) === 0 && Math.abs((piece.widthStart || piece.width) - (piece.widthEnd || piece.width)) < 0.1;
  }
}

function unit(direction: Vec3): Vec3Tuple {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return [direction.x / length, direction.y / length, direction.z / length];
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function basis(x: number[], y: number[], z: number[]): Vec3Tuple {
  const check = cross(x, y);
  if (Math.abs(check[0] - z[0]) + Math.abs(check[1] - z[1]) + Math.abs(check[2] - z[2]) > 1e-6) {
    throw new Error(`Axes are not right-handed: ${check} vs ${z}`);
  }
  const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
  const angles = new THREE.Euler().setFromRotationMatrix(matrix, "XYZ");
  return [angles.x, angles.y, angles.z];
}

function apply(rotation: Vec3Tuple, local: Vec3): THREE.Vector3 {
  return new THREE.Vector3(local.x, local.y, local.z).applyEuler(new THREE.Euler(...rotation, "XYZ"));
}

function sit(piece: Piece, rotation: Vec3Tuple, position: Vec3Tuple): void {
  piece.rotation = rotation;
  piece.position = position;
}

function shift(pieces: Piece[], dx: number, dy: number, dz: number): void {
  for (const piece of pieces) piece.position = [piece.position[0] + dx, piece.position[1] + dy, piece.position[2] + dz];
}

function lowest(piece: Piece): number {
  let min = Infinity;
  for (const face of localFaces(piece)) {
    for (const corner of face.corners) min = Math.min(min, apply(piece.rotation, corner).y + piece.position[1]);
  }
  return min;
}

function highest(piece: Piece): number {
  let max = -Infinity;
  for (const face of localFaces(piece)) {
    for (const corner of face.corners) max = Math.max(max, apply(piece.rotation, corner).y + piece.position[1]);
  }
  return max;
}

function paint(piece: Piece, label: string): void {
  const finish = FINISH_PRESETS.find((item) => item.label === label);
  if (finish) piece.finish = { ...finish };
}

function offer(id: string) {
  const found = HARDWARE_CATALOG.find((item) => item.id === id);
  if (!found) throw new Error(`Missing hardware ${id}`);
  return found;
}

/** 90 mm up, 35 mm toward −X, length along Z. */
const EDGE_Z = basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
/** 90 mm up, 35 mm toward +Z, length along X. */
const EDGE_X = basis([0, 1, 0], [0, 0, 1], [1, 0, 0]);
/** Length straight up, 90 mm along Z, 35 mm toward +X. */
const POST = basis([0, 0, 1], [1, 0, 0], [0, 1, 0]);

export function summary(project: ProjectData): string {
  const cuts = cutList(project.boards, project.pieces);
  const shop = shoppingList(project.boards, project.hardware, project.pieces);
  const fasteners = fastenerList(project.fasteners, project.pieces);
  const parts = new Map<string, { size: string; count: number }>();
  for (const board of cuts) {
    for (const part of board.parts) {
      const key = `${part.name}|${Math.round(part.length)}|${Math.round(part.width)}|${part.longPoint.toFixed(1)}`;
      const existing = parts.get(key);
      const size = `${part.name}  ${Math.round(part.thickness)}×${Math.round(part.width)}×${Math.round(part.length)}  long ${part.longPoint.toFixed(1)}`;
      if (existing) existing.count += 1;
      else parts.set(key, { size, count: 1 });
    }
  }
  return [
    `${project.name}: ${project.pieces.length} pieces, ${project.boards.length} boards bought, ${project.fasteners.length} fasteners, ${project.hardware.length} hardware`,
    ...shop.lines.map((line) => `  buy ${line.quantity} × ${line.name} ${line.length} mm  R${line.total}`),
    ...fasteners.map((line) => `  ${line.quantity} × ${line.label}`),
    ...[...parts.values()].map((part) => `  ${part.count} × ${part.size}`),
  ].join("\n");
}

export function buildSawhorse(catalog: StockItem[]): ProjectData {
  const shop = new Shop(catalog);
  const top = cutBeam(shop, "Top sawhorse", 1080, 1020, [80, 386]);
  const bottom = cutBeam(shop, "Bottom sawhorse", 1000, 940, [80, 360]);
  const plates = [0, 1, 2, 3].map(() => cutPlate(shop));
  const legs = bevelLegs(shop, 8);
  const topGroup = layoutHorse(shop, top, legs.splice(0, 4), plates.splice(0, 2), 820);
  const bottomGroup = layoutHorse(shop, bottom, legs, plates, -820);
  for (const piece of [...topGroup, ...bottomGroup]) paint(piece, "Sage paint");
  const standing = Math.max(...topGroup.map(highest));
  console.log(`Sawhorse standing height ${standing.toFixed(1)} mm (leg long point 760)`);
  for (const piece of shop.pieces) {
    piece.step = piece.name.includes("leg") ? 2 : piece.name.includes("plate") ? 3 : 1;
  }
  const project = shop.project("Stackable sawhorse", [
    { label: "SA pine 35×90 × 2.4 m", quantity: 6, kind: "board", key: "35×90×2400" },
    { label: "Plywood strip 17×300 × 1.2 m", quantity: 1, kind: "board", key: "17×300×1200" },
    { label: "4.8×65 mm screws", quantity: 50, kind: "fastener", key: "4.8×65" },
    { label: "4×30 mm screws", quantity: 24, kind: "fastener", key: "4×30" },
  ]);
  expectQty(project, "fastener", "4.8×65", 50);
  expectQty(project, "fastener", "4×30", 24);
  expectQty(project, "board", "35×90×2400", 6);
  return project;
}

function cutBeam(shop: Shop, label: string, topLen: number, lowerLen: number, holes: number[]): { label: string; top: Piece; web: Piece; bottom: Piece; holes: number[] } {
  return {
    label,
    top: shop.take("pine-35x90", topLen, `${label} top`, 2400),
    web: shop.take("pine-35x90", lowerLen, `${label} web`, 2400),
    bottom: shop.take("pine-35x90", lowerLen, `${label} bottom`, 2400),
    holes,
  };
}

function cutPlate(shop: Shop): Piece {
  const blank = shop.take("ply-17-300", 235, "Sawhorse end plate", 1200, 250);
  const plate = shop.taper(shop.ripTo(blank, 250), 250, 105);
  plate.name = "Sawhorse end plate";
  return plate;
}

function bevelLegs(shop: Shop, count: number): Piece[] {
  const legs: Piece[] = [];
  let source: Piece | null = null;
  let bevelOnEnd = true;
  const extra = longPointAllowance({ width: 90, thickness: 35 }, 0, 17, "start");
  const centre = 760 - extra;
  while (legs.length < count) {
    if (!source || source.length < centre + shop.kerf + 8) {
      source = shop.buy("pine-35x90", 2400);
      bevelOnEnd = true;
    }
    if (bevelOnEnd) {
      const cut = crosscut(source, centre, 0, shop.kerf, 17);
      if (!cut.ok) throw new Error(cut.reason);
      legs.push(cut.pieces[0]);
      source = cut.pieces[1];
    } else {
      const cut = crosscut(source, centre, 0, shop.kerf, 0);
      if (!cut.ok) throw new Error(cut.reason);
      legs.push(cut.pieces[0]);
      source = cut.pieces[1];
    }
    bevelOnEnd = !bevelOnEnd;
  }
  for (const leg of legs) {
    const points = pointLengths(leg);
    if (Math.abs(points.long - 760) > 0.2) throw new Error(`Leg long point is ${points.long.toFixed(2)}`);
    leg.name = "Sawhorse leg";
    shop.pieces.push(leg);
  }
  return legs;
}

function layoutHorse(shop: Shop, beam: { label: string; top: Piece; web: Piece; bottom: Piece; holes: number[] }, legs: Piece[], plates: Piece[], x: number): Piece[] {
  const { top, web, bottom } = beam;
  const members = [top, web, bottom];
  sit(top, [0, 0, 0], [0, 142.5, 0]);
  sit(web, EDGE_Z, [0, 80, 0]);
  sit(bottom, [0, 0, 0], [0, 17.5, 0]);
  screwFlange(shop, top, web, beam.holes, true);
  screwFlange(shop, bottom, web, [80, 360]);
  for (const end of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = legs.splice(0, 1)[0];
      attachLeg(shop, leg, web, lean, end, beam.bottom.length);
      members.push(leg);
    }
    const plate = plates.splice(0, 1)[0];
    sit(plate, basis([end, 0, 0], [0, 0, -end], [0, 1, 0]), [0, 160 - plate.length / 2, end * (top.length / 2 + plate.thickness / 2)]);
    screwPlate(shop, plate, web);
    members.push(plate);
  }
  const drop = Math.min(...members.map(lowest));
  shift(members, x, -drop, 0);
  return members;
}

function attachLeg(shop: Shop, leg: Piece, web: Piece, lean: number, end: number, lowerLen: number): void {
  const footAtEnd = Math.abs(leg.bevelEnd) > 0.1;
  const topZ = footAtEnd ? -leg.length / 2 : leg.length / 2;
  const target = v(lean * 17.5, 125, end * (lowerLen / 2));
  // Point local +Z so the foot, whichever end it is, sits down and out.
  const footSign = footAtEnd ? 1 : -1;
  const zAxis = [footSign * lean * Math.sin(17 * DEG), -footSign * Math.cos(17 * DEG), 0];
  const xAxis = [0, 0, 1];
  const rotation = basis(xAxis, cross(zAxis, xAxis), zAxis);
  let best: { position: Vec3Tuple; sign: number; spread: number } | null = null;
  for (const sign of [17, -17]) {
    if (footAtEnd) leg.bevelEnd = sign;
    else leg.bevelStart = sign;
    for (const anchorY of [-leg.thickness / 2, leg.thickness / 2]) {
      leg.rotation = rotation;
      const spun = apply(rotation, v(end * leg.width / 2, anchorY, topZ));
      const position: Vec3Tuple = [target.x - spun.x, target.y - spun.y, target.z - spun.z];
      leg.position = position;
      const spread = footSpread(leg, footAtEnd);
      const outward = Math.sign(position[0] - target.x) === Math.sign(lean);
      const footBelow = footAverage(leg, footAtEnd) < topAverage(leg, footAtEnd) - 200;
      if (outward && footBelow && spread < 1.5 && (!best || spread < best.spread)) best = { position, sign, spread };
    }
  }
  if (!best) throw new Error(`No flat pose for ${leg.name} lean ${lean} end ${end}`);
  if (footAtEnd) leg.bevelEnd = best.sign;
  else leg.bevelStart = best.sign;
  leg.rotation = rotation;
  leg.position = best.position;
  const face = screwFace(leg, -lean);
  for (const across of [25, 65]) {
    for (const down of [25, 140]) {
      const vPos = footAtEnd ? down : leg.length - down;
      shop.hole(leg, face, across, vPos, 5);
      shop.screw(leg, web, face, across, vPos, 65, 4.8);
    }
  }
}

function screwFace(leg: Piece, toward: number): FaceId {
  const top = inwardNormal("top", leg);
  const world = apply(leg.rotation, v(top.x, top.y, top.z));
  return world.x * toward > 0 ? "top" : "bottom";
}

function footSpread(piece: Piece, footAtEnd: boolean): number {
  const face = footAtEnd ? "end" : "start";
  const corners = localFaces(piece).find((item) => item.id === face)?.corners ?? [];
  const ys = corners.map((corner) => apply(piece.rotation, corner).y + piece.position[1]);
  return Math.max(...ys) - Math.min(...ys);
}

function footAverage(piece: Piece, footAtEnd: boolean): number {
  const face = footAtEnd ? "end" : "start";
  const corners = localFaces(piece).find((item) => item.id === face)?.corners ?? [];
  return corners.reduce((sum, corner) => sum + apply(piece.rotation, corner).y + piece.position[1], 0) / corners.length;
}

function topAverage(piece: Piece, footAtEnd: boolean): number {
  return footAverage(piece, !footAtEnd);
}

function screwFlange(shop: Shop, flange: Piece, web: Piece, fromEnds: number[], centre = false): void {
  const stations = [...fromEnds, ...fromEnds.map((distance) => flange.length - distance)];
  if (centre) stations.push(flange.length / 2);
  for (const station of stations) {
    shop.hole(flange, "top", flange.width / 2, station, 5);
    shop.screw(flange, web, "top", flange.width / 2, station, 65, 4.8);
  }
}

function screwPlate(shop: Shop, plate: Piece, web: Piece): void {
  const stations = [30, 118, 205];
  for (const vPos of stations) {
    const width = 250 + (105 - 250) * (vPos / plate.length);
    const inset = (250 - width) / 2;
    for (const side of [22, width - 22]) {
      shop.hole(plate, "bottom", inset + side, vPos, 4);
      shop.screw(plate, web, "bottom", inset + side, vPos, 30, 4);
    }
  }
}

export function buildWorkbench(catalog: StockItem[]): ProjectData {
  const shop = new Shop(catalog);
  const pine = (length: number, name: string) => shop.take("pine-35x90", length, name, 2400);
  const dar = (length: number, name: string) => shop.take("pine-19x42", length, name, 2400);
  const ply = (width: number, length: number, name: string) => shop.takeRect("ply-17", width, length, name, 2400);
  const form = (piece: Piece) => {
    paint(piece, "Formply");
    return piece;
  };

  const legStock = cutLegStock(shop);
  shop.step = 1;
  const sideL = pine(2400, "Bottom side");
  const sideR = pine(2400, "Bottom side");
  const endN = pine(1130, "Bottom end");
  const endS = pine(1130, "Bottom end");
  const noggins = [-497.5, -52.5, 547.5].map((z) => {
    const piece = pine(1130, "Bottom noggin");
    sit(piece, EDGE_X, [0, 45, z]);
    return piece;
  });
  sit(sideL, EDGE_Z, [-582.5, 45, 0]);
  sit(sideR, EDGE_Z, [582.5, 45, 0]);
  sit(endN, EDGE_X, [0, 45, -1182.5]);
  sit(endS, EDGE_X, [0, 45, 1182.5]);
  for (const rail of [endN, endS]) {
    screwInto(shop, sideL, rail, 60, 4);
    screwInto(shop, sideR, rail, 60, 4);
  }
  for (const rail of noggins) {
    screwInto(shop, sideL, rail, 60, 2);
    screwInto(shop, sideR, rail, 60, 2);
  }
  shop.seal("pine-35x90");

  // Five posts a side, from the wing end (B, Z=-1200) to the far end (A, Z=+1200).
  // Each post is two 35 mm boards. The outer board is flush with the bench side and
  // carries the ear; the inner board stops under the top rail. Feet sit on the bottom rail.
  const legZ = [-1155, -595, -75, 845, 1155];
  const legEar = [35, 35, 17, 17, 35];
  const legEarTall = [90, 90, 180, 180, 90];
  const legs: Piece[] = [];
  let legCursor = 0;
  const legY = 90 + 863 / 2;
  for (const side of [-1, 1]) {
    const outerX = side * 582.5;
    const innerX = side * 547.5;
    legZ.forEach((z, index) => {
      const names = ["Leg B", "Leg E", "Leg C", "Leg D", "Leg A"];
      const outer = legStock[legCursor];
      const inner = legStock[legCursor + 1];
      legCursor += 2;
      if (!outer || !inner) throw new Error("Leg stock ran out");
      outer.name = names[index];
      inner.name = `${names[index]} laminate`;
      sit(outer, POST, [outerX, legY, z]);
      let eared = cutEar(shop, outer, legEar[index], legEarTall[index], index === 2 || index === 3 ? "center" : index < 2 ? "start" : "end");
      if (index === 0 || index === 1 || index === 4) eared = cutBottomCheek(shop, eared);
      const innerY = index === 2 || index === 3 ? 431.5 : 521.5;
      sit(inner, POST, [innerX, innerY, z]);
      laminate(shop, eared, inner, outerX);
      legs.push(eared);
      const rail = side < 0 ? sideL : sideR;
      const face: FaceId = side < 0 ? "top" : "bottom";
      const along = rail.length / 2 + z;
      const bolts = index === 0 || index === 4 ? [30, 60] : [18, 36, 54, 72];
      for (const u of bolts) shop.screw(rail, eared, face, u, along, 90, 10, "bolt");
    });
  }
  // Wheels hang under the bottom rails at the four corners, on the floor.
  for (const rail of [sideL, sideR]) {
    shop.hardware.push(placeHardware(offer("castor-75"), rail, "left", { u: 45, v: 17 }));
    shop.hardware.push(placeHardware(offer("castor-75"), rail, "left", { u: 2355, v: 17 }));
  }

  shop.step = 3;
  const floor = form(ply(1200, 2400, "Bottom shelf"));
  sit(floor, [0, 0, 0], [0, 98.5, 0]);
  let notched = floor;
  for (const x of [-565, 565]) {
    for (const z of legZ) notched = shop.plunge(notched, { x, z, width: 70, length: 90 }).piece;
  }
  shop.screw(floor, sideL, "bottom", 80, 400, 30, 4);
  shop.screw(floor, sideR, "bottom", floor.width - 80, 400, 30, 4);
  for (let i = 0; i < 21; i += 1) {
    const side = i % 2 === 0 ? sideL : sideR;
    const u = i % 2 === 0 ? 70 : floor.width - 70;
    shop.screw(floor, side, "bottom", u, Math.min(floor.length - 40, 90 + (i % 11) * 200), 30, 4);
  }
  for (const [u, vPos] of [[180, 180], [180, 2200], [600, 180], [600, 2200], [400, 1200], [800, 1200]] as Array<[number, number]>) {
    shop.hardware.push(placeHardware(offer("bumper-10"), floor, "bottom", { u, v: vPos }));
  }

  shop.step = 4;
  shop.seal("pine-35x90");
  // Top rails sit on the inner lamination so the outer ear stands proud of them.
  const back = pine(2400, "Top back rail");
  sit(back, EDGE_Z, [547.5, 908, 0]);
  shop.plunge(back, { x: 22, z: -682.5, width: 54, length: 85 });
  const frontShort = pine(1170, "Top front rail");
  sit(frontShort, EDGE_Z, [-547.5, 908, -615]);
  const endReturn = pine(1060, "Top end rail");
  sit(endReturn, EDGE_X, [0, 908, 1182.5]);
  const wingReturn = pine(370, "Top wing return");
  sit(wingReturn, EDGE_X, [345, 908, -1182.5]);
  const frontReturn = pine(250, "Top front return");
  sit(frontReturn, EDGE_X, [-405, 908, -1182.5]);
  const farReturn = pine(400, "Top far return");
  sit(farReturn, EDGE_Z, [-547.5, 908, 965]);
  for (const leg of legs) {
    shop.screw(leg, back, "end", 45, 20, 60, 4.5);
    shop.screw(leg, back, "end", 70, 20, 60, 4.5);
  }
  spacedScrews(shop, endReturn, back, "bottom", 3, 60, 4.5);
  spacedScrews(shop, farReturn, back, "bottom", 2, 60, 4.5);
  spacedScrews(shop, wingReturn, back, "bottom", 2, 60, 4.5);
  spacedScrews(shop, frontShort, frontReturn, "top", 2, 60, 4.5);
  spacedScrews(shop, frontReturn, wingReturn, "top", 3, 60, 4.5);
  shop.seal("pine-35x90");

  shop.step = 7;
  const main = form(ply(1200, 1840, "Main benchtop"));
  sit(main, [0, 0, 0], [0, 961.5, 280]);
  const opening = shop.plunge(main, { x: -115, z: 105, width: 670, length: 824 }, "Flip-top panel");
  const lid = opening.offcut;
  paint(lid, "Formply");
  lid.step = 8;
  sit(lid, [0, 0, 0], [-115, 961.5, 385]);
  const hole = main.openings?.[0];
  if (hole) hole.rim = { profile: "chamfer", radius: 3 };
  for (const edge of ["left", "right", "start", "end"] as const) {
    const profile = edgeProfile({ profile: "chamfer", edge, side: "top", radius: 3 }, lid.thickness);
    if (!("error" in profile)) lid.profiles.push(profile.profile);
  }
  shop.hardware.push(placeHardware(offer("barrel-bolt-100"), lid, "top", { u: 50, v: 180 }));
  shop.hardware.push(placeHardware(offer("barrel-bolt-100"), lid, "top", { u: lid.width - 50, v: 180 }));
  for (let i = 0; i < 16; i += 1) {
    shop.screw(lid, main, "bottom", 40 + (i % 4) * 150, 80 + Math.floor(i / 4) * 180, 30, 4);
  }

  const wingWide = form(ply(370, 475, "Wing top"));
  const wingNarrow = form(ply(250, 475, "Wing top"));
  sit(wingWide, [0, 0, 0], [600 - 185, 961.5, -1200 + 237.5]);
  sit(wingNarrow, [0, 0, 0], [-600 + 125, 961.5, -1200 + 237.5]);

  shop.seal("pine-19x42");
  shop.step = 5;
  const lipA = dar(990, "Saw base lip");
  const lipC = dar(467, "Saw base lip");
  const trimShortA = dar(937, "Edge trim");
  const lipB = dar(990, "Saw base lip");
  const lipD = dar(467, "Saw base lip");
  const trimShortB = dar(937, "Edge trim");
  const trimEnd = dar(1130, "Edge trim");
  const trimLong = dar(1267, "Edge trim");
  for (const piece of [trimShortA, trimShortB, trimEnd, trimLong]) piece.step = 10;
  for (const piece of [lipA, lipB, lipC, lipD]) piece.step = 5;

  const shelf = buildSawBay(shop, pine, ply, form, [lipA, lipB, lipC, lipD]);
  buildFlip(shop, ply, form, main, lid);
  buildDrawer(shop, ply, form);
  sit(trimLong, [0, 0, 0], [-579, 980, -1200 + 1267 / 2]);
  sit(trimShortA, [0, 0, 0], [-579, 980, -1200 + 1267 + 3 + 937 / 2]);
  sit(trimShortB, [0, 0, 0], [579, 980, -200]);
  sit(trimEnd, EDGE_X, [0, 980, 1182]);
  placeBrackets(shop, main, back, frontShort, wingWide, wingNarrow, endReturn);

  const mitre = placeHardware(offer("mitre-saw-ref"), lid, "top", { u: lid.width / 2, v: 180 });
  shop.hardware.push(mitre);
  const tableSaw = placeHardware(offer("table-saw-ref"), shelf, "top", { u: shelf.width / 2, v: shelf.length / 2 });
  shop.hardware.push(tableSaw);
  for (const [u, vPos] of [[120, 200], [520, 200], [120, 700], [520, 700]] as Array<[number, number]>) {
    shop.screw(main, lid, "bottom", u, vPos, 60, 6.5);
  }

  const project = shop.project("Mitre saw workbench", workbenchBill());
  expectQty(project, "board", "35×90×2400", 22);
  expectQty(project, "board", "19×42×2400", 3);
  expectQty(project, "board", "17×1200×2400", 4);
  expectQty(project, "board", "25×25×1200", 1);
  expectQty(project, "fastener", "4.5×60", 156);
  expectQty(project, "fastener", "4×30", 123);
  expectQty(project, "fastener", "4×16", 38);
  expectQty(project, "fastener", "4×20", 38);
  expectQty(project, "fastener", "4×40", 2);
  expectQty(project, "fastener", "Pocket 4×32", 6);
  expectQty(project, "fastener", "Pocket 4×64", 12);
  expectQty(project, "fastener", "6.5×60", 4);
  expectQty(project, "fastener", "Bolt M10×90", 32);
  expectQty(project, "hardware", "angle-25", 38);
  expectQty(project, "hardware", "castor-75", 4);
  expectQty(project, "hardware", "bumper-10", 6);
  const report = checkPlan(project.planBill ?? [], project.boards, project.hardware, project.fasteners, project.pieces);
  if (report.mismatches.length || report.extras.length) {
    throw new Error(`Workbench plan check: ${JSON.stringify({ mismatches: report.mismatches, extras: report.extras })}`);
  }
  return project;
}

function screwInto(shop: Shop, side: Piece, rail: Piece, length: number, count: number): void {
  const face: FaceId = side.position[0] < 0 ? "top" : "bottom";
  const along = side.length / 2 + (rail.position[2] - side.position[2]);
  for (let i = 0; i < count; i += 1) {
    const u = 16 + (i * 58) / Math.max(1, count - 1);
    const vPos = Math.min(side.length - 25, Math.max(25, along + (i - (count - 1) / 2) * 12));
    shop.screw(side, rail, face, u, vPos, length, 4.5);
  }
}

function cutLegStock(shop: Shop): Piece[] {
  const legs: Piece[] = [];
  shop.step = 2;
  for (let stick = 0; stick < 10; stick += 1) {
    const source = shop.buy("pine-35x90", 2400);
    const first = crosscut(source, 863, 0, shop.kerf, 0);
    if (!first.ok) throw new Error(first.reason);
    const second = crosscut(first.pieces[1], 683, 0, shop.kerf, 0);
    if (!second.ok) throw new Error(second.reason);
    for (const piece of [first.pieces[0], second.pieces[0]]) {
      piece.step = 2;
      piece.name = "Leg";
      shop.pieces.push(piece);
      legs.push(piece);
    }
  }
  shop.seal("pine-35x90");
  return legs;
}

/** Leave a tongue at the top (+Z, which is up on a post). */
function cutEar(shop: Shop, piece: Piece, earWidth: number, earLength: number, side: "start" | "end" | "center"): Piece {
  const spare = piece.width - earWidth;
  const z = piece.length / 2 - earLength / 2;
  if (side === "center") {
    const cheek = spare / 2;
    const first = shop.plunge(piece, { x: -piece.width / 2 + cheek / 2, z, width: cheek, length: earLength }).piece;
    return shop.plunge(first, { x: piece.width / 2 - cheek / 2, z, width: cheek, length: earLength }).piece;
  }
  const x = side === "start" ? piece.width / 2 - spare / 2 : -piece.width / 2 + spare / 2;
  return shop.plunge(piece, { x, z, width: spare, length: earLength }).piece;
}

/** Half-lap cheek: the bottom 90 mm of the inner board narrows to 35 mm. */
function cutBottomCheek(shop: Shop, piece: Piece): Piece {
  const spare = piece.width - 35;
  return shop.plunge(piece, { x: piece.width / 2 - spare / 2, z: -piece.length / 2 + 45, width: spare, length: 90 }).piece;
}

function laminate(shop: Shop, outer: Piece, inner: Piece, x: number): void {
  const face: FaceId = x < 0 ? "bottom" : "top";
  for (const u of [25, 65]) {
    for (const vPos of [160, 410, 660]) shop.screw(outer, inner, face, u, vPos, 60, 4.5);
  }
}

function spacedScrews(shop: Shop, a: Piece, b: Piece, face: FaceId, count: number, length: number, diameter = 4.5, type: FastenerType = "screw"): void {
  const along = face === "left" || face === "right" ? a.length : face === "start" || face === "end" ? a.width : a.length;
  const across = face === "left" || face === "right" ? a.thickness : face === "start" || face === "end" ? a.thickness : a.width;
  for (let i = 0; i < count; i += 1) {
    shop.screw(a, b, face, across * ((i % 3) + 1) / 4, along * (i + 1) / (count + 1), length, diameter, type);
  }
}

function buildSawBay(shop: Shop, pine: (length: number, name: string) => Piece, ply: (width: number, length: number, name: string) => Piece, form: (piece: Piece) => Piece, lips: Piece[]): Piece {
  shop.step = 5;
  shop.seal("pine-35x90");
  const railA = pine(1060, "Saw base rail");
  const railB = pine(990, "Saw base rail");
  const railC = [pine(615, "Saw base end"), pine(615, "Saw base end")];
  shop.seal("pine-35x90");
  shop.step = 6;
  const steppedBlanks = [pine(560, "Saw cradle side"), pine(560, "Saw cradle side")];
  const cradleLegA = pine(370, "Saw cradle rail");
  const frontBlanks = [pine(312, "Saw cradle leg"), pine(312, "Saw cradle leg")];
  const cradleB = pine(250, "Saw cradle rail");
  shop.seal("pine-35x90");
  const cradleD = pine(300, "Saw cradle rail");
  const plain = [pine(222, "Saw cradle leg"), pine(222, "Saw cradle leg")];
  const cradleE = pine(180, "Saw cradle rail");
  shop.step = 5;
  // Lower shelf between the wing end and leg E. Rails on edge, plywood flat on top.
  const shelfY = 595;
  const shelfTop = 648.5;
  sit(railA, EDGE_X, [0, shelfY, -1092]);
  sit(railB, EDGE_X, [0, shelfY, -513]);
  sit(railC[0], EDGE_Z, [-512.5, shelfY, -802.5]);
  sit(railC[1], EDGE_Z, [512.5, shelfY, -802.5]);
  const shelf = form(ply(525, 990, "Saw base shelf"));
  sit(shelf, [0, 0, 0], [0, shelfTop, -802.5]);
  const lip = lips;
  sit(lip[0], [0, 0, 0], [0, shelfTop + 18, -1092]);
  sit(lip[1], [0, 0, 0], [0, shelfTop + 18, -513]);
  sit(lip[2], EDGE_X, [-512.5, shelfTop + 18, -802.5]);
  sit(lip[3], EDGE_X, [512.5, shelfTop + 18, -802.5]);

  const cradleA = cradleLegA;
  const stepped = steppedBlanks.map((piece) => shop.plunge(piece, { x: 45 - 25, z: piece.length / 2 - 42.5, width: 50, length: 85 }).piece);
  const front = frontBlanks.map((piece) =>
    shop.plunge(piece, { x: -45 + 17.5, z: -piece.length / 2 + (piece.length - 90) / 2, width: 35, length: piece.length - 90 }).piece,
  );
  // Upper cradle under the two wings, on edge, meeting the top frame.
  // Cradle members sit under the wings. The 370 and 250 rails are a second layer
  // under the top-frame returns, not the same boards.
  sit(stepped[0], EDGE_Z, [247.5, 818, -885]);
  sit(stepped[1], EDGE_Z, [-367.5, 818, -885]);
  sit(cradleA, EDGE_X, [345, 818, -1147]);
  sit(cradleB, EDGE_X, [-405, 818, -1147]);
  sit(cradleD, EDGE_X, [415, 818, -760]);
  sit(cradleE, EDGE_X, [-475, 818, -760]);
  sit(front[0], POST, [-330, 813, -1110]);
  sit(front[1], POST, [250, 813, -1110]);
  sit(plain[0], POST, [-330, 768, -640]);
  sit(plain[1], POST, [250, 768, -640]);
  shop.screw(cradleA, stepped[0], "top", 45, 40, 64, 4, "pocket-screw");
  shop.screw(cradleB, stepped[1], "top", 45, 40, 64, 4, "pocket-screw");
  spacedScrews(shop, railC[0], railA, "top", 3, 60, 4.5);
  spacedScrews(shop, railC[0], railB, "top", 3, 60, 4.5);
  spacedScrews(shop, railC[1], railA, "bottom", 3, 60, 4.5);
  spacedScrews(shop, railC[1], railB, "bottom", 3, 60, 4.5);
  spacedScrews(shop, shelf, railA, "bottom", 4, 60, 4.5);
  spacedScrews(shop, shelf, railB, "bottom", 4, 60, 4.5);
  spacedScrews(shop, cradleA, stepped[0], "bottom", 2, 60, 4.5);
  spacedScrews(shop, cradleB, stepped[1], "bottom", 2, 60, 4.5);
  spacedScrews(shop, cradleD, stepped[0], "bottom", 2, 60, 4.5);
  spacedScrews(shop, cradleE, stepped[1], "bottom", 2, 60, 4.5);
  spacedScrews(shop, front[0], cradleA, "end", 2, 60, 4.5);
  spacedScrews(shop, front[1], cradleB, "end", 2, 60, 4.5);
  spacedScrews(shop, plain[0], cradleD, "end", 2, 60, 4.5);
  spacedScrews(shop, plain[1], cradleE, "end", 2, 60, 4.5);
  spacedScrews(shop, railA, railC[0], "bottom", 3, 64, 4, "pocket-screw");
  spacedScrews(shop, railB, railC[1], "bottom", 3, 64, 4, "pocket-screw");
  spacedScrews(shop, front[0], stepped[0], "end", 2, 64, 4, "pocket-screw");
  spacedScrews(shop, front[1], stepped[1], "end", 2, 64, 4, "pocket-screw");
  return shelf;
}

function buildFlip(shop: Shop, ply: (width: number, length: number, name: string) => Piece, black: (piece: Piece) => Piece, main: Piece, lid: Piece): void {
  shop.step = 8;
  const supports = [0, 1].map((index) => {
    const panel = black(ply(180, 1130, "Flip support"));
    sit(panel, basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, 863, index === 0 ? -18.5 : 788.5]);
    shop.plunge(panel, { x: 0, z: -1130 / 2 + 275, width: 25, length: 100, ends: "round" });
    shop.screw(panel, main, "bottom", 40, 200, 30, 4);
    shop.screw(panel, main, "bottom", 140, 900, 30, 4);
    shop.screw(panel, main, "bottom", 80, 500, 30, 4);
    shop.screw(panel, main, "bottom", 120, 700, 30, 4);
    return panel;
  });
  const pipe = shop.take("pipe-25", 875, "Flip pipe", 1200);
  paint(pipe, "Black paint");
  sit(pipe, [0, 0, 0], [-290, 863, 385]);
  const rear = black(ply(117, 830, "Rear flip support"));
  sit(rear, basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, 890, 385]);
  const rearNotched = shop.plunge(rear, { x: 117 / 2 - 12.5, z: -830 / 2 + 15, width: 25, length: 30 }).piece;
  shop.plunge(rearNotched, { x: 117 / 2 - 12.5, z: 830 / 2 - 15, width: 25, length: 30 });
  const cleat = [black(ply(25, 770, "Flip cleat")), black(ply(25, 770, "Flip cleat"))];
  sit(cleat[0], [0, 0, 0], [0, 940, 725]);
  sit(cleat[1], [0, 0, 0], [0, 850, 765]);
  shop.screw(rear, supports[1], "top", 40, 80, 30, 4);
  shop.screw(rear, supports[0], "top", 70, 200, 30, 4);
  shop.screw(rear, supports[0], "bottom", 40, 500, 30, 4);
  shop.screw(rear, supports[1], "bottom", 80, 600, 30, 4);
  for (let i = 0; i < 5; i += 1) {
    shop.screw(cleat[0], rear, "bottom", 12, 80 + i * 140, 30, 4);
    shop.screw(cleat[1], rear, "top", 12, 80 + i * 140, 30, 4);
  }

  const sideA = [black(ply(116, 670, "Flip frame end")), black(ply(116, 670, "Flip frame end"))];
  const railB = [black(ply(116, 786, "Flip frame rail")), black(ply(116, 786, "Flip frame rail"))];
  const frameY = 780;
  sit(sideA[0], basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [-115, frameY, -18.5]);
  sit(sideA[1], basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [-115, frameY, 788.5]);
  sit(railB[0], basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]), [-441.5, frameY, 385]);
  sit(railB[1], basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]), [211.5, frameY, 385]);
  shop.screw(sideA[0], railB[0], "top", 30, 40, 30, 4);
  shop.screw(sideA[0], railB[1], "top", 86, 40, 30, 4);
  spacedScrews(shop, sideA[1], railB[0], "top", 2, 30, 4);
  spacedScrews(shop, sideA[1], railB[1], "top", 2, 30, 4);
  spacedScrews(shop, railB[0], sideA[0], "bottom", 1, 30, 4);
  spacedScrews(shop, railB[1], sideA[0], "bottom", 1, 30, 4);

  const platform = black(ply(670, 824, "Saw platform"));
  sit(platform, [0, 0, 0], [-115, frameY + 66.5, 385]);
  for (let i = 0; i < 12; i += 1) shop.screw(platform, railB[i % 2], "bottom", 80 + (i % 4) * 120, 80 + Math.floor(i / 4) * 250, 30, 4);
  for (let i = 0; i < 4; i += 1) {
    const block = black(ply(100, 250, "Tie-down block"));
    const x = -115 - 250 + (i % 2) * 500;
    const z = 385 - 180 + Math.floor(i / 2) * 360;
    sit(block, [0, 0, 0], [x, platform.position[1] + 17, z]);
    shop.screw(block, platform, "bottom", 30, 40, 30, 4);
    shop.screw(block, platform, "bottom", 70, 200, 30, 4);
    shop.screw(block, platform, "bottom", 40, 90, 30, 4);
    shop.screw(block, platform, "bottom", 60, 160, 30, 4);
  }
  shop.screw(platform, pipe, "bottom", 200, 120, 40, 4);
  shop.screw(platform, pipe, "bottom", 470, 700, 40, 4);
  void lid;
}

function buildDrawer(shop: Shop, ply: (width: number, length: number, name: string) => Piece, black: (piece: Piece) => Piece): void {
  shop.step = 9;
  const side = [black(ply(330, 988, "Drawer side")), black(ply(330, 988, "Drawer side"))];
  const end = [black(ply(330, 486, "Drawer end")), black(ply(330, 486, "Drawer end"))];
  const bottom = black(ply(486, 954, "Drawer bottom"));
  const front = black(ply(350, 1056, "Drawer front"));
  for (const edge of ["left", "right", "start", "end"] as const) {
    const profile = edgeProfile({ profile: "chamfer", edge, side: "top", radius: 3 }, front.thickness);
    if (!("error" in profile)) front.profiles.push(profile.profile);
  }
  // 988 wide along the bench, 520 deep, pulled out the front so the box is visible.
  const cx = -280;
  const cz = 500;
  const cy = 560;
  const alongZ = basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
  const alongX = basis([0, 1, 0], [0, 0, 1], [1, 0, 0]);
  sit(side[0], alongZ, [cx - 251.5, cy, cz]);
  sit(side[1], alongZ, [cx + 251.5, cy, cz]);
  sit(end[0], alongX, [cx, cy, cz - 485.5]);
  sit(end[1], alongX, [cx, cy, cz + 485.5]);
  sit(bottom, [0, 0, 0], [cx, cy - 156, cz]);
  sit(front, alongZ, [cx - 268, cy, cz]);
  shop.screw(end[0], side[0], "bottom", 40, 40, 32, 4, "pocket-screw");
  shop.screw(end[0], side[1], "bottom", 290, 40, 32, 4, "pocket-screw");
  shop.screw(end[1], side[0], "top", 40, 40, 32, 4, "pocket-screw");
  shop.screw(end[1], side[1], "top", 80, 80, 32, 4, "pocket-screw");
  shop.screw(bottom, side[0], "bottom", 40, 200, 32, 4, "pocket-screw");
  shop.screw(bottom, side[1], "bottom", 40, 700, 32, 4, "pocket-screw");
  for (let i = 0; i < 20; i += 1) {
    const host = i < 10 ? side[i % 2] : end[i % 2];
    shop.screw(host, bottom, i < 10 ? "bottom" : "top", 40 + (i % 5) * 40, 80 + (i % 4) * 80, 30, 4);
  }
  shop.screw(front, side[0], "top", 80, 200, 30, 4);
  shop.screw(front, side[0], "top", 270, 850, 30, 4);
  shop.screw(front, side[1], "top", 80, 300, 30, 4);
  shop.screw(front, side[1], "top", 200, 500, 30, 4);
  shop.screw(front, end[0], "bottom", 120, 400, 30, 4);
  shop.screw(front, end[1], "bottom", 160, 700, 30, 4);
  shop.hardware.push(placeHardware(offer("slide-500"), end[0], "bottom", { u: 160, v: 240 }));
  shop.hardware.push(placeHardware(offer("slide-500"), end[1], "top", { u: 160, v: 240 }));
  shop.hardware.push(placeHardware(offer("pull-128"), front, "top", { u: 175, v: 528 }));
}

function placeBrackets(shop: Shop, main: Piece, back: Piece, front: Piece, wingWide: Piece, wingNarrow: Piece, endReturn: Piece): void {
  const add = (host: Piece, mate: Piece, u: number, vPos: number) => {
    shop.hardware.push(placeHardware(offer("angle-25"), host, "bottom", { u, v: vPos }));
    shop.screw(host, mate, "bottom", Math.min(host.width - 6, Math.max(6, u)), Math.min(host.length - 6, Math.max(6, vPos)), 16, 4);
    shop.screw(mate, host, "top", Math.min(mate.width - 6, 8 + (u % 30)), Math.min(mate.length - 6, 12 + (vPos % Math.max(20, mate.length - 24))), 20, 4);
  };
  for (let i = 0; i < 10; i += 1) add(main, back, main.width - 40, 90 + i * 160);
  for (let i = 0; i < 8; i += 1) add(main, front, 36, 50 + i * 70);
  for (let i = 0; i < 6; i += 1) {
    add(wingWide, back, 28 + (i % 3) * 90, 40 + Math.floor(i / 3) * 180);
    add(wingNarrow, front, 28 + (i % 2) * 70, 36 + Math.floor(i / 2) * 100);
  }
  for (let i = 0; i < 8; i += 1) add(main, endReturn, 70 + i * 130, main.length - 48);
}

function workbenchBill(): PlanBillLine[] {
  return [
    { label: "SA pine 35×90 × 2.4 m", quantity: 22, kind: "board", key: "35×90×2400" },
    { label: "DAR 19×42 × 2.4 m", quantity: 3, kind: "board", key: "19×42×2400" },
    { label: "Formply 17 mm 1200×2400", quantity: 4, kind: "board", key: "17×1200×2400" },
    { label: "Steel pipe 25 mm × 1.2 m", quantity: 1, kind: "board", key: "25×25×1200" },
    { label: "60 mm screws", quantity: 156, kind: "fastener", key: "4.5×60" },
    { label: "30 mm screws", quantity: 123, kind: "fastener", key: "4×30" },
    { label: "16 mm bracket screws", quantity: 38, kind: "fastener", key: "4×16" },
    { label: "20 mm bracket screws", quantity: 38, kind: "fastener", key: "4×20" },
    { label: "40 mm screws", quantity: 2, kind: "fastener", key: "4×40" },
    { label: "Pocket screws 32 mm", quantity: 6, kind: "fastener", key: "Pocket 4×32" },
    { label: "Pocket screws 64 mm", quantity: 12, kind: "fastener", key: "Pocket 4×64" },
    { label: "Roofing screws 60 mm", quantity: 4, kind: "fastener", key: "6.5×60" },
    { label: "Cuphead bolts M10×90", quantity: 32, kind: "fastener", key: "Bolt M10×90" },
    { label: "Angle brackets 25×25", quantity: 38, kind: "hardware", key: "angle-25" },
    { label: "Drawer slides 500 mm", quantity: 2, kind: "hardware", key: "slide-500" },
    { label: "Drawer pull", quantity: 1, kind: "hardware", key: "pull-128" },
    { label: "Barrel bolts 100 mm", quantity: 2, kind: "hardware", key: "barrel-bolt-100" },
    { label: "Retracting castors", quantity: 4, kind: "hardware", key: "castor-75" },
    { label: "Furniture bumpers 10 mm", quantity: 6, kind: "hardware", key: "bumper-10" },
  ];
}

function expectQty(project: ProjectData, kind: PlanBillLine["kind"], key: string, quantity: number): void {
  const report = checkPlan([{ label: key, quantity, kind, key }], project.boards, project.hardware, project.fasteners, project.pieces);
  const miss = report.mismatches[0];
  if (miss) throw new Error(`${project.name} ${kind} ${key}: expected ${quantity}, got ${miss.actual}`);
}
