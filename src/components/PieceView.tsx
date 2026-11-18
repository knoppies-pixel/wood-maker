import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject, type Ref } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import { canPlaceHole, kerfAlong, preferLegalHole } from "../domain/operations.ts";
import { nearestPieceEdge, profileTarget, routeFits, sawDistanceFromStation, snapFaceHit, stationFromHit } from "../domain/picking.ts";
import { faceExtent, localCopies } from "../domain/modifiers.ts";
import { offsetOnFace } from "../domain/marks.ts";
import { buildMesh, faceUvFromLocal, holeLocalPoint, inwardNormal, softBoxHit } from "../domain/geometry.ts";
import type { HardwareItem, Hole, PencilMark, Piece } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type HoverHit } from "../store/useUi.ts";
import { FeatureMarks, HardwareMarks } from "./FeatureMarks.tsx";
import { PencilMarks } from "./Marks.tsx";
import { woodMaps } from "./wood.ts";

export const pieceGroups = new Map<string, THREE.Group>();
export const pieceMeshes = new Map<string, THREE.Mesh>();
/** Every visible copy, so a click or a screw ray hits the board you are looking at. */
export const hitMeshes = new Set<THREE.Mesh>();

export function rayTargets(): THREE.Mesh[] {
  return hitMeshes.size > 0 ? [...hitMeshes] : [...pieceMeshes.values()];
}

/** Set when a piece mesh handles a click, so an empty-canvas click does not immediately undo it. */
export let lastPiecePointer = 0;

export function PieceView({ piece }: { piece: Piece }) {
  const drag = useUi((state) => state.drag?.[piece.id]);
  const selection = useUi((state) => state.selection);
  const fasteners = useProject((state) => state.fasteners);
  const selected = selection === piece.id;
  const mate = !selected && selection !== null && joined(fasteners, selection, piece.id);
  const position = drag?.position ?? piece.position;
  const rotation = drag?.rotation ?? piece.rotation;
  const geometry = useMemo(() => toGeometry(piece), [piece]);
  const maps = useMemo(() => woodMaps(piece.species), [piece.species]);
  const faceMap = useMemo(() => {
    const map = maps.face.clone();
    map.needsUpdate = true;
    return map;
  }, [maps]);
  const tint = piece.finish?.treatment === "bare" ? "#ffffff" : piece.finish?.color ?? "#ffffff";
  const hardware = useProject((state) => state.hardware);
  const others = useProject((state) => state.pieces);
  const copies = localCopies(piece, others);
  const modal = useUi((state) => state.modal);
  const hovered = useUi((state) => state.hover?.pieceId === piece.id);
  const previewScale = modal?.pieceId === piece.id && modal.op === "scale" ? modal.scale : ([1, 1, 1] as const);
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useLayoutEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (group) pieceGroups.set(piece.id, group);
    if (mesh) pieceMeshes.set(piece.id, mesh);
    useUi.getState().bumpScene();
    return () => {
      if (pieceGroups.get(piece.id) === group) pieceGroups.delete(piece.id);
      if (mesh && pieceMeshes.get(piece.id) === mesh) pieceMeshes.delete(piece.id);
    };
  }, [piece.id]);

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={previewScale}>
      {copies.map((copy, index) => (
        <PieceCopy
          key={`${copy.position.join(":")}:${copy.rotation.join(":")}:${index}`}
          piece={piece}
          index={index}
          position={copy.position}
          rotation={copy.rotation}
          scale={copy.scale}
          geometry={geometry}
          faceMap={faceMap}
          edgeMap={maps.edge}
          tint={tint}
          selected={selected}
          hovered={hovered}
          mate={mate}
          hardware={hardware ?? []}
          meshRef={index === 0 ? meshRef : undefined}
        />
      ))}
    </group>
  );
}

