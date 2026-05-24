import { DEFAULT_RULESET, RULE_PRESETS, getRuleset } from "./rules.js";
import { GAME_MODE_ONLINE_2P, GAME_MODE_ONLINE_4P } from "./game-mode.js";

export const FIREBASE_ROOM_ID_MAX_LENGTH = 8;
export const FIREBASE_RANDOM_ROOM_CODE_LENGTH = 6;
export const FIREBASE_RANDOM_ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const FIREBASE_RULESET_IDS = Object.freeze(Object.keys(RULE_PRESETS));
export const FIREBASE_RULESET_ID_REGEX_SOURCE = `^(${FIREBASE_RULESET_IDS.join("|")})$`;
export const FIREBASE_GAME_MODE_IDS = Object.freeze([GAME_MODE_ONLINE_2P, GAME_MODE_ONLINE_4P]);
export const FIREBASE_GAME_MODE_REGEX_SOURCE = `^(${FIREBASE_GAME_MODE_IDS.join("|")})$`;
export const FIREBASE_TILE_ID_REGEX_SOURCE = "^[A-Za-z0-9-]{2,16}$";
export const FIREBASE_TILE_TYPE_REGEX_SOURCE = "^[A-Za-z0-9-]{1,8}$";

export const FIREBASE_COMMAND_TYPES = Object.freeze([
  "startGame",
  "restartGame",
  "drawTile",
  "discardTile",
  "passClaim",
  "claimChow",
  "claimPung",
  "claimDiscardKong",
  "declareSelfDraw",
  "claimWin",
  "concealedKong",
  "addedKong",
]);

export const FIREBASE_COMMAND_TYPE_SET = new Set(FIREBASE_COMMAND_TYPES);
export const FIREBASE_COMMAND_TYPE_REGEX_SOURCE = `^(${FIREBASE_COMMAND_TYPES.join("|")})$`;

function buildFirebaseStringMatchValidateRule(regexSource) {
  return `newData.isString() && newData.val().matches(/${regexSource}/)`;
}

function buildFirebaseHasChildrenRule(keys) {
  return `newData.hasChildren([${keys.map((key) => `'${key}'`).join(",")}])`;
}

function buildFirebaseCommandPayloadTypeRule(commandTypePath, commandType, condition) {
  return `${commandTypePath} == '${commandType}' && (${condition})`;
}

export const FIREBASE_RULESET_VALIDATE_RULE = buildFirebaseStringMatchValidateRule(FIREBASE_RULESET_ID_REGEX_SOURCE);
export const FIREBASE_GAME_MODE_VALIDATE_RULE = buildFirebaseStringMatchValidateRule(FIREBASE_GAME_MODE_REGEX_SOURCE);
export const FIREBASE_COMMAND_TYPE_VALIDATE_RULE = buildFirebaseStringMatchValidateRule(FIREBASE_COMMAND_TYPE_REGEX_SOURCE);
export const FIREBASE_TILE_ID_VALIDATE_RULE = buildFirebaseStringMatchValidateRule(FIREBASE_TILE_ID_REGEX_SOURCE);
export const FIREBASE_TILE_TYPE_VALIDATE_RULE = buildFirebaseStringMatchValidateRule(FIREBASE_TILE_TYPE_REGEX_SOURCE);
export const FIREBASE_NEEDED_TYPES_VALIDATE_RULE =
  `${buildFirebaseHasChildrenRule(["0", "1"])} && !newData.child('2').exists()`;
export const FIREBASE_ROOM_META_HOST_PLAYER_VALIDATE_RULE =
  "newData.isString() && newData.val() == newData.parent().child('seats/0').val() && " +
  "newData.parent().child('participants/' + newData.val()).val() == true";
export const FIREBASE_ROOM_META_SEAT0_VALIDATE_RULE =
  "newData.isString() && newData.val() == newData.parent().parent().child('hostPlayerId').val()";
