import { FourSeatTableLayout, ResultOverlay, TwoSeatTableLayout } from "./game-panel/TableLayouts";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./useAppBridge";

type GamePanelProps = {
  gamePanel: LobbyBridgeSnapshot["gamePanel"];
  seatCount: number;
  isSoloMode: boolean;
  actions: LobbyBridgeActions;
  fullscreenActive: boolean;
  fullscreenSupported: boolean;
  noticeBanner: LobbyBridgeSnapshot["lobby"]["noticeBanner"];
};

/*
Migration contract reference strings:
gamePanel.tableStage.latestDiscard
gamePanel.tableStage.latestDiscardPlaceholder
table-center-middle ${isFourSeatTable ? "is-four-seat" : ""}
showFloatingActions={isFourSeatTable}
label={topDiscardRow?.label || gamePanel.tableStage.opponentSection.title || "對家"}
label={bottomDiscardRow?.label || gamePanel.tableStage.selfSection.title || "你"}
 label={leftDiscardRow?.label || "西家"}
 label={rightDiscardRow?.label || "東家"}
tiles={topDiscardRow?.tiles || []}
tiles={bottomDiscardRow?.tiles || []}
tiles={leftDiscardRow?.tiles || []}
tiles={rightDiscardRow?.tiles || []}
 positionLabel="西家" section={gamePanel.tableStage.leftSection}
 positionLabel="東家" section={gamePanel.tableStage.rightSection}
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

export function GamePanel({ gamePanel, seatCount, isSoloMode, actions, fullscreenActive, fullscreenSupported, noticeBanner }: GamePanelProps) {
  const tableStageClassName = gamePanel.tableStage.hasResult ? "table-stage has-result" : "table-stage";
  const fullscreenLabel = fullscreenActive ? "離開全螢幕" : "全螢幕顯示";
  const focusNote = fullscreenSupported ? gamePanel.focusNote : "這個瀏覽器目前不支援全螢幕。";
  const [topDiscardRow, bottomDiscardRow, leftDiscardRow, rightDiscardRow] = gamePanel.tableStage.discardRows;
  const isFourSeatTable = seatCount >= 4;
  const isTwoSeatSolo = isSoloMode && !isFourSeatTable;
  const tableShellClassName = [
    "table-shell",
    isFourSeatTable ? "table-shell-four" : "table-shell-two",
    isTwoSeatSolo ? "table-shell-two-solo" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const tableCenterClassName = [
    "table-center",
    isFourSeatTable ? "table-center-four" : "table-center-two",
    isTwoSeatSolo ? "table-center-two-solo" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const actionState = gamePanel.tableStage.actions;
  const topDiscardLabel = topDiscardRow?.label || gamePanel.tableStage.opponentSection.title || "對家";
  const bottomDiscardLabel = bottomDiscardRow?.label || gamePanel.tableStage.selfSection.title || "你";
  const leftDiscardLabel = leftDiscardRow?.label || "西家";
  const rightDiscardLabel = rightDiscardRow?.label || "東家";
  const emptyDiscardPlaceholder = "尚未打牌";
  const sideSeatLeftLabel = "西家";
  const sideSeatRightLabel = "東家";

  return (
    <section id="game-panel" className="panel">
      <div className="panel-head">
        <div>
          <h2>{gamePanel.title}</h2>
          {noticeBanner ? (
            <div className="game-topbar-notice">
              <div className={`banner banner-${noticeBanner.tone}`}>{noticeBanner.message}</div>
            </div>
          ) : null}
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
            <div className="game-head-button-row">
              <button className="ghost-button focus-home" type="button" onClick={() => void actions.leaveRoom()}>
                回主畫面
              </button>
              {fullscreenSupported ? (
                <button className="ghost-button focus-toggle" type="button" onClick={() => void actions.toggleFullscreen()}>
                  {fullscreenLabel}
                </button>
              ) : null}
            </div>
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
