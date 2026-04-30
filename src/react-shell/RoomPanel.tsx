import { RULESET_OPTIONS } from "./ui-options";
import type { LobbyBridgeActions, LobbyBridgeSnapshot } from "./useAppBridge";

type RoomPanelProps = {
  ready: boolean;
  roomPanel: LobbyBridgeSnapshot["roomPanel"];
  actions: LobbyBridgeActions;
};

export function RoomPanel({ ready, roomPanel, actions }: RoomPanelProps) {
  if (!ready) {
    return <section id="room-panel" className="panel"></section>;
  }

  if (!roomPanel.hasRoom) {
    return (
      <section id="room-panel" className="panel">
        <div className="panel-head">
          <div>
            <h2>{roomPanel.title}</h2>
            <p>{roomPanel.description}</p>
          </div>
        </div>
        <div className="empty-state">
          <p>{roomPanel.emptyStateText}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="room-panel" className="panel">
      <div className="panel-head">
        <div>
          <h2>{roomPanel.title}</h2>
          <p>{roomPanel.description}</p>
        </div>
        <div className="room-actions">
          {roomPanel.canCopyLink ? (
            <button className="ghost-button" type="button" onClick={() => void actions.copyShareLink()}>
              複製邀請連結
            </button>
          ) : null}
          {roomPanel.canEditRuleset ? (
            <>
              <label className="field room-inline-field">
                <span>規則</span>
                <select
                  id="room-ruleset-select"
                  value={roomPanel.roomRulesetId}
                  onChange={(event) => actions.setRoomRulesetId(event.currentTarget.value)}
                >
                  {RULESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void actions.startGame()}
                disabled={roomPanel.startDisabled}
              >
                {roomPanel.startLabel}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="room-grid">
        <div className="room-card">
          <h3>玩家</h3>
          <div className="seat-list">
            {roomPanel.seats.map((seat) => (
              <div key={seat.seat} className={`seat-card${seat.empty ? " seat-empty" : ""}`}>
                <strong>
                  {seat.title}
                  {seat.scoreBadge ? <span className="score-badge">{seat.scoreBadge}</span> : null}
                </strong>
                <span>{seat.subtitle}</span>
                {seat.badges.length ? (
                  <div className="pill-row">
                    {seat.badges.map((badge) => (
                      <span key={`${seat.seat}-${badge}`} className="pill">
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="room-card">
          <h3>對局資訊</h3>
          <p className="phase-copy">{roomPanel.phaseCopy}</p>
          <div className="pill-row">
            {roomPanel.pills.map((pill) => (
              <span key={pill} className="pill">
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
