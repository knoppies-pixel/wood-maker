import { toast } from "sonner";
import { faceUvFromLocal, holeLocalPoint, localFaces, localToWorld, worldToLocal } from "../domain/geometry.ts";
import { resolveInference, type Inference, type InferenceLock } from "../domain/inference.ts";
import { measurementOffset, parseMeasurement } from "../domain/measure-input.ts";
import { normalize, rotateEuler, uid, v } from "../domain/math.ts";
import { connectedIds } from "../domain/operations.ts";
import type { FaceId, Piece, Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type DragPose, type GuideDraft } from "../store/useUi.ts";

export function measurementLive(): boolean {
  const ui = useUi.getState();
  const pencil = ui.tool === "pencil" && ui.pencilMode === "line" && (ui.pencilDraft?.length ?? 0) > 0;
  const saw = ui.tool === "saw" && ui.selection != null && (ui.sawMode === "crosscut" || ui.sawMode === "rip");
  return Boolean(ui.moveSession || ui.guideDraft || pencil || saw);
}

export function typeMeasurement(key: string): void {
  const text = useUi.getState().measurementText;
  if (text.length >= 24) return;
  useUi.getState().setMeasurementText(text + key);
}

export function backspaceMeasurement(): void {
  const text = useUi.getState().measurementText;
  useUi.getState().setMeasurementText(text.slice(0, -1));
}

export function trackInference(cursor: Vec3Tuple): Inference | null {
  const ui = useUi.getState();
  const project = useProject.getState();
  const origin = ui.moveSession?.from ?? ui.guideDraft?.origin ?? ui.pencilAnchor;
  if (ui.ctrlDown && !ui.inferenceLock) {
    useUi.getState().setInference(null);
    if (ui.moveSession) previewPointMove(cursor);
    return null;
  }
  const hit = resolveInference({
    cursor,
    origin,
    pieces: project.pieces,
    guides: ui.showGuides ? project.guides : [],
    lock: ui.inferenceLock,
  });
  useUi.getState().setInference(hit);
  if (ui.moveSession) previewPointMove(hit?.point ?? cursor);
  return hit;
}

export function lockCurrentInference(): void {
  const hit = useUi.getState().inference;
  if (!hit || useUi.getState().inferenceLock) return;
  const lock: InferenceLock = { kind: hit.kind, point: hit.point, direction: hit.direction, normal: hit.normal };
  useUi.getState().setInferenceLock(lock);
}

export function startPointMove(pieceId: string, from: Vec3Tuple): void {
  const project = useProject.getState();
  const ids = connectedIds(project.fasteners, pieceId, project.pieces);
  const origins: Record<string, Vec3Tuple> = {};
  for (const id of ids) {
    const piece = project.pieces.find((item) => item.id === id);
    if (piece) origins[id] = piece.position;
  }
  if (!origins[pieceId]) {
    const piece = project.pieces.find((item) => item.id === pieceId);
    if (!piece) return;
    origins[pieceId] = piece.position;
  }
  useUi.getState().setMoveSession({ pieceId, from, origins });
  useUi.getState().setMeasurementText("");
  useUi.getState().setInferenceLock(null);
}

export function previewPointMove(target: Vec3Tuple): void {
  const session = useUi.getState().moveSession;
  if (!session) return;
  const delta: Vec3Tuple = [target[0] - session.from[0], target[1] - session.from[1], target[2] - session.from[2]];
  const pieces = useProject.getState().pieces;
  const drag: Record<string, DragPose> = {};
  for (const [id, origin] of Object.entries(session.origins)) {
    const piece = pieces.find((item) => item.id === id);
    if (!piece) continue;
    drag[id] = {
      position: [origin[0] + delta[0], origin[1] + delta[1], origin[2] + delta[2]],
      rotation: piece.rotation,
    };
  }
  useUi.getState().setDrag(drag);
}

export function commitPointMove(target: Vec3Tuple): void {
  const session = useUi.getState().moveSession;
  if (!session) return;
  const delta: Vec3Tuple = [target[0] - session.from[0], target[1] - session.from[1], target[2] - session.from[2]];
  const pieces = useProject.getState().pieces;
  const updates = Object.entries(session.origins).flatMap(([id, origin]) => {
    const piece = pieces.find((item) => item.id === id);
    if (!piece) return [];
    return [{ id, position: [origin[0] + delta[0], origin[1] + delta[1], origin[2] + delta[2]] as Vec3Tuple, rotation: piece.rotation }];
  });
  useProject.getState().setTransforms(updates);
  finishGesture();
}

