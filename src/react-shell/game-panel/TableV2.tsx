import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SRGBColorSpace } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getTileSvgMarkup } from "../../tile-art.js";
import { shouldLockGameFocusHeight } from "../page-mode-support";
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
  rotationZ?: number;
  rotationX?: number;
  standing?: boolean;
  width: number;
  height: number;
  depth?: number;
  faceUp: boolean;
  disabled?: boolean;
  muted?: boolean;
  highlight?: boolean;
  lift?: number;
  action?: BridgeTileActionSnapshot;
  onActivate?: () => void;
};

const TABLE_WIDTH = 14.6;
const TABLE_HEIGHT = 12;
const TILE_BACK_COLOR = "#2e7452";
const TILE_BACK_EDGE_COLOR = "#f7f2e2";
const TILE_EDGE_COLOR = "#f2ead6";
const TILE_ROUGHNESS = 0.44;

const WALL_TILE_WIDTH = 0.48;
const WALL_TILE_HEIGHT = 0.66;
const WALL_TILE_DEPTH = 0.24;
const WALL_TILE_GEOMETRY = new RoundedBoxGeometry(WALL_TILE_WIDTH, WALL_TILE_HEIGHT, WALL_TILE_DEPTH, 1, 0.025);

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
  const visible = section.revealHand ? section.handTiles : [];
  const count = visible.length || Math.max(0, section.hiddenTileCount);
  const positions = centeredPositions(count, 9.4, 0.57);
  positions.forEach((offset, index) => {
    specs.push({
      key: seat + '-rack-' + (visible[index]?.tileId || index),
      tile: visible[index] || hiddenTile(seat + '-hidden-' + index),
      position: seat === "top" ? [offset, 5.3, 0.42] : [seat === "left" ? -6.4 : 6.4, offset, 0.42],
      rotationZ: seat === "top" ? Math.PI : seat === "left" ? Math.PI / 2 : -Math.PI / 2,
      standing: !section.revealHand,
      width: 0.55, height: 0.82, depth: 0.3,
      faceUp: Boolean(visible[index]),
    });
  });
}

function addSelfRack(specs: TileSpec[], section: BridgeSelfSectionSnapshot, actions: LobbyBridgeActions) {
  const buttons = [...section.handTiles, ...(section.drawnTile ? [section.drawnTile.button] : [])];
  const positions = centeredPositions(buttons.length, 11.4, 0.72);
  buttons.forEach((button, index) => {
    const drawn = index >= section.handTiles.length;
    specs.push({
      key: 'self-hand-' + button.tile.tileId, tile: button.tile,
      position: [(positions[index] || 0) + (drawn ? 0.18 : 0), -5.3, 0.58],
      rotationX: Math.PI / 3, standing: true, width: 0.7, height: 1.04, depth: 0.34,
      faceUp: true, disabled: button.disabled, action: button,
      onActivate: () => void actions.runGameCommand(button.command, button.payload),
      lift: 0.18,
    });
  });
}

