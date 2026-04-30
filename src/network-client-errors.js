function formatFirebaseClientError(error) {
  const code = String((error && error.code) || "");
  const message = String((error && error.message) || "").trim();

  if (code.includes("permission-denied") || message.includes("PERMISSION_DENIED")) {
    return "Firebase 規則拒絕這個操作。請先重新貼上最新的 local-admin/firebase-rules.json 到 Realtime Database Rules 並按 Publish。";
  }

  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
    return "Firebase 尚未啟用 Anonymous Authentication。";
  }

  if (code.startsWith("appCheck/")) {
    return message || "App Check 驗證失敗。";
  }

  if (code.startsWith("auth/")) {
    return message || "Firebase Authentication 發生錯誤。";
  }

  if (message) {
    return message;
  }

  return "Firebase 發生錯誤。";
}

export { formatFirebaseClientError };
