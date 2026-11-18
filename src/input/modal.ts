import { toast } from "sonner";
import * as THREE from "three";
import { connectedIds } from "../domain/operations.ts";
import type { Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type ModalOp, type TransformModal } from "../store/useUi.ts";

export function beginModal(op: ModalOp): void {
  const id = useUi.getState().selection;
  const piece = useProject.getState().pieces.find((item) => item.id === id);
  if (!piece) {
    toast.error("Select a piece, then press G, R or S.");
    return;
  }
  useUi.getState().setDrag(null);
  useUi.getState().setModal({
    op,
    axis: null,
    text: "",
    pieceId: piece.id,
    originPosition: [...piece.position],
    originRotation: [...piece.rotation],
    delta: [0, 0, 0],
    scale: [1, 1, 1],
  });
}

export function cancelModal(): void {
  useUi.getState().setDrag(null);
  useUi.getState().setModal(null);
}

export function nudgeSelection(axis: 0 | 1 | 2, amount: number): void {
  const id = useUi.getState().selection;
  if (!id) return;
  const pieces = useProject.getState().pieces;
  const piece = pieces.find((item) => item.id === id);
  if (!piece) return;
  const ids = connectedIds(useProject.getState().fasteners, id, pieces);
  useProject.getState().setTransforms(
    ids.flatMap((memberId) => {
      const member = pieces.find((item) => item.id === memberId);
      if (!member) return [];
      const position = [...member.position] as Vec3Tuple;
      position[axis] += amount;
      return [{ id: memberId, position, rotation: member.rotation }];
    }),
  );
}

export function previewModal(patch: Partial<Pick<TransformModal, "delta" | "scale" | "axis" | "text">>): void {
  const modal = useUi.getState().modal;
  if (!modal) return;
  const next = { ...modal, ...patch };
  useUi.getState().setModal(next);
  publishPreview(next);
}

export function commitModal(): void {
  const modal = useUi.getState().modal;
  if (!modal) return;
  const piece = useProject.getState().pieces.find((item) => item.id === modal.pieceId);
  if (!piece) {
    cancelModal();
    return;
  }
  const typed = parseTyped(modal.text);
  if (modal.op === "scale") {
    const factor = typed ?? 1;
    const scale = typed === null ? modal.scale : axisScale(modal.axis, factor);
    useProject.getState().resizePiece(piece.id, {
      width: piece.width * scale[0],
      thickness: piece.thickness * scale[1],
      length: piece.length * scale[2],
    });
    useUi.getState().setModal(null);
    toast.success("Scaled.");
    return;
  }
  if (typed !== null) {
    if (modal.op === "grab") publishPreview({ ...modal, delta: axisDelta(modal.axis ?? "x", typed) });
    if (modal.op === "rotate") publishPreview({ ...modal, delta: axisDelta(modal.axis ?? "y", typed * (Math.PI / 180)) });
  }
  const drag = useUi.getState().drag;
  if (!drag) {
    cancelModal();
    return;
  }
  useProject.getState().setTransforms(Object.entries(drag).map(([id, pose]) => ({ id, ...pose })));
  useUi.getState().setDrag(null);
  useUi.getState().setModal(null);
  toast.success(modal.op === "grab" ? "Moved." : "Rotated.");
}

function publishPreview(modal: TransformModal): void {
  const pieces = useProject.getState().pieces;
  const piece = pieces.find((item) => item.id === modal.pieceId);
  if (!piece) return;
  const ids = connectedIds(useProject.getState().fasteners, piece.id, pieces);
  const origin = new THREE.Vector3(...modal.originPosition);
  const delta = new THREE.Vector3(...modal.delta);
  const spin = new THREE.Quaternion();
  if (modal.op === "rotate") {
    const axis = modal.axis === "x" ? new THREE.Vector3(1, 0, 0) : modal.axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const angle = modal.axis === "x" ? modal.delta[0] : modal.axis === "z" ? modal.delta[2] : modal.delta[1];
    spin.setFromAxisAngle(axis, angle);
  }
  const overrides: Record<string, { position: Vec3Tuple; rotation: Vec3Tuple }> = {};
  for (const id of ids) {
    const member = pieces.find((item) => item.id === id);
    if (!member) continue;
    if (modal.op === "grab") {
      const position = new THREE.Vector3(...(id === piece.id ? modal.originPosition : member.position)).add(delta);
      overrides[id] = { position: [position.x, position.y, position.z], rotation: id === piece.id ? modal.originRotation : member.rotation };
      continue;
    }
    if (modal.op === "rotate") {
      const basePosition = id === piece.id ? new THREE.Vector3(...modal.originPosition) : new THREE.Vector3(...member.position);
      const baseRotation = id === piece.id ? modal.originRotation : member.rotation;
      const position = basePosition.clone().sub(origin).applyQuaternion(spin).add(origin);
      const quaternion = spin.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...baseRotation, "XYZ")));
      const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
      overrides[id] = {
        position: [position.x, position.y, position.z],
        rotation: [euler.x, euler.y, euler.z],
      };
    }
  }
  if (modal.op !== "scale") useUi.getState().setDrag(overrides);
}

function parseTyped(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function axisDelta(axis: "x" | "y" | "z", value: number): Vec3Tuple {
  if (axis === "x") return [value, 0, 0];
  if (axis === "y") return [0, value, 0];
  return [0, 0, value];
}

function axisScale(axis: "x" | "y" | "z" | null, factor: number): Vec3Tuple {
  const safe = factor === 0 ? 1 : factor;
  if (axis === "x") return [safe, 1, 1];
  if (axis === "y") return [1, safe, 1];
  if (axis === "z") return [1, 1, safe];
  return [safe, safe, safe];
}

export function modalLabel(modal: TransformModal): string {
  const name = modal.op === "grab" ? "Grab" : modal.op === "rotate" ? "Rotate" : "Scale";
  const axis = modal.axis ? ` ${modal.axis.toUpperCase()}` : "";
  const unit = modal.op === "rotate" ? "°" : modal.op === "scale" ? "×" : " mm";
  return `${name}${axis}  ${modal.text || "0"}${unit}`;
}
