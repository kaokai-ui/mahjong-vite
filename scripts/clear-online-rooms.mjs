import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { firebaseConfig } from "../src/firebase-config.js";

const projectId =
  process.env.MAHJONG_FIREBASE_PROJECT_ID ||
  readDefaultProjectId() ||
  firebaseConfig.projectId;
const databaseInstance =
  process.env.MAHJONG_FIREBASE_DATABASE_INSTANCE ||
  readDatabaseInstance(firebaseConfig.databaseURL) ||
  (projectId ? `${projectId}-default-rtdb` : null);
const targets = ["/rooms", "/roomMeta"];
const listMode = process.argv.includes("--list");
const dryRun = process.argv.includes("--dry-run");

if (!projectId || !databaseInstance) {
  console.error(
    "[rooms:clear] Firebase project or database instance is missing. Set MAHJONG_FIREBASE_PROJECT_ID and MAHJONG_FIREBASE_DATABASE_INSTANCE.",
  );
  process.exit(1);
}

if (listMode) {
  listOnlineRooms();
} else {
  clearOnlineRooms();
}

function clearOnlineRooms() {
  console.log(`[rooms:clear] project=${projectId}`);
  console.log(`[rooms:clear] instance=${databaseInstance}`);
  console.log(`[rooms:clear] dryRun=${dryRun ? "yes" : "no"}`);

  for (const path of targets) {
    console.log(`[rooms:clear] removing ${path}`);
    if (dryRun) {
      continue;
    }

    const result = runFirebaseCommand(
      [
        "database:remove",
        path,
        "--force",
        "--project",
        projectId,
        "--instance",
        databaseInstance,
      ],
      "inherit",
    );

    if (result.error) {
      console.error(`[rooms:clear] failed to execute remove command for ${path}`);
      console.error(result.error);
      process.exit(1);
    }

    if (result.status !== 0) {
      console.error(
        `[rooms:clear] remove failed for ${path} with exit code ${result.status ?? "unknown"}`,
      );
      process.exit(result.status ?? 1);
    }
  }

  console.log(
    dryRun ? "[rooms:clear] dry run complete" : "[rooms:clear] all online room data removed",
  );
}

function listOnlineRooms() {
  console.log(`[rooms:list] project=${projectId}`);
  console.log(`[rooms:list] instance=${databaseInstance}`);
  console.log("[rooms:list] reading /roomMeta");

  const result = runFirebaseCommand(
    ["database:get", "/roomMeta", "--project", projectId, "--instance", databaseInstance],
    ["inherit", "pipe", "inherit"],
  );

  if (result.error) {
    console.error("[rooms:list] failed to execute Firebase CLI");
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      `[rooms:list] database read failed with exit code ${result.status ?? "unknown"}`,
    );
    process.exit(result.status ?? 1);
  }

  let roomMeta;
  try {
    roomMeta = JSON.parse(String(result.stdout || "null"));
  } catch (error) {
    console.error("[rooms:list] Firebase CLI returned invalid JSON");
    console.error(error);
    process.exit(1);
  }

  const roomIds = roomMeta && typeof roomMeta === "object" && !Array.isArray(roomMeta)
    ? Object.keys(roomMeta).sort()
    : [];

  if (!roomIds.length) {
    console.log("[rooms:list] no online rooms found");
    return;
  }

  console.log(`[rooms:list] found ${roomIds.length} room(s)`);
  roomIds.forEach((roomId) => console.log(roomId));
}

function runFirebaseCommand(args, stdio) {
  const command = ["npx", "--yes", "firebase-tools", ...args].join(" ");
  return spawnSync(command, {
    encoding: "utf8",
    shell: true,
    stdio,
  });
}

function readDefaultProjectId() {
  const firebasercPath = resolve(".firebaserc");
  if (!existsSync(firebasercPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(firebasercPath, "utf8"));
    return typeof parsed?.projects?.default === "string" ? parsed.projects.default : null;
  } catch {
    return null;
  }
}

function readDatabaseInstance(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  try {
    const hostname = new URL(databaseUrl).hostname;
    return hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}
