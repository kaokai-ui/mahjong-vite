import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { DoubleSide, SRGBColorSpace } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getTileSvgMarkup } from "../../tile-art.js";
import type {
  BridgeGameActionSnapshot,
  BridgeMeldSnapshot,
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  LobbyBridgeActions,
} from "../useAppBridge";
import type { TableStageSnapshot } from "./types";

type SeatKey = "top" | "left" | "right" | "self";
type DiscardKey = "top" | "bottom" | "left" | "right";
type Position = [number, number, number];

type TableV2Props = {
  tableStage: TableStageSnapshot;
  seatCount: number;
  isSoloMode: boolean;
  actions: LobbyBridgeActions;
};

type TileSpec = {
  key: string;
  tile: BridgeTileSnapshot;
  position: Position;
  entryPosition?: Position;
  rotationZ?: number;
  width: number;
  height: number;
  depth?: number;
  faceUp: boolean;
  disabled?: boolean;
  muted?: boolean;
  highlight?: boolean;
  lift?: number;
  animateDuration?: number;
  action?: BridgeTileActionSnapshot;
  onActivate?: () => void;
};

type TileMotion = {
  from: Position;
  to: Position;
  elapsed: number;
  duration: number;
  initialized: boolean;
};

const TABLE_WIDTH = 18.8;
const TABLE_HEIGHT = 9.9;
const TABLE_Y_SCALE = 1.1;
const TABLE_Y_OFFSET = (TABLE_HEIGHT * (TABLE_Y_SCALE - 1)) / 2;
const TILE_BACK_COLOR = "#2e7452";
const TILE_BACK_DARK_COLOR = "#1f4f38";
const TILE_BACK_EDGE_COLOR = "#f7f2e2";
const TILE_EDGE_COLOR = "#f2ead6";
const TILE_FACE_COLOR = "#f7f2e2";
const TILE_CLEARCOAT = 0.3;
const TILE_CLEARCOAT_ROUGHNESS = 0.3;
const TILE_ROUGHNESS = 0.44;

const WALL_TILE_WIDTH = 0.58;
const WALL_TILE_HEIGHT = 0.4;
const WALL_TILE_DEPTH = 0.24;
const WALL_TILE_GEOMETRY = new RoundedBoxGeometry(WALL_TILE_WIDTH, WALL_TILE_HEIGHT, WALL_TILE_DEPTH, 3, 0.045);

function createFeltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const size = canvas.width;
  context.fillStyle = "#164a32";
  context.fillRect(0, 0, size, size);

  const centerPool = context.createRadialGradient(size * 0.5, size * 0.45, 0, size * 0.5, size * 0.45, size * 0.62);
  centerPool.addColorStop(0, "#228556");
  centerPool.addColorStop(0.5, "#1a5c3c");
  centerPool.addColorStop(1, "rgba(22, 74, 50, 0)");
  context.fillStyle = centerPool;
  context.fillRect(0, 0, size, size);

  const lowerGlow = context.createRadialGradient(size * 0.18, size * 0.78, 0, size * 0.18, size * 0.78, size * 0.42);
  lowerGlow.addColorStop(0, "rgba(50, 110, 72, 0.28)");
  lowerGlow.addColorStop(1, "rgba(50, 110, 72, 0)");
  context.fillStyle = lowerGlow;
  context.fillRect(0, 0, size, size);

  const upperGlow = context.createRadialGradient(size * 0.85, size * 0.2, 0, size * 0.85, size * 0.2, size * 0.4);
  upperGlow.addColorStop(0, "rgba(40, 95, 62, 0.22)");
  upperGlow.addColorStop(1, "rgba(40, 95, 62, 0)");
  context.fillStyle = upperGlow;
  context.fillRect(0, 0, size, size);

  const pixels = context.getImageData(0, 0, size, size);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = ((seed >>> 16) / 65535 - 0.5) * 10;
    pixels.data[index] = Math.max(0, Math.min(255, pixels.data[index] + noise));
    pixels.data[index + 1] = Math.max(0, Math.min(255, pixels.data[index + 1] + noise));
    pixels.data[index + 2] = Math.max(0, Math.min(255, pixels.data[index + 2] + noise * 0.85));
  }
  context.putImageData(pixels, 0, 0);

  const vignette = context.createRadialGradient(size * 0.5, size * 0.5, size * 0.42, size * 0.5, size * 0.5, size * 0.78);
  vignette.addColorStop(0, "rgba(8, 24, 16, 0)");
  vignette.addColorStop(1, "rgba(8, 24, 16, 0.28)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function tileTextureUrl(tileType: string): string {
  const svg = getTileSvgMarkup(tileType);
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function centeredPositions(count: number, span: number, maxGap: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [0];
  }

  const gap = Math.min(maxGap, span / (count - 1));
  const start = (-gap * (count - 1)) / 2;
  return Array.from({ length: count }, (_, index) => start + index * gap);
}

