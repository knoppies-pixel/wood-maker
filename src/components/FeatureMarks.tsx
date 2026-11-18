import { useMemo } from "react";
import * as THREE from "three";
import { holeLocalPoint, inwardNormal } from "../domain/geometry.ts";
import type { EdgeProfile, HardwareItem, JoineryFeature, Piece, RouterCut } from "../domain/types.ts";

export function FeatureMarks({ piece }: { piece: Piece }) {
  return (
    <group>
      {(piece.routes ?? []).map((route) => (
        <RouteMark key={route.id} piece={piece} route={route} />
      ))}
      {(piece.profiles ?? []).map((profile) => (
        <ProfileMark key={profile.id} piece={piece} profile={profile} />
      ))}
      {(piece.joinery ?? []).map((feature) => (
        <JointMark key={feature.id} piece={piece} feature={feature} />
      ))}
    </group>
  );
}

export function HardwareMarks({ piece, items }: { piece: Piece; items: HardwareItem[] }) {
  return (
    <group>
      {items.filter((item) => item.pieceId === piece.id).map((item) => (
        <HardwareMark key={item.id} piece={piece} item={item} />
      ))}
    </group>
  );
}

function RouteMark({ piece, route }: { piece: Piece; route: RouterCut }) {
  const y = (piece.thickness / 2 - route.depth / 2) * (route.face === "bottom" ? -1 : 1);
  if (route.kind === "groove") {
    return (
      <mesh position={[-piece.width / 2 + route.u, y, 0]} raycast={() => null}>
        <boxGeometry args={[route.width, route.depth + 0.2, piece.length + 0.6]} />
        <meshBasicMaterial color="#4a3022" />
      </mesh>
    );
  }
  if (route.kind === "rebate") {
    const alongX = route.edge === "left" || route.edge === "right";
    const x = route.edge === "left" ? -piece.width / 2 + route.width / 2 : route.edge === "right" ? piece.width / 2 - route.width / 2 : 0;
    const z = route.edge === "start" ? -piece.length / 2 + route.width / 2 : route.edge === "end" ? piece.length / 2 - route.width / 2 : 0;
    return (
      <mesh position={[x, y, z]} raycast={() => null}>
        <boxGeometry args={alongX ? [route.width, route.depth + 0.2, piece.length + 0.6] : [piece.width + 0.6, route.depth + 0.2, route.width]} />
        <meshBasicMaterial color="#4a3022" />
      </mesh>
    );
  }
  return (
    <mesh position={[0, y, -piece.length / 2 + route.v]} raycast={() => null}>
      <boxGeometry args={[piece.width + 0.6, route.depth + 0.2, route.width]} />
      <meshBasicMaterial color="#4a3022" />
    </mesh>
  );
}

function ProfileMark({ piece, profile }: { piece: Piece; profile: EdgeProfile }) {
  const y = piece.thickness / 2 - profile.radius * 0.35;
  const alongLength = profile.edge === "left" || profile.edge === "right";
  const x = profile.edge === "left" ? -piece.width / 2 : profile.edge === "right" ? piece.width / 2 : 0;
  const z = profile.edge === "start" ? -piece.length / 2 : profile.edge === "end" ? piece.length / 2 : 0;
  const length = alongLength ? piece.length : piece.width;
  const rotation: [number, number, number] = alongLength ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  if (profile.profile === "chamfer") {
    return (
      <mesh position={[x, piece.thickness / 2, z]} rotation={[0, alongLength ? 0 : Math.PI / 2, Math.PI / 4]} raycast={() => null}>
        <boxGeometry args={[profile.radius * 1.4, profile.radius * 0.4, length]} />
        <meshStandardMaterial color="#d7b48a" roughness={0.7} />
      </mesh>
    );
  }
  return (
    <mesh position={[x, y, z]} rotation={rotation} raycast={() => null}>
      <cylinderGeometry args={[profile.radius, profile.radius, length, profile.profile === "cove" ? 16 : 20, 1, false, 0, Math.PI]} />
      <meshStandardMaterial color={profile.profile === "cove" ? "#6b4630" : "#e4c89a"} roughness={0.72} />
    </mesh>
  );
}