export function cancelPointMove(): void {
  finishGesture();
}

export function beginGuideLine(piece: Piece, edge: "left" | "right" | "start" | "end"): void {
  const frame = edgeFrame(piece, edge);
  const draft: GuideDraft = { kind: "line", origin: frame.origin, direction: frame.direction, offsetAxis: frame.offsetAxis };
  useUi.getState().setGuideDraft(draft);
  useUi.getState().setMeasurementText("");
  useUi.getState().setInferenceLock(null);
}

export function beginGuidePoint(point: Vec3Tuple): void {
  useUi.getState().setGuideDraft({ kind: "point", origin: point });
  useUi.getState().setMeasurementText("");
  useUi.getState().setInferenceLock(null);
}

export function commitGuide(target: Vec3Tuple): void {
  const draft = useUi.getState().guideDraft;
  if (!draft) return;
  if (draft.kind === "line" && draft.direction && draft.offsetAxis) {
    const signed = dot(sub(target, draft.origin), draft.offsetAxis);
    const origin: Vec3Tuple = [
      draft.origin[0] + draft.offsetAxis[0] * signed,
      draft.origin[1] + draft.offsetAxis[1] * signed,
      draft.origin[2] + draft.offsetAxis[2] * signed,
    ];
    useProject.getState().addGuide({ id: uid("guide"), kind: "line", origin, direction: draft.direction });
    toast.success(`Guide line, ${Math.round(signed)} mm off the edge.`);
  } else {
    useProject.getState().addGuide({ id: uid("guide"), kind: "point", point: target });
    toast.success("Guide point placed.");
  }
  finishGesture();
}

export function cancelGuide(): void {
  finishGesture();
}

export function rememberPencilAnchor(piece: Piece, face: FaceId, u: number, v: number): void {
  const world = localToWorld(piece, holeLocalPoint(piece, face, u, v));
  useUi.getState().setPencilAnchor([world.x, world.y, world.z]);
}

