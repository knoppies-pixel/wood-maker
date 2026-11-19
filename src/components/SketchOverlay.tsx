import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Guide, Vec3Tuple } from "../domain/types.ts";
import { trackInference } from "../input/sessions.ts";
import { rayTargets } from "./PieceView.tsx";
import { useProject } from "../store/useProject.ts";
import { useUi } from "../store/useUi.ts";

export function SketchLayer() {
  const guides = useProject((state) => state.guides);
  const showGuides = useUi((state) => state.showGuides);
  const selectedId = useUi((state) => state.selectedGuideId);
  const inference = useUi((state) => state.inference);
  const moveSession = useUi((state) => state.moveSession);
  const guideDraft = useUi((state) => state.guideDraft);
  const dragging = Boolean(moveSession || guideDraft);
  const origin = moveSession?.from ?? guideDraft?.origin ?? null;

  return (
    <group>
      {showGuides
        ? guides.map((guide) => (
            <GuideMark key={guide.id} guide={guide} selected={guide.id === selectedId} pickable={!dragging} />
          ))
        : null}
      {inference ? <InferenceMark kind={inference.kind} point={inference.point} color={inference.color} /> : null}
      {origin && inference?.direction ? <AxisLine origin={origin} direction={inference.direction} color={inference.color} /> : null}
      {guideDraft?.kind === "line" && guideDraft.direction && guideDraft.offsetAxis && inference ? (
        <GuidePreview origin={guideDraft.origin} direction={guideDraft.direction} offsetAxis={guideDraft.offsetAxis} target={inference.point} />
      ) : null}
      {dragging && origin ? <EmptyDrag height={origin[1]} /> : null}
    </group>
  );
}

/** Keeps inference alive over empty space without a plane that would hide pieces behind it. */
function EmptyDrag({ height }: { height: number }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const hit = new THREE.Vector3();
    function onMove(event: PointerEvent) {
      const point = underCursor(event, element, camera, raycaster, plane, hit);
      if (point) trackInference(point);
    }
    element.addEventListener("pointermove", onMove);
    return () => element.removeEventListener("pointermove", onMove);
  }, [camera, gl, height]);
  return null;
}

function InferenceMark({ kind, point, color }: { kind: string; point: Vec3Tuple; color: string }) {
  return (
    <group position={point}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[22, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <Html position={[0, 18, 0]} zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded border bg-card/95 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm" style={{ borderColor: color, color }}>
          {kind}
        </div>
      </Html>
    </group>
  );
}

function AxisLine({ origin, direction, color }: { origin: Vec3Tuple; direction: Vec3Tuple; color: string }) {
  const span = 6000;
  const lift = 6;
  const from: Vec3Tuple = [origin[0] - direction[0] * span, origin[1] - direction[1] * span + lift, origin[2] - direction[2] * span];
  const to: Vec3Tuple = [origin[0] + direction[0] * span, origin[1] + direction[1] * span + lift, origin[2] + direction[2] * span];
  return <Dashed from={from} to={to} color={color} />;
}

function GuidePreview({ origin, direction, offsetAxis, target }: { origin: Vec3Tuple; direction: Vec3Tuple; offsetAxis: Vec3Tuple; target: Vec3Tuple }) {
  const delta = [target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]];
  const signed = delta[0] * offsetAxis[0] + delta[1] * offsetAxis[1] + delta[2] * offsetAxis[2];
  const placed: Vec3Tuple = [origin[0] + offsetAxis[0] * signed, origin[1] + offsetAxis[1] * signed, origin[2] + offsetAxis[2] * signed];
  return (
    <group>
      <Dashed from={origin} to={placed} color="#868e96" />
      <Dashed from={shift(placed, direction, -4000)} to={shift(placed, direction, 4000)} color="#868e96" />
    </group>
  );
}