function JointMark({ piece, feature }: { piece: Piece; feature: JoineryFeature }) {
  const point = holeLocalPoint(piece, feature.face, feature.u, feature.v);
  const inward = inwardNormal(feature.face, piece);
  const inwardQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(inward.x, inward.y, inward.z).normalize()),
    [inward.x, inward.y, inward.z],
  );
  const outwardQuat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-inward.x, -inward.y, -inward.z).normalize()),
    [inward.x, inward.y, inward.z],
  );
  if (feature.kind === "dowel") {
    return (
      <mesh position={[point.x, point.y, point.z]} quaternion={inwardQuat} raycast={() => null}>
        <cylinderGeometry args={[feature.width / 2, feature.width / 2, feature.depth * 2, 16]} />
        <meshStandardMaterial color="#c9a36a" roughness={0.6} />
      </mesh>
    );
  }
  if (feature.kind === "tenon") {
    return (
      <mesh position={[point.x - inward.x * feature.depth / 2, point.y - inward.y * feature.depth / 2, point.z - inward.z * feature.depth / 2]} quaternion={inwardQuat} raycast={() => null}>
        <boxGeometry args={[feature.width, feature.depth, feature.height]} />
        <meshStandardMaterial color="#e0c090" roughness={0.7} />
      </mesh>
    );
  }
  if (feature.kind === "dovetail-tail" || feature.kind === "dovetail-pin") {
    return <DovetailMesh point={point} quaternion={outwardQuat} feature={feature} tail={feature.kind === "dovetail-tail"} />;
  }
  return (
    <mesh
      position={[point.x + inward.x * feature.depth / 2, point.y + inward.y * feature.depth / 2, point.z + inward.z * feature.depth / 2]}
      quaternion={inwardQuat}
      raycast={() => null}
    >
      <boxGeometry args={[feature.width, feature.depth, feature.height]} />
      <meshBasicMaterial color="#3d291c" />
    </mesh>
  );
}

function DovetailMesh({
  point,
  quaternion,
  feature,
  tail,
}: {
  point: { x: number; y: number; z: number };
  quaternion: THREE.Quaternion;
  feature: JoineryFeature;
  tail: boolean;
}) {
  const geometry = useMemo(() => {
    const flare = Math.tan(((feature.angle ?? 10) * Math.PI) / 180) * feature.depth;
    const root = feature.width / 2;
    const tip = tail ? root + flare : Math.max(2, root - flare);
    const shape = new THREE.Shape();
    shape.moveTo(-root, -feature.height / 2);
    shape.lineTo(root, -feature.height / 2);
    shape.lineTo(tip, feature.height / 2);
    shape.lineTo(-tip, feature.height / 2);
    shape.closePath();
    const extruded = new THREE.ExtrudeGeometry(shape, { depth: feature.depth, bevelEnabled: false });
    if (!tail) extruded.translate(0, 0, -feature.depth);
    return extruded;
  }, [feature.angle, feature.depth, feature.height, feature.width, tail]);
  return (
    <mesh position={[point.x, point.y, point.z]} quaternion={quaternion} geometry={geometry} raycast={() => null}>
      <meshStandardMaterial color={tail ? "#e0c090" : "#3d291c"} roughness={0.75} />
    </mesh>
  );
}

function HardwareMark({ piece, item }: { piece: Piece; item: HardwareItem }) {
  const point = holeLocalPoint(piece, item.face, item.u, item.v);
  const inward = inwardNormal(item.face, piece);
  const outward = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-inward.x, -inward.y, -inward.z).normalize());
  const color = item.kind === "hinge" ? "#c6a15a" : item.kind === "drawer-slide" ? "#c5ccd1" : "#1f2428";
  if (item.face === "top" || item.face === "bottom") {
    const lift = item.face === "top" ? item.depth / 2 : -item.depth / 2;
    return (
      <mesh position={[point.x, point.y + lift, point.z]} raycast={() => null}>
        <boxGeometry args={[item.width, Math.max(item.depth, 3), item.height]} />
        <meshStandardMaterial color={color} metalness={item.kind === "handle" ? 0.35 : 0.6} roughness={0.35} />
      </mesh>
    );
  }
  const depth = Math.max(item.depth, 3);
  return (
    <mesh position={[point.x - inward.x * depth / 2, point.y - inward.y * depth / 2, point.z - inward.z * depth / 2]} quaternion={outward} raycast={() => null}>
      <boxGeometry args={[item.width, item.height, depth]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
    </mesh>
  );
}