function PieceCopy({
  piece,
  index,
  position,
  rotation,
  scale,
  geometry,
  faceMap,
  edgeMap,
  tint,
  selected,
  hovered,
  mate,
  hardware,
  meshRef,
}: {
  piece: Piece;
  index: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  geometry: THREE.BufferGeometry;
  faceMap: THREE.Texture;
  edgeMap: THREE.Texture;
  tint: string;
  selected: boolean;
  hovered: boolean;
  mate: boolean;
  hardware: HardwareItem[];
  meshRef?: Ref<THREE.Mesh>;
}) {
  const localRef = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const mesh = localRef.current;
    if (!mesh) return;
    hitMeshes.add(mesh);
    if (index === 0) pieceMeshes.set(piece.id, mesh);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (bounds) {
      mesh.raycast = (raycaster, intersects) => {
        const before = intersects.length;
        THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
        if (intersects.length > before) return;
        const inverse = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        const origin = raycaster.ray.origin.clone().applyMatrix4(inverse);
        const direction = raycaster.ray.direction.clone().transformDirection(inverse);
        const hit = softBoxHit(
          { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
          { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
          { x: origin.x, y: origin.y, z: origin.z },
          { x: direction.x, y: direction.y, z: direction.z },
          18,
        );
        if (!hit) return;
        const point = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).applyMatrix4(mesh.matrixWorld);
        const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).transformDirection(mesh.matrixWorld).normalize();
        intersects.push({
          distance: raycaster.ray.origin.distanceTo(point),
          point,
          object: mesh,
          face: { a: 0, b: 0, c: 0, normal, materialIndex: 0 },
        });
      };
    }
    return () => {
      hitMeshes.delete(mesh);
      if (pieceMeshes.get(piece.id) === mesh) pieceMeshes.delete(piece.id);
    };
  }, [piece.id, index, geometry]);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh
        ref={(node) => {
          localRef.current = node;
          if (typeof meshRef === "function") meshRef(node);
          else if (meshRef) (meshRef as MutableRefObject<THREE.Mesh | null>).current = node;
        }}
        geometry={geometry}
        castShadow
        receiveShadow
        userData={{ pieceId: piece.id }}
        onPointerDown={(event) => onPiecePointer(event, piece, "down")}
        onPointerMove={(event) => onPiecePointer(event, piece, "move")}
        onPointerUp={() => finishFreehand(piece)}
        onPointerOut={() => {
          const hover = useUi.getState().hover;
          if (hover?.pieceId === piece.id) useUi.getState().setHover(null);
        }}
      >
        <meshStandardMaterial attach="material-0" map={faceMap} color={tint} roughness={piece.finish?.treatment === "paint" ? 0.42 : 0.78} metalness={0.02} emissive={selected || hovered ? "#e26a1a" : "#000000"} emissiveIntensity={selected ? 0.16 : hovered ? 0.08 : 0} side={THREE.DoubleSide} />
        <meshStandardMaterial attach="material-1" map={edgeMap} color={tint} roughness={0.86} metalness={0} side={THREE.DoubleSide} />
        {selected || hovered || mate ? <Edges threshold={15} color={selected ? "#f08a2a" : "#e2b15a"} /> : null}
      </mesh>
      {(piece.holes ?? []).map((hole) => <HoleMark key={hole.id} piece={piece} hole={hole} />)}
      <FeatureMarks piece={piece} />
      <HardwareMarks piece={piece} items={hardware} />
      <PencilMarks piece={piece} annotate={index === 0} />
    </group>
  );
}

