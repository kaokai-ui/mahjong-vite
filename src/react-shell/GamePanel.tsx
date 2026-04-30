import { getTileSvgMarkup } from "../tile-art.js";
import type {
  BridgeDiscardSnapshot,
  BridgeGameActionSnapshot,
  BridgeMeldSnapshot,
  BridgeOpponentSectionSnapshot,
  BridgeSelfSectionSnapshot,
  BridgeTileActionSnapshot,
  BridgeTileSnapshot,
  GameResultOverlaySnapshot,
  LobbyBridgeActions,
  LobbyBridgeSnapshot,
} from "./useAppBridge";

type GamePanelProps = {
  gamePanel: LobbyBridgeSnapshot["gamePanel"];
  actions: LobbyBridgeActions;
  fullscreenActive: boolean;
  fullscreenSupported: boolean;
};

function TileFaceButton({ tile }: { tile: BridgeTileSnapshot }) {
  return (
    <button className={`tile tile-faceup ${tile.themeClass}`} type="button" disabled aria-label={tile.label} title={tile.label}>
      <span className="tile-face" dangerouslySetInnerHTML={{ __html: getTileSvgMarkup(tile.tileType) }} />
    </button>
  );
}

function TileCommandButton({ button, actions }: { button: BridgeTileActionSnapshot; actions: LobbyBridgeActions }) {
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

function DiscardTile({ discard }: { discard: BridgeDiscardSnapshot }) {
  return (
    <div className={`discard-item ${discard.claimed ? "discard-claimed" : ""}`}>
      <TileFaceButton tile={discard.tile} />
    </div>
  );
}

function MeldStrip({ melds }: { melds: BridgeMeldSnapshot[] }) {
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

function GameActionButton({ action, actions }: { action: BridgeGameActionSnapshot; actions: LobbyBridgeActions }) {
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

function OpponentSection({ section }: { section: BridgeOpponentSectionSnapshot }) {
  return (
    <section className="table-side table-opponent">
      <div className="side-head">
        <h3>
          {section.title}
          {section.scoreBadge ? <span className="score-badge">{section.scoreBadge}</span> : null}
        </h3>
        <span>{section.subtitle}</span>
      </div>
      <div className="opponent-rack">
        <MeldStrip melds={section.melds} />
        {section.revealHand ? (
          <div className="visible-hand visible-hand-inline">
            {section.handTiles.map((tile) => (
              <TileFaceButton key={tile.tileId} tile={tile} />
            ))}
          </div>
        ) : (
          <div className="hidden-hand hidden-hand-inline">
            {Array.from({ length: section.hiddenTileCount }, (_, index) => (
              <div key={`hidden-${index}`} className="tile tile-back" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SelfSection({ section, actions }: { section: BridgeSelfSectionSnapshot; actions: LobbyBridgeActions }) {
  return (
    <section className="table-side table-self">
      <div className="side-head side-head-self">
        <h3>
          {section.title}
          {section.scoreBadge ? <span className="score-badge">{section.scoreBadge}</span> : null}
        </h3>
        <div className="self-head-melds">
          <MeldStrip melds={section.melds} />
        </div>
        <span className="self-head-status">{section.statusText}</span>
      </div>
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
      </div>
    </section>
  );
}

function ResultOverlay({
  overlay,
  actions,
}: {
  overlay: GameResultOverlaySnapshot;
  actions: LobbyBridgeActions;
}) {
  if (!overlay.visible) {
    return null;
  }

  return (
    <div className="result-overlay-host">
      <div className="result-overlay">
        <div className="result-overlay-backdrop" />
        <div className="result-card">
          <span className="result-eyebrow">{overlay.eyebrow}</span>
          {overlay.kindLabel ? <div className="result-kind">{overlay.kindLabel}</div> : null}
          <h3 className="result-title">{overlay.title}</h3>
          {overlay.winningTile ? (
            <div className="result-winning-tile">
              <TileFaceButton tile={overlay.winningTile} />
            </div>
          ) : null}
          {overlay.handGroups.length ? (
            <div className="result-hand-panel">
              <span className="result-hand-label">{overlay.handTitle}</span>
              <div className="result-hand-groups">
                {overlay.handGroups.map((group, groupIndex) => (
                  <div key={`${group.label}-${groupIndex}`} className="result-hand-group">
                    <span className="result-hand-tag">{group.label}</span>
                    <div className="result-hand-tiles">
                      {group.tiles.map((tile) => (
                        <TileFaceButton key={tile.tileId} tile={tile} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {overlay.scoringSummary ? (
            <div className="result-score-panel">
              <span className="result-score-label">{overlay.scoringSummary.label}</span>
              <ul className="result-score-breakdown">
                {overlay.scoringSummary.rows.map((row) => (
                  <li key={`${row.label}-${row.valueLabel}`}>
                    <span>{row.label}</span>
                    <strong>{row.valueLabel}</strong>
                  </li>
                ))}
              </ul>
              <div className="result-score-total">
                <span>{overlay.scoringSummary.totalTaiLabel}</span>
                <strong>{overlay.scoringSummary.totalScoreLabel}</strong>
              </div>
            </div>
          ) : null}
          <p className="result-patterns">{overlay.detail}</p>
          <div className="result-actions result-actions-centered">
            <button
              className="primary-button result-action-button"
              type="button"
              onClick={() => void actions.runGameCommand("restartGame")}
            >
              {overlay.primaryActionLabel}
            </button>
            <button className="ghost-button result-action-button" type="button" onClick={() => void actions.leaveRoom()}>
              {overlay.secondaryActionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GamePanel({ gamePanel, actions, fullscreenActive, fullscreenSupported }: GamePanelProps) {
  const tableStageClassName = gamePanel.tableStage.hasResult ? "table-stage has-result" : "table-stage";
  const fullscreenLabel = fullscreenActive ? "離開全螢幕" : "全螢幕顯示";
  const focusNote = fullscreenSupported ? gamePanel.focusNote : "這個瀏覽器目前不支援全螢幕。";

  return (
    <section id="game-panel" className="panel">
      <div className="panel-head">
        <div>
          <h2>{gamePanel.title}</h2>
          <p>{gamePanel.description}</p>
        </div>
        {gamePanel.showFocusControls ? (
          <div className="game-head-actions">
            <div className="pill-row">
              {gamePanel.pills.map((pill) => (
                <span key={pill} className="pill">
                  {pill}
                </span>
              ))}
            </div>
            <span className="focus-note">{focusNote}</span>
            <button className="ghost-button focus-toggle" type="button" onClick={() => void actions.toggleFullscreen()}>
              {fullscreenLabel}
            </button>
          </div>
        ) : null}
      </div>
      <div className={tableStageClassName} hidden={!gamePanel.tableStage.visible}>
        <div className="table-shell">
          <OpponentSection section={gamePanel.tableStage.opponentSection} />
          <section className="table-center">
            <div className="center-block center-block-latest">
              <span className="center-label">最新棄牌</span>
              <div className="latest-discard">
                {gamePanel.tableStage.latestDiscard ? (
                  <TileFaceButton tile={gamePanel.tableStage.latestDiscard} />
                ) : (
                  <span className="placeholder">{gamePanel.tableStage.latestDiscardPlaceholder}</span>
                )}
              </div>
            </div>
            <div className="center-block center-block-discards">
              <span className="center-label">出牌記錄</span>
              <div className="center-discard-board">
                <div className="center-discard-viewport">
                  <div className="center-discard-content">
                    {gamePanel.tableStage.discardRows.map((row, rowIndex) => (
                      <div key={`${row.label}-${rowIndex}`} className="center-discard-row">
                        <span className="discard-row-label">{row.label}</span>
                        <div className="discard-line">
                          {row.tiles.length ? (
                            row.tiles.map((discard, discardIndex) => (
                              <DiscardTile key={`${discard.tile.tileId}-${discardIndex}`} discard={discard} />
                            ))
                          ) : (
                            <span className="placeholder">{row.placeholderText}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="center-block center-block-actions">
              <span className="center-label">可用操作</span>
              <div className="action-grid">
                {gamePanel.tableStage.actions.buttons.length ? (
                  gamePanel.tableStage.actions.buttons.map((action, actionIndex) => (
                    <GameActionButton key={`${action.command}-${action.label}-${actionIndex}`} action={action} actions={actions} />
                  ))
                ) : (
                  <span className="placeholder">{gamePanel.tableStage.actions.placeholderText}</span>
                )}
              </div>
            </div>
          </section>
          <SelfSection section={gamePanel.tableStage.selfSection} actions={actions} />
        </div>
        <ResultOverlay overlay={gamePanel.tableStage.resultOverlay} actions={actions} />
      </div>
    </section>
  );
}
