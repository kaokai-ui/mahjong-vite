import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_APP_VARIANT, getAppVariantConfig } from "../capacitor-variants.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const capacitorBin = resolve(scriptDir, "..", "node_modules", "@capacitor", "cli", "bin", "capacitor");

const [, , requestedVariant = DEFAULT_APP_VARIANT, commandName = "", ...restArgs] = process.argv;

if (!commandName) {
  console.error("Usage: node scripts/run-capacitor-variant.mjs <variant> <cap-command> [...args]");
  process.exit(1);
}

const variant = getAppVariantConfig(requestedVariant);

try {
  if (commandName === "copy" || commandName === "sync") {
    await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", [
      "run",
      requestedVariant === "mahjong-solo-offline" ? "build:solo-offline" : "build:online",
    ]);
  }

  await runCommand(process.execPath, [capacitorBin, commandName, ...restArgs], {
    CAP_APP_FLAVOR: requestedVariant,
    VITE_APP_VARIANT: requestedVariant,
    VITE_BASE_PATH: variant.basePath,
  });
} catch (error) {
  process.exit(error && typeof error === "object" && "code" in error ? error.code : 1);
}

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        ...extraEnv,
      },
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(Object.assign(new Error(`Command ${command} ${args.join(" ")} terminated with signal ${signal}`), { code: 1 }));
        return;
      }

      if (code && code !== 0) {
        reject(Object.assign(new Error(`Command ${command} ${args.join(" ")} failed with exit code ${code}`), { code }));
        return;
      }

      resolve(undefined);
    });
  });
}