function HoleMark({ piece, hole }: { piece: Piece; hole: Hole }) {
  const point = holeLocalPoint(piece, hole.face, hole.u, hole.v);
  const inward = inwardNormal(hole.face, piece);
  const mouth = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-inward.x, -inward.y, -inward.z).normalize()),
    [inward.x, inward.y, inward.z],
  );
  const barrel = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(inward.x, inward.y, inward.z).normalize()),
    [inward.x, inward.y, inward.z],
  );
  const radius = hole.diameter / 2;
  const style = hole.style ?? "twist";
  const mouthRadius = (hole.secondaryDiameter ?? hole.diameter * (style === "countersink" ? 2 : 1.15)) / 2;
  if (style === "hole-saw") {
    return (
      <group position={[point.x, point.y, point.z]}>
        <mesh quaternion={mouth} raycast={() => null}>
          <ringGeometry args={[radius * 0.92, radius * 1.05, 32]} />
          <meshBasicMaterial color="#140e0a" side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[point.x, point.y, point.z]}>
      <mesh quaternion={mouth} position={[-inward.x * 0.3, -inward.y * 0.3, -inward.z * 0.3]} raycast={() => null}>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color="#140e0a" side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      <mesh quaternion={mouth} position={[-inward.x * 0.35, -inward.y * 0.35, -inward.z * 0.35]} raycast={() => null}>
        <ringGeometry args={[radius * 0.92, radius * 1.18, 28]} />
        <meshBasicMaterial color="#3a2414" side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      {style === "countersink" ? (
        <mesh quaternion={barrel} position={[inward.x * 1.2, inward.y * 1.2, inward.z * 1.2]} raycast={() => null}>
          <cylinderGeometry args={[radius, mouthRadius, 2.4, 24]} />
          <meshStandardMaterial color="#d5dbe1" metalness={0.2} roughness={0.4} />
        </mesh>
      ) : null}
      {style === "forstner" ? (
        <mesh quaternion={mouth} raycast={() => null}>
          <ringGeometry args={[radius * 0.96, radius * 1.12, 28]} />
          <meshBasicMaterial color="#1a120c" side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
        </mesh>
      ) : null}
      <mesh quaternion={barrel} position={[inward.x * (hole.depth / 2), inward.y * (hole.depth / 2), inward.z * (hole.depth / 2)]} raycast={() => null}>
        <cylinderGeometry args={[radius * 0.92, radius * 0.92, hole.depth, 20]} />
        <meshBasicMaterial color="#1a120c" />
      </mesh>
    </group>
  );
}

