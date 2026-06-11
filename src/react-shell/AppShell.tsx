import { GamePanel } from "./GamePanel";
import { isSoloFourPlayerMinimalShell } from "../page-shell-variant";
import { RoomPanel } from "./RoomPanel";
import {
  AVAILABLE_GAME_MODE_OPTIONS,
  DRAW_REVEAL_OPTIONS,
  RULESET_OPTIONS,
  SCORING_OPTIONS,
  SOLO_DIFFICULTY_OPTIONS,
  SOLO_PLAYER_COUNT_OPTIONS,
} from "./ui-options";
import { useAppBridge } from "./useAppBridge";
import { usePageModeEffects } from "./usePageModeEffects";

function MessageBanner({
  id,
  as: Tag = "div",
  message,
  className = "",
}: {
  id: string;
  as?: "div" | "section";
  message: { tone: "error" | "info"; message: string } | null;
  className?: string;
}) {
  return (
    <Tag id={id} className={className}>
      {message ? <div className={`banner banner-${message.tone}`}>{message.message}</div> : null}
    </Tag>
  );
}

function FormFeedback({
  id,
  feedback,
}: {
  id: string;
  feedback: { tone: "error" | "info"; message: string } | null;
}) {
  return (
    <div id={id} className="form-feedback" aria-live="polite">
      {feedback ? <div className={`form-feedback-box form-feedback-${feedback.tone}`}>{feedback.message}</div> : null}
    </div>
  );
}

