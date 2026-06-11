import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { getAppVariantConfig } from "./capacitor-variants.mjs";

const rootDir = dirname(fileURLToPath(import.meta.url));

function normalizeBasePath(basePath = "/") {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const trimmed = basePath.trim();
  if (trimmed === "./" || trimmed === ".") {
    return "./";
  }

  if (trimmed.startsWith("./") || trimmed.startsWith("../")) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

const appVariantConfig = getAppVariantConfig(process.env.VITE_APP_VARIANT);
const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export default defineConfig({
  base: normalizeBasePath(process.env.VITE_BASE_PATH || appVariantConfig.basePath),
  build: {
    outDir: appVariantConfig.webDir,
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        sologame: resolve(rootDir, "sologame.html"),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@network-controller-entry": appVariantConfig.onlineMultiplayerEnabled
        ? resolve(rootDir, "src/network-controller-entry.js")
        : resolve(rootDir, "src/network-controller-offline-entry.js"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    headers: noStoreHeaders,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    headers: noStoreHeaders,
  },
});
