import { ContactShadows, Grid, Html, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { faceSize, localToWorld, rayDistanceOnAxis, snapTranslation } from "../domain/geometry.ts";
import { DEG, clamp, formatMm } from "../domain/math.ts";
import { connectedIds, kerfAlong } from "../domain/operations.ts";
import { MIN_PART_MM, type Piece, type Vec3Tuple } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type DragPose } from "../store/useUi.ts";
import { PieceView, pieceGroups } from "./PieceView.tsx";
import { cn } from "cn";

export function Viewport() {
  const pieces = useProject((state) => state.pieces);
  const tool = useUi((state) => state.tool);
  const selection = useUi((state) => state.selection);
  useUi((state) => state.sceneEpoch);
  const [resetSignal, setResetSignal] = useState(0);
  const selected = pieces.find((piece) => piece.id === selection) ?? null;

  useEffect(() => {
    if (selection && !pieces.some((piece) => piece.id === selection)) useUi.getState().select(null);
  }, [pieces, selection]);

  return (
    <div className="relative min-w-0 flex-1 bg-[#e7dcc8]">
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [980, 760, 1280], fov: 38, near: 8, far: 20000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={(event) => {
          if (event.type === "click" && useUi.getState().tool === "select") useUi.getState().select(null);
        }}
      >
        <color attach="background" args={["#e7dcc8"]} />
        <hemisphereLight args={["#f8f3e8", "#b89a74", 0.8]} />
        <ambientLight intensity={0.28} />
        <directionalLight position={[1800, 3200, 1400]} intensity={1.55} />
        <directionalLight position={[-1600, 800, -900]} intensity={0.32} color="#f0d2a4" />
        <Grid
          args={[10, 10]}
          cellSize={100}
          cellThickness={0.6}
          cellColor="#c9b79a"
          sectionSize={500}
          sectionThickness={1.25}
          sectionColor="#8d7358"
          fadeDistance={8000}
          fadeStrength={1.5}
          infiniteGrid
          position={[0, -0.4, 0]}
          raycast={() => null}
        />
        <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={8000} blur={2.2} far={700} color="#3a291c" resolution={1024} />
        {pieces.map((piece) => (
          <PieceView key={piece.id} piece={piece} />
        ))}
        <Fasteners />
        {tool === "saw" && selected ? <SawPreview piece={selected} /> : null}
        <Ghosts />
        {tool === "select" && selected ? <MoveGizmo pieceId={selected.id} /> : null}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={80} maxDistance={16000} />
        <ViewRig signal={resetSignal} />
      </Canvas>

      {pieces.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border bg-card/90 px-5 py-4 text-center shadow-sm backdrop-blur-sm">
            <div className="font-display text-2xl">The bench is clear</div>
            <p className="mt-1 text-sm text-muted-foreground">Choose a length on the left. It arrives full size, and you shape it with the saw, drill and screws.</p>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-3 left-3 rounded-full border bg-card/85 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
        Grid 100 mm · bold lines 500 mm · all units mm
      </div>
      <button
        type="button"
        className="absolute top-3 right-3 rounded-full border bg-card/85 px-3 py-1 text-xs shadow-sm backdrop-blur-sm hover:bg-accent"
        onClick={() => setResetSignal((value) => value + 1)}
      >
        Reset view
      </button>
      <ToolDock />
    </div>
  );
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
        const ids = connectedIds(useProject.getState().fasteners, pieceId);
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
  const from = useUi((state) => state.sawFrom);
  const mode = useUi((state) => state.sawMode);
  const kerf = useProject((state) => state.kerf);
  const consumed = mode === "rip" ? kerf : kerfAlong(kerf, mitre);
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
        rotation={mode === "crosscut" ? [0, mitre * DEG, 0] : [0, Math.PI / 2, 0]}
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
      <Html position={[marker[0], piece.thickness / 2 + 28, marker[2]]} center style={{ pointerEvents: "none" }}>
        <div className="nums rounded-full bg-[#3a2718] px-2 py-0.5 text-xs font-semibold text-[#f6efe4]">{formatMm(distance)} mm</div>
      </Html>
    </group>
  );
}