function addMelds(specs: TileSpec[], seat: SeatKey, melds: BridgeMeldSnapshot[]) {
  // Allocate a fixed slot per tile plus a visible gap per set. Never squeeze
  // a long side meld strip below the physical tile width.
  const gap = 0.22;
  const step = 0.51;
  const total = melds.reduce((sum, meld) => sum + meld.tiles.length * step, 0) + Math.max(0, melds.length - 1) * gap;
  let cursor = -total / 2 + step / 2;
  for (const [meldIndex, meld] of melds.entries()) {
    for (const [tileIndex, tile] of meld.tiles.entries()) {
      const horizontal = seat === "self" || seat === "top";
      specs.push({
        key: seat + '-meld-' + meldIndex + '-' + tileIndex + '-' + tile.tileId, tile,
        position: horizontal ? [cursor, seat === "self" ? -4.3 : 4.3, 0.13] : [seat === "left" ? -5.65 : 5.65, cursor, 0.13],
        rotationZ: seat === "top" ? Math.PI : seat === "left" ? -Math.PI / 2 : seat === "right" ? Math.PI / 2 : 0,
        width: 0.49, height: 0.69, depth: 0.24, faceUp: true,
      });
      cursor += step;
    }
    cursor += gap;
  }
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

    // Keep three fixed rows inside each wall. Full history remains available
    // in the DOM history panel, including tiles claimed by another player.
    const tiles = row.tiles.filter((discard) => !discard.claimed).slice(-18).reverse();
    tiles.forEach((discard, index) => {
      const isHorizontal = rowKey === "top" || rowKey === "bottom";
      const laneIndex = index % 6;
      const lane = Math.floor(index / 6);
      const lanePositions = isHorizontal
        ? centeredPositions(6, 3, 0.46)
        : centeredPositions(6, 3, 0.46);
      const lanePosition = lanePositions[laneIndex] || 0;
      const position: Position = isHorizontal
        ? [lanePosition, rowKey === "top" ? 1.28 + lane * 0.63 : -1.28 - lane * 0.63, 0.13]
        : [rowKey === "left" ? -2.65 - lane * 0.63 : 2.65 + lane * 0.63, lanePosition, 0.13];

      specs.push({
        key: `discard-${rowKey}-${discard.tile.tileId}-${index}`,
        tile: discard.tile,
        position,
        rotationZ: isHorizontal ? 0 : rowKey === "left" ? Math.PI / 2 : -Math.PI / 2,
        width: 0.44,
        height: 0.6,
        depth: 0.24,
        faceUp: true,
        muted: discard.claimed,
        highlight: discard.tile.tileId === latestTileId,
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
  const { camera, size, invalidate } = useThree();
  const lastAppliedOrientation = useRef<string | null>(null);

  useEffect(() => {
    // iPad Safari can report transient ResizeObserver dimensions while its
    // browser chrome moves. The v1 DOM table is unaffected, but a live R3F
    // camera fit turns that transient measurement into a visible zoom. Keep
    // the iPad camera stable until an orientation/fullscreen transition is
    // explicitly reported; desktop and Android remain fully responsive.
    if (size.width <= 0 || size.height <= 0) {
      return;
    }

    const lockedViewport = shouldLockGameFocusHeight();
    const orientation = size.width >= size.height ? "landscape" : "portrait";
    if (lockedViewport && lastAppliedOrientation.current === orientation) {
      return;
    }

    lastAppliedOrientation.current = orientation;
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = size.width / Math.max(size.height, 1);
      const fov = 44;
      const fovRadians = THREE.MathUtils.degToRad(fov);
      const verticalDistance = (TABLE_HEIGHT + 1.85) / (2 * Math.tan(fovRadians / 2));
      const horizontalDistance = (TABLE_WIDTH + 1.1) / (2 * Math.tan(fovRadians / 2) * aspect);
      // The old fit left the table as a small island in the middle of the
      // viewport. A modest closer fit gives the hand enough pixels to read
      // while preserving a margin for the seat captions and controls.
      const distance = Math.max(verticalDistance, horizontalDistance) * 0.78;

      camera.fov = fov;
      camera.position.set(0, -distance * 0.72, distance);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      invalidate();
      return;
    }

    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(1, Math.min(size.width / TABLE_WIDTH, size.height / TABLE_HEIGHT) * 1.02);
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, size.height, size.width, invalidate]);

  useEffect(() => {
    if (!shouldLockGameFocusHeight()) {
      return;
    }

    const handleViewportModeChange = () => {
      // Let R3F publish the post-transition size, then allow the size effect
      // above to perform one intentional camera fit.
      lastAppliedOrientation.current = null;
    };

    window.addEventListener("orientationchange", handleViewportModeChange);
    document.addEventListener("fullscreenchange", handleViewportModeChange);
    document.addEventListener("webkitfullscreenchange", handleViewportModeChange);

    return () => {
      window.removeEventListener("orientationchange", handleViewportModeChange);
      document.removeEventListener("fullscreenchange", handleViewportModeChange);
      document.removeEventListener("webkitfullscreenchange", handleViewportModeChange);
    };
  }, []);
}

// Shared texture loading avoids decoding the same SVG for every copy of a tile.
const faceTextures = new Map<string, Promise<THREE.CanvasTexture>>();
function loadFaceTexture(tileType: string): Promise<THREE.CanvasTexture> {
  let pending = faceTextures.get(tileType);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 512; canvas.height = 704;
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("Cannot create tile texture")); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        resolve(texture);
      };
      image.onerror = reject;
      image.src = tileTextureUrl(tileType);
    });
    faceTextures.set(tileType, pending);
  }
  return pending;
}

