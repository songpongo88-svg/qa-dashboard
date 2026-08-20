function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`QA Access Check overview patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function qaAccessCheckOverviewPatch() {
  let workspacePatched = false;
  let storePatched = false;

  return {
    name: "qa-access-check-overview",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/qaTypingChallengeStore.ts")) {
        let next = code;

        next = replaceOrThrow(
          this,
          next,
          `import { deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";`,
          `import { collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";`,
          "Firestore collection import"
        );

        const overviewStoreCode = `
export type QaTypingChallengeQueueOverview = {
  username: string;
  displayName: string;
  queue: QaTypingChallenge[];
};

export function subscribeQaTypingChallengeOverview(
  onChange: (rows: QaTypingChallengeQueueOverview[]) => void,
  onError?: (error: unknown) => void
) {
  return onSnapshot(
    collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION),
    (snapshot) => {
      const rows = snapshot.docs
        .map((item) => {
          const data = item.data();
          const username = String(data?.username || "").trim();
          const queue = normalizeQueue(username, data);
          return {
            username,
            displayName: String(data?.displayName || queue[0]?.displayName || username).trim(),
            queue,
          };
        })
        .filter((row) => row.username && row.queue.length > 0)
        .sort((a, b) =>
          String(a.displayName || a.username).localeCompare(
            String(b.displayName || b.username),
            "en",
            { sensitivity: "base" }
          )
        );
      onChange(rows);
    },
    (error) => onError?.(error)
  );
}

export async function updateQaTypingChallengeRepeatCount(
  username: string,
  challengeId: string,
  repeatCount: number
) {
  const normalizedUsername = String(username || "").trim();
  const normalizedChallengeId = String(challengeId || "").trim();
  const safeRepeatCount = Math.max(1, Math.min(500, Math.floor(Number(repeatCount) || 1)));
  if (!normalizedUsername || !normalizedChallengeId) {
    throw new Error("Missing QA Access Check target");
  }

  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername));
  await runTransaction(firebaseDb, async (transaction) => {
    const snap = await transaction.get(challengeRef);
    if (!snap.exists()) throw new Error("QA Access Check queue not found");

    const queue = normalizeQueue(normalizedUsername, snap.data());
    const targetIndex = queue.findIndex((item) => item.id === normalizedChallengeId);
    if (targetIndex < 0) throw new Error("QA Access Check item not found");

    const current = queue[targetIndex];
    const allowedMistakes = Math.floor(safeRepeatCount * 0.05);
    let calculatedSeconds = 0;
    if (current.mode === "sentence") {
      const charactersPerMinute = 30 * 5;
      const totalCharacters = Math.max(1, Array.from(String(current.word || "").trim()).length) * safeRepeatCount;
      calculatedSeconds = Math.ceil((totalCharacters / charactersPerMinute) * 60);
    } else {
      calculatedSeconds = Math.ceil((safeRepeatCount / 30) * 60);
    }
    const timeLimitSeconds = Math.max(30, Math.min(3600, calculatedSeconds));

    const nextQueue = queue.map((item, index) =>
      index === targetIndex
        ? {
            ...item,
            repeatCount: safeRepeatCount,
            allowedMistakes,
            timeLimitSeconds,
          }
        : item
    );

    transaction.set(
      challengeRef,
      {
        username: normalizedUsername,
        displayName: nextQueue[0]?.displayName || "",
        queue: nextQueue.map(serializeChallenge),
        queueCount: nextQueue.length,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );
  });
}

`;

        next = replaceOrThrow(
          this,
          next,
          `export async function replaceQaTypingChallengeQueue(username: string, queue: QaTypingChallenge[]) {`,
          `${overviewStoreCode}export async function replaceQaTypingChallengeQueue(username: string, queue: QaTypingChallenge[]) {`,
          "overview store exports"
        );

        storePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingChallengeWorkspace.tsx")) {
        let next = code;

        next = replaceOrThrow(
          this,
          next,
          `import QaTypingChallengeAdmin from "./QaTypingChallengeAdmin";`,
          `import QaTypingChallengeAdmin from "./QaTypingChallengeAdmin";\nimport QaAccessCheckOverview from "./QaAccessCheckOverview";`,
          "overview component import"
        );

        next = replaceOrThrow(
          this,
          next,
          `type WorkspaceView = "setup" | "history";`,
          `type WorkspaceView = "overview" | "setup" | "history";`,
          "workspace view type"
        );

        next = replaceOrThrow(
          this,
          next,
          `const [view, setView] = useState<WorkspaceView>(canManage ? "setup" : "history");`,
          `const [view, setView] = useState<WorkspaceView>(canManage ? "overview" : "history");`,
          "default overview view"
        );

        next = replaceOrThrow(
          this,
          next,
          `          <div className="flex gap-2">\n            {canManage ? (`,
          `          <div className="flex gap-2">\n            {canManage ? (\n              <button\n                type="button"\n                onClick={() => setView("overview")}\n                className={\`rounded-t-2xl px-5 py-3 text-sm font-black transition \${view === "overview" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"}\`}\n              >\n                Overview\n              </button>\n            ) : null}\n            {canManage ? (`,
          "Overview tab"
        );

        next = replaceOrThrow(
          this,
          next,
          `        {view === "setup" && canManage ? (\n          <div className="grid gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)] sm:p-6">`,
          `        {view === "overview" && canManage ? (\n          <QaAccessCheckOverview\n            agents={agents}\n            history={history}\n            currentUser={currentUser}\n            onOpenSetup={(username) => {\n              setSelectedUsername(username);\n              setView("setup");\n            }}\n          />\n        ) : view === "setup" && canManage ? (\n          <div className="grid gap-5 p-5 xl:grid-cols-[360px_minmax(0,1fr)] sm:p-6">`,
          "Overview workspace branch"
        );

        workspacePatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!storePatched) this.error("QA Access Check overview store patch was not applied.");
      if (!workspacePatched) this.error("QA Access Check overview workspace patch was not applied.");
    },
  };
}
