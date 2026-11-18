import { Html } from "@react-three/drei";
import * as THREE from "three";
import { holeLocalPoint, inwardNormal, localToWorld } from "../domain/geometry.ts";
import { formatMm } from "../domain/math.ts";
import { anchorDistance } from "../domain/marks.ts";
import type { FaceId, FacePoint, Piece, Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi } from "../store/useUi.ts";

export function facePoint(piece: Piece, face: FaceId, point: FacePoint, lift = 0.8): Vec3Tuple {
  const local = holeLocalPoint(piece, face, point.u, point.v);
  const inward = inwardNormal(face, piece);
  return [local.x - inward.x * lift, local.y - inward.y * lift, local.z - inward.z * lift];
}

export function PencilMarks({ piece, annotate = true }: { piece: Piece; annotate?: boolean }) {
  const draft = useUi((state) => (state.pencilPieceId === piece.id ? state.pencilDraft : null));
  const face = useUi((state) => state.pencilFace);
  const marks = piece.marks ?? [];
  return (
    <group>
      {marks.map((mark) => {
        const points = mark.points.map((point) => facePoint(piece, mark.face, point, 1.4));
        const labelAt = points[points.length - 1];
        return (
          <group key={mark.id}>
            <Stroke points={points} color="#1a120c" radius={1.3} />
            {annotate && mark.label && labelAt ? (
              <Html position={labelAt} center style={{ pointerEvents: "none" }}>
                <div className="nums rounded bg-[#2a261f] px-1 py-0.5 text-[10px] text-[#f6efe4]">{mark.label}</div>
              </Html>
            ) : null}
          </group>
        );
      })}
      {draft && face && draft.length > 0 ? <Stroke points={draft.map((point) => facePoint(piece, face, point, 1.6))} color="#e26a1a" radius={1.3} /> : null}
    </group>
  );
}

/** WebGL ignores line width, so a pencil stroke is a thin rod that stays visible on the face. */
function Stroke({ points, color, radius }: { points: Vec3Tuple[]; color: string; radius: number }) {
  return (
    <group>
      {points.slice(1).map((point, index) => {
        const previous = points[index];
        if (!previous) return null;
        return <Rod key={`${index}:${point.join(":")}`} a={previous} b={point} color={color} radius={radius} />;
      })}
    </group>
  );
}

function Rod({ a, b, color, radius }: { a: Vec3Tuple; b: Vec3Tuple; color: string; radius: number }) {
  const length = Math.max(0.4, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  const mid: Vec3Tuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  if (direction.lengthSq() < 1e-8) return null;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  return (
    <mesh position={mid} quaternion={quaternion} raycast={() => null}>
      <cylinderGeometry args={[radius, radius, length, 6]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

export function DimensionNotes() {
  const notes = useProject((state) => state.dimensions);
  const pieces = useProject((state) => state.pieces);
  return (
    <group>
      {notes.map((note) => {
        const aPiece = pieces.find((item) => item.id === note.a.pieceId);
        const bPiece = pieces.find((item) => item.id === note.b.pieceId);
        if (!aPiece || !bPiece) return null;
        const aLocal = holeLocalPoint(aPiece, note.a.face, note.a.u, note.a.v);
        const bLocal = holeLocalPoint(bPiece, note.b.face, note.b.u, note.b.v);
        const a = localToWorld(aPiece, aLocal);
        const b = localToWorld(bPiece, bLocal);
        const mid: Vec3Tuple = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
        const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        return (
          <group key={note.id}>
            <Rod a={[a.x, a.y + 1.2, a.z]} b={[b.x, b.y + 1.2, b.z]} color="#e2b122" radius={1.1} />
            <Html position={mid} center style={{ pointerEvents: "none" }}>
              <button
                type="button"
                className="nums pointer-events-auto rounded-md bg-[#2a261f] px-1.5 py-0.5 text-[11px] text-[#f6efe4]"
                onClick={() => useProject.getState().removeDimension(note.id)}
              >
                {formatMm(distance)} mm
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

export function liveDistance(a: { u: number; v: number }, b: { u: number; v: number }): number {
  return anchorDistance(a, b);
}
