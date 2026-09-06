export function isTableV2Enabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("table") === "v2";
}

function getCurrentTableUrl(): URL | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URL(window.location.href);
}

function formatTableUrl(url: URL | null, version: "v1" | "v2"): string {
  if (!url) {
    return version === "v2" ? "?table=v2" : "./";
  }

  if (version === "v2") {
    url.searchParams.set("table", "v2");
  } else {
    url.searchParams.delete("table");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getTableV2Href(): string {
  return formatTableUrl(getCurrentTableUrl(), "v2");
}

export function getTableV1Href(): string {
  return formatTableUrl(getCurrentTableUrl(), "v1");
}