function FaceTile({ tile, width, height, depth, muted }: { tile: BridgeTileSnapshot; width: number; height: number; depth: number; muted: boolean }) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const { gl, invalidate } = useThree();
  useEffect(() => {
    let active = true;
    void loadFaceTexture(tile.tileType).then((loaded) => {
      if (!active) return;
      // Tile art is 512x704 (NPOT), so mipmapped minification would make the
      // WebGL texture incomplete. Linear filtering keeps the face readable at
      // table scale while remaining valid for this native aspect ratio.
      loaded.generateMipmaps = false;
      loaded.minFilter = THREE.LinearFilter;
      loaded.magFilter = THREE.LinearFilter;
      loaded.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      loaded.needsUpdate = true;
      setLoadError(null);
      setTexture(loaded);
      invalidate();
    }).catch((error) => {
      if (!active) return;
      console.error(`[table-v2] Failed to load face texture for ${tile.tileType}`, error);
      setLoadError(error);
      invalidate();
    });
    return () => { active = false; };
  }, [gl, tile.tileType, invalidate]);

  // Mount the material only after a valid texture is ready. This guarantees
  // that the initial shader includes USE_MAP; attaching a map later can leave
  // an already-compiled material showing only the ivory body.
  if (!texture || loadError) {
    return null;
  }

  return <mesh position={[0, 0, depth / 2 + 0.004]}>
    <planeGeometry args={[width * 0.97, height * 0.97]} />
    <meshBasicMaterial map={texture} color={muted ? "#bfc9bd" : "#ffffff"} />
  </mesh>;
}

function BackTile({ width, height, depth }: { width: number; height: number; depth: number }) {
  return <group>
    {[1, -1].map((side) => <mesh key={side} position={[0, 0, side * (depth / 2 + 0.004)]} rotation={[0, side < 0 ? Math.PI : 0, 0]}>
      <planeGeometry args={[width * 0.96, height * 0.88]} />
      <meshStandardMaterial color={TILE_BACK_COLOR} roughness={TILE_ROUGHNESS} />
    </mesh>)}
  </group>;
}

function TableWall({ count }: { count: number }) {
  // Consume tiles from consecutive stacks; the second layer shares x/y with
  // the first, with only z changing. The wall follows the actual game count.
  const total = Math.max(0, Math.min(144, count));
  const perSide = 36;
  return <group name="tile-wall" userData={{ tileCount: total }}>
    {Array.from({ length: total }, (_, index) => {
      const slot = 144 - total + index;
      const side = Math.floor(slot / perSide);
      const stack = Math.floor((slot % perSide) / 2);
      const layer = slot % 2;
      const offset = (stack - 8.5) * 0.49;
      const position: Position = side === 0 ? [offset, 3.35, 0.13 + layer * 0.245]
        : side === 1 ? [4.8, -offset * 0.72, 0.13 + layer * 0.245]
        : side === 2 ? [-offset, -3.35, 0.13 + layer * 0.245]
        : [-4.8, offset * 0.72, 0.13 + layer * 0.245];
      return <group key={slot} position={position} rotation={[0, 0, side % 2 ? Math.PI / 2 : 0]} scale={[side % 2 ? 0.72 : 1, 1, 1]}>
        <mesh geometry={WALL_TILE_GEOMETRY}><meshStandardMaterial color={TILE_BACK_EDGE_COLOR} roughness={0.6} /></mesh>
        <mesh position={[0, 0, WALL_TILE_DEPTH / 2 + 0.003]}>
          <planeGeometry args={[WALL_TILE_WIDTH * 0.96, WALL_TILE_HEIGHT * 0.96]} />
          <meshStandardMaterial color={TILE_BACK_COLOR} roughness={0.6} />
        </mesh>
      </group>;
    })}
  </group>;
}

function TableTile({ spec }: { spec: TileSpec }) {
  const [hovered, setHovered] = useState(false);
  const depth = spec.depth || 0.24;
  const interactive = Boolean(spec.onActivate) && !spec.disabled;
  const bodyGeometry = useMemo(() => new RoundedBoxGeometry(spec.width, spec.height, depth, 1, 0.025), [spec.width, spec.height, depth]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);
  useEffect(() => { if (!interactive) setHovered(false); }, [interactive]);
  const lift = hovered && interactive ? spec.lift || 0.16 : 0;
  const rotationX = spec.rotationX ?? (spec.standing ? Math.PI / 2 : 0);
  return <group position={[spec.position[0], spec.position[1], spec.position[2] + lift]} rotation={[0, 0, spec.rotationZ || 0]} name={spec.key}>
    <group rotation={[rotationX, 0, 0]}>
      <mesh geometry={bodyGeometry}><meshStandardMaterial color={spec.highlight ? "#f8d679" : TILE_EDGE_COLOR} roughness={0.52} /></mesh>
      {spec.faceUp ? <FaceTile tile={spec.tile} width={spec.width} height={spec.height} depth={depth} muted={Boolean(spec.muted)} /> : <BackTile width={spec.width} height={spec.height} depth={depth} />}
    </group>
    {interactive ? <mesh
      // Only the simple box is raycast. Visual meshes and the wall have no
      // event handlers, so pointer movement never traverses their triangles.
      rotation={[rotationX, 0, 0]}
      onPointerDown={(event) => { event.stopPropagation(); spec.onActivate?.(); }}
      onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[spec.width, spec.height, depth + 0.02]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh> : null}
  </group>;
}

