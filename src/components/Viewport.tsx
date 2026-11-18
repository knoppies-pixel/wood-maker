import { ContactShadows, Grid, Html, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { faceSize, localToWorld, rayDistanceOnAxis, snapTranslation } from "../domain/geometry.ts";
import { HARDWARE_CATALOG } from "../domain/features.ts";
import { offsetOnFace } from "../domain/marks.ts";
import { faceExtent } from "../domain/modifiers.ts";
import { holeLocalPoint } from "../domain/geometry.ts";
import { DEG, clamp, formatMm } from "../domain/math.ts";
import { connectedIds, kerfAlong } from "../domain/operations.ts";
import { profileLocal, profileTarget, routeLocalBox } from "../domain/picking.ts";
import { MIN_PART_MM, type Piece, type Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type DragPose } from "../store/useUi.ts";
import { DimensionNotes, facePoint } from "./Marks.tsx";
import { NumberSlider } from "./fields.tsx";
import { modalLabel } from "../input/modal.ts";
import { commitModal, previewModal } from "../input/modal.ts";
import { PieceView, pieceGroups } from "./PieceView.tsx";
import { shopMaps } from "./wood.ts";
import { cn } from "cn";

export function Viewport() {
  const pieces = useProject((state) => state.pieces);
  const tool = useUi((state) => state.tool);
  const sawMode = useUi((state) => state.sawMode);
  const selection = useUi((state) => state.selection);
  const modal = useUi((state) => state.modal);
  useUi((state) => state.sceneEpoch);
  const [resetSignal, setResetSignal] = useState(0);
  const selected = pieces.find((piece) => piece.id === selection) ?? null;

  useEffect(() => {
    if (selection && !pieces.some((piece) => piece.id === selection)) useUi.getState().select(null);
  }, [pieces, selection]);

  return (
    <div className="relative min-w-0 flex-1 bg-[#6f6a63]" onContextMenu={(event) => event.preventDefault()}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [980, 760, 1280], fov: 38, near: 8, far: 20000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={(event) => {
          if (event.type === "click" && useUi.getState().tool === "select") useUi.getState().select(null);
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={["#8a847b"]} />
        <hemisphereLight args={["#f4efe6", "#5c564e", 0.45]} />
        <ambientLight intensity={0.18} />
        <directionalLight
          position={[640, 1680, 820]}
          intensity={2.6}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={200}
          shadow-camera-far={4200}
          shadow-camera-left={-1600}
          shadow-camera-right={1600}
          shadow-camera-top={1400}
          shadow-camera-bottom={-1400}
          shadow-bias={-0.0006}
        />
        <directionalLight position={[-900, 700, -500]} intensity={0.35} color="#d9c7a4" />
        <Workshop />
        <Grid
          args={[10, 10]}
          cellSize={100}
          cellThickness={0.55}
          cellColor="#6a5a46"
          sectionSize={500}
          sectionThickness={1}
          sectionColor="#3d3228"
          fadeDistance={1600}
          fadeStrength={1.8}
          infiniteGrid
          position={[0, 0.6, 80]}
          raycast={() => null}
        />
        <ContactShadows frames={1} position={[0, 0.4, 80]} opacity={0.42} scale={2400} blur={2.4} far={280} color="#1c1814" resolution={512} />
        {pieces.map((piece) => (
          <PieceView key={piece.id} piece={piece} />
        ))}
        <Fasteners />
        {tool === "saw" && selected && (sawMode === "crosscut" || sawMode === "rip") ? <SawPreview piece={selected} /> : null}
        {tool === "saw" && sawMode === "curve" && selected ? <CurvePreview piece={selected} /> : null}
        <Ghosts />
        <DimensionNotes />
        {tool === "select" && selected && !modal ? <MoveGizmo pieceId={selected.id} /> : null}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={Math.PI / 2 - 0.03}
          minDistance={80}
          maxDistance={16000}
        />
        <CameraButtons />
        <ViewRig signal={resetSignal} />
        <ViewBridge />
        <ModalPointer />
      </Canvas>

      {pieces.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm overflow-hidden rounded-lg border bg-card/92 text-center shadow-lg backdrop-blur-sm">
            <div className="birch-rule" />
            <div className="px-5 py-4">
              <div className="font-display text-xl">The bench is clear</div>
              <p className="mt-1 text-sm text-muted-foreground">Choose a length on the left. It arrives full size, and you shape it with the saw, drill and screws.</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-3 left-3 rounded-md border bg-card/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
        Grid <span className="nums">100</span> mm · bold lines <span className="nums">500</span> mm
      </div>
      <button
        type="button"
        className="absolute top-3 right-3 rounded-md border bg-card/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm hover:bg-accent hover:text-accent-foreground"
        onClick={() => setResetSignal((value) => value + 1)}
      >
        Reset view
      </button>
      <StatusLine />
      <ToolDock />
    </div>
  );
}

function Workshop() {
  const maps = shopMaps();
  const legs: Array<[number, number]> = [
    [-980, -390],
    [980, -390],
    [-980, 550],
    [980, 550],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -780, 200]} receiveShadow>
        <planeGeometry args={[9000, 7000]} />
        <meshStandardMaterial color="#4e4a45" roughness={0.96} />
      </mesh>
      <mesh position={[0, 780, -1680]} receiveShadow>
        <planeGeometry args={[6400, 2400]} />
        <meshStandardMaterial color="#8f897f" roughness={0.94} />
      </mesh>
      <mesh position={[0, 28, -1672]}>
        <boxGeometry args={[6400, 56, 10]} />
        <meshStandardMaterial color="#5a564f" roughness={0.8} metalness={0.05} />
      </mesh>
      <mesh position={[-40, 460, -640]}>
        <planeGeometry args={[1500, 720]} />
        <meshStandardMaterial map={maps.pegboard} roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh position={[-40, 460, -652]}>
        <boxGeometry args={[1540, 760, 16]} />
        <meshStandardMaterial color="#6d7176" roughness={0.42} metalness={0.62} />
      </mesh>
      <mesh position={[-40, 90, -630]}>
        <boxGeometry args={[1500, 12, 18]} />
        <meshStandardMaterial color="#e2b122" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, -18, 80]} castShadow receiveShadow>
        <boxGeometry args={[2200, 36, 1100]} />
        <meshStandardMaterial attach="material-0" map={maps.benchEdge} roughness={0.7} />
        <meshStandardMaterial attach="material-1" map={maps.benchEdge} roughness={0.7} />
        <meshStandardMaterial attach="material-2" map={maps.benchFace} roughness={0.58} metalness={0.02} />
        <meshStandardMaterial attach="material-3" map={maps.benchEdge} roughness={0.75} />
        <meshStandardMaterial attach="material-4" map={maps.benchEdge} roughness={0.7} />
        <meshStandardMaterial attach="material-5" map={maps.benchEdge} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.2, 622]} raycast={() => null}>
        <boxGeometry args={[2200, 2.2, 10]} />
        <meshStandardMaterial color="#e26a1a" roughness={0.45} />
      </mesh>
      <mesh position={[0, -52, 80]}>
        <boxGeometry args={[2120, 28, 1020]} />
        <meshStandardMaterial color="#6a6e73" roughness={0.38} metalness={0.7} />
      </mesh>
      {legs.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, -390, z]} castShadow>
          <boxGeometry args={[46, 700, 46]} />
          <meshStandardMaterial color="#5e6266" roughness={0.4} metalness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function ViewBridge() {
  const request = useUi((state) => state.viewRequest);
  const ortho = useUi((state) => state.ortho);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera) {
      persp.fov = ortho ? 4 : 38;
      persp.updateProjectionMatrix();
    }
    if (!request || !controls) return;
    const pieces = useProject.getState().pieces;
    const selectedId = useUi.getState().selection;
    const focus = request.kind === "frame" && selectedId ? pieces.filter((item) => item.id === selectedId) : pieces;
    const target = focus.length === 0
      ? new THREE.Vector3(0, 40, 0)
      : focus.reduce((sum, item) => sum.add(new THREE.Vector3(...item.position)), new THREE.Vector3()).multiplyScalar(1 / focus.length);
    const span = focus.reduce((max, item) => Math.max(max, item.length, item.width), 500);
    const dist = Math.max(ortho ? 2800 : 700, span * (ortho ? 6 : 1.7));
    if (request.kind === "reset") {
      camera.position.set(980, 760, 1280);
      controls.target.set(0, 40, 0);
    } else if (request.kind === "frame") {
      const offset = camera.position.clone().sub(controls.target);
      if (offset.lengthSq() < 1) offset.set(1, 0.6, 1);
      camera.position.copy(target.clone().add(offset.setLength(dist)));
      controls.target.copy(target);
    } else {
      const offset = request.kind === "front"
        ? new THREE.Vector3(0, span * 0.25, dist)
        : request.kind === "side"
          ? new THREE.Vector3(dist, span * 0.25, 0)
          : new THREE.Vector3(0, dist, span * 0.02);
      camera.position.copy(target.clone().add(offset));
      controls.target.copy(target);
    }
    controls.update();
  }, [request, ortho, camera, controls]);
  return null;
}

