import { describe, expect, it } from "vitest";
import { shapeDefaults } from "./features.ts";
import { nearestPieceEdge, snapFaceHit, stationFromHit } from "./picking.ts";
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
  });
});
