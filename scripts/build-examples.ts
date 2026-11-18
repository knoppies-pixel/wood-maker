/**
 * Builds the two example projects by driving Benchwork's own cut, drill,
 * plunge, taper and fastener operations. The numbers are the finished
 * millimetre sizes of the model. Nothing here is copied from a plan.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { defaultCatalog } from "../src/domain/catalog.ts";
import { edgeProfile, FINISH_PRESETS, HARDWARE_CATALOG, placeHardware, plungeCut, taperPiece } from "../src/domain/features.ts";
import { holeLocalPoint, inwardNormal, localFaces, longPointAllowance, pointLengths } from "../src/domain/geometry.ts";
import { DEG, uid, v, type Vec3 } from "../src/domain/math.ts";
import { addStockPiece, crosscut, makeHole, rip } from "../src/domain/operations.ts";
import { serializeProject } from "../src/domain/project-io.ts";
import { cutList, fastenerList, shoppingList } from "../src/domain/reports.ts";
import type { Board, FaceId, Fastener, FastenerType, HardwareItem, Piece, ProjectData, StockItem, Vec3Tuple } from "../src/domain/types.ts";

const KERF = 3;

class Shop {
  boards: Board[] = [];
  pieces: Piece[] = [];
  pool: Piece[] = [];
  fasteners: Fastener[] = [];
  hardware: HardwareItem[] = [];
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
      this.pieces.push(source);
      return source;
    }
    const cut = crosscut(source, length, 0, this.kerf, 0);
    if (!cut.ok) throw new Error(`${name}: ${cut.reason}`);
    cut.pieces[0].name = name;
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
    this.pieces.push(source);
    return source;
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

  plunge(piece: Piece, opening: { x: number; z: number; width: number; length: number }, offcutName?: string): { piece: Piece; offcut: Piece } {
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

  project(name: string): ProjectData {
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

function summary(project: ProjectData): string {
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

function buildSawhorse(catalog: StockItem[]): ProjectData {
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
  return shop.project("Stackable sawhorse");
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
  screwFlange(shop, top, web, beam.holes);
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

function screwFlange(shop: Shop, flange: Piece, web: Piece, fromEnds: number[]): void {
  const stations = [...fromEnds, ...fromEnds.map((distance) => flange.length - distance)];
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

function buildWorkbench(catalog: StockItem[]): ProjectData {
  const shop = new Shop(catalog);
  const pine = (length: number, name: string) => shop.take("pine-35x90", length, name, 2400);
  const dar = (length: number, name: string) => shop.take("pine-19x42", length, name, 2400);
  const ply = (width: number, length: number, name: string) => shop.takeRect("ply-17", width, length, name, 2400);
  const black = (piece: Piece) => {
    paint(piece, "Black paint");
    return piece;
  };

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
  for (const rail of [endN, endS, ...noggins]) {
    screwInto(shop, sideL, rail, 60);
    screwInto(shop, sideR, rail, 60);
  }

  // Five posts a side. Centres from the floor checkout chain and the leg spacing.
  const legZ = [-1155, -595, 235, 845, 1155];
  const legs: Piece[] = [];
  for (const x of [-547.5, 547.5]) {
    legZ.forEach((z, index) => {
      const names = ["Leg B", "Leg E", "Leg C", "Leg D", "Leg A"];
      const leg = pine(863, names[index]);
      sit(leg, POST, [x, 863 / 2, z]);
      if (index === 0 || index === 4) {
        // Ear left by a 35 mm deep notch along the lower 90 mm, the lap the frame sits in.
        shop.plunge(leg, { x: x > 0 ? 45 - 17.5 : -45 + 17.5, z: -863 / 2 + 45, width: 35, length: 90 });
      }
      legs.push(leg);
      const rail = x < 0 ? sideL : sideR;
      const face: FaceId = x < 0 ? "top" : "bottom";
      const along = rail.length / 2 + z;
      shop.screw(rail, leg, face, 30, along, 90, 10, "bolt");
      shop.screw(rail, leg, face, 60, along, 90, 10, "bolt");
      if (index === 0 || index === 4) shop.hardware.push(placeHardware(offer("castor-75"), leg, "start", { u: leg.width / 2, v: leg.thickness / 2 }));
    });
  }

  const floor = black(ply(1200, 2400, "Bottom shelf"));
  sit(floor, [0, 0, 0], [0, 98.5, 0]);
  for (const x of [-565, 565]) {
    for (const z of legZ) shop.plunge(floor, { x, z, width: 70, length: 96 });
  }
  shop.screw(floor, sideL, "bottom", 80, 400, 30, 4);
  shop.screw(floor, sideR, "bottom", floor.width - 80, 400, 30, 4);

  const back = pine(2400, "Top back rail");
  sit(back, EDGE_Z, [582.5, 908, 0]);
  shop.plunge(back, { x: 20, z: -682.5, width: 50, length: 85 });
  const frontShort = pine(1170, "Top front rail");
  sit(frontShort, EDGE_Z, [-582.5, 908, -615]);
  shop.plunge(frontShort, { x: 20, z: -1170 / 2 + 517.5, width: 50, length: 85 });
  const endReturn = pine(1200, "Top end rail");
  sit(endReturn, EDGE_X, [0, 908, 1182.5]);
  const wingReturn = pine(370, "Top wing return");
  sit(wingReturn, EDGE_X, [380, 908, -1182.5]);
  const frontReturn = pine(250, "Top front return");
  sit(frontReturn, EDGE_X, [-440, 908, -1182.5]);
  const farReturn = pine(400, "Top far return");
  sit(farReturn, EDGE_X, [-365, 908, 1182.5]);
  for (const leg of legs) {
    shop.screw(leg, back, "end", 45, 20, 60, 4.5);
  }

  const main = black(ply(1200, 1840, "Main benchtop"));
  sit(main, [0, 0, 0], [0, 961.5, 280]);
  const opening = shop.plunge(main, { x: 138, z: 0, width: 670, length: 824 }, "Flip-top panel");
  const lid = opening.offcut;
  paint(lid, "Black paint");
  hingeOpen(lid, [main.position[0] + 138, main.position[1] + main.thickness / 2, main.position[2] - 412]);
  shop.hardware.push(placeHardware(offer("barrel-bolt-100"), lid, "top", { u: 50, v: 180 }));
  shop.hardware.push(placeHardware(offer("barrel-bolt-100"), lid, "top", { u: lid.width - 50, v: 180 }));
  for (let i = 0; i < 12; i += 1) {
    shop.hardware.push(placeHardware(offer("angle-25"), main, "bottom", { u: 80 + (i % 6) * 190, v: i < 6 ? 70 : main.length - 70 }));
  }

  const wingWide = black(ply(370, 475, "Wing top"));
  const wingNarrow = black(ply(250, 475, "Wing top"));
  sit(wingWide, [0, 0, 0], [600 - 185, 961.5, -1200 + 237.5]);
  sit(wingNarrow, [0, 0, 0], [-600 + 125, 961.5, -1200 + 237.5]);
  for (const wing of [wingWide, wingNarrow]) {
    shop.hardware.push(placeHardware(offer("angle-25"), wing, "bottom", { u: 40, v: 40 }));
    shop.hardware.push(placeHardware(offer("angle-25"), wing, "bottom", { u: wing.width - 40, v: wing.length - 40 }));
  }

  buildSawBay(shop, pine, dar, ply, black);
  buildFlip(shop, ply, black, main, lid);
  buildDrawer(shop, ply, black);
  const trim = [dar(2400, "Edge trim"), dar(2400, "Edge trim"), dar(1130, "Edge trim")];
  sit(trim[0], [0, 0, 0], [-579, 980, 0]);
  sit(trim[1], [0, 0, 0], [579, 980, 0]);
  sit(trim[2], EDGE_X, [0, 980, 1182]);

  return shop.project("Mitre saw workbench");
}

function screwInto(shop: Shop, side: Piece, rail: Piece, length: number): void {
  const face: FaceId = side.position[0] < 0 ? "top" : "bottom";
  const along = side.length / 2 + (rail.position[2] - side.position[2]);
  shop.screw(side, rail, face, 28, Math.min(side.length - 25, Math.max(25, along - 16)), length, 4.5);
  shop.screw(side, rail, face, 62, Math.min(side.length - 25, Math.max(25, along + 16)), length, 4.5);
}

function hingeOpen(panel: Piece, hinge: Vec3Tuple): void {
  const tilt = 58 * DEG;
  const rotation = basis([1, 0, 0], [0, Math.cos(tilt), -Math.sin(tilt)], [0, Math.sin(tilt), Math.cos(tilt)]);
  const pivot = apply(rotation, v(0, 0, -panel.length / 2));
  panel.rotation = rotation;
  panel.position = [hinge[0] - pivot.x, hinge[1] - pivot.y, hinge[2] - pivot.z];
}

function buildSawBay(shop: Shop, pine: (length: number, name: string) => Piece, dar: (length: number, name: string) => Piece, ply: (width: number, length: number, name: string) => Piece, black: (piece: Piece) => Piece): void {
  // A rectangular base in the table-saw bay, standing on the bottom frame.
  const railA = pine(1060, "Saw base rail");
  const railB = pine(990, "Saw base rail");
  const railC = [pine(615, "Saw base end"), pine(615, "Saw base end")];
  sit(railA, EDGE_X, [0, 200, -1080]);
  sit(railB, EDGE_X, [0, 200, -470]);
  sit(railC[0], EDGE_Z, [-470, 200, -775]);
  sit(railC[1], EDGE_Z, [470, 200, -775]);
  const shelf = black(ply(525, 990, "Saw base shelf"));
  sit(shelf, [0, 0, 0], [0, 255, -775]);
  const lip = [dar(990, "Saw base lip"), dar(990, "Saw base lip"), dar(467, "Saw base lip"), dar(467, "Saw base lip")];
  sit(lip[0], [0, 0, 0], [0, 274, -1080]);
  sit(lip[1], [0, 0, 0], [0, 274, -470]);
  sit(lip[2], EDGE_X, [-490, 274, -775]);
  sit(lip[3], EDGE_X, [490, 274, -775]);

  // The upper cradle sits under the two small tops. Sides stand, rails tie them.
  const cradleA = pine(370, "Saw cradle rail");
  const cradleB = pine(250, "Saw cradle rail");
  // plungeCut returns a new piece. Sitting the old one leaves the notched board where the stock landed.
  const stepped = [pine(560, "Saw cradle side"), pine(560, "Saw cradle side")].map((piece) =>
    shop.plunge(piece, { x: 45 - 25, z: piece.length / 2 - 42.5, width: 50, length: 85 }).piece,
  );
  const cradleD = pine(300, "Saw cradle rail");
  const cradleE = pine(180, "Saw cradle rail");
  const front = [pine(312, "Saw cradle leg"), pine(312, "Saw cradle leg")].map((piece) =>
    shop.plunge(piece, { x: -45 + 17.5, z: -piece.length / 2 + (piece.length - 90) / 2, width: 35, length: piece.length - 90 }).piece,
  );
  const plain = [pine(222, "Saw cradle leg"), pine(222, "Saw cradle leg")];
  sit(stepped[0], POST, [-300, 560, -900]);
  sit(stepped[1], POST, [220, 560, -900]);
  sit(cradleA, EDGE_X, [-300, 860, -1080]);
  sit(cradleB, EDGE_X, [220, 860, -1080]);
  sit(cradleD, EDGE_X, [-300, 700, -720]);
  sit(cradleE, EDGE_X, [220, 700, -720]);
  sit(front[0], POST, [-420, 420, -1080]);
  sit(front[1], POST, [400, 420, -1080]);
  sit(plain[0], POST, [-420, 380, -620]);
  sit(plain[1], POST, [400, 380, -620]);
  shop.screw(cradleA, stepped[0], "top", 45, 40, 64, 4, "pocket-screw");
  shop.screw(cradleB, stepped[1], "top", 45, 40, 64, 4, "pocket-screw");
}

function buildFlip(shop: Shop, ply: (width: number, length: number, name: string) => Piece, black: (piece: Piece) => Piece, main: Piece, lid: Piece): void {
  const supports = [0, 1].map((index) => {
    const panel = black(ply(180, 1130, "Flip support"));
    // 180 tall, 1130 spanning the width. Slot 100 × 25, 275 mm from one end, on the centre line.
    sit(panel, basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, 863, index === 0 ? 40 : 440]);
    shop.plunge(panel, { x: 0, z: -1130 / 2 + 275, width: 25, length: 100 });
    shop.screw(panel, main, "bottom", 40, 200, 30, 4);
    shop.screw(panel, main, "bottom", 140, 900, 30, 4);
    return panel;
  });
  const pipe = shop.take("pipe-25", 875, "Flip pipe", 1200);
  paint(pipe, "Black paint");
  sit(pipe, [0, 0, 0], [-565 + 275, 863, 240]);
  const rear = black(ply(117, 830, "Rear flip support"));
  sit(rear, basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, 890, 240]);
  shop.plunge(rear, { x: 117 / 2 - 12.5, z: -830 / 2 + 15, width: 25, length: 30 });
  shop.plunge(rear, { x: 117 / 2 - 12.5, z: 830 / 2 - 15, width: 25, length: 30 });
  const cleat = [black(ply(25, 770, "Flip cleat")), black(ply(25, 770, "Flip cleat"))];
  sit(cleat[0], [0, 0, 0], [0, 940, 620]);
  sit(cleat[1], [0, 0, 0], [0, 850, 660]);
  shop.screw(rear, supports[1], "top", 40, 80, 30, 4);

  const sideA = [black(ply(116, 670, "Flip frame end")), black(ply(116, 670, "Flip frame end"))];
  const railB = [black(ply(116, 786, "Flip frame rail")), black(ply(116, 786, "Flip frame rail"))];
  const frameY = 780;
  sit(sideA[0], basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, frameY, 280 - 401.5]);
  sit(sideA[1], basis([0, 1, 0], [0, 0, 1], [1, 0, 0]), [0, frameY, 280 + 401.5]);
  sit(railB[0], basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]), [-335, frameY, 280]);
  sit(railB[1], basis([0, 1, 0], [-1, 0, 0], [0, 0, 1]), [335, frameY, 280]);
  shop.screw(sideA[0], railB[0], "top", 30, 40, 30, 4);
  shop.screw(sideA[0], railB[1], "top", 86, 40, 30, 4);

  const platform = black(ply(670, 824, "Saw platform"));
  sit(platform, [0, 0, 0], [138, frameY + 66.5, 280]);
  for (let i = 0; i < 4; i += 1) {
    const block = black(ply(100, 250, "Tie-down block"));
    const x = 138 - 250 + (i % 2) * 500;
    const z = 280 - 180 + Math.floor(i / 2) * 360;
    sit(block, [0, 0, 0], [x, platform.position[1] + 17, z]);
    shop.screw(block, platform, "bottom", 30, 40, 30, 4);
    shop.screw(block, platform, "bottom", 70, 200, 30, 4);
  }
  shop.screw(platform, pipe, "bottom", 200, 120, 40, 4);
  shop.screw(platform, pipe, "bottom", 470, 700, 40, 4);
  void lid;
}

function buildDrawer(shop: Shop, ply: (width: number, length: number, name: string) => Piece, black: (piece: Piece) => Piece): void {
  const side = [black(ply(330, 988, "Drawer side")), black(ply(330, 988, "Drawer side"))];
  const end = [black(ply(330, 486, "Drawer end")), black(ply(330, 486, "Drawer end"))];
  const bottom = black(ply(486, 954, "Drawer bottom"));
  const front = black(ply(350, 1056, "Drawer front"));
  for (const edge of ["left", "right", "start", "end"] as const) {
    const profile = edgeProfile({ profile: "chamfer", edge, side: "top", radius: 3 }, front.thickness);
    if (!("error" in profile)) front.profiles.push(profile.profile);
  }
  // 988 wide along the bench, 520 deep, pulled out the front so the box is visible.
  const cx = -560;
  const cz = 180;
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
  shop.screw(front, side[0], "top", 80, 200, 30, 4);
  shop.screw(front, side[0], "top", 270, 850, 30, 4);
  shop.hardware.push(placeHardware(offer("slide-500"), end[0], "bottom", { u: 160, v: 240 }));
  shop.hardware.push(placeHardware(offer("slide-500"), end[1], "top", { u: 160, v: 240 }));
  shop.hardware.push(placeHardware(offer("pull-128"), front, "top", { u: 175, v: 528 }));
}

const catalog = defaultCatalog();
const sawhorse = buildSawhorse(catalog);
const workbench = buildWorkbench(catalog);
mkdirSync("public/examples", { recursive: true });
writeFileSync("public/examples/stackable-sawhorse.json", serializeProject(sawhorse));
writeFileSync("public/examples/mitre-saw-workbench.json", serializeProject(workbench));
const text = `${summary(sawhorse)}\n\n${summary(workbench)}\n`;
writeFileSync("/tmp/example-summary.txt", text);
console.log(text);