function hiddenTile(tileId: string): BridgeTileSnapshot {
  return {
    tileId,
    tileType: "B",
    label: "背面牌",
    themeClass: "tile-back",
  };
}

function addOpponentRack(specs: TileSpec[], seat: "top" | "left" | "right", section: BridgeOpponentSectionSnapshot) {
  const visibleTiles = section.revealHand ? section.handTiles : [];
  const tileCount = visibleTiles.length || Math.max(0, section.hiddenTileCount);

  if (!tileCount) {
    return;
  }

  if (seat === "top") {
    const positions = centeredPositions(tileCount, 12.6, 0.82);
    positions.forEach((x, index) => {
      specs.push({
        key: `top-rack-${visibleTiles[index]?.tileId || index}`,
        tile: visibleTiles[index] || hiddenTile(`top-hidden-${index}`),
        position: [x, 3.02, 1.25],
        entryPosition: [x, 4.5, 0.2],
        width: 0.58,
        height: 0.84,
        faceUp: Boolean(visibleTiles[index]),
        animateDuration: 480,
      });
    });
    return;
  }

  const positions = centeredPositions(tileCount, 7.65, 0.74);
  positions.forEach((y, index) => {
    const x = seat === "left" ? -5.4 : 5.4;
    specs.push({
      key: `${seat}-rack-${visibleTiles[index]?.tileId || index}`,
      tile: visibleTiles[index] || hiddenTile(`${seat}-hidden-${index}`),
      position: [x, y, 1.25],
      entryPosition: [seat === "left" ? -6.05 : 6.05, y, 0.2],
      rotationZ: seat === "left" ? Math.PI / 2 : -Math.PI / 2,
      width: 0.72,
      height: 0.52,
      faceUp: Boolean(visibleTiles[index]),
      animateDuration: 480,
    });
  });
}

function addSelfRack(specs: TileSpec[], section: BridgeSelfSectionSnapshot, actions: LobbyBridgeActions) {
  const buttons = section.handTiles;
  const hasDrawnTile = Boolean(section.drawnTile?.button);
  const positions = centeredPositions(buttons.length + (hasDrawnTile ? 1 : 0), 13.2, 0.9);

  buttons.forEach((button, index) => {
    specs.push({
      key: `self-hand-${button.tile.tileId}`,
      tile: button.tile,
      position: [positions[index] || 0, -4.32, 1.45],
      entryPosition: [positions[index] || 0, -5.08, 0.2],
      width: 0.78,
      height: 1.08,
      faceUp: true,
      disabled: button.disabled,
      action: button,
      onActivate: () => void actions.runGameCommand(button.command, button.payload),
      animateDuration: 430,
      lift: 0.2,
    });
  });

  if (section.drawnTile) {
    const drawnButton = section.drawnTile.button;
    const drawnIndex = positions.length - 1;
    specs.push({
      key: `self-drawn-${drawnButton.tile.tileId}`,
      tile: drawnButton.tile,
      position: [(positions[drawnIndex] || 0) + 0.24, -4.32, 1.58],
      entryPosition: [(positions[drawnIndex] || 0) + 0.24, -5.08, 0.2],
      width: 0.78,
      height: 1.08,
      faceUp: true,
      disabled: drawnButton.disabled,
      action: drawnButton,
      onActivate: () => void actions.runGameCommand(drawnButton.command, drawnButton.payload),
      animateDuration: 430,
      lift: 0.2,
    });
  }
}

