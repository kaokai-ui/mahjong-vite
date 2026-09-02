import { EdgeSeatSection, SelfSection, TopSeatSection } from "./SeatSections";
import { DiscardTile, TileFaceButton } from "./TilePrimitives";
import type {
  DiscardRowSnapshot,
  GameResultOverlaySnapshot,
  LobbyBridgeActions,
  TableActionState,
  TableStageSnapshot,
} from "./types";

function DiscardLane({
  label,
  tiles,
  placeholderText,
  direction,
  className,
}: {
  label: string;
  tiles: DiscardRowSnapshot["tiles"];
  placeholderText: string;
  direction: "top" | "bottom" | "left" | "right" | "center";
  className?: string;
}) {
  const isVertical = direction === "left" || direction === "right";
  const verticalColumns = isVertical
    ? (() => {
        const columns: DiscardRowSnapshot["tiles"][] = [];
        for (let index = 0; index < tiles.length; index += 3) {
          columns.push(tiles.slice(index, index + 3));
        }
        return direction === "right" ? columns.reverse() : columns;
      })()
    : [];

  return (
    <div className={`discard-lane discard-lane-${direction} ${className || ""}`.trim()}>
      <span className="discard-lane-label">{label}</span>
      {isVertical ? (
        <div className={`discard-line discard-line-vertical discard-line-vertical-${direction}`}>
          {tiles.length ? (
            verticalColumns.map((column, columnIndex) => (
              <div key={`discard-column-${direction}-${columnIndex}`} className="discard-column">
                {column.map((discard, discardIndex) => (
                  <DiscardTile key={`${discard.tile.tileId}-${columnIndex}-${discardIndex}`} discard={discard} />
                ))}
              </div>
            ))
          ) : placeholderText ? (
            <span className="placeholder">{placeholderText}</span>
          ) : null}
        </div>
      ) : (
        <div className="discard-line discard-line-horizontal">
          {tiles.length ? (
            tiles.map((discard, discardIndex) => (
              <DiscardTile key={`${discard.tile.tileId}-${discardIndex}`} discard={discard} />
            ))
          ) : placeholderText ? (
            <span className="placeholder">{placeholderText}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ResultOverlay({
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
          {overlay.sourceLabel ? <p className="result-source">{overlay.sourceLabel}</p> : null}
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

function TwoSeatCenterMiddle() {
  return <div className="table-center-core table-center-core-two" aria-hidden="true" />;
}

function FourSeatDiscardStack({
  topDiscardRow,
  leftDiscardRow,
  rightDiscardRow,
  bottomDiscardRow,
  topDiscardLabel,
  leftDiscardLabel,
  rightDiscardLabel,
  bottomDiscardLabel,
}: {
  topDiscardRow: DiscardRowSnapshot;
  leftDiscardRow: DiscardRowSnapshot;
  rightDiscardRow: DiscardRowSnapshot;
  bottomDiscardRow: DiscardRowSnapshot;
  topDiscardLabel: string;
  leftDiscardLabel: string;
  rightDiscardLabel: string;
  bottomDiscardLabel: string;
}) {
  const rows = [
    { key: "top", row: topDiscardRow, label: topDiscardLabel },
    { key: "left", row: leftDiscardRow, label: leftDiscardLabel },
    { key: "right", row: rightDiscardRow, label: rightDiscardLabel },
    { key: "bottom", row: bottomDiscardRow, label: bottomDiscardLabel },
  ];

  return (
    <div className="four-seat-discard-scroll-viewport">
      <div className="four-seat-discard-stack">
        {rows.map(({ key, row, label }) => {
          // The shared snapshot keeps the newest discard first for the legacy
          // 2P presentation; RetroPie 4P rows read chronologically left-to-right.
          const tiles = [...(row?.tiles || [])].reverse();

          return (
            <DiscardLane
              key={`four-seat-discard-${key}`}
              label={label}
              tiles={tiles}
              placeholderText={row?.placeholderText || ""}
              direction="center"
              className={`four-seat-discard-row four-seat-discard-row-${key}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function TableCenterBoard({
  tableCenterClassName,
  isFourSeatTable,
  topDiscardRow,
  bottomDiscardRow,
  leftDiscardRow,
  rightDiscardRow,
  topDiscardLabel,
  bottomDiscardLabel,
  leftDiscardLabel,
  rightDiscardLabel,
  emptyDiscardPlaceholder,
}: {
  tableCenterClassName: string;
  isFourSeatTable: boolean;
  topDiscardRow: DiscardRowSnapshot;
  bottomDiscardRow: DiscardRowSnapshot;
  leftDiscardRow: DiscardRowSnapshot;
  rightDiscardRow: DiscardRowSnapshot;
  topDiscardLabel: string;
  bottomDiscardLabel: string;
  leftDiscardLabel: string;
  rightDiscardLabel: string;
  emptyDiscardPlaceholder: string;
}) {
  return (
    <section className={tableCenterClassName}>
      <div className={`table-center-board ${isFourSeatTable ? "table-center-board-four" : ""}`.trim()}>
        {isFourSeatTable ? (
          <FourSeatDiscardStack
            topDiscardRow={topDiscardRow}
            leftDiscardRow={leftDiscardRow}
            rightDiscardRow={rightDiscardRow}
            bottomDiscardRow={bottomDiscardRow}
            topDiscardLabel={topDiscardLabel}
            leftDiscardLabel={leftDiscardLabel}
            rightDiscardLabel={rightDiscardLabel}
            bottomDiscardLabel={bottomDiscardLabel}
          />
        ) : (
          <>
            <DiscardLane
              label={topDiscardLabel}
              tiles={topDiscardRow?.tiles || []}
              placeholderText={topDiscardRow?.placeholderText || emptyDiscardPlaceholder}
              direction="top"
            />
            <div className="table-center-middle is-two-seat">
              <TwoSeatCenterMiddle />
            </div>
            <DiscardLane
              label={bottomDiscardLabel}
              tiles={bottomDiscardRow?.tiles || []}
              placeholderText={bottomDiscardRow?.placeholderText || emptyDiscardPlaceholder}
              direction="bottom"
            />
          </>
        )}
      </div>
    </section>
  );
}

type TableLayoutSharedProps = {
  tableShellClassName: string;
  tableCenterClassName: string;
  tableStage: TableStageSnapshot;
  actionState: TableActionState;
  actions: LobbyBridgeActions;
  topDiscardRow: DiscardRowSnapshot;
  bottomDiscardRow: DiscardRowSnapshot;
  leftDiscardRow: DiscardRowSnapshot;
  rightDiscardRow: DiscardRowSnapshot;
  topDiscardLabel: string;
  bottomDiscardLabel: string;
  leftDiscardLabel: string;
  rightDiscardLabel: string;
  emptyDiscardPlaceholder: string;
  sideSeatLeftLabel: string;
  sideSeatRightLabel: string;
};

export function TwoSeatTableLayout({
  tableShellClassName,
  tableCenterClassName,
  tableStage,
  actionState,
  actions,
  topDiscardRow,
  bottomDiscardRow,
  leftDiscardRow,
  rightDiscardRow,
  topDiscardLabel,
  bottomDiscardLabel,
  leftDiscardLabel,
  rightDiscardLabel,
  emptyDiscardPlaceholder,
}: TableLayoutSharedProps) {
  return (
    <div className={tableShellClassName}>
      <TopSeatSection section={tableStage.opponentSection} />
      <TableCenterBoard
        tableCenterClassName={tableCenterClassName}
        isFourSeatTable={false}
        topDiscardRow={topDiscardRow}
        bottomDiscardRow={bottomDiscardRow}
        leftDiscardRow={leftDiscardRow}
        rightDiscardRow={rightDiscardRow}
        topDiscardLabel={topDiscardLabel}
        bottomDiscardLabel={bottomDiscardLabel}
        leftDiscardLabel={leftDiscardLabel}
        rightDiscardLabel={rightDiscardLabel}
        emptyDiscardPlaceholder={emptyDiscardPlaceholder}
      />
      <SelfSection section={tableStage.selfSection} actionState={actionState} actions={actions} showFloatingActions />
    </div>
  );
}

export function FourSeatTableLayout({
  tableShellClassName,
  tableCenterClassName,
  tableStage,
  actionState,
  actions,
  topDiscardRow,
  bottomDiscardRow,
  leftDiscardRow,
  rightDiscardRow,
  topDiscardLabel,
  bottomDiscardLabel,
  leftDiscardLabel,
  rightDiscardLabel,
  emptyDiscardPlaceholder,
  sideSeatLeftLabel,
  sideSeatRightLabel,
}: TableLayoutSharedProps) {
  return (
    <div className={tableShellClassName}>
      <TopSeatSection section={tableStage.opponentSection} compactStandingRack />
      <EdgeSeatSection positionLabel={sideSeatLeftLabel} section={tableStage.leftSection} direction="left" />
      <TableCenterBoard
        tableCenterClassName={tableCenterClassName}
        isFourSeatTable
        topDiscardRow={topDiscardRow}
        bottomDiscardRow={bottomDiscardRow}
        leftDiscardRow={leftDiscardRow}
        rightDiscardRow={rightDiscardRow}
        topDiscardLabel={topDiscardLabel}
        bottomDiscardLabel={bottomDiscardLabel}
        leftDiscardLabel={leftDiscardLabel}
        rightDiscardLabel={rightDiscardLabel}
        emptyDiscardPlaceholder={emptyDiscardPlaceholder}
      />
      <EdgeSeatSection positionLabel={sideSeatRightLabel} section={tableStage.rightSection} direction="right" />
      <SelfSection section={tableStage.selfSection} actionState={actionState} actions={actions} showFloatingActions />
    </div>
  );
}
