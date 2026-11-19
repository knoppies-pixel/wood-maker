import { describe, expect, it } from "vitest";
import { buildSawhorse, buildWorkbench } from "./example-builds.ts";
import { defaultCatalog } from "./catalog.ts";
import { localFaces, localToWorld } from "./geometry.ts";
import { checkPlan } from "./reports.ts";
import type { Piece, PlanBillLine } from "./types.ts";

interface Box {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function bounds(piece: Piece): Box {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const face of localFaces(piece)) {
    for (const corner of face.corners) {
      const world = localToWorld(piece, corner);
      minX = Math.min(minX, world.x);
      minY = Math.min(minY, world.y);
      minZ = Math.min(minZ, world.z);
      maxX = Math.max(maxX, world.x);
      maxY = Math.max(maxY, world.y);
      maxZ = Math.max(maxZ, world.z);
    }
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    sx: maxX - minX,
    sy: maxY - minY,
    sz: maxZ - minZ,
    minX, maxX, minY, maxY, minZ, maxZ,
  };
}

/** Plan boxes in app space: X depth (front −), Y up, Z along the bench (wing end −). */
const WORKBENCH: Array<[string, number, number, number, number, number, number]> = [
  ["Bottom side", -582.5, 45, 0, 35, 90, 2400],
  ["Bottom side", 582.5, 45, 0, 35, 90, 2400],
  ["Bottom end", 0, 45, -1182.5, 1130, 90, 35],
  ["Bottom end", 0, 45, 1182.5, 1130, 90, 35],
  ["Bottom noggin", 0, 45, -497.5, 1130, 90, 35],
  ["Bottom noggin", 0, 45, -52.5, 1130, 90, 35],
  ["Bottom noggin", 0, 45, 547.5, 1130, 90, 35],
  ["Leg B", -582.5, 521.5, -1155, 35, 863, 90],
  ["Leg B", 582.5, 521.5, -1155, 35, 863, 90],
  ["Leg B laminate", -547.5, 521.5, -1155, 35, 683, 90],
  ["Leg B laminate", 547.5, 521.5, -1155, 35, 683, 90],
  ["Leg E", -582.5, 521.5, -595, 35, 863, 90],
  ["Leg E", 582.5, 521.5, -595, 35, 863, 90],
  ["Leg E laminate", -547.5, 521.5, -595, 35, 683, 90],
  ["Leg E laminate", 547.5, 521.5, -595, 35, 683, 90],
  ["Leg C", -582.5, 521.5, -75, 35, 863, 90],
  ["Leg C", 582.5, 521.5, -75, 35, 863, 90],
  ["Leg C laminate", -547.5, 431.5, -75, 35, 683, 90],
  ["Leg C laminate", 547.5, 431.5, -75, 35, 683, 90],
  ["Leg D", -582.5, 521.5, 845, 35, 863, 90],
  ["Leg D", 582.5, 521.5, 845, 35, 863, 90],
  ["Leg D laminate", -547.5, 431.5, 845, 35, 683, 90],
  ["Leg D laminate", 547.5, 431.5, 845, 35, 683, 90],
  ["Leg A", -582.5, 521.5, 1155, 35, 863, 90],
  ["Leg A", 582.5, 521.5, 1155, 35, 863, 90],
  ["Leg A laminate", -547.5, 521.5, 1155, 35, 683, 90],
  ["Leg A laminate", 547.5, 521.5, 1155, 35, 683, 90],
  ["Bottom shelf", 0, 98.5, 0, 1200, 17, 2400],
  ["Top back rail", 547.5, 908, 0, 35, 90, 2400],
  ["Top front rail", -547.5, 908, -615, 35, 90, 1170],
  ["Top end rail", 0, 908, 1182.5, 1060, 90, 35],
  ["Top wing return", 345, 908, -1182.5, 370, 90, 35],
  ["Top front return", -405, 908, -1182.5, 250, 90, 35],
  ["Top far return", -547.5, 908, 965, 35, 90, 400],
  ["Main benchtop", 0, 961.5, 280, 1200, 17, 1840],
  ["Flip-top panel", -115, 961.5, 385, 670, 17, 824],
  ["Wing top", 415, 961.5, -962.5, 370, 17, 475],
  ["Wing top", -475, 961.5, -962.5, 250, 17, 475],
  ["Saw base rail", 0, 595, -1092, 1060, 90, 35],
  ["Saw base rail", 0, 595, -513, 990, 90, 35],
  ["Saw base end", -512.5, 595, -802.5, 35, 90, 615],
  ["Saw base end", 512.5, 595, -802.5, 35, 90, 615],
  ["Saw base shelf", 0, 648.5, -802.5, 525, 17, 990],
  ["Flip support", 0, 863, -18.5, 1130, 180, 17],
  ["Flip support", 0, 863, 788.5, 1130, 180, 17],
  ["Drawer side", -531.5, 560, 500, 17, 330, 988],
  ["Drawer side", -28.5, 560, 500, 17, 330, 988],
  ["Drawer end", -280, 560, 14.5, 486, 330, 17],
  ["Drawer end", -280, 560, 985.5, 486, 330, 17],
  ["Drawer bottom", -280, 404, 500, 486, 17, 954],
  ["Drawer front", -548, 560, 500, 17, 350, 1056],
];