function Ghosts() {
  const tool = useUi((state) => state.tool);
  const hover = useUi((state) => state.hover);
  const diameter = useUi((state) => state.drillDiameter);
  const depth = useUi((state) => state.drillDepth);
  const through = useUi((state) => state.drillThrough);
  const piece = useProject((state) => state.pieces.find((item) => item.id === hover?.pieceId));
  if (!hover || !piece || (tool !== "drill" && tool !== "screw")) return null;
  if (tool === "screw") {
    return (
      <mesh position={hover.point} raycast={() => null}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#d7dde3" transparent opacity={0.85} />
      </mesh>
    );
  }
  const size = faceSize(piece, hover.face);
  const holeDepth = through ? size.depth : Math.min(depth, size.depth);
  const normal = new THREE.Vector3(...hover.normal).normalize();
  const inward = normal.clone().negate();
  const center = new THREE.Vector3(...hover.point).addScaledVector(inward, holeDepth / 2);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
  return (
    <mesh position={center} quaternion={quaternion} raycast={() => null}>
      <cylinderGeometry args={[diameter / 2, diameter / 2, Math.max(holeDepth, 1), 20]} />
      <meshBasicMaterial color="#9a3412" transparent opacity={0.45} />
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
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur-md">
        {tool === "select" ? <SelectDock /> : null}
        {tool === "saw" ? <SawDock piece={piece} /> : null}
        {tool === "drill" ? <DrillDock /> : null}
        {tool === "screw" ? <ScrewDock /> : null}
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
  const kerf = useProject((state) => state.kerf);
  const span = piece ? (mode === "rip" ? piece.width : piece.length) : 0;
  const consumed = piece && mode === "crosscut" ? kerfAlong(kerf, mitre) : kerf;
  const max = piece ? Math.max(MIN_PART_MM, span - consumed - MIN_PART_MM) : MIN_PART_MM;
  const head = mode === "rip" || from === "start" ? distance : piece ? piece.length - distance - consumed : 0;
  const tail = piece ? span - head - consumed : 0;

  function cut() {
    if (!piece) {
      toast.error("Select a piece to cut.");
      return;
    }
    const result = useProject.getState().cutPiece(piece.id, mode, head, mode === "crosscut" ? mitre : 0);
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
        {mode === "crosscut" ? (
          <Toggle on={from === "end"} onClick={() => useUi.getState().setSawFrom(from === "start" ? "end" : "start")}>
            {from === "start" ? "From reference end" : "From far end"}
          </Toggle>
        ) : null}
        <span className="nums text-sm font-semibold">{piece ? `${formatMm(distance)} mm` : "No piece"}</span>
      </div>
      <Slider
        min={MIN_PART_MM}
        max={Math.max(MIN_PART_MM + 1, max)}
        step={1}
        value={[clamp(distance, MIN_PART_MM, max)]}
        onValueChange={(value) => useUi.getState().setSawDistance(value[0] ?? distance)}
        disabled={!piece}
      />
      {mode === "crosscut" ? (
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          Mitre {formatMm(mitre, 0)}°
          <Slider min={-60} max={60} step={1} value={[mitre]} onValueChange={(value) => useUi.getState().setSawMitre(value[0] ?? 0)} />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nums text-xs text-muted-foreground">
          {piece
            ? mode === "rip"
              ? `Left ${formatMm(head)} mm · kerf ${formatMm(consumed)} · right ${formatMm(tail)} mm`
              : `Keep ${formatMm(head)} mm · kerf ${formatMm(consumed)} along the board · offcut ${formatMm(tail)} mm`
            : "Click the piece you want to cut. The brass dot is the reference end."}
        </p>
        <Button size="sm" disabled={!piece} onClick={cut}>
          Cut
        </Button>
      </div>
    </div>
  );
}

function DrillDock() {
  const diameter = useUi((state) => state.drillDiameter);
  const depth = useUi((state) => state.drillDepth);
  const through = useUi((state) => state.drillThrough);
  return (
    <div className="flex flex-col gap-2">
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
      <label className="flex items-center gap-3 text-xs text-muted-foreground">
        Depth {through ? "through" : `${formatMm(depth)} mm`}
        <Slider min={2} max={80} step={1} disabled={through} value={[depth]} onValueChange={(value) => useUi.getState().setDrillDepth(value[0] ?? depth)} />
      </label>
      <p className="text-xs text-muted-foreground">Click a face. The hole is measured from the left and from the reference end, and stored on the piece.</p>
    </div>
  );
}

function ScrewDock() {
  const diameter = useUi((state) => state.screwDiameter);
  const length = useUi((state) => state.screwLength);
  const presets = [30, 40, 50, 60, 70, 80, 90, 100];
  return (
    <div className="flex flex-col gap-2">
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
      <p className="text-xs text-muted-foreground">
        {diameter}×{length} mm. Click the outside face so the screw travels into the piece behind it.
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