function ModalPointer() {
  const modal = useUi((state) => state.modal);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!modal || !controls) return;
    controls.enabled = false;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    function onDown(event: PointerEvent) {
      if (useUi.getState().modal?.text) return;
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    function onMove(event: PointerEvent) {
      if (!dragging) return;
      const current = useUi.getState().modal;
      if (!current || current.text) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(dx, dy) > 1) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      const fov = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera).fov : 38;
      const distance = camera.position.distanceTo(new THREE.Vector3(...current.originPosition));
      const mm = (2 * Math.tan((fov * Math.PI) / 360) * distance) / gl.domElement.clientHeight;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      if (current.op === "grab") {
        const delta = new THREE.Vector3(...current.delta);
        if (current.axis) {
          const axis = new THREE.Vector3(current.axis === "x" ? 1 : 0, current.axis === "y" ? 1 : 0, current.axis === "z" ? 1 : 0);
          delta.addScaledVector(axis, (dx * right.dot(axis) - dy * up.dot(axis)) * mm);
        } else {
          delta.addScaledVector(right, dx * mm).addScaledVector(up, -dy * mm);
        }
        const grid = useUi.getState().snapGrid && !useUi.getState().ctrlDown ? useUi.getState().gridSize : 0;
        if (grid > 0) {
          delta.x = Math.round(delta.x / grid) * grid;
          delta.y = Math.round(delta.y / grid) * grid;
          delta.z = Math.round(delta.z / grid) * grid;
        }
        previewModal({ delta: [delta.x, delta.y, delta.z] });
      } else if (current.op === "rotate") {
        const index = current.axis === "x" ? 0 : current.axis === "z" ? 2 : 1;
        const delta: [number, number, number] = [0, 0, 0];
        delta[index] = current.delta[index] + dx * 0.01;
        previewModal({ delta });
      } else {
        const base = current.axis === "y" ? current.scale[1] : current.axis === "z" ? current.scale[2] : current.scale[0];
        const factor = Math.max(0.05, base + dx * 0.004);
        const scale: [number, number, number] = current.axis === "x"
          ? [factor, 1, 1]
          : current.axis === "y"
            ? [1, factor, 1]
            : current.axis === "z"
              ? [1, 1, factor]
              : [factor, factor, factor];
        previewModal({ scale });
      }
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      if (moved && !useUi.getState().modal?.text) commitModal();
    }
    gl.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      controls.enabled = true;
      gl.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [modal?.op, modal?.pieceId, camera, gl, controls]);
  return null;
}

function CameraButtons() {
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!controls) return;
    controls.mouseButtons.LEFT = -1 as unknown as THREE.MOUSE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  }, [controls]);
  return null;
}

function ViewRig({ signal }: { signal: number }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (!signal || !controls) return;
    camera.position.set(980, 760, 1280);
    controls.target.set(0, 40, 0);
    controls.update();
  }, [signal, camera, controls]);
  return null;
}