function TableScene({ specs, wallCount }: { specs: TileSpec[]; wallCount: number }) {
  useTableCamera();
  const feltTexture = useMemo(() => createFeltTexture(), []);
  useEffect(() => () => feltTexture.dispose(), [feltTexture]);
  return <>
    <color attach="background" args={["#103a2e"]} />
    <ambientLight intensity={1.25} />
    <directionalLight position={[-5, -7, 14]} intensity={1.6} color="#fff6df" />
    <directionalLight position={[7, 4, 10]} intensity={0.45} color="#b8dfd0" />
    <group>
      <mesh position={[0, 0, -0.27]}><boxGeometry args={[TABLE_WIDTH + 0.32, TABLE_HEIGHT + 0.32, 0.45]} /><meshStandardMaterial color="#583a24" roughness={0.68} /></mesh>
      <mesh position={[0, 0, -0.055]}><boxGeometry args={[TABLE_WIDTH, TABLE_HEIGHT, 0.1]} /><meshStandardMaterial map={feltTexture} roughness={0.92} /></mesh>
      <TableWall count={wallCount} />
      {specs.map((spec) => <TableTile key={spec.key} spec={spec} />)}
    </group>
  </>;
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

function V2DiscardHistory({ rows }: { rows: TableStageSnapshot["discardRows"] }) {
  const [open, setOpen] = useState(false);
  const count = rows.reduce((sum, row) => sum + row.tiles.length, 0);
  if (!count) return null;
  return <div className="table-v2-history">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "關閉紀錄" : `棄牌紀錄 (${count})`}</button>
    {open ? <div className="table-v2-history-panel" role="region" aria-label="完整棄牌紀錄">
      <p>桌面顯示各家最近 18 張未被吃碰的棄牌。</p>
      {rows.map((row, index) => <section key={index}>
        <strong>{row.label}</strong>
        <div className="table-v2-history-tiles">
          {row.tiles.map((discard, tileIndex) => <span key={tileIndex} title={discard.tile.label + (discard.claimed ? "（已吃碰）" : "")} className={discard.claimed ? "is-claimed" : ""}>
            <img src={tileTextureUrl(discard.tile.tileType)} alt={discard.tile.label} />
            {discard.claimed ? <small>已吃碰</small> : null}
          </span>)}
        </div>
      </section>)}
    </div> : null}
  </div>;
}

export function TableV2({ tableStage, seatCount, isSoloMode, actions }: TableV2Props) {
  const resolvedSeatCount = seatCount >= 4 ? 4 : 2;
  const specs = useMemo(() => buildTileSpecs(tableStage, resolvedSeatCount, actions), [actions, resolvedSeatCount, tableStage]);
  const selfSection = tableStage.selfSection;
  const meldCount = [
    tableStage.opponentSection,
    tableStage.selfSection,
    tableStage.leftSection,
    tableStage.rightSection,
  ].reduce((total, section) => total + section.melds.length, 0);
  const hasCrowdedBoard = meldCount > 0 || tableStage.discardRows.some((row) => row.tiles.length > 12);
  const statusText = selfSection.statusText || tableStage.actions.placeholderText;
  const latestDiscard = tableStage.latestDiscard?.label || tableStage.latestDiscardPlaceholder;
  const isSelfTurn = statusText.includes("輪到你");

  return (
    <div className={`table-v2 table-v2-${resolvedSeatCount}p ${isSoloMode ? "table-v2-solo" : "table-v2-online"} ${hasCrowdedBoard ? "is-crowded" : ""}`.trim()} data-table-version="v2">
      <div className="table-v2-scene" aria-label="麻將 2 代 3D 牌桌">
        <Canvas
          frameloop="demand"
          resize={{ debounce: { scroll: 50, resize: 180 } }}
          dpr={[1, 1.5]}
          camera={{ position: [0, -2.2, 18], fov: 44, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <Suspense fallback={null}>
            <TableScene specs={specs} wallCount={tableStage.wallTileCount || 0} />
          </Suspense>
        </Canvas>
      </div>

      <div className="table-v2-overlay">
        <V2DiscardHistory rows={tableStage.discardRows} />
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
