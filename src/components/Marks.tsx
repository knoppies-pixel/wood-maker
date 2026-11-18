import { Html, Line } from "@react-three/drei";
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

export function PencilMarks({ piece }: { piece: Piece }) {
  const draft = useUi((state) => (state.pencilPieceId === piece.id ? state.pencilDraft : null));
  const face = useUi((state) => state.pencilFace);
  const marks = piece.marks ?? [];
  return (
    <group>
      {marks.map((mark) => (
        <Line key={mark.id} points={mark.points.map((point) => facePoint(piece, mark.face, point))} color="#221c16" lineWidth={2} raycast={() => null} />
      ))}
      {draft && face && draft.length > 0 ? (
        <Line points={draft.map((point) => facePoint(piece, face, point))} color="#e26a1a" lineWidth={2} raycast={() => null} />
      ) : null}
    </group>
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
            <Line points={[[a.x, a.y, a.z], [b.x, b.y, b.z]]} color="#e2b122" lineWidth={1.5} raycast={() => null} />
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