function addMelds(specs: TileSpec[], seat: SeatKey, melds: BridgeMeldSnapshot[]) {
  if (!melds.length) {
    return;
  }

  const flattened = melds.flatMap((meld, meldIndex) =>
    meld.tiles.map((tile, tileIndex) => ({ tile, meldIndex, tileIndex, meld })),
  );

  if (seat === "self" || seat === "top") {
    const positions = centeredPositions(flattened.length, 10.5, 0.47);
    const y = seat === "self" ? -3.35 : 2.9;
    flattened.forEach(({ tile, meldIndex, tileIndex }) => {
      const x = positions[flattened.findIndex((item) => item.tile.tileId === tile.tileId && item.meldIndex === meldIndex && item.tileIndex === tileIndex)] || 0;
      specs.push({
        key: `${seat}-meld-${meldIndex}-${tileIndex}-${tile.tileId}`,
        tile,
        position: [x, y, 1.15],
        entryPosition: [x, seat === "self" ? -3.95 : 3.5, 0.2],
        width: 0.39,
        height: 0.56,
        faceUp: true,
        animateDuration: 360,
      });
    });
    return;
  }

  const x = seat === "left" ? -5.45 : 5.45;
  const positions = centeredPositions(flattened.length, 3.35, 0.52);
  flattened.forEach(({ tile, meldIndex, tileIndex }, index) => {
    specs.push({
      key: `${seat}-meld-${meldIndex}-${tileIndex}-${tile.tileId}`,
      tile,
      position: [x, positions[index] || 0, 1.15],
      entryPosition: [seat === "left" ? -6.1 : 6.1, positions[index] || 0, 0.2],
      rotationZ: seat === "left" ? Math.PI / 2 : -Math.PI / 2,
      width: 0.5,
      height: 0.35,
      faceUp: true,
      animateDuration: 360,
    });
  });
}

function addDiscardLanes(specs: TileSpec[], tableStage: TableStageSnapshot, seatCount: number) {
  const rowEntries: Array<[DiscardKey, TableStageSnapshot["discardRows"][number]]> = [
    ["top", tableStage.discardRows[0]],
    ["bottom", tableStage.discardRows[1]],
    ["left", tableStage.discardRows[2]],
    ["right", tableStage.discardRows[3]],
  ];
  const latestTileId = tableStage.latestDiscard?.tileId;

  rowEntries.forEach(([rowKey, row]) => {
    if (!row || (seatCount < 4 && (rowKey === "left" || rowKey === "right"))) {
      return;
    }

    const tiles = [...row.tiles].reverse();
    tiles.forEach((discard, index) => {
      const isHorizontal = rowKey === "top" || rowKey === "bottom";
      const laneIndex = isHorizontal ? index % 9 : index % 6;
      const lane = Math.floor(index / (isHorizontal ? 9 : 6));
      const lanePositions = isHorizontal
        ? centeredPositions(Math.min(9, tiles.length - lane * 9), 5.25, 0.62)
        : centeredPositions(Math.min(6, tiles.length - lane * 6), 3.7, 0.7);
      const lanePosition = lanePositions[laneIndex] || 0;
      const position: Position = isHorizontal
        ? [lanePosition, rowKey === "top" ? 1.92 - lane * 0.67 : -1.92 + lane * 0.67, 0.98]
        : [rowKey === "left" ? -3.82 - lane * 0.58 : 3.82 + lane * 0.58, lanePosition, 0.98];

      specs.push({
        key: `discard-${rowKey}-${discard.tile.tileId}-${index}`,
        tile: discard.tile,
        position,
        entryPosition: [0, 0, 0.35],
        rotationZ: isHorizontal ? 0 : rowKey === "left" ? Math.PI / 2 : -Math.PI / 2,
        width: isHorizontal ? 0.48 : 0.64,
        height: isHorizontal ? 0.66 : 0.46,
        faceUp: true,
        muted: discard.claimed,
        highlight: discard.tile.tileId === latestTileId,
        animateDuration: 520,
      });
    });
  });
}