function MoveGizmo({ pieceId }: { pieceId: string }) {
  const object = pieceGroups.get(pieceId);
  const mode = useUi((state) => state.transformMode);
  const space = useUi((state) => state.space);
  const snapRotate = useUi((state) => state.snapRotate);
  const session = useRef<{ ids: string[]; start: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }> } | null>(null);
  const busy = useRef(false);
  if (!object) return null;

  return (
    <TransformControls
      object={object}
      mode={mode}
      space={space}
      rotationSnap={snapRotate && mode === "rotate" ? THREE.MathUtils.degToRad(15) : null}
      onMouseDown={() => {
        const ids = connectedIds(useProject.getState().fasteners, pieceId, useProject.getState().pieces);
        const start = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
        for (const id of ids) {
          const group = pieceGroups.get(id);
          if (!group) continue;
          start.set(id, { position: group.position.clone(), quaternion: group.quaternion.clone() });
        }
        session.current = { ids, start };
      }}
      onObjectChange={() => {
        const drag = session.current;
        const current = pieceGroups.get(pieceId);
        if (!drag || !current || busy.current) return;
        busy.current = true;
        const origin = drag.start.get(pieceId);
        if (origin && mode === "translate") {
          const pieces = useProject.getState().pieces;
          const base = pieces.find((item) => item.id === pieceId);
          if (base) {
            const euler = new THREE.Euler().setFromQuaternion(current.quaternion, "XYZ");
            const trial: Piece = {
              ...base,
              position: [current.position.x, current.position.y, current.position.z],
              rotation: [euler.x, euler.y, euler.z],
            };
            const ui = useUi.getState();
            const delta = snapTranslation(
              trial,
              pieces.filter((item) => !drag.ids.includes(item.id)),
              { grid: ui.snapGrid, gridSize: ui.gridSize, faces: ui.snapFaces },
            );
            current.position.add(new THREE.Vector3(delta.x, delta.y, delta.z));
          }
        }
        if (origin) {
          const dq = current.quaternion.clone().multiply(origin.quaternion.clone().invert());
          const overrides: Record<string, DragPose> = {};
          for (const id of drag.ids) {
            const member = pieceGroups.get(id);
            const memberStart = drag.start.get(id);
            if (!member || !memberStart) continue;
            if (id !== pieceId) {
              const offset = memberStart.position.clone().sub(origin.position).applyQuaternion(dq);
              member.position.copy(current.position).add(offset);
              member.quaternion.copy(dq.clone().multiply(memberStart.quaternion));
            }
            const euler = new THREE.Euler().setFromQuaternion(member.quaternion, "XYZ");
            overrides[id] = {
              position: [member.position.x, member.position.y, member.position.z],
              rotation: [euler.x, euler.y, euler.z],
            };
          }
          useUi.getState().setDrag(overrides);
        }
        busy.current = false;
      }}
      onMouseUp={() => {
        const drag = session.current;
        session.current = null;
        if (!drag) {
          useUi.getState().setDrag(null);
          return;
        }
        const updates = drag.ids.flatMap((id) => {
          const member = pieceGroups.get(id);
          if (!member) return [];
          const euler = new THREE.Euler().setFromQuaternion(member.quaternion, "XYZ");
          return [
            {
              id,
              position: [member.position.x, member.position.y, member.position.z] as Vec3Tuple,
              rotation: [euler.x, euler.y, euler.z] as Vec3Tuple,
            },
          ];
        });
        useProject.getState().setTransforms(updates);
        useUi.getState().setDrag(null);
      }}
    />
  );
}