function GuideMark({ guide, selected, pickable }: { guide: Guide; selected: boolean; pickable: boolean }) {
  const color = selected ? "#212529" : "#495057";
  if (guide.kind === "point") {
    return (
      <mesh
        position={guide.point}
        raycast={pickable ? undefined : () => null}
        onClick={(event) => {
          event.stopPropagation();
          useUi.getState().setSelectedGuide(guide.id);
        }}
      >
        <sphereGeometry args={[14, 14, 14]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  }
  const direction = new THREE.Vector3(...guide.direction).normalize();
  if (direction.lengthSq() < 0.5) return null;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  return (
    <group>
      <Dashed from={shift(guide.origin, guide.direction, -5000)} to={shift(guide.origin, guide.direction, 5000)} color={color} />
      {pickable ? (
        <mesh
          position={guide.origin}
          quaternion={quaternion}
          onClick={(event) => {
            event.stopPropagation();
            useUi.getState().setSelectedGuide(guide.id);
          }}
        >
          <cylinderGeometry args={[8, 8, 8000, 6]} />
          <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function underCursor(
  event: PointerEvent,
  element: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  plane: THREE.Plane,
  hit: THREE.Vector3,
): Vec3Tuple | null {
  const rect = element.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const pieceHit = raycaster.intersectObjects(rayTargets(), false)[0];
  if (pieceHit) return [pieceHit.point.x, pieceHit.point.y, pieceHit.point.z];
  if (!raycaster.ray.intersectPlane(plane, hit)) return null;
  return [hit.x, hit.y, hit.z];
}

function Dashed({ from, to, color }: { from: Vec3Tuple; to: Vec3Tuple; color: string }) {
  const points = useMemo(() => [from, to] as [Vec3Tuple, Vec3Tuple], [from[0], from[1], from[2], to[0], to[1], to[2]]);
  return <Line points={points} color={color} dashed dashSize={80} gapSize={42} lineWidth={3} />;
}

function shift(origin: Vec3Tuple, direction: Vec3Tuple, distance: number): Vec3Tuple {
  return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance];
}

export function MeasurementsBox() {
  const modal = useUi((state) => state.modal);
  const text = useUi((state) => state.measurementText);
  const moveSession = useUi((state) => state.moveSession);
  const guideDraft = useUi((state) => state.guideDraft);
  const pencil = useUi((state) => state.pencilDraft);
  const pencilMode = useUi((state) => state.pencilMode);
  const tool = useUi((state) => state.tool);
  const selection = useUi((state) => state.selection);
  const inference = useUi((state) => state.inference);
  const sawDistance = useUi((state) => state.sawDistance);
  const typing = modal?.text || text;
  const live = Boolean(modal || moveSession || guideDraft || (pencilMode === "line" && pencil && pencil.length > 0) || (tool === "saw" && selection) || text);
  if (!live) return null;
  const idle = tool === "saw" && !text && !modal ? `${Math.round(sawDistance)} mm` : inference?.kind ?? "Type 600 or 600, 0, 90";
  return (
    <div className="pointer-events-none absolute right-3 bottom-28 z-20 min-w-44 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Measurements</div>
      <div className="nums mt-0.5 text-sm text-foreground">{typing || idle}</div>
    </div>
  );
}

export function FirstHint() {
  useUi((state) => state.sceneEpoch);
  const seen = typeof localStorage !== "undefined" && localStorage.getItem("benchwork.hint.v1") === "1";
  if (seen) return null;
  return (
    <div className="absolute bottom-28 left-3 z-20 max-w-sm rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
      <div className="font-display text-base">Move it like SketchUp</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Click a piece, then click the point you want to grab and click where it should land. Type 600 and press Enter. Middle mouse orbits, Shift+middle pans. Press ? for every shortcut.
      </p>
      <button
        type="button"
        className="mt-2 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        onClick={() => {
          localStorage.setItem("benchwork.hint.v1", "1");
          useUi.getState().bumpScene();
        }}
      >
        Got it
      </button>
    </div>
  );
}
