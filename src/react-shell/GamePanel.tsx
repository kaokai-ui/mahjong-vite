import { lazy, Suspense } from "react";
import { FourSeatTableLayout, ResultOverlay, TwoSeatTableLayout } from "./game-panel/TableLayouts";
import { isTableV2Enabled, getTableV1Href } from "../table-version";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./useAppBridge";
import { useGameVoiceCues } from "./useGameVoiceCues";

const TableV2 = lazy(() => import("./game-panel/TableV2").then((module) => ({ default: module.TableV2 })));

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
  const tableV2Enabled = isTableV2Enabled();
  const tableStageClassName = [
    "table-stage",
    gamePanel.tableStage.hasResult ? "has-result" : "",
    tableV2Enabled ? "table-stage-v2-host" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
              {tableV2Enabled ? (
                <a className="ghost-button v2-switch-button" href={getTableV1Href()}>
                  回到1代牌桌
                </a>
              ) : null}
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
        {tableV2Enabled ? (
          <Suspense fallback={<div className="table-v2-loading">正在準備 2 代牌桌…</div>}>
            <TableV2 tableStage={gamePanel.tableStage} seatCount={resolvedSeatCount} isSoloMode={isSoloMode} actions={actions} />
          </Suspense>
        ) : isFourSeatTable ? (
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
