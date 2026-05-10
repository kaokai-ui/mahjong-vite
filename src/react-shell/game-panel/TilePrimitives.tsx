import { getTileSvgMarkup } from "../../tile-art.js";
import type {
  BridgeDiscardSnapshot,
  BridgeGameActionSnapshot,
  BridgeMeldSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  LobbyBridgeActions,
  TableActionState,
} from "./types";

export function TileFaceButton({ tile }: { tile: BridgeTileSnapshot }) {
  return (
    <button className={`tile tile-faceup ${tile.themeClass}`} type="button" disabled aria-label={tile.label} title={tile.label}>
      <span className="tile-face" dangerouslySetInnerHTML={{ __html: getTileSvgMarkup(tile.tileType) }} />
    </button>
  );
}

export function TileCommandButton({ button, actions }: { button: BridgeTileActionSnapshot; actions: LobbyBridgeActions }) {
  const payload = button.payload || {};
  return (
    <button
      className={`tile tile-faceup ${button.tile.themeClass} ${button.disabled ? "" : "tile-clickable"}`.trim()}
      type="button"
      disabled={button.disabled}
      onClick={() => void actions.runGameCommand(button.command, payload)}
      aria-label={button.ariaLabel}
      title={button.tile.label}
    >
      <span className="tile-face" dangerouslySetInnerHTML={{ __html: getTileSvgMarkup(button.tile.tileType) }} />
    </button>
  );
}

export function DiscardTile({ discard }: { discard: BridgeDiscardSnapshot }) {
  return (
    <div className={`discard-item ${discard.claimed ? "discard-claimed" : ""}`}>
      <TileFaceButton tile={discard.tile} />
    </div>
  );
}

export function MeldStrip({ melds }: { melds: BridgeMeldSnapshot[] }) {
  if (!melds.length) {
    return null;
  }

  return (
    <div className="meld-strip meld-strip-compact meld-strip-inline">
      {melds.map((meld, meldIndex) => (
        <div key={`${meld.label}-${meldIndex}`} className="meld-group meld-group-compact">
          <span className="meld-tag">{meld.label}</span>
          <div className="meld-tiles">
            {meld.tiles.map((tile) => (
              <TileFaceButton key={tile.tileId} tile={tile} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HiddenTileRail({
  count,
  orientation,
}: {
  count: number;
  orientation: "horizontal" | "vertical" | "standing-horizontal";
}) {
  const tileCount = Math.max(0, count || 0);
  return (
    <div className={`hidden-hand hidden-hand-${orientation}`}>
      {Array.from({ length: tileCount }, (_, index) =>
        orientation === "vertical" || orientation === "standing-horizontal" ? (
          <div key={`hidden-${orientation}-${index}`} className="standing-side-tile" aria-hidden="true" />
        ) : (
          <div key={`hidden-${orientation}-${index}`} className="tile tile-back" />
        ),
      )}
    </div>
  );
}

export function GameActionButton({ action, actions }: { action: BridgeGameActionSnapshot; actions: LobbyBridgeActions }) {
  const payload = action.payload || {};
  return (
    <button
      className={`action-button ${action.emphasis ? "action-emphasis" : ""}`.trim()}
      type="button"
      onClick={() => void actions.runGameCommand(action.command, payload)}
    >
      {action.label}
    </button>
  );
}

export function FloatingActionDock({
  actionState,
  actions,
}: {
  actionState: TableActionState;
  actions: LobbyBridgeActions;
}) {
  if (!actionState.buttons.length) {
    return null;
  }

  return (
    <div className="self-action-dock" aria-label="game actions">
      {actionState.buttons.map((action, actionIndex) => (
        <GameActionButton key={`${action.command}-${action.label}-${actionIndex}`} action={action} actions={actions} />
      ))}
    </div>
  );
}