function SawPreview({ piece }: { piece: Piece }) {
  const distance = useUi((state) => state.sawDistance);
  const mitre = useUi((state) => state.sawMitre);
  const bevel = useUi((state) => state.sawBevel);
  const from = useUi((state) => state.sawFrom);
  const mode = useUi((state) => state.sawMode);
  const kerf = useProject((state) => state.kerf);
  const consumed = mode === "rip" ? kerf : kerfAlong(kerf, mitre, bevel);
  const span = mode === "rip" ? piece.width : piece.length;
  const fromStart = mode === "rip" || from === "start" ? distance : piece.length - distance - consumed;
  const valid = fromStart >= MIN_PART_MM && span - fromStart - consumed >= MIN_PART_MM;
  const drag = useRef(false);

  function scrub(origin: THREE.Vector3, direction: THREE.Vector3) {
    const along = rayDistanceOnAxis(piece, { x: origin.x, y: origin.y, z: origin.z }, { x: direction.x, y: direction.y, z: direction.z }, mode === "rip" ? "width" : "length");
    const measured = mode === "crosscut" && from === "end" ? piece.length - along : along;
    const max = Math.max(MIN_PART_MM, span - consumed - MIN_PART_MM);
    useUi.getState().setSawDistance(clamp(measured, MIN_PART_MM, max));
  }

  const marker =
    mode === "rip"
      ? [-piece.width / 2 + fromStart + consumed / 2, 0, 0] as Vec3Tuple
      : [0, 0, -piece.length / 2 + fromStart + consumed / 2] as Vec3Tuple;

  return (
    <group position={piece.position} rotation={piece.rotation}>
      <mesh position={[0, piece.thickness / 2 + 6, -piece.length / 2]} raycast={() => null}>
        <sphereGeometry args={[5, 16, 16]} />
        <meshBasicMaterial color="#c9852a" />
      </mesh>
      <mesh
        position={marker}
        rotation={mode === "crosscut" ? [bevel * DEG, mitre * DEG, 0] : [0, Math.PI / 2, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          drag.current = true;
          scrub(event.ray.origin, event.ray.direction);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          event.stopPropagation();
          scrub(event.ray.origin, event.ray.direction);
        }}
        onPointerUp={() => {
          drag.current = false;
        }}
      >
        <planeGeometry args={mode === "rip" ? [piece.length + 36, piece.thickness + 36] : [piece.width + 36, piece.thickness + 36]} />
        <meshBasicMaterial color={valid ? "#c2410c" : "#7f1d1d"} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={marker} rotation={mode === "crosscut" ? [Math.PI / 2, mitre * DEG, 0] : [0, 0, Math.PI / 2]} raycast={() => null}>
        <cylinderGeometry args={[72, 72, Math.max(consumed, 2.4), 28]} />
        <meshStandardMaterial color={valid ? "#d5dbe2" : "#e07070"} metalness={0.55} roughness={0.35} transparent opacity={0.8} />
      </mesh>
      <mesh position={[piece.width / 2 + 10, piece.thickness / 2 + 1, (-piece.length / 2 + marker[2]) / 2]} raycast={() => null}>
        <boxGeometry args={[2, 2, Math.max(4, Math.abs(marker[2] + piece.length / 2))]} />
        <meshBasicMaterial color="#f0d48a" />
      </mesh>
      <Html position={[marker[0], piece.thickness / 2 + 28, marker[2]]} center style={{ pointerEvents: "none" }}>
        <div className="nums rounded-md bg-[#2a261f] px-2 py-0.5 text-xs font-semibold text-[#f6efe4]">{formatMm(fromStart)} mm kept</div>
      </Html>
      <Html
        position={mode === "rip" ? [piece.width / 2 - Math.max(span - fromStart - consumed, 8) / 2, piece.thickness / 2 + 18, 0] : [0, piece.thickness / 2 + 18, piece.length / 2 - Math.max(span - fromStart - consumed, 8) / 2]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div className={`nums rounded-md px-2 py-0.5 text-xs font-semibold text-[#f6efe4] ${valid ? "bg-[#3d4a3a]" : "bg-[#7f1d1d]"}`}>{formatMm(Math.max(0, span - fromStart - consumed))} mm offcut</div>
      </Html>
    </group>
  );
}

function CurvePreview({ piece }: { piece: Piece }) {
  const points = useUi((state) => state.curvePoints);
  return (
    <group position={piece.position} rotation={piece.rotation}>
      {points.map((point, index) => (
        <mesh key={`${point.u}-${point.v}-${index}`} position={[point.u - piece.width / 2, piece.thickness / 2 + 2, point.v - piece.length / 2]} raycast={() => null}>
          <sphereGeometry args={[4, 12, 12]} />
          <meshBasicMaterial color="#c2410c" />
        </mesh>
      ))}
    </group>
  );
}

function Ghosts() {
  const tool = useUi((state) => state.tool);
  const hover = useUi((state) => state.hover);
  const diameter = useUi((state) => state.drillDiameter);
  const depth = useUi((state) => state.drillDepth);
  const through = useUi((state) => state.drillThrough);
  const routerKind = useUi((state) => state.routerKind);
  const routerWidth = useUi((state) => state.routerWidth);
  const routerDepth = useUi((state) => state.routerDepth);
  const radius = useUi((state) => state.profileRadius);
  const piece = useProject((state) => state.pieces.find((item) => item.id === hover?.pieceId));
  if (!hover || !piece) return null;
  const tint = hover.valid ? "#e8a04a" : "#e05050";
  const normal = new THREE.Vector3(...hover.normal).normalize();
  const inward = normal.clone().negate();
  let ghost = null;
  if (tool === "drill") {
    const size = faceSize(piece, hover.face);
    const holeDepth = through ? size.depth : Math.min(depth, size.depth);
    const center = new THREE.Vector3(...hover.point).addScaledVector(inward, holeDepth / 2);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
    ghost = (
      <group>
        <mesh position={center} quaternion={quaternion} raycast={() => null}>
          <cylinderGeometry args={[diameter / 2, diameter / 2, Math.max(holeDepth, 1), 20]} />
          <meshBasicMaterial color={tint} transparent opacity={0.45} />
        </mesh>
        <mesh position={hover.point} quaternion={quaternion} raycast={() => null}>
          <cylinderGeometry args={[diameter, diameter * 0.72, 3, 20]} />
          <meshStandardMaterial color="#d5dbe2" metalness={0.4} roughness={0.4} transparent opacity={0.8} />
        </mesh>
      </group>
    );
  } else if (tool === "router") {
    ghost = (
      <group position={piece.position} rotation={piece.rotation}>
        {routerKind === "profile"
          ? <ProfileGhost piece={piece} face={hover.face} u={hover.u} v={hover.v} radius={radius} tint={tint} />
          : <RouteGhost piece={piece} kind={routerKind} face={hover.face} edge={hover.edge} u={hover.u} v={hover.v} width={routerWidth} depth={routerDepth} tint={tint} />}
      </group>
    );
  } else if (tool === "screw") {
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
    const length = useUi.getState().screwLength;
    ghost = (
      <mesh position={new THREE.Vector3(...hover.point).addScaledVector(inward, length / 2)} quaternion={quaternion} raycast={() => null}>
        <cylinderGeometry args={[useUi.getState().screwDiameter / 2, useUi.getState().screwDiameter / 2, length, 16]} />
        <meshBasicMaterial color={tint} transparent opacity={0.55} />
      </mesh>
    );
  } else if (tool === "joint") {
    ghost = <JointGhost piece={piece} hover={hover} tint={tint} inward={inward} />;
  } else if (tool === "hardware") {
    const offer = HARDWARE_CATALOG.find((item) => item.id === useUi.getState().hardwareId);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
    ghost = (
      <mesh position={new THREE.Vector3(...hover.point).addScaledVector(inward, (offer?.depth ?? 8) / 2)} quaternion={quaternion} raycast={() => null}>
        <boxGeometry args={[offer?.width ?? 30, offer?.height ?? 60, offer?.depth ?? 8]} />
        <meshBasicMaterial color={tint} transparent opacity={0.45} />
      </mesh>
    );
  } else if (tool === "pencil" || tool === "measure") {
    ghost = <LayoutGhost piece={piece} hover={hover} tint={tint} />;
  }
  return (
    <group>
      {ghost}
      {hover.snap ? (
        <Html position={hover.point} center style={{ pointerEvents: "none" }}>
          <div className="rounded-full bg-[#1c1915] px-2 py-0.5 text-[11px] font-medium text-[#f6efe4]">{hover.snap}</div>
        </Html>
      ) : null}
    </group>
  );
}

function JointGhost({ piece, hover, tint, inward }: { piece: Piece; hover: NonNullable<ReturnType<typeof useUi.getState>["hover"]>; tint: string; inward: THREE.Vector3 }) {
  const kind = useUi((state) => state.jointKind);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
  if (kind === "dowels") {
    return (
      <group position={hover.point} quaternion={quaternion}>
        <mesh position={[8, 6, 0]} raycast={() => null}><cylinderGeometry args={[4, 4, 24, 12]} /><meshBasicMaterial color={tint} transparent opacity={0.5} /></mesh>
        <mesh position={[-8, 6, 0]} raycast={() => null}><cylinderGeometry args={[4, 4, 24, 12]} /><meshBasicMaterial color={tint} transparent opacity={0.5} /></mesh>
      </group>
    );
  }
  const depth = Math.min(piece.thickness / 2, 12);
  return (
    <mesh position={new THREE.Vector3(...hover.point).addScaledVector(inward, depth / 2)} quaternion={quaternion} raycast={() => null}>
      <boxGeometry args={[kind === "dovetail" ? 22 : piece.width * 0.45, depth, kind === "half-lap" ? piece.width * 0.8 : 28]} />
      <meshBasicMaterial color={tint} transparent opacity={0.45} />
    </mesh>
  );
}

function LayoutGhost({ piece, hover, tint }: { piece: Piece; hover: NonNullable<ReturnType<typeof useUi.getState>["hover"]>; tint: string }) {
  const tool = useUi((state) => state.tool);
  const anchor = useUi((state) => state.measureAnchor);
  const mode = useUi((state) => state.measureMode);
  const degrees = useUi((state) => state.angleDegrees);
  const offset = useUi((state) => state.offsetMm);
  const draft = useUi((state) => state.pencilDraft);
  if (tool === "measure" && mode === "tape" && anchor) {
    const host = useProject.getState().pieces.find((item) => item.id === anchor.pieceId);
    if (!host) return null;
    const local = holeLocalPoint(host, anchor.face, anchor.u, anchor.v);
    const world = localToWorld(host, local);
    const distance = Math.hypot(world.x - hover.point[0], world.y - hover.point[1], world.z - hover.point[2]);
    return (
      <group>
        <LineBridge a={[world.x, world.y, world.z]} b={hover.point} color={tint} />
        <Html position={hover.point} center style={{ pointerEvents: "none" }}>
          <div className="nums rounded-md bg-[#2a261f] px-1.5 py-0.5 text-[11px] text-[#f6efe4]">{formatMm(distance)} mm</div>
        </Html>
      </group>
    );
  }
  if (tool === "measure" && mode === "angle") {
    const size = faceExtent(hover.face, piece);
    const length = Math.min(size.u, size.v) * 0.7;
    const radians = (degrees * Math.PI) / 180;
    const end = facePoint(piece, hover.face, {
      u: Math.min(size.u, Math.max(0, hover.u + Math.cos(radians) * length)),
      v: Math.min(size.v, Math.max(0, hover.v + Math.sin(radians) * length)),
    });
    const start = facePoint(piece, hover.face, hover);
    return <group position={piece.position} rotation={piece.rotation}><LineBridge a={start} b={end} color={tint} /></group>;
  }
  if (tool === "measure" && mode === "offset") {
    const line = offsetOnFace(hover.face, piece, hover.u, hover.v, offset);
    const a = facePoint(piece, hover.face, line[0] ?? hover);
    const b = facePoint(piece, hover.face, line[1] ?? hover);
    return <group position={piece.position} rotation={piece.rotation}><LineBridge a={a} b={b} color={tint} /></group>;
  }
  if (tool === "pencil" && draft && draft[0]) {
    const start = facePoint(piece, hover.face, draft[0]);
    const end = facePoint(piece, hover.face, hover);
    return <group position={piece.position} rotation={piece.rotation}><LineBridge a={start} b={end} color={tint} /></group>;
  }
  return <mesh position={hover.point} raycast={() => null}><sphereGeometry args={[3, 12, 12]} /><meshBasicMaterial color={tint} /></mesh>;
}

function LineBridge({ a, b, color }: { a: Vec3Tuple; b: Vec3Tuple; color: string }) {
  const length = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  const mid: Vec3Tuple = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  return (
    <mesh position={mid} quaternion={quaternion} raycast={() => null}>
      <cylinderGeometry args={[0.8, 0.8, length, 6]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function RouteGhost({
  piece,
  kind,
  face,
  edge,
  u,
  v,
  width,
  depth,
  tint,
}: {
  piece: Piece;
  kind: "dado" | "groove" | "rebate";
  face: Piece["holes"][number]["face"];
  edge: "left" | "right" | "start" | "end";
  u: number;
  v: number;
  width: number;
  depth: number;
  tint: string;
}) {
  const box = routeLocalBox(piece, { kind, face, edge, u, v, width, depth }, 0.15);
  return (
    <mesh position={box.position} raycast={() => null}>
      <boxGeometry args={box.size} />
      <meshBasicMaterial color={tint} transparent opacity={0.45} />
    </mesh>
  );
}

function ProfileGhost({ piece, face, u, v, radius, tint }: { piece: Piece; face: Piece["holes"][number]["face"]; u: number; v: number; radius: number; tint: string }) {
  const target = profileLocal(piece, profileTarget(piece, face, u, v));
  return (
    <mesh position={target.position} rotation={target.alongLength ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]} raycast={() => null}>
      <cylinderGeometry args={[radius, radius, target.alongLength ? piece.length : piece.width, 16]} />
      <meshBasicMaterial color={tint} transparent opacity={0.45} />
    </mesh>
  );
}

function Fasteners() {
  const fasteners = useProject((state) => state.fasteners);
  const pieces = useProject((state) => state.pieces);
  const drag = useUi((state) => state.drag);
  return (
    <>
      {fasteners.map((fastener) => {
        const piece = pieces.find((item) => item.id === fastener.pieceAId);
        if (!piece) return null;
        const pose = drag?.[piece.id];
        const posed = pose ? { ...piece, position: pose.position, rotation: pose.rotation } : piece;
        const head = localToWorld(posed, { x: fastener.localPosition[0], y: fastener.localPosition[1], z: fastener.localPosition[2] });
        const direction = new THREE.Vector3(...fastener.localDirection).applyEuler(new THREE.Euler(...posed.rotation, "XYZ")).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        const headRadius = Math.max(6, fastener.diameter * 1.15);
        return (
          <group key={fastener.id} position={[head.x, head.y, head.z]} quaternion={quaternion}>
            <mesh position={[0, -2.2, 0]} raycast={() => null}>
              <cylinderGeometry args={[headRadius, headRadius * 0.78, 3.2, 20]} />
              <meshStandardMaterial color="#f4f7f8" metalness={0.2} roughness={0.35} />
            </mesh>
            <mesh position={[0, -3.9, 0]} raycast={() => null}>
              <boxGeometry args={[headRadius * 1.4, 0.8, 0.6]} />
              <meshStandardMaterial color="#5d666d" metalness={0.1} roughness={0.45} />
            </mesh>
            <mesh position={[0, fastener.length / 2, 0]} raycast={() => null}>
              <cylinderGeometry args={[Math.max(1.6, fastener.diameter / 2.1), Math.max(1.6, fastener.diameter / 2.1), fastener.length, 12]} />
              <meshStandardMaterial color="#d5dbe0" metalness={0.25} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

function ToolDock() {
  const tool = useUi((state) => state.tool);
  const selection = useUi((state) => state.selection);
  const piece = useProject((state) => state.pieces.find((item) => item.id === selection));
  return (
    <div className="absolute inset-x-3 bottom-3 flex justify-center">
      <div className="pointer-events-auto max-h-[46vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-card/95 shadow-lg backdrop-blur-md">
        <div className="birch-rule" />
        <div className="p-3">
        {tool === "select" ? <SelectDock /> : null}
        {tool === "saw" ? <SawDock piece={piece} /> : null}
        {tool === "drill" ? <DrillDock /> : null}
        {tool === "screw" ? <ScrewDock /> : null}
        {tool === "router" ? <RouterDock /> : null}
        {tool === "joint" ? <JointDock /> : null}
        {tool === "hardware" ? <HardwareDock /> : null}
        {tool === "pencil" ? <PencilDock /> : null}
        {tool === "measure" ? <MeasureDock /> : null}
        </div>
      </div>
    </div>
  );
}

function SelectDock() {
  const mode = useUi((state) => state.transformMode);
  const space = useUi((state) => state.space);
  const gridSize = useUi((state) => state.gridSize);
  const snapRotate = useUi((state) => state.snapRotate);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle on={mode === "translate"} onClick={() => useUi.getState().setTransformMode("translate")}>Move</Toggle>
      <Toggle on={mode === "rotate"} onClick={() => useUi.getState().setTransformMode("rotate")}>Rotate</Toggle>
      <Toggle on={space === "world"} onClick={() => useUi.getState().setSpace(space === "world" ? "local" : "world")}>{space === "world" ? "World axes" : "Piece axes"}</Toggle>
      <div className="flex items-center gap-1">
        {[1, 5, 10, 50].map((size) => (
          <Toggle key={size} on={gridSize === size} onClick={() => useUi.getState().setGridSize(size)}>
            {size}
          </Toggle>
        ))}
      </div>
      <Toggle on={snapRotate} onClick={() => useUi.getState().setSnapRotate(!snapRotate)}>15° turns</Toggle>
      <span className="text-xs text-muted-foreground">Drag the gizmo. Face snap butts pieces. Screwed parts move together.</span>
    </div>
  );
}

function SawDock({ piece }: { piece: Piece | undefined }) {
  const mode = useUi((state) => state.sawMode);
  const from = useUi((state) => state.sawFrom);
  const distance = useUi((state) => state.sawDistance);
  const mitre = useUi((state) => state.sawMitre);
  const bevel = useUi((state) => state.sawBevel);
  const kerf = useProject((state) => state.kerf);
  const span = piece ? (mode === "rip" ? piece.width : piece.length) : 0;
  const consumed = piece && mode === "crosscut" ? kerfAlong(kerf, mitre, bevel) : kerf;
  const max = piece ? Math.max(MIN_PART_MM, span - consumed - MIN_PART_MM) : MIN_PART_MM;
  const head = mode === "rip" || from === "start" ? distance : piece ? piece.length - distance - consumed : 0;
  const tail = piece ? span - head - consumed : 0;

  function cut() {
    if (!piece) {
      toast.error("Select a piece to cut.");
      return;
    }
    const result = useProject.getState().cutPiece(piece.id, mode === "rip" ? "rip" : "crosscut", head, mode === "crosscut" ? mitre : 0, bevel);
    if (!result.ok) toast.error(result.message);
    else {
      toast.success(result.message ?? "Cut");
      if (result.selectId) useUi.getState().select(result.selectId);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle on={mode === "crosscut"} onClick={() => useUi.getState().setSawMode("crosscut")}>Crosscut</Toggle>
        <Toggle on={mode === "rip"} onClick={() => useUi.getState().setSawMode("rip")}>Rip</Toggle>
        <Toggle on={mode === "taper"} onClick={() => useUi.getState().setSawMode("taper")}>Taper</Toggle>
        <Toggle on={mode === "curve"} onClick={() => useUi.getState().setSawMode("curve")}>Curve</Toggle>
        {mode === "crosscut" ? (
          <Toggle on={from === "end"} onClick={() => useUi.getState().setSawFrom(from === "start" ? "end" : "start")}>
            {from === "start" ? "From reference end" : "From far end"}
          </Toggle>
        ) : null}
        {mode === "crosscut" || mode === "rip" ? <span className="nums text-sm font-semibold">{piece ? `${formatMm(distance)} mm` : "No piece"}</span> : null}
      </div>
      {mode === "crosscut" || mode === "rip" ? (
        <NumberSlider label="Station" min={MIN_PART_MM} max={Math.max(MIN_PART_MM + 1, max)} value={clamp(distance, MIN_PART_MM, max)} disabled={!piece} onCommit={(value) => useUi.getState().setSawDistance(value)} />
      ) : null}
      {mode === "crosscut" ? (
        <div className="flex flex-wrap gap-3">
          <NumberSlider label="Mitre" min={-60} max={60} suffix="°" value={mitre} onCommit={(value) => useUi.getState().setSawMitre(value)} />
          <NumberSlider label="Bevel" min={-60} max={60} suffix="°" value={bevel} onCommit={(value) => useUi.getState().setSawBevel(value)} />
        </div>
      ) : null}
      {mode === "taper" ? <TaperControls piece={piece} /> : null}
      {mode === "curve" ? <CurveControls piece={piece} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nums text-xs text-muted-foreground">
          {piece && mode === "rip"
            ? `Left ${formatMm(head)} mm · kerf ${formatMm(consumed)} · right ${formatMm(tail)} mm`
            : piece && mode === "crosscut"
              ? `Keep ${formatMm(head)} mm · kerf ${formatMm(consumed)} along the board · offcut ${formatMm(tail)} mm`
              : mode === "taper"
                ? "Narrow one or both ends. The taper stays inside the board."
                : "Click the top face to draw the cut. Start and finish on an edge."}
        </p>
        {mode === "crosscut" || mode === "rip" ? (
          <Button size="sm" disabled={!piece} onClick={cut}>
            Cut
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TaperControls({ piece }: { piece: Piece | undefined }) {
  const start = useUi((state) => state.taperStart);
  const end = useUi((state) => state.taperEnd);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NumberSlider label="Start" min={5} max={piece?.width ?? 80} value={start} onCommit={(value) => useUi.getState().setTaperStart(value)} />
      <NumberSlider label="End" min={5} max={piece?.width ?? 80} value={end} onCommit={(value) => useUi.getState().setTaperEnd(value)} />
      <Button size="sm" disabled={!piece} onClick={() => {
        if (!piece) return;
        const result = useProject.getState().taper(piece.id, start, end);
        if (result.ok) toast.success(result.message ?? "Tapered");
        else toast.error(result.message);
      }}>Taper</Button>
    </div>
  );
}

function CurveControls({ piece }: { piece: Piece | undefined }) {
  const points = useUi((state) => state.curvePoints);
  const waste = useUi((state) => state.curveWaste);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="nums text-xs">{points.length} points</span>
      <Toggle on={waste === "left"} onClick={() => useUi.getState().setCurveWaste(waste === "left" ? "right" : "left")}>
        Waste {waste}
      </Toggle>
      <Button size="sm" variant="outline" onClick={() => useUi.getState().setCurvePoints(points.slice(0, -1))}>Undo point</Button>
      <Button size="sm" variant="ghost" onClick={() => useUi.getState().setCurvePoints([])}>Clear</Button>
      <Button size="sm" disabled={!piece || points.length < 2} onClick={() => {
        if (!piece) return;
        const result = useProject.getState().curve(piece.id, points, waste);
        if (result.ok) {
          toast.success(result.message ?? "Cut");
          useUi.getState().setCurvePoints([]);
        } else toast.error(result.message);
      }}>Cut curve</Button>
    </div>
  );
}

function DrillDock() {
  const diameter = useUi((state) => state.drillDiameter);
  const depth = useUi((state) => state.drillDepth);
  const through = useUi((state) => state.drillThrough);
  const style = useUi((state) => state.drillStyle);
  const countersink = useUi((state) => state.countersinkDiameter);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <Toggle on={style === "twist"} onClick={() => useUi.getState().setDrillStyle("twist")}>Twist</Toggle>
        <Toggle on={style === "countersink"} onClick={() => useUi.getState().setDrillStyle("countersink")}>Countersink</Toggle>
        <Toggle on={style === "forstner"} onClick={() => useUi.getState().setDrillStyle("forstner")}>Forstner</Toggle>
        <Toggle on={style === "hole-saw"} onClick={() => useUi.getState().setDrillStyle("hole-saw")}>Hole saw</Toggle>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {[3, 4, 5, 6, 8, 10, 15, 20, 35].map((size) => (
          <Toggle key={size} on={diameter === size} onClick={() => useUi.getState().setDrillDiameter(size)}>
            ⌀{size}
          </Toggle>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          Through
          <Switch checked={through} onCheckedChange={(checked) => useUi.getState().setDrillThrough(checked)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <NumberSlider label="Diameter" min={2} max={80} value={diameter} onCommit={(value) => useUi.getState().setDrillDiameter(value)} />
        <NumberSlider label="Depth" min={2} max={80} value={depth} disabled={through} onCommit={(value) => useUi.getState().setDrillDepth(value)} />
        {style === "countersink" ? <NumberSlider label="Mouth" min={diameter + 2} max={40} value={countersink} onCommit={(value) => useUi.getState().setCountersinkDiameter(value)} /> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {style === "hole-saw" ? "A hole saw cuts through and leaves the plug as its own piece." : style === "forstner" ? "Forstner bits leave a flat-bottomed hole and a rim." : style === "countersink" ? "The countersink is the cone the screw head sits in." : "Click a face. The hole is stored on the piece."}
      </p>
    </div>
  );
}

function ScrewDock() {
  const diameter = useUi((state) => state.screwDiameter);
  const length = useUi((state) => state.screwLength);
  const kind = useUi((state) => state.fastenerKind);
  const presets = [30, 40, 50, 60, 70, 80, 90, 100];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <Toggle on={kind === "screw"} onClick={() => useUi.getState().setFastenerKind("screw")}>Screw</Toggle>
        <Toggle on={kind === "pocket-screw"} onClick={() => useUi.getState().setFastenerKind("pocket-screw")}>Pocket</Toggle>
        <Toggle on={kind === "bolt"} onClick={() => useUi.getState().setFastenerKind("bolt")}>Bolt</Toggle>
        <Toggle on={kind === "glue"} onClick={() => useUi.getState().setFastenerKind("glue")}>Glue</Toggle>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {[3.5, 4, 4.5, 5, 6].map((size) => (
          <Toggle key={size} on={diameter === size} onClick={() => useUi.getState().setScrewDiameter(size)}>
            ⌀{size}
          </Toggle>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((size) => (
          <Toggle key={size} on={length === size} onClick={() => useUi.getState().setScrewLength(size)}>
            {size} mm
          </Toggle>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <NumberSlider label="Diameter" min={2} max={12} step={0.5} value={diameter} onCommit={(value) => useUi.getState().setScrewDiameter(value)} />
        <NumberSlider label="Length" min={12} max={160} value={length} onCommit={(value) => useUi.getState().setScrewLength(value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {kind === "glue"
          ? "Click the face that touches the other piece. Glue has no head, but the parts move together."
          : kind === "pocket-screw"
            ? `${diameter}×${length} mm at 15°. Click the face near the joint.`
            : kind === "bolt"
              ? `M${diameter} × ${length} mm. The bolt goes through into the piece behind.`
              : `${diameter}×${length} mm. Click the outside face so the screw reaches the piece behind.`}
      </p>
    </div>
  );
}

function RouterDock() {
  const kind = useUi((state) => state.routerKind);
  const width = useUi((state) => state.routerWidth);
  const depth = useUi((state) => state.routerDepth);
  const profile = useUi((state) => state.profile);
  const radius = useUi((state) => state.profileRadius);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Toggle on={kind === "dado"} onClick={() => useUi.getState().setRouterKind("dado")}>Dado</Toggle>
        <Toggle on={kind === "groove"} onClick={() => useUi.getState().setRouterKind("groove")}>Groove</Toggle>
        <Toggle on={kind === "rebate"} onClick={() => useUi.getState().setRouterKind("rebate")}>Rebate</Toggle>
        <Toggle on={kind === "profile"} onClick={() => useUi.getState().setRouterKind("profile")}>Edge</Toggle>
      </div>
      {kind === "profile" ? (
        <div className="flex flex-wrap items-center gap-1">
          <Toggle on={profile === "round-over"} onClick={() => useUi.getState().setProfile("round-over")}>Round-over</Toggle>
          <Toggle on={profile === "chamfer"} onClick={() => useUi.getState().setProfile("chamfer")}>Chamfer</Toggle>
          <Toggle on={profile === "cove"} onClick={() => useUi.getState().setProfile("cove")}>Cove</Toggle>
          <NumberSlider label="Radius" min={2} max={16} value={radius} onCommit={(value) => useUi.getState().setProfileRadius(value)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <NumberSlider label="Width" min={3} max={30} value={width} onCommit={(value) => useUi.getState().setRouterWidth(value)} />
          <NumberSlider label="Depth" min={1} max={18} value={depth} onCommit={(value) => useUi.getState().setRouterDepth(value)} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Hover to see the cut. A dado, groove, rebate or edge profile lands on the face or edge under the cursor. Red means it will not fit.</p>
    </div>
  );
}

function JointDock() {
  const kind = useUi((state) => state.jointKind);
  const first = useUi((state) => state.jointFirst);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Toggle on={kind === "mortise-tenon"} onClick={() => useUi.getState().setJointKind("mortise-tenon")}>Mortise & tenon</Toggle>
        <Toggle on={kind === "half-lap"} onClick={() => useUi.getState().setJointKind("half-lap")}>Half-lap</Toggle>
        <Toggle on={kind === "dovetail"} onClick={() => useUi.getState().setJointKind("dovetail")}>Dovetail</Toggle>
        <Toggle on={kind === "dowels"} onClick={() => useUi.getState().setJointKind("dowels")}>Dowels</Toggle>
      </div>
      <p className="text-xs text-muted-foreground">
        {first ? "Now click the mating face." : kind === "mortise-tenon" ? "Click the mortise face, then the end that gets the tenon." : kind === "dovetail" ? "Click the tail end, then the pin end." : "Click the first face, then the face it meets."}
      </p>
    </div>
  );
}

function HardwareDock() {
  const selected = useUi((state) => state.hardwareId);
  const offers = [
    ["butt-hinge-60", "Hinge 60"],
    ["butt-hinge-75", "Hinge 75"],
    ["slide-350", "Slide 350"],
    ["slide-450", "Slide 450"],
    ["pull-128", "Bar pull"],
    ["knob-30", "Knob"],
  ] as const;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {offers.map(([id, label]) => (
          <Toggle key={id} on={selected === id} onClick={() => useUi.getState().setHardwareId(id)}>{label}</Toggle>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Click a face to place it. Hinges and slides note a neighbouring piece when one is close. Prices land on the shopping list.</p>
    </div>
  );
}

function StatusLine() {
  const tool = useUi((state) => state.tool);
  const modal = useUi((state) => state.modal);
  const hints: Record<string, string> = {
    select: "Middle mouse orbits · Shift+middle pans · wheel zooms · G R S",
    saw: "Click the board to cut · both lengths show on the blade · Enter cuts too",
    drill: "Ghost hole follows the face under the cursor · red will not fit",
    screw: "Ghost fastener · red means it does not reach a second piece",
    router: "Edge and face come from the cursor, not a fixed side",
    joint: "Ghost joint · first face, then the mate",
    hardware: "Ghost hardware on the face under the cursor",
    pencil: "Straight, freehand, or erase · marks travel with the piece",
    measure: "Tape keeps a dimension · speed square and combination square mark the face",
  };
  return (
    <div className="pointer-events-none absolute top-12 left-3 max-w-md rounded-md border bg-card/92 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
      <span className="nums text-foreground">{modal ? modalLabel(modal) : tool}</span>
      <span className="mx-2 text-border">·</span>
      {modal ? "X Y Z locks an axis. Type a value and press Enter. Esc cancels." : hints[tool]}
    </div>
  );
}

function PencilDock() {
  const mode = useUi((state) => state.pencilMode);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Toggle on={mode === "line"} onClick={() => useUi.getState().setPencilMode("line")}>Straight</Toggle>
        <Toggle on={mode === "freehand"} onClick={() => useUi.getState().setPencilMode("freehand")}>Freehand</Toggle>
        <Toggle on={mode === "erase"} onClick={() => useUi.getState().setPencilMode("erase")}>Erase</Toggle>
      </div>
      <p className="text-xs text-muted-foreground">Marks stay on the face when the piece moves. Straight is two clicks. Freehand is a drag. Erase removes the mark under the cursor. Esc drops a half-drawn line.</p>
    </div>
  );
}

function MeasureDock() {
  const mode = useUi((state) => state.measureMode);
  const angle = useUi((state) => state.angleDegrees);
  const offset = useUi((state) => state.offsetMm);
  const edge = useUi((state) => state.offsetEdge);
  const anchor = useUi((state) => state.measureAnchor);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Toggle on={mode === "tape"} onClick={() => useUi.getState().setMeasureMode("tape")}>Tape</Toggle>
        <Toggle on={mode === "angle"} onClick={() => useUi.getState().setMeasureMode("angle")}>Speed square</Toggle>
        <Toggle on={mode === "offset"} onClick={() => useUi.getState().setMeasureMode("offset")}>Combination square</Toggle>
      </div>
      {mode === "angle" ? (
        <div className="flex flex-wrap items-center gap-1">
          {[22.5, 26.6, 30, 45, 60].map((preset) => (
            <Toggle key={preset} on={angle === preset} onClick={() => useUi.getState().setAngleDegrees(preset)}>{preset === 26.6 ? "6/12" : `${preset}°`}</Toggle>
          ))}
          <NumberSlider label="Angle" value={angle} min={0} max={90} step={0.1} suffix="°" onCommit={(value) => useUi.getState().setAngleDegrees(value)} />
        </div>
      ) : null}
      {mode === "offset" ? (
        <div className="flex flex-wrap items-center gap-1">
          {(["left", "right", "start", "end"] as const).map((side) => (
            <Toggle key={side} on={edge === side} onClick={() => useUi.getState().setOffsetEdge(side)}>{side}</Toggle>
          ))}
          <NumberSlider label="Offset" value={offset} min={1} max={300} step={1} onCommit={(value) => useUi.getState().setOffsetMm(value)} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {mode === "tape"
          ? anchor ? "Click the second point. The dimension stays, and you can click the label to remove it." : "Click two points. The distance is kept on the pieces."
          : mode === "angle"
            ? "Hover shows the blade. Click to pencil that angle onto the face. 22.5° and 45° are the common stops. 6/12 is a rafter pitch."
            : "Hover shows the gauge line. Click to mark that offset from the chosen edge."}
      </p>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-lg border px-2 py-1 text-xs font-medium", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
    >
      {children}
    </button>
  );
}
