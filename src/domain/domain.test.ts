import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { defaultCatalog, parseCatalog, parseCatalogCsv } from "./catalog.ts";
import { sampleFrame } from "./example.ts";
import { buildMesh, faceSnapDelta, gridSnapDelta, keepBottom, localToWorld, translatePiece, worldToLocal } from "./geometry.ts";
import { curveCut, keptOutline, planJoint, shapeDefaults, taperPiece } from "./features.ts";
import { v } from "./math.ts";
import { addStockPiece, connectedIds, crosscut, kerfAlong, rip } from "./operations.ts";
import { cutList, shoppingList } from "./reports.ts";
import type { Piece } from "./types.ts";

function blankPiece(patch: Partial<Piece> = {}): Piece {
  return {
    id: "p",
    name: "Blank",
    boardId: "b",
    stockId: "s",
    species: "SA Pine",
    profileName: "PAR Pine 38×76",
    thickness: 38,
    width: 76,
    length: 1000,
    mitreStart: 0,
    mitreEnd: 0,
    position: [0, 19, 0],
    rotation: [0, 0, 0],
    holes: [],
    ...shapeDefaults(76),
    spanStart: 0,
    spanEnd: 1000,
    ...patch,
  };
}

function meshOf(piece: Piece): THREE.Mesh {
  const data = buildMesh(piece);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry);
  mesh.position.set(...piece.position);
  mesh.rotation.set(...piece.rotation);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("crosscut", () => {
  it("keeps the measured length and takes kerf from the offcut", () => {
    const piece = blankPiece();
    const result = crosscut(piece, 400, 0, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [head, tail] = result.pieces;
    expect(head.length).toBeCloseTo(400);
    expect(tail.length).toBeCloseTo(597);
    expect(head.spanStart).toBeCloseTo(0);
    expect(head.spanEnd).toBeCloseTo(400);
    expect(tail.spanStart).toBeCloseTo(403);
    expect(tail.spanEnd).toBeCloseTo(1000);
    const headStart = localToWorld(head, v(0, 0, -head.length / 2));
    const originalStart = localToWorld(piece, v(0, 0, -piece.length / 2));
    expect(headStart.z).toBeCloseTo(originalStart.z);
    const tailEnd = localToWorld(tail, v(0, 0, tail.length / 2));
    const originalEnd = localToWorld(piece, v(0, 0, piece.length / 2));
    expect(tailEnd.z).toBeCloseTo(originalEnd.z);
  });

  it("uses a longer kerf along the board when the cut is mitred", () => {
    expect(kerfAlong(3, 0)).toBeCloseTo(3);
    expect(kerfAlong(3, 45)).toBeCloseTo(3 / Math.cos(Math.PI / 4));
    const rotated = blankPiece({ position: [120, 19, -40], rotation: [0, 0.4, 0] });
    const result = crosscut(rotated, 250, 45, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [head, tail] = result.pieces;
    expect(head.mitreEnd).toBeCloseTo(45);
    expect(tail.mitreStart).toBeCloseTo(45);
    expect(head.length + tail.length + kerfAlong(3, 45)).toBeCloseTo(rotated.length);
    const headStart = localToWorld(head, v(0, 0, -head.length / 2));
    const originalStart = localToWorld(rotated, v(0, 0, -rotated.length / 2));
    expect(headStart.x).toBeCloseTo(originalStart.x);
    expect(headStart.z).toBeCloseTo(originalStart.z);
  });

  it("refuses a cut that would leave a sliver", () => {
    const result = crosscut(blankPiece(), 2, 0, 3);
    expect(result.ok).toBe(false);
  });
});

describe("rip", () => {
  it("splits the width and leaves the length shared", () => {
    const result = rip(blankPiece(), 30, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [left, right] = result.pieces;
    expect(left.width).toBeCloseTo(30);
    expect(right.width).toBeCloseTo(43);
    expect(left.length).toBeCloseTo(1000);
    expect(left.spanStart).toBeCloseTo(right.spanStart);
    expect(left.spanEnd).toBeCloseTo(right.spanEnd);
    expect(left.position[0]).toBeLessThan(right.position[0]);
  });
});

describe("reports", () => {
  it("accounts for kerf on two crosscuts and prices the purchased board once", () => {
    const stock = defaultCatalog().find((item) => item.id === "pine-38x76");
    expect(stock).toBeTruthy();
    if (!stock) return;
    const added = addStockPiece(stock, 2400, []);
    if ("error" in added) throw new Error(added.error);
    const first = crosscut(added.piece, 450, 0, 3);
    if (!first.ok) throw new Error(first.reason);
    const second = crosscut(first.pieces[1], 800, 0, 3);
    if (!second.ok) throw new Error(second.reason);
    const pieces = [first.pieces[0], ...second.pieces];
    const list = cutList([added.board], pieces);
    expect(list).toHaveLength(1);
    expect(list[0]?.parts).toHaveLength(3);
    expect(list[0]?.discarded).toBeCloseTo(6);
    const shop = shoppingList([added.board, { ...added.board, id: "other" }]);
    expect(shop.lines[0]?.quantity).toBe(2);
    expect(shop.total).toBe(added.board.price * 2);
  });

  it("does not double-count a ripped length", () => {
    const stock = defaultCatalog().find((item) => item.id === "pine-22x69");
    if (!stock) throw new Error("missing stock");
    const added = addStockPiece(stock, 2400, []);
    if ("error" in added) throw new Error(added.error);
    const ripped = rip(added.piece, 22, 3);
    if (!ripped.ok) throw new Error(ripped.reason);
    const list = cutList([added.board], ripped.pieces);
    expect(list[0]?.discarded).toBeCloseTo(0);
    expect(list[0]?.parts).toHaveLength(2);
  });

  it("prices the sample frame as one stick with kerf and an offcut", () => {
    const project = sampleFrame(defaultCatalog());
    const list = cutList(project.boards, project.pieces);
    const used = project.pieces.reduce((sum, piece) => sum + piece.length, 0);
    expect(list[0]?.discarded).toBeCloseTo((project.boards[0]?.length ?? 0) - used);
    expect(list[0]?.discarded).toBeGreaterThan(9);
    const shop = shoppingList(project.boards);
    expect(shop.lines).toHaveLength(1);
    expect(shop.total).toBe(project.boards[0]?.price);
  });
});

describe("catalogue", () => {
  it("loads the South African sample sizes", () => {
    const items = defaultCatalog();
    const pine = items.find((item) => item.id === "pine-38x38");
    const ply = items.find((item) => item.id === "ply-16");
    const mdf = items.find((item) => item.id === "mdf-18");
    expect(pine?.thickness).toBe(38);
    expect(pine?.width).toBe(38);
    expect(pine?.lengths.map((length) => length.length)).toEqual([1800, 2400, 3000]);
    expect(ply?.width).toBe(1220);
    expect(ply?.lengths[0]?.length).toBe(2440);
    expect(mdf?.sheet).toBe(true);
  });

  it("imports JSON and CSV", () => {
    const json = parseCatalog({
      items: [
        {
          id: "oak-20x40",
          name: "Oak 20×40",
          species: "Oak",
          thickness: 20,
          width: 40,
          lengths: [{ length: 2000, price: 180 }],
        },
      ],
    });
    expect("items" in json && json.items[0]?.species).toBe("Oak");
    const csv = parseCatalogCsv("name,species,thickness_mm,width_mm,length_mm,price_zar\nPAR Pine,SA Pine,38,38,2400,62\nPAR Pine,SA Pine,38,38,3000,78\n");
    expect("items" in csv && csv.items).toHaveLength(1);
    if ("items" in csv) expect(csv.items[0]?.lengths.map((length) => length.price)).toEqual([62, 78]);
  });
});

describe("assemblies and snapping", () => {
  it("joins screws transitively", () => {
    const ids = connectedIds(
      [
        { id: "a", type: "screw", pieceAId: "1", pieceBId: "2", localPosition: [0, 0, 0], localDirection: [1, 0, 0], diameter: 4, length: 40 },
        { id: "b", type: "screw", pieceAId: "2", pieceBId: "3", localPosition: [0, 0, 0], localDirection: [1, 0, 0], diameter: 4, length: 40 },
      ],
      "1",
    );
    expect(ids.sort()).toEqual(["1", "2", "3"]);
  });

  it("snaps a parallel face across a small gap and lands the other edges", () => {
    const left = blankPiece({ id: "left", length: 400, position: [0, 19, 0] });
    const right = blankPiece({ id: "right", length: 400, position: [86, 19, 8] });
    const delta = faceSnapDelta(right, [left]);
    expect(delta).toBeTruthy();
    expect(delta?.x).toBeCloseTo(-10);
    expect(Math.abs(delta?.z ?? 0)).toBeGreaterThan(0);
    const snapped = translatePiece(right, delta ?? v(0, 0, 0));
    const again = faceSnapDelta(snapped, [left]);
    expect(again).toBeNull();
  });

  it("snaps the footprint onto the grid", () => {
    const piece = blankPiece({ position: [14, 23, -6] });
    const delta = gridSnapDelta(piece, 10);
    const moved = translatePiece(piece, delta);
    expect(moved.position[0] - piece.width / 2).toBeCloseTo(Math.round((14 - 38) / 10) * 10);
    expect(moved.position[1] - piece.thickness / 2).toBeCloseTo(0);
  });
});

describe("geometry agreement with three.js", () => {
  it("matches Euler rotation and round-trips local space", () => {
    const local = v(12, -4, 80);
    const rotation: [number, number, number] = [0.2, -0.5, 0.35];
    const position: [number, number, number] = [30, 19, -15];
    const euler = new THREE.Euler(...rotation, "XYZ");
    const expected = new THREE.Vector3(local.x, local.y, local.z).applyEuler(euler).add(new THREE.Vector3(...position));
    const world = localToWorld({ position, rotation }, local);
    expect(world.x).toBeCloseTo(expected.x);
    expect(world.y).toBeCloseTo(expected.y);
    expect(world.z).toBeCloseTo(expected.z);
    const back = worldToLocal({ position, rotation }, world);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
    expect(back.z).toBeCloseTo(local.z);
  });

  it("is solid to a ray cast from outside, including the sample screws", () => {
    const piece = blankPiece();
    const hit = new THREE.Raycaster(new THREE.Vector3(0, 80, 0), new THREE.Vector3(0, -1, 0)).intersectObject(meshOf(piece));
    expect(hit.length).toBeGreaterThan(0);
    expect(hit[0]?.point.y).toBeCloseTo(38);

    const frame = sampleFrame(defaultCatalog());
    const meshes = new Map(frame.pieces.map((item) => [item.id, meshOf(item)]));
    for (const screw of frame.fasteners) {
      const head = frame.pieces.find((item) => item.id === screw.pieceAId);
      const target = meshes.get(screw.pieceBId);
      if (!head || !target) throw new Error("missing piece");
      const origin = localToWorld(head, { x: screw.localPosition[0], y: screw.localPosition[1], z: screw.localPosition[2] });
      const direction = new THREE.Vector3(...screw.localDirection).applyEuler(new THREE.Euler(...head.rotation, "XYZ")).normalize();
      const ray = new THREE.Raycaster(
        new THREE.Vector3(origin.x, origin.y, origin.z).addScaledVector(direction, 0.5),
        direction,
        0,
        screw.length,
      );
      const hits = ray.intersectObject(target);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.distance).toBeLessThan(screw.length);
    }
  });
});

describe("shaped cuts and joints", () => {
  it("consumes more board length when the saw is bevelled", () => {
    expect(kerfAlong(3, 0, 45)).toBeCloseTo(3 * Math.SQRT2);
    const result = crosscut(blankPiece(), 400, 0, 3, 45);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].bevelEnd).toBe(45);
    expect(result.pieces[1].bevelStart).toBe(45);
    expect(result.pieces[0].length + result.pieces[1].length + kerfAlong(3, 0, 45)).toBeCloseTo(1000);
  });

  it("tapers inside the existing width", () => {
    const result = taperPiece(blankPiece(), 76, 38);
    expect("piece" in result).toBe(true);
    if (!("piece" in result)) return;
    expect(result.piece.widthStart).toBe(76);
    expect(result.piece.widthEnd).toBe(38);
    const tooWide = taperPiece(blankPiece(), 90, 40);
    expect("error" in tooWide).toBe(true);
  });

  it("keeps the side opposite the waste of a bandsaw path", () => {
    const piece = blankPiece({ width: 100, length: 200, widthStart: 100, widthEnd: 100 });
    const outline = keptOutline(piece, [
      { u: 50, v: 0 },
      { u: 70, v: 100 },
      { u: 50, v: 200 },
    ], "left");
    expect("outline" in outline).toBe(true);
    if (!("outline" in outline)) return;
    const cut = curveCut(piece, [
      { u: 50, v: 0 },
      { u: 70, v: 100 },
      { u: 50, v: 200 },
    ], "left");
    expect("piece" in cut).toBe(true);
    if (!("piece" in cut)) return;
    expect(cut.piece.outline?.length).toBeGreaterThan(3);
  });

  it("pairs a mortise with a tenon", () => {
    const stile = blankPiece({ id: "stile", width: 69, thickness: 22, length: 400, widthStart: 69, widthEnd: 69 });
    const rail = blankPiece({ id: "rail", width: 69, thickness: 22, length: 300, widthStart: 69, widthEnd: 69, position: [80, 11, 0] });
    const plan = planJoint("mortise-tenon", stile, "right", { u: 200, v: 11 }, rail, "start");
    expect("pieces" in plan).toBe(true);
    if (!("pieces" in plan)) return;
    const mortise = plan.pieces.find((item) => item.id === "stile")?.joinery[0];
    const tenon = plan.pieces.find((item) => item.id === "rail")?.joinery[0];
    expect(mortise?.kind).toBe("mortise");
    expect(tenon?.kind).toBe("tenon");
    expect(mortise?.pairId).toBe(tenon?.pairId);
    expect(mortise?.width).toBe(tenon?.width);
    expect(mortise?.depth).toBe(tenon?.depth);
  });

  it("keeps a stacked piece's underside when the thickness changes", () => {
    expect(keepBottom(19, 38, 22)).toBeCloseTo(11);
    expect(keepBottom(80, 38, 22)).toBeCloseTo(72);
  });
});