const BILL: PlanBillLine[] = [
  { label: "pine", quantity: 22, kind: "board", key: "35×90×2400" },
  { label: "dar", quantity: 3, kind: "board", key: "19×42×2400" },
  { label: "ply", quantity: 4, kind: "board", key: "17×1200×2400" },
  { label: "pipe", quantity: 1, kind: "board", key: "25×25×1200" },
  { label: "screws 60", quantity: 156, kind: "fastener", key: "4.5×60" },
  { label: "screws 30", quantity: 123, kind: "fastener", key: "4×30" },
  { label: "screws 16", quantity: 38, kind: "fastener", key: "4×16" },
  { label: "screws 20", quantity: 38, kind: "fastener", key: "4×20" },
  { label: "screws 40", quantity: 2, kind: "fastener", key: "4×40" },
  { label: "pocket 32", quantity: 6, kind: "fastener", key: "Pocket 4×32" },
  { label: "pocket 64", quantity: 12, kind: "fastener", key: "Pocket 4×64" },
  { label: "roofing", quantity: 4, kind: "fastener", key: "6.5×60" },
  { label: "bolts", quantity: 32, kind: "fastener", key: "Bolt M10×90" },
  { label: "angles", quantity: 38, kind: "hardware", key: "angle-25" },
  { label: "castors", quantity: 4, kind: "hardware", key: "castor-75" },
  { label: "bumpers", quantity: 6, kind: "hardware", key: "bumper-10" },
  { label: "slides", quantity: 2, kind: "hardware", key: "slide-500" },
  { label: "pull", quantity: 1, kind: "hardware", key: "pull-128" },
  { label: "bolts barrel", quantity: 2, kind: "hardware", key: "barrel-bolt-100" },
];

function claim(pieces: Piece[], name: string, cx: number, cy: number, cz: number): Piece {
  const left = pieces.filter((piece) => piece.name === name);
  const ranked = left
    .map((piece) => {
      const box = bounds(piece);
      const distance = Math.hypot(box.cx - cx, box.cy - cy, box.cz - cz);
      return { piece, distance };
    })
    .sort((a, b) => a.distance - b.distance);
  const found = ranked[0];
  expect(found, name).toBeTruthy();
  expect(found.distance, `${name} nearest is ${found.distance.toFixed(1)} mm from the plan centre`).toBeLessThanOrEqual(2);
  const index = pieces.indexOf(found.piece);
  pieces.splice(index, 1);
  return found.piece;
}

