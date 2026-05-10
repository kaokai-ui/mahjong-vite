import { build } from "vite";

import { DEFAULT_APP_VARIANT, getAppVariantConfig } from "../capacitor-variants.mjs";

const requestedVariant = process.argv[2] || DEFAULT_APP_VARIANT;
const variant = getAppVariantConfig(requestedVariant);

process.env.VITE_APP_VARIANT = requestedVariant;
process.env.VITE_BASE_PATH = variant.basePath;

const viteConfigModule = await import("../vite.config.js");

await build({
  ...viteConfigModule.default,
  configFile: false,
});