export const FIREBASE_ROOM_META_SEAT1_VALIDATE_RULE =
  "newData.exists() == false || (newData.isString() && newData.val() != newData.parent().child('0').val() && " +
  "newData.parent().parent().child('participants/' + newData.val()).val() == true)";
export const FIREBASE_ROOM_META_PARTICIPANT_VALIDATE_RULE =
  "newData.val() == true && ($uid == newData.parent().parent().child('seats/0').val() || " +
  "$uid == newData.parent().parent().child('seats/1').val())";
export const FIREBASE_ROOM_META_PLAYER_COUNT_VALIDATE_RULE =
  "newData.isNumber() && ((newData.parent().child('seats/1').exists() && newData.val() == 2) || " +
  "(!newData.parent().child('seats/1').exists() && newData.val() == 1))";
export const FIREBASE_ROOM_META_OPEN_VALIDATE_RULE =
  "newData.isBoolean() && ((newData.parent().child('seats/1').exists() && newData.val() == false) || " +
  "(!newData.parent().child('seats/1').exists() && newData.val() == true))";
export const FIREBASE_ROOM_META_GAME_MODE_VALIDATE_RULE = FIREBASE_GAME_MODE_VALIDATE_RULE;
export const FIREBASE_ROOM_META_TABLE_PLAYER_COUNT_VALIDATE_RULE =
  "newData.isNumber() && ((newData.parent().child('gameMode').val() == 'online-4p' && newData.val() == 4) || " +
  "(newData.parent().child('gameMode').val() != 'online-4p' && newData.val() == 2))";
export const FIREBASE_ROOM_META_SEAT_BROWSER_ID0_VALIDATE_RULE =
  "newData.isString() && newData.val() == newData.parent().parent().child('hostBrowserId').val()";
export const FIREBASE_ROOM_META_SEAT_BROWSER_ID1_VALIDATE_RULE =
  "newData.exists() == false || (newData.isString() && newData.parent().parent().child('seats/1').exists())";
export const FIREBASE_ROOM_META_BOT_DIFFICULTY_VALIDATE_RULE =
  "newData.isString() && newData.val().matches(/^(easy|normal|hard|god)$/)";
export const FIREBASE_ROOM_META_BOT_THINKING_VALIDATE_RULE = "newData.isBoolean()";
export const FIREBASE_ROOM_META_BOT_THINKING_SEAT_VALIDATE_RULE =
  "newData.exists() == false || (newData.isNumber() && (newData.val() == 1 || newData.val() == 3))";
export const FIREBASE_COMMAND_PAYLOAD_VALIDATE_RULE =
  buildFirebaseCommandPayloadValidateRule("newData.parent().child('type').val()");
export const FIREBASE_COMMAND_ENVELOPE_VALIDATE_RULE =
  "newData.exists() == false || " +
  "(newData.hasChildren(['type','fromPlayerId','createdAt']) && " +
  "newData.child('type').isString() && " +
  `newData.child('type').val().matches(/${FIREBASE_COMMAND_TYPE_REGEX_SOURCE}/) && ` +
  "newData.child('fromPlayerId').isString() && " +
  "newData.child('createdAt').isNumber() && " +
  `(${buildFirebaseCommandPayloadValidateRule("newData.child('type').val()", "newData.child('payload')")}))`;
