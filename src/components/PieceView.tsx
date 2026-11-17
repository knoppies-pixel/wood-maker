import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import * as THREE from "three";
import { buildMesh, faceUvFromLocal, holeLocalPoint, inwardNormal } from "../domain/geometry.ts";
import type { Hole, Piece } from "../domain/types.ts";
import { useProject } from "../store/useProject.ts";
import { useUi, type HoverHit } from "../store/useUi.ts";
import { woodMaps } from "./wood.ts";

export const pieceGroups = new Map<string, THREE.Group>();
export const pieceMeshes = new Map<string, THREE.Mesh>();

export function PieceView({ piece }: { piece: Piece }) {
  const drag = useUi((state) => state.drag?.[piece.id]);
  const selection = useUi((state) => state.selection);
  const fasteners = useProject((state) => state.fasteners);
  const selected = selection === piece.id;
  const mate = !selected && selection !== null && joined(fasteners, selection, piece.id);
  const position = drag?.position ?? piece.position;
  const rotation = drag?.rotation ?? piece.rotation;
  const geometry = useMemo(() => toGeometry(piece), [piece.length, piece.width, piece.thickness, piece.mitreStart, piece.mitreEnd]);
  const maps = useMemo(() => woodMaps(piece.species), [piece.species]);
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
    <group ref={groupRef} position={position} rotation={rotation}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        castShadow
        receiveShadow
        userData={{ pieceId: piece.id }}
        onPointerDown={(event) => onPiecePointer(event, piece, "down")}
        onPointerMove={(event) => onPiecePointer(event, piece, "move")}
        onPointerOut={() => {
          const hover = useUi.getState().hover;
          if (hover?.pieceId === piece.id) useUi.getState().setHover(null);
        }}
      >
        <meshStandardMaterial attach="material-0" map={maps.face} roughness={0.86} metalness={0} emissive={selected ? "#6a3b16" : "#000000"} emissiveIntensity={selected ? 0.12 : 0} />
        <meshStandardMaterial attach="material-1" map={maps.edge} roughness={0.92} metalness={0} />
        {(selected || mate) && <Edges threshold={20} color={selected ? "#7a3414" : "#c4844a"} />}
      </mesh>
      {piece.holes.map((hole) => (
        <HoleMark key={hole.id} piece={piece} hole={hole} />
      ))}
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
      <mesh quaternion={barrel} position={[inward.x * (hole.depth / 2), inward.y * (hole.depth / 2), inward.z * (hole.depth / 2)]} raycast={() => null}>
        <cylinderGeometry args={[radius * 0.92, radius * 0.92, hole.depth, 20]} />
        <meshBasicMaterial color="#1a120c" />
      </mesh>
    </group>
  );
}

function onPiecePointer(event: ThreeEvent<PointerEvent>, piece: Piece, kind: "down" | "move") {
  event.stopPropagation();
  const tool = useUi.getState().tool;
  if (kind === "down" && (tool === "select" || tool === "saw")) {
    useUi.getState().select(piece.id);
    return;
  }
  const hit = readHit(event, piece);
  if (!hit) return;
  if (tool === "drill" || tool === "screw") useUi.getState().setHover(hit);
  if (kind === "move") return;
  if (tool === "drill") {
    const ui = useUi.getState();
    const result = useProject.getState().drillHole(piece.id, {
      face: hit.face,
      u: hit.u,
      v: hit.v,
      diameter: ui.drillDiameter,
      depth: ui.drillDepth,
      through: ui.drillThrough,
    });
    if (result.ok) toast.success(result.message ?? "Hole drilled");
    else toast.error(result.message);
    useUi.getState().select(piece.id);
    return;
  }
  if (tool === "screw") placeScrew(event, piece, hit);
}

function placeScrew(event: ThreeEvent<PointerEvent>, piece: Piece, hit: HoverHit) {
  const length = useUi.getState().screwLength;
  const normal = new THREE.Vector3(...hit.normal).normalize();
  const direction = normal.clone().negate();
  const origin = event.point.clone().addScaledVector(direction, 0.4);
  const raycaster = new THREE.Raycaster(origin, direction, 0, length + 80);
  const hits = raycaster.intersectObjects([...pieceMeshes.values()], false);
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
  const result = useProject.getState().addScrew({
    pieceAId: piece.id,
    pieceBId: String(other.object.userData.pieceId),
    localPosition: [localPosition.x, localPosition.y, localPosition.z],
    localDirection: [localDirection.x, localDirection.y, localDirection.z],
    diameter: useUi.getState().screwDiameter,
    length,
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
  const worldNormal = face.normal.clone().transformDirection(event.object.matrixWorld);
  return {
    pieceId: piece.id,
    face: uv.face,
    u: uv.u,
    v: uv.v,
    point: [event.point.x, event.point.y, event.point.z],
    normal: [worldNormal.x, worldNormal.y, worldNormal.z],
  };
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