describe("workbench plan geometry", () => {
  const project = buildWorkbench(defaultCatalog());

  it("matches every audited bounding box", () => {
    const pool = [...project.pieces];
    for (const [name, cx, cy, cz, sx, sy, sz] of WORKBENCH) {
      const piece = claim(pool, name, cx, cy, cz);
      const box = bounds(piece);
      expect(box.sx, name).toBeCloseTo(sx, 0);
      expect(box.sy, name).toBeCloseTo(sy, 0);
      expect(box.sz, name).toBeCloseTo(sz, 0);
    }
  });

  it("stands the legs on the bottom rail, flush with the sides, with the plan ears", () => {
    for (const piece of project.pieces.filter((item) => item.name.startsWith("Leg ") && !item.name.includes("laminate"))) {
      const box = bounds(piece);
      expect(box.minY).toBeCloseTo(90, 0);
      expect(box.maxY).toBeCloseTo(953, 0);
      const outer = Math.abs(box.cx) > 570;
      if (outer) {
        expect(Math.max(Math.abs(box.minX), Math.abs(box.maxX))).toBeCloseTo(600, 0);
      }
    }
    const ear = (name: string, length: number, count: number) => {
      for (const piece of project.pieces.filter((item) => item.name === name && Math.abs(item.position[0]) > 570)) {
        const bites = (piece.openings ?? []).filter((opening) => Math.abs(opening.length - length) < 1 && opening.z > 0);
        expect(bites, name).toHaveLength(count);
      }
    };
    ear("Leg B", 90, 1);
    ear("Leg E", 90, 1);
    ear("Leg A", 90, 1);
    ear("Leg C", 180, 2);
    ear("Leg D", 180, 2);
    for (const piece of project.pieces.filter((item) => /^Leg [ABE]$/.test(item.name))) {
      expect((piece.openings ?? []).some((opening) => opening.length === 90 && opening.z < 0)).toBe(true);
    }
    for (const piece of project.pieces.filter((item) => item.name.includes("laminate"))) {
      expect(piece.openings ?? []).toEqual([]);
      expect(piece.length).toBe(683);
    }
    const shelf = project.pieces.find((piece) => piece.name === "Bottom shelf");
    expect(shelf).toBeTruthy();
    for (const z of [-1155, -595, -75, 845, 1155]) {
      const bites = (shelf!.openings ?? []).filter((opening) => Math.abs(opening.z - z) < 2 && opening.length === 90 && opening.width === 70);
      expect(bites).toHaveLength(2);
    }
    const back = project.pieces.find((piece) => piece.name === "Top back rail");
    const notch = (back?.openings ?? []).find((opening) => Math.abs(opening.z + 682.5) < 2 && opening.length === 85);
    expect(notch).toBeTruthy();
    expect(notch!.x + notch!.width / 2).toBeGreaterThan(back!.width / 2);
  });

  it("cuts the top end rail to fit between the side rails", () => {
    const end = project.pieces.find((piece) => piece.name === "Top end rail");
    const sides = project.pieces.filter((piece) => piece.name === "Top back rail" || piece.name === "Top front rail" || piece.name === "Top far return");
    expect(end).toBeTruthy();
    const endBox = bounds(end!);
    for (const side of sides) {
      const sideBox = bounds(side);
      const overlapX = Math.min(endBox.maxX, sideBox.maxX) - Math.max(endBox.minX, sideBox.minX);
      const overlapZ = Math.min(endBox.maxZ, sideBox.maxZ) - Math.max(endBox.minZ, sideBox.minZ);
      const overlapY = Math.min(endBox.maxY, sideBox.maxY) - Math.max(endBox.minY, sideBox.minY);
      expect(overlapX < 1 || overlapZ < 1 || overlapY < 1, side.name).toBe(true);
    }
  });

  it("keeps the plan shopping list", () => {
    const report = checkPlan(BILL, project.boards, project.hardware, project.fasteners, project.pieces);
    expect(report.mismatches).toEqual([]);
    expect(report.extras).toEqual([]);
  });
});

