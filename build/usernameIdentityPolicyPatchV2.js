function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Username identity policy patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function usernameIdentityPolicyPatchV2() {
  let appPatched = false;
  let mainPatched = false;
  let sessionPatched = false;

  return {
    name: "username-identity-policy-v2",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/sessionStore.ts")) {
        let next = code;
        next = replaceOrThrow(
          this,
          next,
          'export const SESSION_POLICY_VERSION = "qa-session-policy-2026-07-15-v1";',
          'export const SESSION_POLICY_VERSION = "qa-session-policy-2026-08-18-v2-case-sensitive";',
          "session policy version"
        );
        sessionPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/main.tsx")) {
        let next = code;
        const importAnchor = 'import AutoDeployRefresh from "./AutoDeployRefresh";';
        next = replaceOrThrow(
          this,
          next,
          importAnchor,
          `${importAnchor}\nimport { ensureUsernamePolicyMigration } from "./usernamePolicyMigrationStore";`,
          "main bootstrap import"
        );

        const renderAnchor = 'ReactDOM.createRoot(document.getElementById("root")!).render(';
        const bootstrap = `function UsernamePolicyBootstrap({ children }: { children: React.ReactNode }) {\n  const [ready, setReady] = React.useState(false);\n  const [error, setError] = React.useState("");\n\n  React.useEffect(() => {\n    let cancelled = false;\n    void ensureUsernamePolicyMigration("System Username Policy 18/08/2026")\n      .then(() => {\n        if (!cancelled) setReady(true);\n      })\n      .catch((migrationError) => {\n        console.error("Username policy migration failed", migrationError);\n        if (!cancelled) {\n          setError(\n            migrationError instanceof Error\n              ? migrationError.message\n              : String(migrationError || "Username migration failed")\n          );\n        }\n      });\n    return () => {\n      cancelled = true;\n    };\n  }, []);\n\n  if (error) {\n    return (\n      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-6 text-slate-950">\n        <div className="mx-auto mt-16 max-w-xl rounded-[28px] border border-rose-200 bg-white p-6 shadow-xl">\n          <div className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">Username Migration</div>\n          <h1 className="mt-2 text-2xl font-semibold">ปรับมาตรฐาน Username ไม่สำเร็จ</h1>\n          <p className="mt-2 text-sm leading-6 text-slate-600">ระบบยังไม่เปิดหน้า Login เพื่อป้องกันการเข้าใช้งานด้วย Username เก่า กรุณาลองโหลดใหม่อีกครั้ง</p>\n          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-rose-50 p-4 text-xs text-rose-700">{error}</pre>\n          <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Reload</button>\n        </div>\n      </div>\n    );\n  }\n\n  if (!ready) {\n    return (\n      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 px-5">\n        <div className="rounded-[28px] border border-violet-100 bg-white px-7 py-6 text-center shadow-xl">\n          <div className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Updating Account Identity</div>\n          <div className="mt-2 text-lg font-semibold text-slate-950">กำลังปรับ Username ของระบบ...</div>\n          <div className="mt-2 text-sm text-slate-500">กรุณารอสักครู่ ระบบจะเปิดหน้า Login เมื่อข้อมูลพร้อม</div>\n        </div>\n      </div>\n    );\n  }\n\n  return <>{children}</>;\n}\n\n`;
        next = replaceOrThrow(this, next, renderAnchor, `${bootstrap}${renderAnchor}`, "main render anchor");

        const childrenAnchor = `    <RootErrorBoundary>\n      <App />\n      <AutoDeployRefresh />\n      <MaintenanceRuntime />\n    </RootErrorBoundary>`;
        const childrenReplacement = `    <RootErrorBoundary>\n      <UsernamePolicyBootstrap>\n        <App />\n        <AutoDeployRefresh />\n        <MaintenanceRuntime />\n      </UsernamePolicyBootstrap>\n    </RootErrorBoundary>`;
        next = replaceOrThrow(this, next, childrenAnchor, childrenReplacement, "main root children");

        mainPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;

        const restoreOld = `        if (\n          !storedUser.sessionId ||\n          storedUser.sessionPolicyVersion !== SESSION_POLICY_VERSION\n        ) {\n          if (!isQualityAssurance) {\n            localStorage.removeItem(STORAGE_KEY);\n            if (!cancelled) {\n              setCurrentUser(null);\n              setLoginError(\n                "The security session was updated. Please sign in again."\n              );\n            }\n            return;\n          }\n\n          const migratedSession = await createStoredUserSession(storedUser);\n          restoredUser = {\n            ...storedUser,\n            sessionId: migratedSession.sessionId,\n            sessionPolicyVersion: SESSION_POLICY_VERSION,\n            sessionExpiresAt: migratedSession.expiresAt,\n          };\n          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredUser));\n        } else {`;
        const restoreNew = `        if (\n          !storedUser.sessionId ||\n          storedUser.sessionPolicyVersion !== SESSION_POLICY_VERSION\n        ) {\n          localStorage.removeItem(STORAGE_KEY);\n          localStorage.removeItem(REMEMBERED_USERNAME_KEY);\n          if (!cancelled) {\n            setCurrentUser(null);\n            setUsername("");\n            setLoginError(\n              "Username policy was updated. Please sign in again using the exact Username shown in User Directory."\n            );\n          }\n          return;\n        } else {`;
        next = replaceOrThrow(this, next, restoreOld, restoreNew, "forced session logout block");

        next = replaceOrThrow(
          this,
          next,
          `        const normalizedUsername = typedUsername.toLowerCase();\n        let account: UserAccount | null =\n          normalizedUsername === "songpon" ? USER_ACCOUNTS[0] : null;`,
          `        const exactUsername = typedUsername;\n        let account: UserAccount | null =\n          exactUsername === "Songpon" ? USER_ACCOUNTS[0] : null;`,
          "username validation normalization"
        );

        next = replaceOrThrow(
          this,
          next,
          `            centralAccounts.find(\n              (item) => item.username.trim().toLowerCase() === normalizedUsername\n            ) || null;`,
          `            centralAccounts.find(\n              (item) => item.username.trim() === exactUsername\n            ) || null;`,
          "exact username validation lookup"
        );

        next = replaceOrThrow(
          this,
          next,
          `          const profileIds = Array.from(\n            new Set([\n              typedUsername,\n              typedUsername.charAt(0).toUpperCase() + typedUsername.slice(1),\n              typedUsername.toLowerCase(),\n            ].filter(Boolean))\n          );`,
          `          const profileIds = [typedUsername];`,
          "username validation profile ids"
        );

        next = replaceOrThrow(
          this,
          next,
          `      const profileIds = Array.from(new Set([\n        typedUsername,\n        typedUsername.charAt(0).toUpperCase() + typedUsername.slice(1),\n        typedUsername.toLowerCase(),\n      ].filter(Boolean)));`,
          `      const profileIds = [typedUsername];`,
          "direct login profile ids"
        );

        next = replaceOrThrow(
          this,
          next,
          `    const matchedAccount = centralUserAccounts.find(\n      (item) => item.username.trim().toLowerCase() === normalizedUsername\n    );`,
          `    const matchedAccount = centralUserAccounts.find(\n      (item) => item.username.trim() === username.trim()\n    );`,
          "exact central login lookup"
        );

        next = replaceOrThrow(
          this,
          next,
          `        if (snap.exists()) {\n          firebaseProfileData = snap.data();\n          firebaseProfileId = profileId;\n          break;\n        }`,
          `        if (snap.exists()) {\n          const candidateProfile = snap.data() as any;\n          const storedProfileUsername = String(candidateProfile.username || profileId).trim();\n          if (storedProfileUsername !== typedUsername) continue;\n          firebaseProfileData = candidateProfile;\n          firebaseProfileId = profileId;\n          break;\n        }`,
          "exact Firebase login profile verification"
        );

        appPatched = true;
        return { code: next, map: null };
      }

      // New usernames are entered and validated in UserRoleAdminMockup.
      // Keep this patch limited to the existing case-sensitive login/session policy.
      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!sessionPatched) this.error("Username identity policy patch was not applied to sessionStore.ts.");
      if (!mainPatched) this.error("Username identity policy patch was not applied to main.tsx.");
      if (!appPatched) this.error("Username identity policy patch was not applied to App.tsx.");
    },
  };
}