function buildTileSpecs(tableStage: TableStageSnapshot, seatCount: number, actions: LobbyBridgeActions): TileSpec[] {
  const specs: TileSpec[] = [];
  addOpponentRack(specs, "top", tableStage.opponentSection);
  if (seatCount >= 4) {
    addOpponentRack(specs, "left", tableStage.leftSection);
    addOpponentRack(specs, "right", tableStage.rightSection);
  }
  addSelfRack(specs, tableStage.selfSection, actions);
  addMelds(specs, "top", tableStage.opponentSection.melds);
  addMelds(specs, "self", tableStage.selfSection.melds);
  if (seatCount >= 4) {
    addMelds(specs, "left", tableStage.leftSection.melds);
    addMelds(specs, "right", tableStage.rightSection.melds);
  }
  addDiscardLanes(specs, tableStage, seatCount);
  return specs;
}

function useTableCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = Math.max(0.72, size.width / Math.max(size.height, 1));
      const fov = 44;
      const fovRadians = THREE.MathUtils.degToRad(fov);
      const verticalDistance = (TABLE_HEIGHT + 1.85) / (2 * Math.tan(fovRadians / 2));
      const horizontalDistance = (TABLE_WIDTH + 1.1) / (2 * Math.tan(fovRadians / 2) * aspect);
      const distance = Math.max(verticalDistance, horizontalDistance);

      camera.fov = fov;
      camera.position.set(0, -distance * 0.36, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      return;
    }

    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(1, Math.min(size.width / TABLE_WIDTH, size.height / TABLE_HEIGHT) * 1.02);
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, size.height, size.width]);
}

function FaceTile({ tile, width, height, depth, muted, disabled }: { tile: BridgeTileSnapshot; width: number; height: number; depth: number; muted: boolean; disabled: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let active = true;
    let loadedTexture: THREE.CanvasTexture | null = null;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const sourceWidth = image.naturalWidth || 160;
      const sourceHeight = image.naturalHeight || 220;
      const pixelScale = 3;
      canvas.width = sourceWidth * pixelScale;
      canvas.height = sourceHeight * pixelScale;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.imageSmoothingEnabled = true;
      context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
      context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
      loadedTexture = new THREE.CanvasTexture(canvas);
      loadedTexture.colorSpace = SRGBColorSpace;
      loadedTexture.minFilter = THREE.LinearFilter;
      loadedTexture.magFilter = THREE.LinearFilter;
      loadedTexture.generateMipmaps = false;
      loadedTexture.needsUpdate = true;
      if (active) {
        setTexture(loadedTexture);
      } else {
        loadedTexture.dispose();
      }
    };
    image.src = tileTextureUrl(tile.tileType);

    return () => {
      active = false;
      loadedTexture?.dispose();
    };
  }, [tile.tileType]);

  return (
    <mesh position={[0, 0, depth / 2 + 0.008]}>
      <planeGeometry args={[width * 0.9, height * 0.9]} />
      <meshBasicMaterial
        map={texture || undefined}
        color={TILE_FACE_COLOR}
        transparent
        opacity={disabled ? 0.68 : muted ? 0.78 : 1}
        side={DoubleSide}
      />
    </mesh>
  );
}