function onPiecePointer(event: ThreeEvent<PointerEvent>, piece: Piece, kind: "down" | "move") {
  event.stopPropagation();
  if (kind === "down") lastPiecePointer = performance.now();
  if (useUi.getState().modal) return;
  const tool = useUi.getState().tool;
  const hit = readHit(event, piece);
  if (hit) useUi.getState().setHover(hit);
  if (kind === "move" && tool === "pencil" && hit && useUi.getState().pencilDrawing && useUi.getState().pencilFace === hit.face) {
    const draft = useUi.getState().pencilDraft ?? [];
    const last = draft[draft.length - 1];
    if (!last || Math.hypot(last.u - hit.u, last.v - hit.v) > 2) useUi.getState().setPencilDraft([...draft, { u: hit.u, v: hit.v }]);
    return;
  }
  const sawMode = useUi.getState().sawMode;
  if (tool === "saw" && hit && (sawMode === "crosscut" || sawMode === "rip") && (kind === "move" || kind === "down")) {
    rememberSawStation(piece, hit.face, hit.u, hit.v, sawMode);
    if (kind === "move") return;
    useUi.getState().select(piece.id);
    commitSaw(piece);
    return;
  }
  if (kind === "down" && tool === "saw" && useUi.getState().sawMode === "curve" && hit?.face === "top") {
    event.stopPropagation();
    const points = useUi.getState().curvePoints;
    useUi.getState().setCurvePoints([...points, { u: hit.u, v: hit.v }]);
    useUi.getState().select(piece.id);
    return;
  }
  if (kind === "down" && (tool === "select" || tool === "saw")) {
    useUi.getState().select(piece.id);
    return;
  }
  if (!hit) return;
  if (kind === "move") return;
  if (tool === "drill") {
    const ui = useUi.getState();
    const result = useProject.getState().drillHole(piece.id, {
      face: hit.face,
      u: hit.u,
      v: hit.v,
      diameter: ui.drillDiameter,
      depth: ui.drillStyle === "hole-saw" ? 999 : ui.drillDepth,
      through: ui.drillThrough || ui.drillStyle === "hole-saw",
      style: ui.drillStyle,
      secondaryDiameter: ui.drillStyle === "countersink" ? ui.countersinkDiameter : undefined,
    });
    if (result.ok) toast.success(result.message ?? "Hole drilled");
    else toast.error(result.message);
    useUi.getState().select(piece.id);
    return;
  }
  if (tool === "screw") {
    placeScrew(event, piece, hit);
    return;
  }
  if (tool === "router") {
    const ui = useUi.getState();
    const arris = profileTarget(piece, hit.face, hit.u, hit.v);
    const result = ui.routerKind === "profile"
      ? useProject.getState().addProfile(piece.id, ui.profile, arris.edge, ui.profileRadius, arris.side)
      : useProject.getState().addRoute(piece.id, {
          kind: ui.routerKind,
          face: hit.face,
          u: hit.u,
          v: hit.v,
          length: ui.routerLength,
          width: ui.routerWidth,
          depth: ui.routerDepth,
          edge: hit.edge,
        });
    if (result.ok) toast.success(result.message ?? "Routed");
    else toast.error(result.message);
    useUi.getState().select(piece.id);
    return;
  }
  if (tool === "joint") {
    const ui = useUi.getState();
    if (!ui.jointFirst) {
      useUi.getState().setJointFirst({ pieceId: piece.id, face: hit.face, u: hit.u, v: hit.v });
      toast.success(`Marked ${piece.name}. Click the other piece.`);
      return;
    }
    if (ui.jointFirst.pieceId === piece.id) {
      toast("Click the other piece, not this one again.");
      return;
    }
    const along = hit.face === "left" || hit.face === "right" ? hit.u : hit.v;
    const secondFace = (ui.jointKind === "mortise-tenon" || ui.jointKind === "dovetail") && hit.face !== "start" && hit.face !== "end"
      ? along < piece.length / 2 ? "start" : "end"
      : hit.face;
    const result = useProject.getState().join(ui.jointKind, ui.jointFirst.pieceId, ui.jointFirst.face, ui.jointFirst, piece.id, secondFace, hit, ui.drillDiameter);
    if (result.ok) toast.success(result.message ?? "Joint cut");
    else toast.error(result.message);
    useUi.getState().setJointFirst(null);
    return;
  }
  if (tool === "pencil") {
    drawPencil(piece, hit);
    return;
  }
  if (tool === "measure") {
    measure(piece, hit);
    return;
  }
  if (tool === "hardware") {
    const result = useProject.getState().addHardware(useUi.getState().hardwareId, piece.id, hit.face, hit);
    if (result.ok) toast.success(result.message ?? "Hardware placed");
    else toast.error(result.message);
    useUi.getState().select(piece.id);
  }
}

