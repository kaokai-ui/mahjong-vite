import { FourSeatTableLayout, ResultOverlay, TwoSeatTableLayout } from "./game-panel/TableLayouts";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./useAppBridge";
import { useGameVoiceCues } from "./useGameVoiceCues";

type GamePanelProps = {
  gamePanel: LobbyBridgeSnapshot["gamePanel"];
  seatCount: number;
  isSoloMode: boolean;
  actions: LobbyBridgeActions;
  fullscreenActive: boolean;
  fullscreenSupported: boolean;
  noticeBanner: LobbyBridgeSnapshot["lobby"]["noticeBanner"];
};

export function GamePanel({ gamePanel, seatCount, isSoloMode, actions, fullscreenActive, fullscreenSupported, noticeBanner }: GamePanelProps) {
  useGameVoiceCues(gamePanel.tableStage);
  const tableStageClassName = gamePanel.tableStage.hasResult ? "table-stage has-result" : "table-stage";
  const fullscreenLabel = fullscreenActive ? "離開全螢幕" : "全螢幕顯示";
  const focusNote = fullscreenSupported ? gamePanel.focusNote : "這個瀏覽器目前不支援全螢幕。";
  const [topDiscardRow, bottomDiscardRow, leftDiscardRow, rightDiscardRow] = gamePanel.tableStage.discardRows;
  // The live table snapshot is authoritative for online 4P; keep the prop as
  // a fallback for the minimal solo shell before its first snapshot arrives.
  const resolvedSeatCount = Number(gamePanel.tableStage.seatCount) || seatCount;
  const isFourSeatTable = resolvedSeatCount >= 4;
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
  const leftDiscardLabel = leftDiscardRow?.label || "上家";
  const rightDiscardLabel = rightDiscardRow?.label || "下家";
  const emptyDiscardPlaceholder = "尚未打牌";
  const sideSeatLeftLabel = "上家";
  const sideSeatRightLabel = "下家";

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
              {gamePanel.pills.map((pill, pillIndex) => (
                <span key={`${pill}-${pillIndex}`} className="pill">
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
