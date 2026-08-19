function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) context.error(`Firestore quota protection could not find ${label}.`);
  return code.replace(search, replacement);
}

export function firestoreQuotaProtectionPatch() {
  let appPatched = false;
  let sessionPatched = false;
  let profilePhotoPatched = false;
  let progressStorePatched = false;
  let progressUiPatched = false;
  let chatStorePatched = false;

  return {
    name: "firestore-quota-protection",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/sessionStore.ts")) {
        let next = code;
        const oldTouch = `export async function touchStoredUserSession(sessionId: string, username: string) {\n  if (!sessionId || !username) return null;\n\n  const validation = await validateStoredUserSession(sessionId, username);\n  if (!validation.valid) return null;\n\n  const now = new Date();\n  const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_MS);\n\n  await updateDoc(doc(firebaseDb, SESSION_COLLECTION, sessionId), {\n    lastActivityAt: now.toISOString(),\n    expiresAt: expiresAt.toISOString(),\n    updatedAtServer: serverTimestamp(),\n  });\n\n  return expiresAt.toISOString();\n}`;
        const newTouch = `export async function touchStoredUserSession(sessionId: string, username: string) {\n  if (!sessionId || !username || sessionId.startsWith("local-")) return null;\n\n  // Quota protection: session validity is checked separately on a slower cadence.\n  // Do not perform 2 extra reads before every activity touch.\n  const now = new Date();\n  const expiresAt = new Date(now.getTime() + SESSION_INACTIVITY_MS);\n\n  await updateDoc(doc(firebaseDb, SESSION_COLLECTION, sessionId), {\n    lastActivityAt: now.toISOString(),\n    expiresAt: expiresAt.toISOString(),\n    updatedAtServer: serverTimestamp(),\n  });\n\n  return expiresAt.toISOString();\n}`;
        next = replaceOrThrow(this, next, oldTouch, newTouch, "session touch function");
        sessionPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/profilePhotoStore.ts")) {
        let next = code;
        const anchor = `export async function fetchStoredProfilePhoto(username: string) {\n  const normalizedUsername = String(username || "").trim();\n  if (!normalizedUsername) return null;\n\n  try {`;
        const replacement = `export async function fetchStoredProfilePhoto(username: string) {\n  const normalizedUsername = String(username || "").trim();\n  if (!normalizedUsername) return null;\n\n  // Profile photos are static most of the time. Prefer the browser cache first\n  // so Chat/User UI does not re-read one Firestore document per avatar refresh.\n  const cached = readCache(normalizedUsername);\n  if (cached) return cached;\n\n  try {`;
        next = replaceOrThrow(this, next, anchor, replacement, "profile photo cache-first read");
        profilePhotoPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/qaEvaluationProgressStore.ts")) {
        let next = code;
        next = replaceOrThrow(
          this,
          next,
          "export const QA_EVALUATION_PROGRESS_TTL_MS = 90 * 1000;",
          "export const QA_EVALUATION_PROGRESS_TTL_MS = 5 * 60 * 1000;",
          "evaluation progress TTL"
        );
        progressStorePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/CreateEvaluationMockup.tsx")) {
        let next = code;
        next = replaceOrThrow(
          this,
          next,
          "const heartbeat = window.setInterval(publishProgress, 30_000);",
          "const heartbeat = window.setInterval(publishProgress, 2 * 60_000);",
          "evaluation progress heartbeat"
        );
        progressUiPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/chatRealtimeStore.ts")) {
        let next = code;
        next = replaceOrThrow(
          this,
          next,
          "const ONLINE_TTL_MS = 6 * 60 * 1000;",
          "const ONLINE_TTL_MS = 20 * 60 * 1000;",
          "chat presence TTL"
        );
        chatStorePatched = true;
        return { code: next, map: null };
      }

      if (!cleanId.endsWith("/src/App.tsx")) return null;

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `const SESSION_CHECK_INTERVAL_MS = 30 * 1000;\nconst SESSION_TOUCH_INTERVAL_MS = 60 * 1000;`,
        `// Firestore quota protection: local inactivity still enforces the 2-hour timeout.\n// Central session revocation is checked periodically instead of every 30 seconds.\nconst SESSION_CHECK_INTERVAL_MS = 15 * 60 * 1000;\nconst SESSION_TOUCH_INTERVAL_MS = 30 * 60 * 1000;`,
        "session intervals"
      );

      next = replaceOrThrow(
        this,
        next,
        `const MAINTENANCE_POLL_INTERVAL_MS = 5 * 60 * 1000;\nconst INBOX_POLL_INTERVAL_MS = 2 * 60 * 1000;`,
        `const MAINTENANCE_POLL_INTERVAL_MS = 15 * 60 * 1000;\n// Inbox/password badges are convenience data. Keep core QA writes ahead of background polling.\nconst INBOX_POLL_INTERVAL_MS = 60 * 60 * 1000;`,
        "background polling intervals"
      );

      next = replaceOrThrow(
        this,
        next,
        "fetchUsageLogsByEventTypes(INBOX_EVENT_TYPES, 1500)",
        "fetchUsageLogsByEventTypes(INBOX_EVENT_TYPES, 100)",
        "inbox history read limit"
      );

      next = replaceOrThrow(
        this,
        next,
        `    await loadInboxTasks();\n    notifyQaDataChanged();`,
        `    // Inbox refresh is deferred to its own low-frequency/manual refresh path.\n    notifyQaDataChanged();`,
        "post-evaluation inbox reload"
      );

      next = replaceOrThrow(
        this,
        next,
        `  }, [currentUser, appealRequestsAllowed, activeTab, buildMeta.buildNumber, maintenanceBlocked, effectiveUserAccounts]);`,
        `  }, [currentUser, appealRequestsAllowed, maintenanceBlocked, effectiveUserAccounts]);`,
        "inbox effect dependencies"
      );

      const oldSessionStart = `  useEffect(() => {\n    if (!currentUser?.sessionId || !currentUser.username) return;\n\n    let cancelled = false;\n\n    const checkCentralSession = async () => {\n      try {`;
      const newSessionStart = `  useEffect(() => {\n    if (!currentUser?.sessionId || !currentUser.username || currentUser.sessionId.startsWith("local-")) return;\n\n    let cancelled = false;\n    let lastCentralCheckAt = 0;\n\n    const checkCentralSession = async (force = false) => {\n      const now = Date.now();\n      if (!force && now - lastCentralCheckAt < SESSION_CHECK_INTERVAL_MS) return;\n      lastCentralCheckAt = now;\n      try {`;
      next = replaceOrThrow(this, next, oldSessionStart, newSessionStart, "session validation throttle");
      next = replaceOrThrow(
        this,
        next,
        `    void checkCentralSession();\n    const interval = window.setInterval(`,
        `    void checkCentralSession(true);\n    const interval = window.setInterval(`,
        "initial session validation"
      );

      const oldActivate = `  const activateUserSession = async (user: CurrentUser) => {\n    try {\n      const session = await createStoredUserSession(user);\n      const authenticatedUser: CurrentUser = {\n        ...user,\n        sessionId: session.sessionId,\n        sessionPolicyVersion: SESSION_POLICY_VERSION,\n        sessionExpiresAt: session.expiresAt,\n      };\n\n      currentUserWasRestoredRef.current = false;\n      restoredLoginLoggedRef.current = true;\n      lastSessionTouchRef.current = Date.now();\n      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));\n      if (rememberLogin) {\n        localStorage.setItem(REMEMBERED_USERNAME_KEY, authenticatedUser.username);\n      } else {\n        localStorage.removeItem(REMEMBERED_USERNAME_KEY);\n      }\n      resetWorkspaceSessionState();\n      setCurrentUser(authenticatedUser);\n      return authenticatedUser;\n    } catch (error) {\n      console.error("Secure session creation failed", error);\n      setLoginError("Unable to create a secure session. Please try signing in again.");\n      return null;\n    }\n  };`;
      const newActivate = `  const activateUserSession = async (user: CurrentUser) => {\n    const finishLogin = (authenticatedUser: CurrentUser) => {\n      currentUserWasRestoredRef.current = false;\n      restoredLoginLoggedRef.current = true;\n      lastSessionTouchRef.current = Date.now();\n      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));\n      if (rememberLogin) {\n        localStorage.setItem(REMEMBERED_USERNAME_KEY, authenticatedUser.username);\n      } else {\n        localStorage.removeItem(REMEMBERED_USERNAME_KEY);\n      }\n      resetWorkspaceSessionState();\n      setCurrentUser(authenticatedUser);\n      return authenticatedUser;\n    };\n\n    try {\n      const session = await createStoredUserSession(user);\n      return finishLogin({\n        ...user,\n        sessionId: session.sessionId,\n        sessionPolicyVersion: SESSION_POLICY_VERSION,\n        sessionExpiresAt: session.expiresAt,\n      });\n    } catch (error) {\n      // Do not block staff from working only because the session-control write is temporarily unavailable.\n      console.warn("Central session creation unavailable; using local protected session.", error);\n      const expiresAt = new Date(Date.now() + INACTIVITY_LIMIT_MS).toISOString();\n      return finishLogin({\n        ...user,\n        sessionId: \`local-\${user.username}-\${Date.now()}\`,\n        sessionPolicyVersion: SESSION_POLICY_VERSION,\n        sessionExpiresAt: expiresAt,\n      });\n    }\n  };`;
      next = replaceOrThrow(this, next, oldActivate, newActivate, "login session fallback");

      const oldRestoreCatch = `      } catch (error) {\n        console.error("Secure session restore failed", error);\n        localStorage.removeItem(STORAGE_KEY);\n        if (!cancelled) {\n          setCurrentUser(null);\n          setLoginError(\n            "The secure session could not be verified. Please sign in again."\n          );\n        }\n      } finally {`;
      const newRestoreCatch = `      } catch (error) {\n        // Firestore quota/network problems must not destroy a still-recent local work session.\n        console.warn("Central session restore unavailable; checking local session age.", error);\n        const loginAtMs = new Date(String(storedUser.loginAt || "")).getTime();\n        const localFallbackValid = Number.isFinite(loginAtMs) && Date.now() - loginAtMs < 12 * 60 * 60 * 1000;\n        if (localFallbackValid) {\n          if (!cancelled) {\n            lastSessionTouchRef.current = Date.now();\n            setCurrentUser(storedUser);\n            setLoginError("");\n          }\n        } else {\n          localStorage.removeItem(STORAGE_KEY);\n          if (!cancelled) {\n            setCurrentUser(null);\n            setLoginError("The secure session could not be verified. Please sign in again.");\n          }\n        }\n      } finally {`;
      next = replaceOrThrow(this, next, oldRestoreCatch, newRestoreCatch, "session restore fail-open fallback");

      next = replaceOrThrow(
        this,
        next,
        `      currentUser.sessionId &&\n      now - lastSessionTouchRef.current >= SESSION_TOUCH_INTERVAL_MS`,
        `      currentUser.sessionId &&\n      !currentUser.sessionId.startsWith("local-") &&\n      now - lastSessionTouchRef.current >= SESSION_TOUCH_INTERVAL_MS`,
        "local session touch guard"
      );

      const oldProgressCleanup = `  useEffect(() => {\n    const evaluatorUsername = String(currentUser?.username || "").trim();\n    if (!evaluatorUsername || activeTab === "create-evaluation") return;\n    void clearQaEvaluationProgressByEvaluator(evaluatorUsername).catch((error) =>\n      console.warn("QA evaluation progress evaluator cleanup failed", error)\n    );\n  }, [activeTab, currentUser?.username]);`;
      const newProgressCleanup = `  const previousEvaluationTabRef = useRef(activeTab);\n  useEffect(() => {\n    const evaluatorUsername = String(currentUser?.username || "").trim();\n    const previousTab = previousEvaluationTabRef.current;\n    previousEvaluationTabRef.current = activeTab;\n    if (!evaluatorUsername || previousTab !== "create-evaluation" || activeTab === "create-evaluation") return;\n    void clearQaEvaluationProgressByEvaluator(evaluatorUsername).catch((error) =>\n      console.warn("QA evaluation progress evaluator cleanup failed", error)\n    );\n  }, [activeTab, currentUser?.username]);`;
      next = replaceOrThrow(this, next, oldProgressCleanup, newProgressCleanup, "evaluation progress cleanup frequency");

      const oldRealtimeStart = `  useEffect(() => {\n    if (!currentUser || maintenanceBlocked) {\n      setChatMessages([]);\n      setOnlineUsers([]);\n      setWebRtcSignals([]);\n      return;\n    }`;
      const newRealtimeStart = `  useEffect(() => {\n    const chatRealtimeActive = activeTab === "team-chat" || activeTab === "call-history";\n    if (!currentUser || maintenanceBlocked || !chatRealtimeActive) {\n      setChatMessages([]);\n      setOnlineUsers([]);\n      setWebRtcSignals([]);\n      return;\n    }`;
      next = replaceOrThrow(this, next, oldRealtimeStart, newRealtimeStart, "chat realtime activation guard");
      next = replaceOrThrow(
        this,
        next,
        `    const presenceTimer = window.setInterval(() => void sendPresence(), 4 * 60 * 1000);`,
        `    const presenceTimer = window.setInterval(() => void sendPresence(), 10 * 60 * 1000);`,
        "chat presence heartbeat"
      );
      next = replaceOrThrow(
        this,
        next,
        `  }, [currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName, maintenanceBlocked]);`,
        `  }, [currentUser?.username, currentUser?.displayName, currentUser?.role, currentUser?.agentName, maintenanceBlocked, activeTab]);`,
        "chat realtime dependencies"
      );

      appPatched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!appPatched) this.error("Firestore quota protection was not applied to App.tsx.");
      if (!sessionPatched) this.error("Firestore quota protection was not applied to sessionStore.ts.");
      if (!profilePhotoPatched) this.error("Firestore quota protection was not applied to profilePhotoStore.ts.");
      if (!progressStorePatched) this.error("Firestore quota protection was not applied to qaEvaluationProgressStore.ts.");
      if (!progressUiPatched) this.error("Firestore quota protection was not applied to CreateEvaluationMockup.tsx.");
      if (!chatStorePatched) this.error("Firestore quota protection was not applied to chatRealtimeStore.ts.");
    },
  };
}
