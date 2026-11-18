import { describe, expect, it } from "vitest";
import { shapeDefaults } from "./features.ts";
import { nearestPieceEdge, profileLocal, profileTarget, routeLocalBox, sawDistanceFromStation, snapFaceHit, stationFromHit } from "./picking.ts";
import type { Piece } from "./types.ts";

function board(): Piece {
  return {
    id: "p",
    name: "Board",
    boardId: "b",
    stockId: "s",
    species: "SA Pine",
    profileName: "PAR",
    thickness: 22,
    width: 80,
    length: 400,
    mitreStart: 0,
    mitreEnd: 0,
    position: [0, 11, 0],
    rotation: [0, 0, 0],
    holes: [],
    spanStart: 0,
    spanEnd: 400,
    ...shapeDefaults(80),
  };
}

const off = { enabled: true, vertices: false, midpoints: false, edges: false, centres: false, grid: false, marks: false, gridSize: 10 };

describe("edge and face picking", () => {
  const piece = board();

  it("picks the edge next to the cursor, not a fixed side", () => {
    expect(nearestPieceEdge(piece, "top", 4, 200)).toBe("left");
    expect(nearestPieceEdge(piece, "top", 74, 200)).toBe("right");
    expect(nearestPieceEdge(piece, "top", 40, 6)).toBe("start");
    expect(nearestPieceEdge(piece, "top", 40, 390)).toBe("end");
    expect(nearestPieceEdge(piece, "left", 200, 11)).toBe("left");
    expect(nearestPieceEdge(piece, "right", 200, 11)).toBe("right");
    expect(nearestPieceEdge(piece, "left", 8, 11)).toBe("start");
    expect(nearestPieceEdge(piece, "end", 6, 11)).toBe("left");
  });

  it("puts a profile on the arris of the face under the cursor", () => {
    expect(profileTarget(piece, "top", 4, 200)).toEqual({ edge: "left", side: "top" });
    expect(profileTarget(piece, "bottom", 74, 200)).toEqual({ edge: "right", side: "bottom" });
    expect(profileTarget(piece, "left", 200, 20)).toEqual({ edge: "left", side: "top" });
    expect(profileTarget(piece, "left", 200, 2)).toEqual({ edge: "left", side: "bottom" });
    expect(profileTarget(piece, "right", 390, 11)).toEqual({ edge: "end", side: "top" });
    expect(profileTarget(piece, "right", 200, 3)).toEqual({ edge: "right", side: "bottom" });
  });

  it("reads a crosscut from how far along the board the hit is, and a rip from the width", () => {
    expect(stationFromHit(piece, "top", 10, 125, "crosscut")).toBe(125);
    expect(stationFromHit(piece, "left", 80, 11, "crosscut")).toBe(80);
    expect(stationFromHit(piece, "top", 18, 200, "rip")).toBe(18);
    expect(stationFromHit(piece, "start", 18, 11, "crosscut")).toBe(0);
  });

  it("snaps to a vertex, an edge, a pencil mark, or the grid", () => {
    const vertex = snapFaceHit(piece, "top", 3, 4, { ...off, vertices: true });
    expect(vertex.snap).toBe("vertex");
    expect(vertex.u).toBe(0);
    expect(vertex.v).toBe(0);
    const edge = snapFaceHit(piece, "top", 6, 140, { ...off, edges: true });
    expect(edge.snap).toBe("edge");
    expect(edge.u).toBe(0);
    expect(edge.v).toBe(140);
    const mark = snapFaceHit(piece, "top", 40, 210, { ...off, marks: true }, [
      { id: "m", face: "top", kind: "line", points: [{ u: 40, v: 200 }], label: "shelf" },
    ]);
    expect(mark.snap).toBe("mark “shelf”");
    expect(mark.v).toBe(200);
    const grid = snapFaceHit(piece, "top", 23, 47, { ...off, grid: true, gridSize: 10 });
    expect(grid.snap).toBe("grid");
    expect(grid.u).toBe(20);
    expect(grid.v).toBe(50);
    const plain = snapFaceHit(piece, "top", 23, 47, { ...off, enabled: false, grid: true });
    expect(plain.snap).toBeNull();
    expect(plain.u).toBe(23);
    const far = snapFaceHit(piece, "top", 16, 16, { ...off, grid: true, gridSize: 10 });
    expect(far.snap).toBeNull();
    expect(far.u).toBe(16);
  });

  it("keeps a dado on the face that was clicked", () => {
    const top = routeLocalBox(piece, { kind: "dado", face: "top", u: 40, v: 100, width: 12, depth: 6 });
    expect(top.position[1]).toBeCloseTo(8);
    expect(top.position[2]).toBeCloseTo(-100);
    expect(top.size).toEqual([80, 6, 12]);
    const side = routeLocalBox(piece, { kind: "dado", face: "left", u: 100, v: 11, width: 12, depth: 6, edge: "left" });
    expect(side.position[0]).toBeCloseTo(-37);
    expect(side.position[2]).toBeCloseTo(-100);
    expect(side.size).toEqual([6, 22, 12]);
    const bottom = routeLocalBox(piece, { kind: "groove", face: "bottom", u: 30, v: 10, width: 8, depth: 4 });
    expect(bottom.position[0]).toBeCloseTo(-10);
    expect(bottom.position[1]).toBeLessThan(0);
    const rebate = routeLocalBox(piece, { kind: "rebate", face: "top", u: 4, v: 200, width: 10, depth: 5, edge: "left" });
    expect(rebate.position[0]).toBeCloseTo(-35);
    expect(rebate.size[2]).toBe(400);
  });

  it("measures a saw station from the end the user picked", () => {
    expect(sawDistanceFromStation(400, "crosscut", "start", 100, 3)).toBe(100);
    expect(sawDistanceFromStation(400, "crosscut", "end", 100, 3)).toBe(297);
    expect(sawDistanceFromStation(80, "rip", "end", 18, 3)).toBe(18);
  });

  it("seats a profile on the bottom arris when that corner was clicked", () => {
    expect(profileLocal(piece, { edge: "left", side: "bottom" }).position[1]).toBeCloseTo(-11);
    expect(profileLocal(piece, { edge: "end" }).position[1]).toBeCloseTo(11);
    expect(profileLocal(piece, { edge: "left" }).alongLength).toBe(true);
  });
});
