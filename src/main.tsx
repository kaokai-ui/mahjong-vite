import { createRoot } from "react-dom/client";

function shouldLoadLocalOverride() {
  const { protocol, hostname } = window.location;
  if (protocol === "file:") {
    return true;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
    return true;
  }

  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
    return true;
  }

  const private172 = hostname.match(/^172\.(\d{1,2})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

async function loadLocalOverride() {
  const overrideUrl = `${window.location.origin}/local-admin/firebase-config.local.js`;

  try {
    await import(/* @vite-ignore */ overrideUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.info("Local Firebase override not loaded:", message);
  }
}

async function bootstrapReactApp() {
  const rootElement = document.getElementById("app-root");
  if (!rootElement) {
    throw new Error("Missing #app-root container.");
  }

  if (shouldLoadLocalOverride()) {
    await loadLocalOverride();
  }

  const [{ AppShell }, { AppBridgeProvider }] = await Promise.all([
    import("./react-shell/AppShell"),
    import("./react-shell/useAppBridge"),
  ]);

  createRoot(rootElement).render(
    <AppBridgeProvider>
      <AppShell />
    </AppBridgeProvider>,
  );
}

void bootstrapReactApp();