function placeScrew(event: ThreeEvent<PointerEvent>, piece: Piece, hit: HoverHit) {
  const ui = useUi.getState();
  const length = ui.screwLength;
  const normal = new THREE.Vector3(...hit.normal).normalize();
  const pocket = ui.fastenerKind === "pocket-screw";
  const direction = normal.clone().negate();
  if (pocket) direction.applyAxisAngle(new THREE.Vector3(1, 0, 0), (15 * Math.PI) / 180);
  const origin = event.point.clone().addScaledVector(direction, 0.4);
  const raycaster = new THREE.Raycaster(origin, direction, 0, length + 80);
  const hits = raycaster.intersectObjects(rayTargets(), false);
  const other = hits.find((item) => item.object.userData.pieceId !== piece.id);
  if (!other) {
    toast.error("No second piece on that line. Butt the parts together and click the outside face.");
    return;
  }
  if (other.distance > length - 2) {
    toast.error(`That screw stops short. Use at least ${Math.ceil(other.distance + 12)} mm.`);
    return;
  }
  const group = pieceGroups.get(piece.id);
  if (!group) return;
  const localPosition = group.worldToLocal(event.point.clone());
  const localDirection = direction.clone().transformDirection(new THREE.Matrix4().copy(group.matrixWorld).invert());
  const embed = length - other.distance;
  const kind = ui.fastenerKind;
  if (kind === "glue") {
    const glued = useProject.getState().addScrew({
      type: "glue",
      pieceAId: piece.id,
      pieceBId: String(other.object.userData.pieceId),
      localPosition: [localPosition.x, localPosition.y, localPosition.z],
      localDirection: [localDirection.x, localDirection.y, localDirection.z],
      diameter: 0,
      length: 0,
    });
    if (glued.ok) toast.success(glued.message ?? "Glued");
    else toast.error(glued.message);
    return;
  }
  const result = useProject.getState().addScrew({
    type: kind,
    pieceAId: piece.id,
    pieceBId: String(other.object.userData.pieceId),
    localPosition: [localPosition.x, localPosition.y, localPosition.z],
    localDirection: [localDirection.x, localDirection.y, localDirection.z],
    diameter: ui.screwDiameter,
    length,
    angle: pocket ? 15 : undefined,
  });
  if (result.ok) toast.success(`${result.message ?? "Screwed."} About ${Math.round(embed)} mm of thread in the second piece.`);
  else toast.error(result.message);
  useUi.getState().select(piece.id);
}

function readHit(event: ThreeEvent<PointerEvent>, piece: Piece): HoverHit | null {
  const face = event.face;
  const parent = event.object.parent;
  if (!face || !parent) return null;
  const local = parent.worldToLocal(event.point.clone());
  const uv = faceUvFromLocal(piece, { x: local.x, y: local.y, z: local.z }, { x: face.normal.x, y: face.normal.y, z: face.normal.z });
  if (!uv) return null;
  const ui = useUi.getState();
  const anySnap = ui.snapVertices || ui.snapMidpoints || ui.snapEdges || ui.snapCentres || ui.snapGrid || ui.snapMarks || ui.snapDimensions;
  const forceAll = ui.ctrlDown && !anySnap;
  const snapped = snapFaceHit(
    piece,
    uv.face,
    uv.u,
    uv.v,
    {
      enabled: ui.ctrlDown ? !anySnap : anySnap,
      vertices: forceAll || ui.snapVertices,
      midpoints: forceAll || ui.snapMidpoints,
      edges: forceAll || ui.snapEdges,
      centres: forceAll || ui.snapCentres,
      grid: forceAll || ui.snapGrid,
      marks: forceAll || ui.snapMarks,
      gridSize: ui.gridSize,
    },
    piece.marks ?? [],
    forceAll || ui.snapDimensions
      ? (useProject.getState().dimensions ?? [])
        .flatMap((note) => [note.a, note.b])
        .filter((anchor) => anchor.pieceId === piece.id && anchor.face === uv.face)
        .map((anchor) => ({ u: anchor.u, v: anchor.v }))
      : [],
  );
  const tool = ui.tool;
  const drillDepth = ui.drillStyle === "hole-saw" ? piece.thickness : ui.drillDepth;
  const drillPoint = tool === "drill"
    ? preferLegalHole(piece, uv.face, uv, snapped, ui.drillDiameter, drillDepth)
    : { u: snapped.u, v: snapped.v, keepSnap: snapped.snap != null };
  const u = drillPoint.u;
  const v = drillPoint.v;
  const edge = drillPoint.keepSnap && snapped.snap ? snapped.edge : nearestPieceEdge(piece, uv.face, u, v);
  const worldNormal = face.normal.clone().transformDirection(event.object.matrixWorld);
  let valid = true;
  if (tool === "router") valid = ui.routerKind === "profile" ? ui.profileRadius < piece.thickness / 2 : routeFits(piece, ui.routerDepth);
  if (tool === "drill") {
    valid = canPlaceHole(piece, {
      face: uv.face,
      u,
      v,
      diameter: ui.drillDiameter,
      depth: drillDepth,
    }) === null;
  }
  if (tool === "joint") valid = piece.thickness >= 8;
  if (tool === "screw" && ui.fastenerKind !== "glue") {
    const direction = worldNormal.clone().negate();
    const raycaster = new THREE.Raycaster(event.point.clone().addScaledVector(direction, 0.4), direction, 0, ui.screwLength + 4);
    valid = raycaster.intersectObjects(rayTargets(), false).some((item) => item.object.userData.pieceId !== piece.id && item.distance <= ui.screwLength - 2);
  }
  const placed = holeLocalPoint(piece, uv.face, u, v);
  const world = parent.localToWorld(new THREE.Vector3(placed.x, placed.y, placed.z));
  return {
    pieceId: piece.id,
    face: uv.face,
    u,
    v,
    point: [world.x, world.y, world.z],
    normal: [worldNormal.x, worldNormal.y, worldNormal.z],
    edge,
    snap: drillPoint.keepSnap ? snapped.snap : null,
    valid,
  };
}

