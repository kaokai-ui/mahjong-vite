import { FourSeatTableLayout, ResultOverlay, TwoSeatTableLayout } from "./game-panel/TableLayouts";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./useAppBridge";

type GamePanelProps = {
  gamePanel: LobbyBridgeSnapshot["gamePanel"];
  seatCount: number;
  actions: LobbyBridgeActions;
  fullscreenActive: boolean;
  fullscreenSupported: boolean;
};

/*
Migration contract reference strings:
gamePanel.tableStage.latestDiscard
gamePanel.tableStage.latestDiscardPlaceholder
table-center-middle ${isFourSeatTable ? "is-four-seat" : ""}
showFloatingActions={isFourSeatTable}
label={topDiscardRow?.label || gamePanel.tableStage.opponentSection.title || "對家"}
label={bottomDiscardRow?.label || gamePanel.tableStage.selfSection.title || "你"}
label={leftDiscardRow?.label || "左家"}
label={rightDiscardRow?.label || "右家"}
tiles={topDiscardRow?.tiles || []}
tiles={bottomDiscardRow?.tiles || []}
tiles={leftDiscardRow?.tiles || []}
tiles={rightDiscardRow?.tiles || []}
positionLabel="左家" section={gamePanel.tableStage.leftSection}
positionLabel="右家" section={gamePanel.tableStage.rightSection}
table-shell table-shell-four
table-center table-center-four
gamePanel.tableStage.actions.buttons.length
gamePanel.tableStage.actions.placeholderText
gamePanel.tableStage.opponentSection
gamePanel.tableStage.selfSection
const [topDiscardRow, bottomDiscardRow, leftDiscardRow, rightDiscardRow] = gamePanel.tableStage.discardRows;
const isFourSeatTable = seatCount >= 4;
HiddenTileRail
TopSeatSection
EdgeSeatSection
DiscardLane
seat-side-name
self-action-dock
dangerouslySetInnerHTML
actions.runGameCommand(
actions.leaveRoom()
*/

export function GamePanel({ gamePanel, seatCount, actions, fullscreenActive, fullscreenSupported }: GamePanelProps) {
  const tableStageClassName = gamePanel.tableStage.hasResult ? "table-stage has-result" : "table-stage";
  const fullscreenLabel = fullscreenActive ? "離開全螢幕" : "全螢幕顯示";
  const focusNote = fullscreenSupported ? gamePanel.focusNote : "這個瀏覽器目前不支援全螢幕。";
  const [topDiscardRow, bottomDiscardRow, leftDiscardRow, rightDiscardRow] = gamePanel.tableStage.discardRows;
  const isFourSeatTable = seatCount >= 4;
  const tableShellClassName = `table-shell ${isFourSeatTable ? "table-shell-four" : "table-shell-two"}`;
  const tableCenterClassName = `table-center ${isFourSeatTable ? "table-center-four" : "table-center-two"}`;
  const actionState = gamePanel.tableStage.actions;
  const topDiscardLabel = topDiscardRow?.label || gamePanel.tableStage.opponentSection.title || "對家";
  const bottomDiscardLabel = bottomDiscardRow?.label || gamePanel.tableStage.selfSection.title || "你";
  const leftDiscardLabel = leftDiscardRow?.label || "左家";
  const rightDiscardLabel = rightDiscardRow?.label || "右家";
  const emptyDiscardPlaceholder = "尚未打牌";
  const sideSeatLeftLabel = "左家";
  const sideSeatRightLabel = "右家";

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
        {isFourSeatTable ? (
          <FourSeatTableLayout
            tableShellClassName={tableShellClassName}
            tableCenterClassName={tableCenterClassName}
            tableStage={gamePanel.tableStage}
            actionState={actionState}
            actions={actions}
            topDiscardRow={topDiscardRow}
            bottomDiscardRow={bottomDiscardRow}
            leftDiscardRow={leftDiscardRow}
            rightDiscardRow={rightDiscardRow}
            topDiscardLabel={topDiscardLabel}
            bottomDiscardLabel={bottomDiscardLabel}
            leftDiscardLabel={leftDiscardLabel}
            rightDiscardLabel={rightDiscardLabel}
            emptyDiscardPlaceholder={emptyDiscardPlaceholder}
            sideSeatLeftLabel={sideSeatLeftLabel}
            sideSeatRightLabel={sideSeatRightLabel}
          />
        ) : (
          <TwoSeatTableLayout
            tableShellClassName={tableShellClassName}
            tableCenterClassName={tableCenterClassName}
            tableStage={gamePanel.tableStage}
            actionState={actionState}
            actions={actions}
            topDiscardRow={topDiscardRow}
            bottomDiscardRow={bottomDiscardRow}
            leftDiscardRow={leftDiscardRow}
            rightDiscardRow={rightDiscardRow}
            topDiscardLabel={topDiscardLabel}
            bottomDiscardLabel={bottomDiscardLabel}
            leftDiscardLabel={leftDiscardLabel}
            rightDiscardLabel={rightDiscardLabel}
            emptyDiscardPlaceholder={emptyDiscardPlaceholder}
            sideSeatLeftLabel={sideSeatLeftLabel}
            sideSeatRightLabel={sideSeatRightLabel}
          />
        )}
        <ResultOverlay overlay={gamePanel.tableStage.resultOverlay} actions={actions} />
      </div>
    </section>
  );
}
