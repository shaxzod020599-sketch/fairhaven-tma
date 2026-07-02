import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Float,
  Lightformer,
  useTexture,
} from '@react-three/drei';
import * as THREE from 'three';

import { bottleSpec, motion } from './fhProModel.mjs';

const BODY_POINTS = [
  [0, bottleSpec.baseY],
  [0.56, bottleSpec.baseY],
  [0.63, -1.30],
  [0.675, -1.20],
  [bottleSpec.bodyRadius, -1.08],
  [bottleSpec.bodyRadius, 0.42],
  [0.672, 0.53],
  [0.635, 0.66],
  [0.575, 0.78],
  [0.515, 0.87],
  [0.475, 0.92],
  [0.465, bottleSpec.neckTop],
  [0, bottleSpec.neckTop],
].map(([x, y]) => new THREE.Vector2(x, y));

function createCurvedLabelGeometry() {
  const segments = 72;
  const positions = [];
  const uvs = [];
  const indices = [];
  const height = bottleSpec.labelTop - bottleSpec.labelBottom;

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const angle = (u - 0.5) * bottleSpec.labelArc;
    const x = Math.sin(angle) * bottleSpec.labelRadius;
    const z = Math.cos(angle) * bottleSpec.labelRadius;

    positions.push(x, bottleSpec.labelBottom, z);
    positions.push(x, bottleSpec.labelBottom + height, z);
    uvs.push(u, 0, u, 1);
  }

  for (let i = 0; i < segments; i += 1) {
    const bottom = i * 2;
    const top = bottom + 1;
    const nextBottom = bottom + 2;
    const nextTop = bottom + 3;
    indices.push(bottom, nextBottom, top, nextBottom, nextTop, top);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRibbedCapGeometry() {
  const height = 0.36;
  const geometry = new THREE.CylinderGeometry(
    bottleSpec.capRadius,
    bottleSpec.capRadius,
    height,
    192,
    1,
    false,
  );
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const ridge = 1 + 0.014 * (0.5 + 0.5 * Math.cos(angle * 48));
    positions.setX(i, x * ridge);
    positions.setZ(i, z * ridge);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function BottleBody() {
  return (
    <mesh castShadow receiveShadow>
      <latheGeometry args={[BODY_POINTS, 96]} />
      <meshPhysicalMaterial
        color="#fbfbfa"
        roughness={0.58}
        metalness={0}
        clearcoat={0.08}
        clearcoatRoughness={0.72}
      />
    </mesh>
  );
}

function BottleCap() {
  const ribbedGeometry = useMemo(createRibbedCapGeometry, []);

  useEffect(() => () => ribbedGeometry.dispose(), [ribbedGeometry]);

  return (
    <group>
      <mesh position={[0, 1.19, 0]} geometry={ribbedGeometry} castShadow>
        <meshPhysicalMaterial
          color="#ffffff"
          roughness={0.42}
          clearcoat={0.12}
          clearcoatRoughness={0.65}
        />
      </mesh>
      <mesh position={[0, 1.015, 0]} castShadow>
        <cylinderGeometry args={[0.495, 0.495, 0.095, 96]} />
        <meshStandardMaterial color="#f7f7f6" roughness={0.46} />
      </mesh>
      <mesh position={[0, 1.376, 0]} castShadow>
        <cylinderGeometry args={[0.487, 0.487, 0.018, 96]} />
        <meshStandardMaterial color="#ffffff" roughness={0.48} />
      </mesh>
    </group>
  );
}

function LabelSleeve() {
  const splitY = -0.245;
  const whiteHeight = bottleSpec.labelTop - splitY;
  const berryHeight = splitY - bottleSpec.labelBottom;

  return (
    <group>
      <mesh position={[0, splitY + whiteHeight / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, whiteHeight, 96, 1, true]} />
        <meshStandardMaterial color="#ffffff" roughness={0.64} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, bottleSpec.labelBottom + berryHeight / 2, 0]}>
        <cylinderGeometry args={[0.683, 0.683, berryHeight, 96, 1, true]} />
        <meshStandardMaterial color="#8d1748" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function PhotoLabel() {
  const texture = useTexture('/assets/fh-pro-women-label.jpg');
  const geometry = useMemo(createCurvedLabelGeometry, []);
  const { gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [gl, texture]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} renderOrder={2}>
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

function InteractionController({ groupRef, reducedMotion }) {
  const target = useRef({ pitch: 0, yaw: 0 });

  useEffect(() => {
    if (reducedMotion) {
      target.current = { pitch: 0, yaw: 0 };
      return undefined;
    }

    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      target.current.pitch = -y * motion.maxPitch;
      target.current.yaw = x * motion.maxYaw;
    };
    const onLeave = () => {
      target.current.pitch = 0;
      target.current.yaw = 0;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [reducedMotion]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const ease = 1 - Math.exp(-delta * 7);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, target.current.pitch, ease);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, target.current.yaw, ease);
  });

  return null;
}

function StudioEnvironment() {
  return (
    <Environment resolution={128}>
      <group rotation={[-Math.PI / 3, 0, 0]}>
        <Lightformer intensity={2.7} position={[0, 5, -2]} scale={[2, 6, 1]} />
        <Lightformer intensity={1.1} position={[-4, 1, 2]} scale={[3, 5, 1]} color="#f4dbe5" />
        <Lightformer intensity={0.9} position={[4, 1, 1]} scale={[3, 5, 1]} color="#dcebe8" />
        <Lightformer intensity={0.65} position={[0, -2, 4]} scale={[9, 4, 1]} />
      </group>
    </Environment>
  );
}

function Scene({ reducedMotion }) {
  const groupRef = useRef();

  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[3.5, 5.5, 3]} intensity={1.65} />
      <directionalLight position={[-3, 2, 2]} intensity={0.38} color="#dcebe8" />

      <Float
        speed={reducedMotion ? 0 : 1.05}
        rotationIntensity={0}
        floatIntensity={reducedMotion ? 0 : motion.floatIntensity}
      >
        <group ref={groupRef} position={[0, -0.02, 0]}>
          <BottleBody />
          <BottleCap />
          <LabelSleeve />
          <Suspense fallback={null}>
            <PhotoLabel />
          </Suspense>
        </group>
      </Float>

      <InteractionController groupRef={groupRef} reducedMotion={reducedMotion} />
      <ContactShadows
        position={[0, bottleSpec.baseY - 0.025, 0]}
        opacity={0.34}
        scale={5}
        blur={2.4}
        far={3.5}
        color="#5d3543"
      />
      <Suspense fallback={null}>
        <StudioEnvironment />
      </Suspense>
    </>
  );
}

export default function Hero3D() {
  const wrapRef = useRef();
  const [active, setActive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, []);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="hero3d-wrap">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0.08, 5.05], fov: 35 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
      >
        <Scene reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
