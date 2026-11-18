import { describe, expect, it } from "vitest";
import { shapeDefaults } from "./features.ts";
import { angleMark, parallelMark, snapFacePoint } from "./marks.ts";
import { instanceCount, localCopies } from "./modifiers.ts";
import { cutList, fastenerList, shoppingList } from "./reports.ts";
import type { Board, Fastener, Piece } from "./types.ts";

function piece(patch: Partial<Piece> = {}): Piece {
  return {
    id: "p",
    name: "Slat",
    boardId: "b",
    stockId: "s",
    species: "SA Pine",
    profileName: "PAR Pine 22×69",
    thickness: 22,
    width: 69,
    length: 800,
    mitreStart: 0,
    mitreEnd: 0,
    position: [0, 11, 0],
    rotation: [0, 0, 0],
    holes: [],
    spanStart: 0,
    spanEnd: 800,
    ...shapeDefaults(69),
    ...patch,
  };
}

describe("modifiers", () => {
  it("counts a linear array and a mirror in the cut list", () => {
    const slat = piece({
      modifiers: [
        { id: "a", type: "array", enabled: true, layout: "linear", count: 5, spacing: 80, axis: "x", fitLength: null },
        { id: "m", type: "mirror", enabled: true, axis: "z", across: "edge" },
      ],
    });
    expect(instanceCount(slat)).toBe(10);
    expect(localCopies(slat)).toHaveLength(10);
    const board: Board = {
      id: "b",
      stockId: "s",
      name: "PAR Pine 22×69",
      species: "SA Pine",
      thickness: 22,
      width: 69,
      length: 2400,
      price: 68,
      sheet: false,
    };
    const list = cutList([board], [slat]);
    expect(list[0]?.parts[0]?.quantity).toBe(10);
    const shop = shoppingList([board], [], [slat]);
    expect(shop.lines[0]?.quantity).toBe(Math.ceil((800 * 10) / 2400));
    const fastener: Fastener = {
      id: "f",
      type: "screw",
      pieceAId: "p",
      pieceBId: "other",
      localPosition: [0, 0, 0],
      localDirection: [0, -1, 0],
      diameter: 4,
      length: 40,
    };
    expect(fastenerList([fastener], [slat])[0]?.quantity).toBe(10);
  });

  it("snaps a pencil point to a midpoint and lays out a square and an angle", () => {
    const board = piece({ width: 100, length: 200, widthStart: 100, widthEnd: 100 });
    const snap = snapFacePoint(board, "top", 52, 4);
    expect(snap.label).toBe("midpoint");
    expect(snap.u).toBeCloseTo(50);
    const square = parallelMark("top", board, "start", 32);
    expect(square[0]?.v).toBeCloseTo(32);
    expect(square[1]?.u).toBeCloseTo(100);
    const angle = angleMark(board, "top", 45);
    expect(angle[1]?.u).toBeCloseTo(angle[1]?.v ?? 0);
  });
});