export function applyMeasurement(): boolean {
  const ui = useUi.getState();
  if (!measurementLive()) return false;
  const parsed = parseMeasurement(ui.measurementText);
  if (parsed.status === "partial" || parsed.status === "invalid") {
    toast.error(parsed.status === "partial" ? "Finish the measurement. A triple looks like 600, 0, 90." : "That measurement is not a number.");
    return true;
  }
  if (parsed.status === "empty") {
    if (ui.moveSession && ui.inference) {
      commitPointMove(ui.inference.point);
      return true;
    }
    if (ui.guideDraft && ui.inference) {
      commitGuide(ui.inference.point);
      return true;
    }
    if (pencilReady(ui) && ui.inference) {
      commitPencil(ui.inference.point);
      return true;
    }
    return false;
  }
  const origin = ui.moveSession?.from ?? ui.guideDraft?.origin ?? ui.pencilAnchor;
  if (ui.guideDraft?.kind === "line" && ui.guideDraft.offsetAxis && parsed.status === "distance") {
    const axis = ui.guideDraft.offsetAxis;
    commitGuide([
      ui.guideDraft.origin[0] + axis[0] * parsed.distance,
      ui.guideDraft.origin[1] + axis[1] * parsed.distance,
      ui.guideDraft.origin[2] + axis[2] * parsed.distance,
    ]);
    return true;
  }
  const direction = ui.inference?.direction ?? between(origin, ui.inference?.point ?? null);
  const offset = measurementOffset(parsed, direction);
  if (!offset || !origin) {
    if (ui.tool === "saw" && parsed.status === "distance") {
      useUi.getState().setSawDistance(Math.max(1, parsed.distance));
      useUi.getState().setMeasurementText("");
      return true;
    }
    toast.error("Move the cursor to pick a direction, or type red, green, blue.");
    return true;
  }
  const target: Vec3Tuple = [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
  if (ui.moveSession) commitPointMove(target);
  else if (ui.guideDraft) commitGuide(target);
  else if (pencilReady(ui)) commitPencil(target);
  else if (parsed.status === "distance") {
    useUi.getState().setSawDistance(Math.max(1, parsed.distance));
    useUi.getState().setMeasurementText("");
  } else {
    toast.error("The saw takes a single distance.");
    return true;
  }
  return true;
}

function commitPencil(target: Vec3Tuple): void {
  const ui = useUi.getState();
  const piece = useProject.getState().pieces.find((item) => item.id === ui.pencilPieceId);
  const face = ui.pencilFace;
  const start = ui.pencilDraft?.[0];
  if (!piece || !face || !start) return;
  const localFace = localFaces(piece).find((item) => item.id === face);
  if (!localFace) return;
  const worldNormal = normalize(rotateEuler(localFace.normal, piece.rotation));
  const planeOrigin = localToWorld(piece, localFace.corners[0]);
  const cursor = v(target[0], target[1], target[2]);
  const distance = dot(sub(cursor, planeOrigin), worldNormal);
  const projected = {
    x: cursor.x - worldNormal.x * distance,
    y: cursor.y - worldNormal.y * distance,
    z: cursor.z - worldNormal.z * distance,
  };
  const uv = faceUvFromLocal(piece, worldToLocal(piece, projected), localFace.normal);
  if (!uv || uv.face !== face) {
    toast.error("That distance does not land on the face.");
    return;
  }
  useProject.getState().addMark(piece.id, { face, kind: "line", points: [start, { u: uv.u, v: uv.v }] });
  useUi.getState().setPencilDraft(null, null, null);
  useUi.getState().setPencilAnchor(null);
  useUi.getState().setMeasurementText("");
  useUi.getState().setInferenceLock(null);
  toast.success("Pencil line marked.");
}

function pencilReady(ui: ReturnType<typeof useUi.getState>): boolean {
  return ui.tool === "pencil" && ui.pencilMode === "line" && (ui.pencilDraft?.length ?? 0) > 0;
}

function finishGesture(): void {
  useUi.getState().setDrag(null);
  useUi.getState().setMoveSession(null);
  useUi.getState().setGuideDraft(null);
  useUi.getState().setMeasurementText("");
  useUi.getState().setInference(null);
  useUi.getState().setInferenceLock(null);
  useUi.getState().armPointer();
}

function edgeFrame(piece: Piece, edge: "left" | "right" | "start" | "end"): { origin: Vec3Tuple; direction: Vec3Tuple; offsetAxis: Vec3Tuple } {
  const w = piece.width / 2;
  const l = piece.length / 2;
  const t = piece.thickness / 2;
  const point = edge === "left" ? v(-w, t, 0) : edge === "right" ? v(w, t, 0) : edge === "start" ? v(0, t, -l) : v(0, t, l);
  const dir = edge === "left" || edge === "right" ? v(0, 0, 1) : v(1, 0, 0);
  const off = edge === "left" ? v(1, 0, 0) : edge === "right" ? v(-1, 0, 0) : edge === "start" ? v(0, 0, 1) : v(0, 0, -1);
  const origin = localToWorld(piece, point);
  const direction = normalize(rotateEuler(dir, piece.rotation));
  const offsetAxis = normalize(rotateEuler(off, piece.rotation));
  return {
    origin: [origin.x, origin.y, origin.z],
    direction: [direction.x, direction.y, direction.z],
    offsetAxis: [offsetAxis.x, offsetAxis.y, offsetAxis.z],
  };
}

function between(origin: Vec3Tuple | null, point: Vec3Tuple | null): Vec3Tuple | null {
  if (!origin || !point) return null;
  return [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
}

function sub(a: { x: number; y: number; z: number } | Vec3Tuple, b: { x: number; y: number; z: number } | Vec3Tuple): { x: number; y: number; z: number } {
  const av = asVec(a);
  const bv = asVec(b);
  return { x: av.x - bv.x, y: av.y - bv.y, z: av.z - bv.z };
}

function dot(a: { x: number; y: number; z: number } | Vec3Tuple, b: { x: number; y: number; z: number } | Vec3Tuple): number {
  const av = asVec(a);
  const bv = asVec(b);
  return av.x * bv.x + av.y * bv.y + av.z * bv.z;
}

function asVec(value: { x: number; y: number; z: number } | Vec3Tuple): { x: number; y: number; z: number } {
  return Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value;
}