function finishFreehand(piece: Piece): void {
  const ui = useUi.getState();
  if (ui.tool !== "pencil" || !ui.pencilDrawing) return;
  const draft = ui.pencilDraft ?? [];
  useUi.getState().setPencilDrawing(false);
  useUi.getState().setPencilDraft(null, null, null);
  if (draft.length < 2 || ui.pencilFace == null) return;
  useProject.getState().addMark(piece.id, { face: ui.pencilFace, kind: "freehand", points: draft });
}

function drawPencil(piece: Piece, hit: HoverHit): void {
  const ui = useUi.getState();
  useUi.getState().select(piece.id);
  if (ui.pencilMode === "erase") {
    const mark = nearestMark(piece, hit);
    if (!mark) {
      toast.error("No pencil mark under the cursor.");
      return;
    }
    useProject.getState().removeMark(piece.id, mark.id);
    return;
  }
  if (ui.pencilMode === "freehand") {
    useUi.getState().setPencilDraft([{ u: hit.u, v: hit.v }], piece.id, hit.face);
    useUi.getState().setPencilDrawing(true);
    return;
  }
  if (!ui.pencilDraft || ui.pencilPieceId !== piece.id || ui.pencilFace !== hit.face) {
    useUi.getState().setPencilDraft([{ u: hit.u, v: hit.v }], piece.id, hit.face);
    return;
  }
  const start = ui.pencilDraft[0];
  if (!start) return;
  useProject.getState().addMark(piece.id, { face: hit.face, kind: "line", points: [start, { u: hit.u, v: hit.v }] });
  useUi.getState().setPencilDraft(null, null, null);
  toast.success("Pencil line marked.");
}

