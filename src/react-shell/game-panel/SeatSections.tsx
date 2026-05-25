import { FloatingActionDock, HiddenTileRail, MeldStrip, TileCommandButton, TileFaceButton } from "./TilePrimitives";
import type {
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  LobbyBridgeActions,
  TableActionState,
} from "./types";

function splitSeatSubtitle(subtitle: string) {
  const parts = String(subtitle || "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    primary: parts[0] || "",
    secondary: parts[1] || "",
  };
}

export function TopSeatSection({
  section,
  compactStandingRack = false,
}: {
  section: BridgeOpponentSectionSnapshot;
  compactStandingRack?: boolean;
}) {
  const subtitleParts = splitSeatSubtitle(section.subtitle);
  const topSeatMeta = subtitleParts.primary || section.subtitle;
  const topSeatMetaDetail = subtitleParts.secondary || "";

  return (
    <section className={`table-side table-opponent seat-top-panel ${compactStandingRack ? "seat-top-panel-compact" : ""}`.trim()}>
      <div className="seat-top-head">
        <div className="seat-top-title-line">
          {section.scoreBadge ? <span className="score-badge">{section.scoreBadge}</span> : null}
          <h3 className="seat-top-name">{section.title}</h3>
          {topSeatMeta ? <span className="seat-top-inline-meta">{topSeatMeta}</span> : null}
        </div>
        {topSeatMetaDetail ? <span className="seat-top-meta-line">{topSeatMetaDetail}</span> : null}
      </div>
      <div className={`opponent-rack seat-top-rack ${compactStandingRack ? "seat-top-rack-standing" : ""}`.trim()}>
        <MeldStrip melds={section.melds} />
        {section.revealHand ? (
          <div className="visible-hand visible-hand-inline">
            {section.handTiles.map((tile) => (
              <TileFaceButton key={tile.tileId} tile={tile} />
            ))}
          </div>
        ) : (
          <HiddenTileRail
            count={section.hiddenTileCount}
            orientation={compactStandingRack ? "standing-horizontal" : "horizontal"}
          />
        )}
      </div>
    </section>
  );
}

export function EdgeSeatSection({
  positionLabel,
  section,
  direction,
}: {
  positionLabel: string;
  section: BridgeOpponentSectionSnapshot;
  direction: "left" | "right";
}) {
  const subtitleParts = splitSeatSubtitle(section.subtitle);

  return (
    <section className={`table-side seat-side-panel seat-side-${direction}`}>
      <div className="seat-side-head">
        <h3 className="seat-side-position-label">{positionLabel}</h3>
        <div className="seat-side-topline">
          {section.scoreBadge ? <span className="score-badge seat-side-score">{section.scoreBadge}</span> : null}
          <strong className="seat-side-name">{section.title}</strong>
        </div>
        {subtitleParts.primary ? <span className="seat-side-role">{subtitleParts.primary}</span> : null}
        {subtitleParts.secondary ? <span className="seat-side-role seat-side-detail">{subtitleParts.secondary}</span> : null}
      </div>
      <div className="seat-side-rack">
        {direction === "right" && section.melds.length ? (
          <div className="seat-side-melds">
            {section.melds.map((meld, meldIndex) => (
              <div key={`${meld.label}-${meldIndex}`} className="seat-side-meld-group">
                <div className="seat-side-meld-tiles">
                  {meld.tiles.map((tile) => (
                    <TileFaceButton key={tile.tileId} tile={tile} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {section.revealHand ? (
          <div className="visible-hand visible-hand-inline seat-side-visible-hand">
            {section.handTiles.map((tile) => (
              <TileFaceButton key={tile.tileId} tile={tile} />
            ))}
          </div>
        ) : (
          <HiddenTileRail count={section.hiddenTileCount} orientation="vertical" />
        )}
        {direction === "left" && section.melds.length ? (
          <div className="seat-side-melds">
            {section.melds.map((meld, meldIndex) => (
              <div key={`${meld.label}-${meldIndex}`} className="seat-side-meld-group">
                <div className="seat-side-meld-tiles">
                  {meld.tiles.map((tile) => (
                    <TileFaceButton key={tile.tileId} tile={tile} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SelfSection({
  section,
  actionState,
  actions,
  showFloatingActions,
}: {
  section: BridgeSelfSectionSnapshot;
  actionState: TableActionState;
  actions: LobbyBridgeActions;
  showFloatingActions: boolean;
}) {
  const hasFloatingActions = showFloatingActions && actionState.buttons.length > 0;

  return (
    <section className="table-side table-self">
      <div className="side-head side-head-self">
        <div className="self-head-title">
          <h3>
            {section.title}
            {section.scoreBadge ? <span className="score-badge">{section.scoreBadge}</span> : null}
          </h3>
          {section.statusText ? (
            <span className={`self-head-status ${section.statusTone === "warn" ? "is-warn" : ""}`.trim()}>
              {section.statusText}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={[
          "self-play-area",
          showFloatingActions ? "self-play-area-floating" : "",
          hasFloatingActions ? "has-action-dock" : "",
        ]
            .filter(Boolean)
            .join(" ")}
      >
        {showFloatingActions ? (
          <div className="self-action-dock-slot">{hasFloatingActions ? <FloatingActionDock actionState={actionState} actions={actions} /> : null}</div>
        ) : null}
        {section.melds.length ? (
          <div className="self-play-melds">
            <MeldStrip melds={section.melds} />
          </div>
        ) : null}
        <div className={`self-hand-row ${section.drawnTile ? "has-drawn-tile" : ""}`.trim()}>
          <div className="hand-grid">
            {section.handTiles.map((button) => (
              <TileCommandButton key={button.tile.tileId} button={button} actions={actions} />
            ))}
          </div>
          {section.drawnTile ? (
            <div className={`drawn-tile-slot ${section.drawnTile.isGracePeriod ? "is-grace-period" : ""}`.trim()}>
              <TileCommandButton button={section.drawnTile.button} actions={actions} />
              {section.drawnTile.countdownLabel ? <span className="draw-countdown">{section.drawnTile.countdownLabel}</span> : null}
            </div>
          ) : null}
          {section.activityText || section.drawNoticeText ? (
            <div className="self-hand-messages" aria-live="polite">
              {section.activityText ? <div className="self-hand-activity">{section.activityText}</div> : null}
              {section.drawNoticeText ? <div className="self-hand-draw-note">{section.drawNoticeText}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