export const FIREBASE_COMMAND_PAYLOAD_VALIDATE_RULES = Object.freeze({
  rulesetId: FIREBASE_RULESET_VALIDATE_RULE,
  tileId: FIREBASE_TILE_ID_VALIDATE_RULE,
  tileType: FIREBASE_TILE_TYPE_VALIDATE_RULE,
  meldId: "newData.isNumber()",
  neededTypesItem: FIREBASE_TILE_TYPE_VALIDATE_RULE,
});
export const FIREBASE_ROOM_META_VALIDATE_RULES = Object.freeze({
  hostPlayerId: FIREBASE_ROOM_META_HOST_PLAYER_VALIDATE_RULE,
  participant: FIREBASE_ROOM_META_PARTICIPANT_VALIDATE_RULE,
  playerCount: FIREBASE_ROOM_META_PLAYER_COUNT_VALIDATE_RULE,
  gameMode: FIREBASE_ROOM_META_GAME_MODE_VALIDATE_RULE,
  tablePlayerCount: FIREBASE_ROOM_META_TABLE_PLAYER_COUNT_VALIDATE_RULE,
  open: FIREBASE_ROOM_META_OPEN_VALIDATE_RULE,
  seat0: FIREBASE_ROOM_META_SEAT0_VALIDATE_RULE,
  seat1: FIREBASE_ROOM_META_SEAT1_VALIDATE_RULE,
  seatBrowserId0: FIREBASE_ROOM_META_SEAT_BROWSER_ID0_VALIDATE_RULE,
  seatBrowserId1: FIREBASE_ROOM_META_SEAT_BROWSER_ID1_VALIDATE_RULE,
  botDifficulty: FIREBASE_ROOM_META_BOT_DIFFICULTY_VALIDATE_RULE,
  botThinking: FIREBASE_ROOM_META_BOT_THINKING_VALIDATE_RULE,
  botThinkingSeat: FIREBASE_ROOM_META_BOT_THINKING_SEAT_VALIDATE_RULE,
});

function buildFirebaseCommandPayloadValidateRule(commandTypePath, payloadPath = "newData") {
  const noPayloadCondition = `!${payloadPath}.exists()`;

  return [
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "startGame", `(${noPayloadCondition} || ${payloadPath}.hasChildren(['rulesetId']))`),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "restartGame", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "drawTile", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "discardTile", `${payloadPath}.hasChildren(['tileId'])`),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "passClaim", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "claimChow", `${payloadPath}.hasChildren(['neededTypes'])`),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "claimPung", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "claimDiscardKong", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "declareSelfDraw", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "claimWin", noPayloadCondition),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "concealedKong", `${payloadPath}.hasChildren(['tileType'])`),
    buildFirebaseCommandPayloadTypeRule(commandTypePath, "addedKong", `${payloadPath}.hasChildren(['meldId','tileId'])`),
  ].join(" || ");
}

export const FIREBASE_COMMAND_PAYLOAD_KEYS_BY_TYPE = Object.freeze({
  startGame: Object.freeze(["rulesetId"]),
  restartGame: Object.freeze([]),
  drawTile: Object.freeze([]),
  discardTile: Object.freeze(["tileId"]),
  passClaim: Object.freeze([]),
  claimChow: Object.freeze(["neededTypes"]),
  claimPung: Object.freeze([]),
  claimDiscardKong: Object.freeze([]),
  declareSelfDraw: Object.freeze([]),
  claimWin: Object.freeze([]),
  concealedKong: Object.freeze(["tileType"]),
  addedKong: Object.freeze(["meldId", "tileId"]),
});

const FIREBASE_REQUIRED_COMMAND_PAYLOAD_KEYS_BY_TYPE = Object.freeze({
  discardTile: Object.freeze(["tileId"]),
  claimChow: Object.freeze(["neededTypes"]),
  concealedKong: Object.freeze(["tileType"]),
  addedKong: Object.freeze(["meldId", "tileId"]),
});

const rulesetIdPattern = new RegExp(FIREBASE_RULESET_ID_REGEX_SOURCE);
const tileIdPattern = new RegExp(FIREBASE_TILE_ID_REGEX_SOURCE);
const tileTypePattern = new RegExp(FIREBASE_TILE_TYPE_REGEX_SOURCE);

export function normalizeFirebaseRoomId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, FIREBASE_ROOM_ID_MAX_LENGTH);
}

