export const DEFAULT_APP_VARIANT = "mahjong-online";

export const APP_VARIANTS = Object.freeze({
  "mahjong-online": Object.freeze({
    appId: "io.kaokai.mahjongonline",
    appName: "Mahjong Online",
    webDir: "dist",
    basePath: "/",
    androidPath: "android-online",
    iosPath: "ios-online",
    onlineMultiplayerEnabled: true,
  }),
  "mahjong-solo-offline": Object.freeze({
    appId: "io.kaokai.mahjongsolooffline",
    appName: "0506單人麻將",
    webDir: "dist-solo-offline",
    basePath: "./",
    androidPath: "android-solo-offline",
    iosPath: "ios-solo-offline",
    onlineMultiplayerEnabled: false,
  }),
});

export function getAppVariantConfig(variantName = DEFAULT_APP_VARIANT) {
  return APP_VARIANTS[variantName] || APP_VARIANTS[DEFAULT_APP_VARIANT];
}