describe("sawhorse plan geometry", () => {
  const project = buildSawhorse(defaultCatalog());

  it("lays the beams flat, the web on edge, and the legs out to the floor", () => {
    const expectBeam = (name: string, x: number, length: number, onEdge: boolean) => {
      const piece = project.pieces.find((item) => item.name === name && Math.sign(item.position[0]) === Math.sign(x));
      expect(piece, name).toBeTruthy();
      const box = bounds(piece!);
      expect(box.cx).toBeCloseTo(x, 0);
      expect(box.cz).toBeCloseTo(0, 0);
      expect(box.sz).toBeCloseTo(length, 0);
      expect(box.sx).toBeCloseTo(onEdge ? 35 : 90, 0);
      expect(box.sy).toBeCloseTo(onEdge ? 90 : 35, 0);
      return box;
    };
    const top = expectBeam("Top sawhorse top", 820, 1080, false);
    expect(top.maxY).toBeGreaterThan(750);
    expect(top.maxY).toBeLessThan(770);
    const web = expectBeam("Top sawhorse web", 820, 1020, true);
    const bottom = expectBeam("Top sawhorse bottom", 820, 1020, false);
    expect(top.cy - web.cy).toBeCloseTo(62.5, 0);
    expect(top.cy - bottom.cy).toBeCloseTo(125, 0);
    expectBeam("Bottom sawhorse top", -820, 1000, false);
    expectBeam("Bottom sawhorse web", -820, 940, true);
    expectBeam("Bottom sawhorse bottom", -820, 940, false);

    const legs = project.pieces.filter((piece) => piece.name === "Sawhorse leg");
    expect(legs).toHaveLength(8);
    for (const horse of [820, -820]) {
      const group = legs.filter((leg) => Math.abs(leg.position[0] - horse) < 400);
      expect(group).toHaveLength(4);
      let floor = Infinity;
      for (const leg of group) {
        const box = bounds(leg);
        expect(box.minY).toBeLessThan(12);
        expect(box.maxY).toBeGreaterThan(600);
        const low = localFaces(leg)
          .flatMap((face) => face.corners)
          .map((corner) => localToWorld(leg, corner))
          .sort((a, b) => a.y - b.y)[0];
        const high = localFaces(leg)
          .flatMap((face) => face.corners)
          .map((corner) => localToWorld(leg, corner))
          .sort((a, b) => b.y - a.y)[0];
        expect(Math.abs(low.x - horse)).toBeGreaterThan(Math.abs(high.x - horse) + 40);
        floor = Math.min(floor, box.minY);
      }
      expect(floor).toBeLessThan(1);
    }
    const plates = project.pieces.filter((piece) => piece.name === "Sawhorse end plate");
    expect(plates).toHaveLength(4);
    for (const plate of plates) {
      const box = bounds(plate);
      expect(box.sy).toBeCloseTo(235, 0);
      expect(box.sz).toBeCloseTo(17, 0);
      expect(box.sx).toBeGreaterThan(100);
      expect(Math.abs(box.cz)).toBeGreaterThan(450);
    }
  });

  it("keeps the plan shopping list", () => {
    const report = checkPlan(
      [
        { label: "pine", quantity: 6, kind: "board", key: "35×90×2400" },
        { label: "ply", quantity: 1, kind: "board", key: "17×300×1200" },
        { label: "long screws", quantity: 50, kind: "fastener", key: "4.8×65" },
        { label: "short screws", quantity: 24, kind: "fastener", key: "4×30" },
      ],
      project.boards,
      project.hardware,
      project.fasteners,
      project.pieces,
    );
    expect(report.mismatches).toEqual([]);
    expect(report.extras).toEqual([]);
  });
});