function BackTile({ width, height, depth, muted, disabled }: { width: number; height: number; depth: number; muted: boolean; disabled: boolean }) {
  const opacity = disabled ? 0.58 : muted ? 0.68 : 1;

  return (
    <group position={[0, 0, depth / 2 + 0.008]}>
      <mesh>
        <planeGeometry args={[width * 0.86, height * 0.86]} />
        <meshPhysicalMaterial
          color={TILE_BACK_COLOR}
          transparent
          opacity={opacity}
          roughness={TILE_ROUGHNESS}
          clearcoat={0.4}
          clearcoatRoughness={0.32}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[width * 0.68, height * 0.68]} />
        <meshPhysicalMaterial
          color={TILE_BACK_DARK_COLOR}
          transparent
          opacity={opacity * 0.18}
          roughness={0.55}
          clearcoat={0.25}
          clearcoatRoughness={0.4}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

function WallTile({ position, rotationZ = 0 }: { position: Position; rotationZ?: number }) {
  const width = WALL_TILE_WIDTH;
  const height = WALL_TILE_HEIGHT;
  const depth = WALL_TILE_DEPTH;

  return (
    <group position={position} rotation={[0, 0, rotationZ]}>
      <mesh geometry={WALL_TILE_GEOMETRY}>
        <meshPhysicalMaterial
          color={TILE_BACK_EDGE_COLOR}
          roughness={0.5}
          clearcoat={0.25}
          clearcoatRoughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.008]}>
        <planeGeometry args={[width * 0.84, height * 0.78]} />
        <meshPhysicalMaterial
          color={TILE_BACK_COLOR}
          roughness={TILE_ROUGHNESS}
          clearcoat={0.4}
          clearcoatRoughness={0.32}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

function TableWall() {
  const positions: Array<{ position: Position; rotationZ?: number }> = [];
  const edgePositions = centeredPositions(17, 7.95, 0.5);

  edgePositions.forEach((x, index) => {
    const offset = index % 2 === 0 ? 0.09 : -0.09;
    positions.push({ position: [x, 4.72 + offset, 0.22] });
    positions.push({ position: [x, 4.42 + offset, 0.18] });
    positions.push({ position: [x, -4.72 - offset, 0.22] });
    positions.push({ position: [x, -4.42 - offset, 0.18] });
  });

  edgePositions.forEach((y, index) => {
    const offset = index % 2 === 0 ? 0.09 : -0.09;
    positions.push({ position: [-5.95 - offset, y, 0.22], rotationZ: Math.PI / 2 });
    positions.push({ position: [-5.65 - offset, y, 0.18], rotationZ: Math.PI / 2 });
    positions.push({ position: [5.95 + offset, y, 0.22], rotationZ: -Math.PI / 2 });
    positions.push({ position: [5.65 + offset, y, 0.18], rotationZ: -Math.PI / 2 });
  });

  return (
    <group>
      {positions.map(({ position, rotationZ }, index) => (
        <WallTile key={`wall-${index}`} position={position} rotationZ={rotationZ} />
      ))}
    </group>
  );
}

function AnimatedTile({ spec }: { spec: TileSpec }) {
  const groupRef = useRef<THREE.Group | null>(null);
  const [hovered, setHovered] = useState(false);
  const rotationZ = spec.rotationZ || 0;
  const depth = spec.depth || 0.14;
  const bodyGeometry = useMemo(
    () => new RoundedBoxGeometry(spec.width, spec.height, depth, 3, Math.min(0.055, spec.width / 4, spec.height / 4, depth / 2.5)),
    [depth, spec.height, spec.width],
  );
  const motionKey = `${spec.position.join(",")}|${rotationZ}|${spec.faceUp}|${spec.width}|${spec.height}`;
  const motionRef = useRef<TileMotion>({
    from: spec.entryPosition || spec.position,
    to: spec.position,
    elapsed: 0,
    duration: spec.animateDuration || 360,
    initialized: false,
  });

  useEffect(() => {
    const group = groupRef.current;
    const current: Position = group ? [group.position.x, group.position.y, group.position.z] : spec.entryPosition || spec.position;
    motionRef.current = {
      from: current,
      to: spec.position,
      elapsed: 0,
      duration: spec.animateDuration || 360,
      initialized: Boolean(group),
    };
  }, [motionKey, spec.animateDuration, spec.entryPosition, spec.position]);

  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const motion = motionRef.current;
    if (!motion.initialized) {
      group.position.set(...motion.from);
      group.rotation.z = rotationZ;
      group.scale.setScalar(0.96);
      motion.initialized = true;
    }

    motion.elapsed = Math.min(motion.duration, motion.elapsed + delta * 1000);
    const rawProgress = motion.duration > 0 ? motion.elapsed / motion.duration : 1;
    const progress = rawProgress >= 1 ? 1 : 1 - (1 - rawProgress) ** 3;
    const baseX = THREE.MathUtils.lerp(motion.from[0], motion.to[0], progress);
    const baseY = THREE.MathUtils.lerp(motion.from[1], motion.to[1], progress);
    const baseZ = THREE.MathUtils.lerp(motion.from[2], motion.to[2], progress);
    const lift = hovered && !spec.disabled ? spec.lift || 0.16 : 0;
    const desiredX = baseX;
    const desiredY = baseY + lift;
    const desiredZ = baseZ + (hovered && !spec.disabled ? 0.12 : 0);
    const smoothing = 1 - Math.exp(-delta * 18);

    group.position.x = THREE.MathUtils.lerp(group.position.x, desiredX, smoothing);
    group.position.y = THREE.MathUtils.lerp(group.position.y, desiredY, smoothing);
    group.position.z = THREE.MathUtils.lerp(group.position.z, desiredZ, smoothing);
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, rotationZ, smoothing);
    const desiredScale = hovered && !spec.disabled ? 1.05 : 1;
    const currentScale = group.scale.x;
    group.scale.setScalar(THREE.MathUtils.lerp(currentScale, desiredScale, smoothing));
  });

  return (
    <group
      ref={groupRef}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!spec.disabled) {
          spec.onActivate?.();
        }
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh geometry={bodyGeometry}>
        <meshPhysicalMaterial
          color={spec.faceUp ? TILE_EDGE_COLOR : TILE_BACK_EDGE_COLOR}
          transparent
          opacity={spec.disabled ? 0.72 : spec.muted ? 0.82 : 1}
          roughness={spec.faceUp ? 0.5 : TILE_ROUGHNESS}
          metalness={0.02}
          clearcoat={TILE_CLEARCOAT}
          clearcoatRoughness={TILE_CLEARCOAT_ROUGHNESS}
        />
      </mesh>
      {spec.faceUp ? (
        <FaceTile tile={spec.tile} width={spec.width} height={spec.height} depth={depth} muted={Boolean(spec.muted)} disabled={Boolean(spec.disabled)} />
      ) : (
        <BackTile width={spec.width} height={spec.height} depth={depth} muted={Boolean(spec.muted)} disabled={Boolean(spec.disabled)} />
      )}
      {spec.highlight ? (
        <mesh position={[0, 0, depth / 2 + 0.012]}>
          <planeGeometry args={[spec.width * 0.97, spec.height * 0.97]} />
          <meshBasicMaterial color="#f8c44f" transparent opacity={0.2} side={DoubleSide} />
        </mesh>
      ) : null}
    </group>
  );
}

