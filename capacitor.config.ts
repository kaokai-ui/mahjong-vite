import type { CapacitorConfig } from "@capacitor/cli";

import { DEFAULT_APP_VARIANT, getAppVariantConfig } from "./capacitor-variants.mjs";

const variant = getAppVariantConfig(process.env.CAP_APP_FLAVOR || process.env.VITE_APP_VARIANT || DEFAULT_APP_VARIANT);

const config: CapacitorConfig = {
  appId: variant.appId,
  appName: variant.appName,
  webDir: variant.webDir,
  android: {
    path: variant.androidPath,
  },
  ios: {
    path: variant.iosPath,
  },
};

export default config;
