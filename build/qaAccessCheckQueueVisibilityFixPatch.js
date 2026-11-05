function replaceSection(context, code, startMarker, endMarker, replacement, label) {
  const start = code.indexOf(startMarker);
  if (start < 0) context.error(`QA Access Check queue visibility fix could not find ${label} start.`);
  const end = code.indexOf(endMarker, start);
  if (end < 0) context.error(`QA Access Check queue visibility fix could not find ${label} end.`);
  return code.slice(0, start) + replacement + code.slice(end);
}

export function qaAccessCheckQueueVisibilityFixPatch() {
  let storePatched = false;

  return {
    name: "qa-access-check-queue-visibility-fix",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/qaTypingChallengeStore.ts")) return null;

      let next = code.replace("import { collection,", "import { query, where, collection,");
      // Older writer helpers also used a collection scan to resolve legacy IDs.
      next = next.replaceAll(
        "getDocs(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION))",
        'getDocs(query(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION), where("username", "in", qaTypingUsernameAliasesV6(normalizedUsername))))'
      );

      const fetchReplacement = `function qaTypingUsernameAliasesV6(username: string) {
  const name = String(username || "").trim();
  const lower = name.toLowerCase();
  return [...new Set([name, lower, lower.charAt(0).toUpperCase() + lower.slice(1), name.toUpperCase()])].filter(Boolean);
}

async function findQaTypingChallengeDocumentsV5(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return [];
  const lookup = normalizedUsername.toLowerCase();
  const [snapshot, direct] = await Promise.all([
    getDocs(query(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION), where("username", "in", qaTypingUsernameAliasesV6(normalizedUsername)))),
    getDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername))).catch(error => {
      if (error?.code === "permission-denied") return null;
      throw error;
    }),
  ]);
  const rows = new Map(snapshot.docs.map(item => [item.id, item]));
  if (direct?.exists() && (!direct.data()?.username || String(direct.data()?.username).trim().toLowerCase() === lookup)) rows.set(direct.id, direct);
  return [...rows.values()];
}

function mergeQaTypingChallengeQueuesV5(username: string, rows: Array<{ data: () => any }>) {
  const merged = rows.flatMap((item) => normalizeQueue(username, item.data()));
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = String(item.id || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_QUEUE_ITEMS);
}

export async function fetchQaTypingChallengeQueue(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return [];
  return mergeQaTypingChallengeQueuesV5(normalizedUsername, await findQaTypingChallengeDocumentsV5(normalizedUsername));
}

`;
      next = replaceSection(
        this,
        next,
        "export async function fetchQaTypingChallengeQueue(",
        "export async function fetchQaTypingChallenge(",
        fetchReplacement,
        "fetch queue"
      );

      const subscribeReplacement = `export function subscribeQaTypingChallengeQueue(
  username: string,
  onChange: (queue: QaTypingChallenge[]) => void,
  onError?: (error: unknown) => void
) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) { onChange([]); return () => {}; }
  let scopedRows: Array<{ id: string; data: () => any }> = [];
  let directRow: { id: string; data: () => any } | null = null;
  let queryReady = false, directReady = false, disposed = false;
  const lookup = normalizedUsername.toLowerCase();
  const emit = () => {
    if (disposed || !queryReady || !directReady) return;
    const rows = new Map(scopedRows.map(item => [item.id, item]));
    if (directRow) rows.set(directRow.id, directRow);
    onChange(mergeQaTypingChallengeQueuesV5(normalizedUsername, [...rows.values()]));
  };
  const stopQuery = onSnapshot(
    query(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION), where("username", "in", qaTypingUsernameAliasesV6(normalizedUsername))),
    snapshot => { scopedRows = snapshot.docs; queryReady = true; emit(); },
    error => { queryReady = true; onError?.(error); emit(); }
  );
  const stopDirect = onSnapshot(
    doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)),
    snapshot => {
      directReady = true;
      const name = String(snapshot.data()?.username || "").trim().toLowerCase();
      directRow = snapshot.exists() && (!name || name === lookup) ? snapshot : null;
      emit();
    },
    error => { directReady = true; onError?.(error); emit(); }
  );
  return () => { disposed = true; stopQuery(); stopDirect(); };
}

`;
      next = replaceSection(
        this,
        next,
        "export function subscribeQaTypingChallengeQueue(",
        "export function subscribeQaTypingChallenge(",
        subscribeReplacement,
        "queue subscription"
      );

      const removeReplacement = `export async function removeQaTypingChallenge(username: string, challengeId: string) {
  const normalizedUsername = String(username || "").trim();
  const normalizedChallengeId = String(challengeId || "").trim();
  if (!normalizedUsername || !normalizedChallengeId) return;

  const matchingDocs = await findQaTypingChallengeDocumentsV5(normalizedUsername);
  const targetDoc = matchingDocs.find((item) =>
    normalizeQueue(normalizedUsername, item.data()).some((challenge) => challenge.id === normalizedChallengeId)
  );
  if (!targetDoc) return;

  const queue = normalizeQueue(normalizedUsername, targetDoc.data());
  const nextQueue = queue.filter((item) => item.id !== normalizedChallengeId);
  if (nextQueue.length === queue.length) return;

  if (!nextQueue.length) {
    await deleteDoc(targetDoc.ref);
    return;
  }

  await setDoc(
    targetDoc.ref,
    {
      username: normalizedUsername,
      displayName: nextQueue[0]?.displayName || "",
      queue: nextQueue.map(serializeChallenge),
      queueCount: nextQueue.length,
      updatedAtServer: serverTimestamp(),
    },
    { merge: false }
  );
}

`;
      next = replaceSection(
        this,
        next,
        "export async function removeQaTypingChallenge(",
        "export async function completeQaTypingChallenge(",
        removeReplacement,
        "remove queue item"
      );

      const clearReplacement = `export async function clearQaTypingChallenge(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;

  const matchingDocs = await findQaTypingChallengeDocumentsV5(normalizedUsername);
  if (matchingDocs.length) {
    await Promise.all(matchingDocs.map((item) => deleteDoc(item.ref)));
    return;
  }

  await deleteDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
}

`;
      next = replaceSection(
        this,
        next,
        "export async function clearQaTypingChallenge(",
        "async function resolveQaTypingChallengeDocumentIdV3(",
        clearReplacement,
        "clear queue"
      );

      storePatched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!storePatched) this.error("QA Access Check queue visibility store fix was not applied.");
    },
  };
}