function TableScene({ specs }: { specs: TileSpec[] }) {
  useTableCamera();
  const feltTexture = useMemo(() => createFeltTexture(), []);

  useEffect(() => () => feltTexture.dispose(), [feltTexture]);

  return (
    <>
      <color attach="background" args={["#062f26"]} />
      <ambientLight intensity={1.05} />
      <directionalLight
        castShadow
        position={[-5, -7, 14]}
        intensity={1.65}
        color="#fff6df"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[7, 4, 10]} intensity={0.62} color="#9ed7c2" />
      <group position={[0, TABLE_Y_OFFSET, 0]} scale={[1, TABLE_Y_SCALE, 1]}>
        <mesh position={[0, 0, -1.82]} receiveShadow>
          <boxGeometry args={[TABLE_WIDTH + 0.5, TABLE_HEIGHT + 0.48, 0.28]} />
          <meshPhysicalMaterial color="#5c3e25" roughness={0.68} clearcoat={0.12} clearcoatRoughness={0.6} />
        </mesh>
        <mesh position={[0, 0, -1.62]} receiveShadow>
          <boxGeometry args={[TABLE_WIDTH + 0.12, TABLE_HEIGHT + 0.1, 0.24]} />
          <meshStandardMaterial color="#082f26" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0, -1.46]} receiveShadow>
          <boxGeometry args={[TABLE_WIDTH - 0.12, TABLE_HEIGHT - 0.1, 0.18]} />
          <meshStandardMaterial map={feltTexture} roughness={0.92} metalness={0} />
        </mesh>
        <TableWall />
        {specs.map((spec) => (
          <AnimatedTile key={spec.key} spec={spec} />
        ))}
      </group>
    </>
  );
}

