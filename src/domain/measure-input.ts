import type { Vec3Tuple } from "./types.ts";

/** A finished measurement, or a string the user has not finished typing. */
export type Measurement =
  | { status: "empty" }
  | { status: "partial" }
  | { status: "distance"; distance: number }
  | { status: "vector"; red: number; green: number; blue: number }
  | { status: "invalid" };

/**
 * SketchUp measurements. `600` is a distance along the current inference.
 * `600,0,90` is red, green, blue: depth, length, up.
 */
export function parseMeasurement(text: string): Measurement {
  const trimmed = text.trim();
  if (trimmed === "") return { status: "empty" };
  if (/[,\s]$/.test(trimmed)) return { status: "partial" };
  const parts = trimmed.split(/[, ]+/).filter((part) => part.length > 0);
  if (parts.length === 2) return { status: "partial" };
  if (parts.some((part) => part === "-" || part === "." || part === "-.")) return { status: "partial" };
  const numbers = parts.map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return { status: "invalid" };
  if (numbers.length === 1) return { status: "distance", distance: numbers[0] };
  if (numbers.length === 3) return { status: "vector", red: numbers[0], green: numbers[1], blue: numbers[2] };
  return { status: "invalid" };
}

/** Red, green, blue into the app world: X depth, Y up, Z along the bench. */
export function measurementOffset(measurement: Measurement, direction: Vec3Tuple | null): Vec3Tuple | null {
  if (measurement.status === "distance") {
    if (!direction) return null;
    const length = Math.hypot(direction[0], direction[1], direction[2]);
    if (length < 1e-8) return null;
    const scale = measurement.distance / length;
    return [direction[0] * scale, direction[1] * scale, direction[2] * scale];
  }
  if (measurement.status === "vector") return [measurement.red, measurement.blue, measurement.green];
  return null;
}