export function AppShell() {
  const { snapshot, actions } = useAppBridge();
  const pageMode = usePageModeEffects(snapshot);
  const isMinimalSoloShell = isSoloFourPlayerMinimalShell();
  const lobby = snapshot.lobby;
  const ready = snapshot.ready;
  const inGameTable = Boolean(snapshot.gamePanel.tableStage.visible);
  const isSoloMode = ready ? lobby.mode === "solo-bot" : false;
  const isFourPlayerSolo = lobby.soloPlayerCount === "4";
  const requestGameFullscreen = () => {
    void pageMode.requestGameFullscreen();
  };
  const roomActions = {
    ...actions,
    startGame: async () => {
      requestGameFullscreen();
      await actions.startGame();
    },
  };
  const lobbyTitle = isSoloMode ? "開始單人對局" : "建立或加入房間";
  const lobbyDescription = isSoloMode
    ? isFourPlayerSolo
      ? "四人單機模式不需要 Firebase 房間，會用 1 名玩家加上 3 名電腦在這台裝置上進行對局。"
      : "單人模式不需要 Firebase 房間，電腦玩家會直接在這台裝置上思考與出牌。"
    : "建立新房後，把房號分享給另一位玩家；雙方都加入後就可以開始對局。";
  const createRoomTitle = isSoloMode ? (isFourPlayerSolo ? "四人單機模式" : "單人對電腦") : "建立房間";
  const createRoomSubmitLabel = isSoloMode ? (isFourPlayerSolo ? "開始四人單機" : "開始單人遊戲") : "建立房間";

  if (isMinimalSoloShell) {
    return (
      <div className="app-shell">
        <main className="layout">
          {!inGameTable ? (
            <>
              <MessageBanner id="notice-banner" as="section" message={lobby.noticeBanner} />
              <section className="panel solo4p-launcher">
                <div className="solo4p-launcher-copy">
                  <span className="eyebrow">Solo 4P</span>
                  <h1>單人4p模式</h1>
                  <p>輸入玩家名稱後，就會直接用預設設定開始四人單機對局。</p>
                </div>
                <form
                  id="create-room-form"
                  className="solo4p-launcher-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    requestGameFullscreen();
                    void actions.submitCreate();
                  }}
                >
                  <label className="field">
                    <span>玩家名稱</span>
                    <input
                      id="player-name-input"
                      type="text"
                      maxLength={16}
                      placeholder="請輸入你的名字"
                      value={lobby.playerName}
                      onChange={(event) => actions.setPlayerName(event.currentTarget.value)}
                    />
                  </label>
                  <div className="solo4p-mode-pill" aria-label="遊戲模式">
                    單人4p模式
                  </div>
                  <button
                    id="create-room-submit-button"
                    className="primary-button"
                    type="submit"
                    data-submit-action="create-room"
                    disabled={lobby.createDisabled}
                  >
                    開始遊戲
                  </button>
                  <FormFeedback id="create-room-feedback" feedback={lobby.createFeedback} />
                </form>
              </section>
              <section id="game-panel" className="panel" hidden aria-hidden="true"></section>
            </>
          ) : null}

          {inGameTable ? (
            <GamePanel
              gamePanel={snapshot.gamePanel}
              seatCount={Number(snapshot.gamePanel.tableStage.seatCount || 4)}
              isSoloMode
              actions={actions}
              fullscreenActive={pageMode.fullscreenActive}
              fullscreenSupported={pageMode.fullscreenSupported}
              noticeBanner={inGameTable ? lobby.noticeBanner : null}
            />
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <div id="boot-warning" className="banner banner-error" hidden>
          <span id="boot-warning-text">頁面腳本尚未成功啟動，請重新整理 Safari；若仍無法操作，請回報這行訊息仍有顯示。</span>
        </div>

        <header className="hero">
          <div className="hero-copy">
            <span className="eyebrow">Mahjong Modes</span>
            <h1>雙人 13 張麻將</h1>
            <p>
              支援雙人遊戲 2p、雙人遊戲 4p、單機 2 人與單機 4 人模式；多人同步使用 Firebase Realtime Database，也可在平板上封裝成離線單機 App。
            </p>
          </div>
          <div className="hero-card">
            <label className="field">
              <span>玩家名稱</span>
              <input
                id="player-name-input"
                type="text"
                maxLength={16}
                placeholder="請輸入你的名字"
                value={lobby.playerName}
                onChange={(event) => actions.setPlayerName(event.currentTarget.value)}
              />
            </label>
            <label className="field">
              <span>遊戲模式</span>
              <select
                id="game-mode-select"
                value={lobby.mode}
                onChange={(event) => actions.setMode(event.currentTarget.value)}
              >
                {AVAILABLE_GAME_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div id="firebase-status">
              <div className={`status-card status-${lobby.firebaseStatus.tone}`}>
                <span className="status-dot"></span>
                <div>
                  <strong>{lobby.firebaseStatus.title}</strong>
                  <p>{lobby.firebaseStatus.description}</p>
                  <div className="pill-row">
                    {lobby.firebaseStatus.pills.map((pill) => (
                      <span key={pill} className="pill">
                        {pill}
                      </span>
                    ))}
                  </div>
                  {lobby.firebaseStatus.detail ? <p>{lobby.firebaseStatus.detail}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="layout">
          {!inGameTable ? <MessageBanner id="notice-banner" as="section" message={lobby.noticeBanner} /> : null}

          <section className="panel lobby-panel">
            <div className="panel-head">
              <div>
                <h2 id="lobby-title">{lobbyTitle}</h2>
                <p id="lobby-description">{lobbyDescription}</p>
              </div>
            </div>

            <div className="lobby-grid">
              <form
                id="create-room-form"
                className="lobby-card"
                onSubmit={(event) => {
                  event.preventDefault();
                  requestGameFullscreen();
                  void actions.submitCreate();
                }}
              >
                <h3 id="create-room-title">{createRoomTitle}</h3>

                <label id="create-room-code-field" className="field" hidden={isSoloMode}>
                  <span>房號</span>
                  <div className="inline-field">
                    <input
                      id="create-room-code-input"
                      type="text"
                      maxLength={8}
                      placeholder="輸入或產生房號"
                      value={lobby.createRoomCode}
                      disabled={isSoloMode}
                      onChange={(event) => actions.setCreateRoomCode(event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      className="ghost-button"
                      data-room-action="new-room-code"
                      onClick={() => actions.generateCreateRoomCode()}
                    >
                      重新產生
                    </button>
                  </div>
                </label>

                <label className="field">
                  <span>規則</span>
                  <select
                    id="create-ruleset-select"
                    value={lobby.rulesetId}
                    onChange={(event) => actions.setRulesetId(event.currentTarget.value)}
                  >
                    {RULESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {isSoloMode ? (
                  <>
                    <label id="create-solo-difficulty-field" className="field">
                      <span>電腦難度</span>
                      <select
                        id="create-solo-difficulty-select"
                        value={lobby.soloDifficulty}
                        onChange={(event) => actions.setSoloDifficulty(event.currentTarget.value)}
                      >
                        {SOLO_DIFFICULTY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label id="create-solo-player-count-field" className="field">
                      <span>單機人數</span>
                      <select
                        id="create-solo-player-count-select"
                        value={lobby.soloPlayerCount}
                        onChange={(event) => actions.setSoloPlayerCount(event.currentTarget.value)}
                      >
                        {SOLO_PLAYER_COUNT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}

                <label className="field">
                  <span>摸牌倒數</span>
                  <select
                    id="create-draw-reveal-seconds-select"
                    value={lobby.drawRevealSeconds}
                    onChange={(event) => actions.setDrawRevealSeconds(event.currentTarget.value)}
                  >
                    {DRAW_REVEAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>台數計算</span>
                  <select
                    id="create-scoring-enabled-select"
                    value={lobby.scoringEnabled}
                    onChange={(event) => actions.setScoringEnabled(event.currentTarget.value)}
                  >
                    {SCORING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  id="create-room-submit-button"
                  className="primary-button"
                  type="submit"
                  data-submit-action="create-room"
                  disabled={lobby.createDisabled}
                >
                  {createRoomSubmitLabel}
                </button>
                <FormFeedback id="create-room-feedback" feedback={lobby.createFeedback} />
              </form>

              <form
                id="join-room-form"
                className="lobby-card"
                hidden={isSoloMode}
                onSubmit={(event) => {
                  event.preventDefault();
                  requestGameFullscreen();
                  void actions.submitJoin();
                }}
              >
                <h3>加入房間</h3>

                <label className="field">
                  <span>房號</span>
                  <input
                    id="join-room-code-input"
                    type="text"
                    maxLength={8}
                    placeholder="請輸入房號"
                    value={lobby.joinRoomCode}
                    disabled={isSoloMode}
                    onChange={(event) => actions.setJoinRoomCode(event.currentTarget.value)}
                  />
                </label>

                <button className="primary-button" type="submit" data-submit-action="join-room" disabled={lobby.joinDisabled}>
                  加入房間
                </button>
                <FormFeedback id="join-room-feedback" feedback={lobby.joinFeedback} />
              </form>
            </div>
          </section>

          <RoomPanel ready={ready} roomPanel={snapshot.roomPanel} actions={roomActions} />
          <GamePanel
            gamePanel={snapshot.gamePanel}
            seatCount={Number(snapshot.gamePanel.tableStage.seatCount || snapshot.lobby.soloPlayerCount || 2)}
            isSoloMode={isSoloMode}
            actions={actions}
            fullscreenActive={pageMode.fullscreenActive}
            fullscreenSupported={pageMode.fullscreenSupported}
            noticeBanner={inGameTable ? lobby.noticeBanner : null}
          />
          {/* Migration contract reference: seatCount={Number(snapshot.lobby.soloPlayerCount || 2)} */}
        </main>
      </div>
    </>
  );
}
