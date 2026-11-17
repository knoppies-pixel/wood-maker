import * as THREE from "three";

export interface WoodMaps {
  face: THREE.CanvasTexture;
  edge: THREE.CanvasTexture;
}

const cache = new Map<string, WoodMaps>();

export function woodMaps(species: string): WoodMaps {
  const key = species.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const look = speciesLook(key);
  const maps = {
    face: texture(paintFace(look)),
    edge: texture(paintEdge(look)),
  };
  cache.set(key, maps);
  return maps;
}

interface Look {
  base: string;
  dark: string;
  light: string;
  edge: "grain" | "ply" | "mdf" | "chip";
}

function speciesLook(species: string): Look {
  if (species.includes("ply")) return { base: "#e4c89a", dark: "#a67c4e", light: "#f6e6c8", edge: "ply" };
  if (species.includes("mdf")) return { base: "#cbb89a", dark: "#9d8b72", light: "#ddd0b8", edge: "mdf" };
  if (species.includes("supa") || species.includes("chip") || species.includes("melamine")) {
    return { base: "#f4f1ea", dark: "#c9bba6", light: "#fbf9f5", edge: "chip" };
  }
  if (species.includes("meranti")) return { base: "#c4623e", dark: "#7c341e", light: "#e39470", edge: "grain" };
  if (species.includes("saligna") || species.includes("eucal")) return { base: "#d19b4c", dark: "#8a5e2c", light: "#ebc888", edge: "grain" };
  if (species.includes("oak")) return { base: "#c9a56c", dark: "#8b6840", light: "#e6d2a6", edge: "grain" };
  return { base: "#e7c88c", dark: "#b3894e", light: "#f6e3bf", edge: "grain" };
}

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function paintFace(look: Look): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, 256, 256);
  if (look.edge === "mdf" || look.edge === "chip") {
    speck(ctx, look.edge === "chip" ? 40 : 90, look.dark, 0.18);
    return canvas;
  }
  for (let i = 0; i < 46; i += 1) {
    const y = (i * 29 + (i % 5) * 7) % 256;
    ctx.strokeStyle = i % 4 === 0 ? look.dark : look.light;
    ctx.globalAlpha = 0.18 + (i % 5) * 0.06;
    ctx.lineWidth = i % 6 === 0 ? 2.4 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(70, y + ((i % 7) - 3), 160, y - ((i % 5) - 2), 256, y + ((i % 4) - 1.5));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function paintEdge(look: Look): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  if (look.edge === "ply") {
    const bands = 9;
    for (let i = 0; i < bands; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#c8956a" : "#f3e6cf";
      ctx.fillRect(0, (256 / bands) * i, 256, 256 / bands + 1);
    }
    return canvas;
  }
  if (look.edge === "mdf") {
    ctx.fillStyle = look.base;
    ctx.fillRect(0, 0, 256, 256);
    speck(ctx, 180, look.dark, 0.35);
    return canvas;
  }
  if (look.edge === "chip") {
    ctx.fillStyle = "#d7c4a4";
    ctx.fillRect(0, 0, 256, 256);
    speck(ctx, 220, "#a88860", 0.55);
    speck(ctx, 80, "#f4ead8", 0.4);
    return canvas;
  }
  ctx.fillStyle = look.dark;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i += 1) {
    ctx.strokeStyle = i % 2 === 0 ? look.light : look.base;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(128, 128, 30 + i * 8, 10 + (i % 3) * 4, i * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 28; i += 1) {
    ctx.strokeStyle = look.light;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y = (i * 19) % 256;
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + ((i % 5) - 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

function speck(ctx: CanvasRenderingContext2D, count: number, color: string, alpha: number): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i += 1) {
    const x = (i * 97) % 256;
    const y = (i * 57 + 13) % 256;
    ctx.fillRect(x, y, 1 + (i % 3), 1 + ((i * 3) % 2));
  }
  ctx.globalAlpha = 1;
}
