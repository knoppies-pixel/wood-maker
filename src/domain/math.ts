export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Quad = [Vec3, Vec3, Vec3, Vec3];

export const DEG = Math.PI / 180;

export function v(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): Vec3 extends never ? never : number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  if (l < 1e-10) return { x: 0, y: 0, z: 0 };
  return mul(a, 1 / l);
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return add(a, mul(sub(b, a), t));
}

/**
 * Euler XYZ, matching three.js column vectors: v' = Rx * Ry * Rz * v.
 * Z is applied first, then Y, then X.
 */
export function rotateEuler(p: Vec3, rot: [number, number, number]): Vec3 {
  const [rx, ry, rz] = rot;
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x1 = p.x * cz - p.y * sz;
  const y1 = p.x * sz + p.y * cz;
  const z1 = p.z;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const z2 = -x1 * sy + z1 * cy;
  const y2 = y1;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  return {
    x: x2,
    y: y2 * cx - z2 * sx,
    z: y2 * sx + z2 * cx,
  };
}

export function almost(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function formatMm(n: number, digits = 1): string {
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(digits);
}

export function formatZar(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [whole, frac] = rounded.toFixed(2).split(".");
  const withSpaces = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac === "00" ? `R${withSpaces}` : `R${withSpaces}.${frac}`;
}

let seq = 0;

export function uid(prefix: string): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${seq.toString(36)}-${rand}`;
}
