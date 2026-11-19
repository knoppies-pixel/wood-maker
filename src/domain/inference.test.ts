import { describe, expect, it } from "vitest";
import { shapeDefaults } from "./features.ts";
import { resolveInference } from "./inference.ts";
import { measurementOffset, parseMeasurement } from "./measure-input.ts";
import { rotateEuler, v } from "./math.ts";
import { partGroups } from "./reports.ts";
import type { Piece } from "./types.ts";

function board(patch: Partial<Piece> = {}): Piece {
  return {
    id: "p",
    name: "Board",
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

describe("parseMeasurement", () => {
  it("reads a distance and a red, green, blue triple", () => {
    expect(parseMeasurement("")).toEqual({ status: "empty" });
    expect(parseMeasurement("600")).toEqual({ status: "distance", distance: 600 });
    expect(parseMeasurement("600,0,90")).toEqual({ status: "vector", red: 600, green: 0, blue: 90 });
    expect(parseMeasurement("600, 0, 90")).toEqual({ status: "vector", red: 600, green: 0, blue: 90 });
    expect(parseMeasurement("-12.5")).toEqual({ status: "distance", distance: -12.5 });
  });

  it("waits while the number is unfinished and rejects letters", () => {
    expect(parseMeasurement("-").status).toBe("partial");
    expect(parseMeasurement("600,").status).toBe("partial");
    expect(parseMeasurement("1, 2").status).toBe("partial");
    expect(parseMeasurement("abc").status).toBe("invalid");
    expect(parseMeasurement("1,2,3,4").status).toBe("invalid");
  });

  it("maps red, green, blue onto depth, up, and length", () => {
    const vector = parseMeasurement("600,0,90");
    expect(measurementOffset(vector, null)).toEqual([600, 90, 0]);
    expect(measurementOffset(parseMeasurement("600"), [0, 0, 2])).toEqual([0, 0, 600]);
  });
});

describe("resolveInference", () => {
  const piece = board();

  it("names the point it locked to", () => {
    expect(resolveInference({ cursor: [38, 38, 500], pieces: [piece] })?.kind).toBe("Endpoint");
    expect(resolveInference({ cursor: [38, 38, 0], pieces: [piece] })?.kind).toBe("Midpoint");
    expect(resolveInference({ cursor: [0, 38, 0], pieces: [piece] })?.kind).toBe("Center");
    expect(resolveInference({ cursor: [38, 38, 200], pieces: [piece] })?.kind).toBe("On Edge");
    expect(resolveInference({ cursor: [0, 40, 200], pieces: [piece] })?.kind).toBe("On Face");
  });

  it("draws the drag onto a coloured axis", () => {
    const origin: [number, number, number] = [200, 38, 0];
    const red = resolveInference({ cursor: [280, 42, 3], origin, pieces: [piece] });
    expect(red?.kind).toBe("On Red Axis");
    expect(red?.point[1]).toBeCloseTo(38, 3);
    expect(red?.point[2]).toBeCloseTo(0, 3);
    const blue = resolveInference({ cursor: [202, 120, 1], origin, pieces: [piece] });
    expect(blue?.kind).toBe("On Blue Axis");
    expect(blue?.point[0]).toBeCloseTo(200, 3);
    const green = resolveInference({ cursor: [202, 40, 90], origin, pieces: [piece] });
    expect(green?.kind).toBe("On Green Axis");
    expect(green?.point[2]).toBeCloseTo(90, 3);
  });

  it("follows a board edge that is not a world axis", () => {
    const rotation: [number, number, number] = [0, Math.PI / 6, 0];
    const turned = board({ rotation });
    const direction = rotateEuler(v(0, 0, 1), rotation);
    const origin: [number, number, number] = [400, 200, 400];
    const cursor: [number, number, number] = [
      origin[0] + direction.x * 200 + 2,
      origin[1] + direction.y * 200,
      origin[2] + direction.z * 200 - 1,
    ];
    const hit = resolveInference({ cursor, origin, pieces: [turned] });
    expect(hit?.kind).toBe("Parallel to Edge");
  });

  it("holds the locked inference while shift is down", () => {
    const hit = resolveInference({
      cursor: [10, 40, 30],
      origin: [0, 0, 0],
      pieces: [piece],
      lock: { kind: "On Red Axis", point: [0, 0, 0], direction: [1, 0, 0] },
    });
    expect(hit?.kind).toBe("On Red Axis");
    expect(hit?.point).toEqual([10, 0, 0]);
  });

  it("snaps to a guide point and a guide line", () => {
    const point = resolveInference({
      cursor: [504, 2, 1],
      pieces: [],
      guides: [{ id: "g", kind: "point", point: [500, 0, 0] }],
    });
    expect(point?.kind).toBe("Guide");
    expect(point?.point).toEqual([500, 0, 0]);
    const line = resolveInference({
      cursor: [6, 0, 100],
      pieces: [],
      guides: [{ id: "g", kind: "line", origin: [0, 0, 0], direction: [0, 0, 1] }],
    });
    expect(line?.kind).toBe("On Guide");
    expect(line?.point[0]).toBeCloseTo(0, 3);
    expect(line?.point[2]).toBeCloseTo(100, 3);
  });

  it("finds where two guide lines cross", () => {
    const hit = resolveInference({
      cursor: [2, 2, 2],
      pieces: [],
      guides: [
        { id: "a", kind: "line", origin: [0, 0, 0], direction: [1, 0, 0] },
        { id: "b", kind: "line", origin: [0, 0, 0], direction: [0, 0, 1] },
      ],
    });
    expect(hit?.kind).toBe("Intersection");
    expect(hit?.point[0]).toBeCloseTo(0, 3);
    expect(hit?.point[2]).toBeCloseTo(0, 3);
  });
});

describe("partGroups", () => {
  it("counts instances of one named part", () => {
    const a = board({ id: "a", name: "Leg", componentId: "cmp" });
    const b = board({ id: "b", name: "Leg", componentId: "cmp" });
    const c = board({ id: "c", name: "Rail" });
    const groups = partGroups([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.name === "Leg")?.quantity).toBe(2);
    expect(groups.find((group) => group.name === "Rail")?.quantity).toBe(1);
  });
});