export function createRandomFirebaseRoomId(rng = Math.random) {
  let code = "";
  for (let index = 0; index < FIREBASE_RANDOM_ROOM_CODE_LENGTH; index += 1) {
    code += FIREBASE_RANDOM_ROOM_CODE_ALPHABET[Math.floor(rng() * FIREBASE_RANDOM_ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeFirebaseRulesetId(value) {
  return getRuleset(value || DEFAULT_RULESET).id;
}

export function isSupportedFirebaseCommandType(value) {
  return FIREBASE_COMMAND_TYPE_SET.has(String(value || "").trim());
}

export function sanitizeFirebaseCommandPayload(type, payload = {}) {
  const normalizedType = String(type || "").trim();
  const allowedKeys = FIREBASE_COMMAND_PAYLOAD_KEYS_BY_TYPE[normalizedType];

  if (!allowedKeys || !allowedKeys.length) {
    return undefined;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("操作資料格式不正確。");
  }

  const sanitizedPayload = {};

  for (const key of allowedKeys) {
    const value = sanitizeFirebasePayloadValue(key, payload[key]);
    if (value !== undefined) {
      sanitizedPayload[key] = value;
    }
  }

  const requiredKeys = FIREBASE_REQUIRED_COMMAND_PAYLOAD_KEYS_BY_TYPE[normalizedType] || [];
  for (const key of requiredKeys) {
    if (sanitizedPayload[key] === undefined) {
      throw new Error("操作資料不完整。");
    }
  }

  return Object.keys(sanitizedPayload).length ? sanitizedPayload : undefined;
}

function sanitizeFirebasePayloadValue(key, value) {
  if (value === undefined) {
    return undefined;
  }

  switch (key) {
    case "rulesetId":
      return normalizeFirebaseRulesetId(value);
    case "tileId":
      return isValidFirebaseTileId(value) ? String(value).trim() : undefined;
    case "tileType":
      return isValidFirebaseTileType(value) ? String(value).trim() : undefined;
    case "meldId":
      return Number.isInteger(value) ? value : undefined;
    case "neededTypes":
      return sanitizeNeededTypes(value);
    default:
      return undefined;
  }
}

function sanitizeNeededTypes(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value
    .map((item) => (isValidFirebaseTileType(item) ? String(item).trim() : ""))
    .filter(Boolean);

  return sanitized.length === 2 ? sanitized : undefined;
}

function isValidFirebaseTileId(value) {
  return typeof value === "string" && tileIdPattern.test(String(value).trim());
}

function isValidFirebaseTileType(value) {
  return typeof value === "string" && tileTypePattern.test(String(value).trim());
}

export function getFirebaseRulesContractSnapshot() {
  return {
    defaultRulesetId: DEFAULT_RULESET,
    rulesetIds: FIREBASE_RULESET_IDS,
    rulesetIdRegexSource: FIREBASE_RULESET_ID_REGEX_SOURCE,
    commandTypes: FIREBASE_COMMAND_TYPES,
    commandTypeRegexSource: FIREBASE_COMMAND_TYPE_REGEX_SOURCE,
    tileIdRegexSource: FIREBASE_TILE_ID_REGEX_SOURCE,
    tileTypeRegexSource: FIREBASE_TILE_TYPE_REGEX_SOURCE,
    validateRules: {
      rulesetId: FIREBASE_RULESET_VALIDATE_RULE,
      commandType: FIREBASE_COMMAND_TYPE_VALIDATE_RULE,
      commandEnvelope: FIREBASE_COMMAND_ENVELOPE_VALIDATE_RULE,
      commandPayload: FIREBASE_COMMAND_PAYLOAD_VALIDATE_RULE,
      neededTypes: FIREBASE_NEEDED_TYPES_VALIDATE_RULE,
      roomMeta: FIREBASE_ROOM_META_VALIDATE_RULES,
      payload: FIREBASE_COMMAND_PAYLOAD_VALIDATE_RULES,
    },
    roomIdMaxLength: FIREBASE_ROOM_ID_MAX_LENGTH,
    randomRoomCodeLength: FIREBASE_RANDOM_ROOM_CODE_LENGTH,
    randomRoomCodeAlphabet: FIREBASE_RANDOM_ROOM_CODE_ALPHABET,
  };
}

export function isValidFirebaseRulesetId(value) {
  return typeof value === "string" && rulesetIdPattern.test(String(value).trim());
}