function V2SeatCaption({ seat, section }: { seat: SeatKey; section: BridgeOpponentSectionSnapshot | BridgeSelfSectionSnapshot }) {
  const isSelf = seat === "self";
  const subtitle = isSelf ? "手牌" : "subtitle" in section ? section.subtitle : "";
  const seatToken = isSelf ? "你" : seat === "top" ? "對" : seat === "left" ? "上" : "下";
  return (
    <div className={`table-v2-seat-caption table-v2-seat-${seat}`} data-seat={seat}>
      <div className="table-v2-seat-name-row">
        <span className="table-v2-seat-token" aria-hidden="true">{seatToken}</span>
        <strong>{section.title || (isSelf ? "你" : seat === "top" ? "對家" : seat === "left" ? "上家" : "下家")}</strong>
        {section.scoreBadge ? <span>{section.scoreBadge}</span> : null}
      </div>
      {subtitle ? <small>{subtitle}</small> : null}
    </div>
  );
}

function V2ActionBar({ buttons, actions }: { buttons: BridgeGameActionSnapshot[]; actions: LobbyBridgeActions }) {
  if (!buttons.length) {
    return null;
  }

  return (
    <div className="table-v2-action-bar" aria-label="可用操作">
      {buttons.map((button, index) => (
        <button
          key={`${button.command}-${button.label}-${index}`}
          className={`table-v2-action-button ${button.emphasis ? "is-emphasis" : ""}`}
          type="button"
          data-game-command={button.command}
          onClick={() => void actions.runGameCommand(button.command, button.payload)}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}

function V2AccessibleControls({ section, actions }: { section: BridgeSelfSectionSnapshot; actions: LobbyBridgeActions }) {
  const buttons = [
    ...section.handTiles,
    ...(section.drawnTile ? [section.drawnTile.button] : []),
  ];

  if (!buttons.length) {
    return null;
  }

  return (
    <div className="table-v2-accessible-controls" aria-label="手牌操作">
      {buttons.map((button) => (
        <button
          key={`accessible-${button.tile.tileId}`}
          type="button"
          disabled={button.disabled}
          aria-label={button.ariaLabel}
          onClick={() => void actions.runGameCommand(button.command, button.payload)}
        >
          {button.ariaLabel}
        </button>
      ))}
    </div>
  );
}

export function TableV2({ tableStage, seatCount, isSoloMode, actions }: TableV2Props) {
  const resolvedSeatCount = seatCount >= 4 ? 4 : 2;
  const specs = useMemo(() => buildTileSpecs(tableStage, resolvedSeatCount, actions), [actions, resolvedSeatCount, tableStage]);
  const selfSection = tableStage.selfSection;
  const statusText = selfSection.statusText || tableStage.actions.placeholderText;
  const latestDiscard = tableStage.latestDiscard?.label || tableStage.latestDiscardPlaceholder;
  const isSelfTurn = statusText.includes("輪到你");

  return (
    <div className={`table-v2 table-v2-${resolvedSeatCount}p ${isSoloMode ? "table-v2-solo" : "table-v2-online"}`} data-table-version="v2">
      <div className="table-v2-scene" aria-label="麻將 2 代 3D 牌桌">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, -2.2, 18], fov: 44, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <Suspense fallback={null}>
            <TableScene specs={specs} />
          </Suspense>
        </Canvas>
      </div>

      <div className="table-v2-overlay">
        <V2SeatCaption seat="top" section={tableStage.opponentSection} />
        {resolvedSeatCount >= 4 ? <V2SeatCaption seat="left" section={tableStage.leftSection} /> : null}
        {resolvedSeatCount >= 4 ? <V2SeatCaption seat="right" section={tableStage.rightSection} /> : null}
        <V2SeatCaption seat="self" section={selfSection} />

        <div className={`table-v2-center-status ${isSelfTurn ? "is-current-turn" : ""}`} aria-live="polite">
          <span>{tableStage.roundNumber ? `第 ${tableStage.roundNumber} 局` : "牌局準備中"}</span>
          <strong>{latestDiscard}</strong>
          <small>{statusText}</small>
        </div>

        <div className="table-v2-self-status" aria-live="polite">
          {statusText ? <span className="table-v2-turn-notice">{statusText}</span> : null}
          {selfSection.activityText ? <span>{selfSection.activityText}</span> : null}
          {selfSection.drawNoticeText ? <span>{selfSection.drawNoticeText}</span> : null}
        </div>

        <V2ActionBar buttons={tableStage.actions.buttons} actions={actions} />
        <V2AccessibleControls section={selfSection} actions={actions} />
      </div>
    </div>
  );
}