function measure(piece: Piece, hit: HoverHit): void {
  const ui = useUi.getState();
  useUi.getState().select(piece.id);
  if (ui.measureMode === "tape") {
    if (!ui.measureAnchor) {
      useUi.getState().setMeasureAnchor({ pieceId: piece.id, face: hit.face, u: hit.u, v: hit.v });
      toast.success("First point. Click the second.");
      return;
    }
    useProject.getState().addDimension({
      a: ui.measureAnchor,
      b: { pieceId: piece.id, face: hit.face, u: hit.u, v: hit.v },
    });
    useUi.getState().setMeasureAnchor(null);
    toast.success("Dimension kept. Click it to remove it.");
    return;
  }
  if (ui.measureMode === "angle") {
    const size = faceExtent(hit.face, piece);
    const radians = (ui.angleDegrees * Math.PI) / 180;
    const length = Math.min(size.u, size.v) * 0.7;
    const end = {
      u: Math.min(size.u, Math.max(0, hit.u + Math.cos(radians) * length)),
      v: Math.min(size.v, Math.max(0, hit.v + Math.sin(radians) * length)),
    };
    useProject.getState().addMark(piece.id, { face: hit.face, kind: "line", points: [{ u: hit.u, v: hit.v }, end], label: `${ui.angleDegrees}°` });
    toast.success(`${ui.angleDegrees}° marked on the face.`);
    return;
  }
  const edge = nearestPieceEdge(piece, hit.face, hit.u, hit.v);
  useUi.getState().setOffsetEdge(edge);
  const points = offsetOnFace(hit.face, piece, hit.u, hit.v, ui.offsetMm);
  useProject.getState().addMark(piece.id, { face: hit.face, kind: "line", points, label: `${ui.offsetMm} mm` });
  toast.success(`Offset ${ui.offsetMm} mm from the nearest edge.`);
}

function rememberSawStation(piece: Piece, face: Piece["holes"][number]["face"], u: number, v: number, mode: "crosscut" | "rip"): void {
  const ui = useUi.getState();
  const station = stationFromHit(piece, face, u, v, mode);
  const kerf = useProject.getState().kerf;
  const consumed = mode === "crosscut" ? kerfAlong(kerf, ui.sawMitre, ui.sawBevel) : kerf;
  const distance = sawDistanceFromStation(piece.length, mode, ui.sawFrom, station, consumed);
  useUi.getState().setSawDistance(Math.max(1, distance));
}

function commitSaw(piece: Piece): void {
  const ui = useUi.getState();
  if (ui.sawMode !== "crosscut" && ui.sawMode !== "rip") return;
  const kerf = useProject.getState().kerf;
  const consumed = ui.sawMode === "crosscut" ? kerfAlong(kerf, ui.sawMitre, ui.sawBevel) : kerf;
  const distance = ui.sawMode === "rip" || ui.sawFrom === "start" ? ui.sawDistance : piece.length - ui.sawDistance - consumed;
  const result = useProject.getState().cutPiece(piece.id, ui.sawMode === "rip" ? "rip" : "crosscut", distance, ui.sawMode === "crosscut" ? ui.sawMitre : 0, ui.sawBevel);
  if (!result.ok) toast.error(result.message);
  else {
    toast.success(result.message ?? "Cut");
    if (result.selectId) useUi.getState().select(result.selectId);
  }
}

function nearestMark(piece: Piece, hit: HoverHit): PencilMark | null {
  let best: PencilMark | null = null;
  let bestDistance = 14;
  for (const mark of piece.marks ?? []) {
    if (mark.face !== hit.face) continue;
    for (const point of mark.points) {
      const distance = Math.hypot(point.u - hit.u, point.v - hit.v);
      if (distance < bestDistance) {
        best = mark;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function toGeometry(piece: Piece): THREE.BufferGeometry {
  const data = buildMesh(piece);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  for (const group of data.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  return geometry;
}

function joined(fasteners: { pieceAId: string; pieceBId: string }[], selected: string, pieceId: string): boolean {
  const seen = new Set<string>();
  const stack = [selected];
  const adjacent = new Map<string, string[]>();
  for (const fastener of fasteners) {
    const a = adjacent.get(fastener.pieceAId) ?? [];
    const b = adjacent.get(fastener.pieceBId) ?? [];
    a.push(fastener.pieceBId);
    b.push(fastener.pieceAId);
    adjacent.set(fastener.pieceAId, a);
    adjacent.set(fastener.pieceBId, b);
  }
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === pieceId) return true;
    seen.add(id);
    for (const next of adjacent.get(id) ?? []) stack.push(next);
  }
  return false;
}
