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

      let next = code;

      const fetchReplacement = `async function findQaTypingChallengeDocumentsV5(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return [];

  const lookup = normalizedUsername.toLowerCase();
  const snapshot = await getDocs(collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION));
  return snapshot.docs.filter((item) =>
    String(item.data()?.username || "").trim().toLowerCase() === lookup
  );
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

  const matchingDocs = await findQaTypingChallengeDocumentsV5(normalizedUsername);
  if (matchingDocs.length) {
    return mergeQaTypingChallengeQueuesV5(normalizedUsername, matchingDocs);
  }

  const directSnap = await getDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
  if (!directSnap.exists()) return [];
  return normalizeQueue(normalizedUsername, directSnap.data());
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
  if (!normalizedUsername) {
    onChange([]);
    return () => {};
  }

  const lookup = normalizedUsername.toLowerCase();
  return onSnapshot(
    collection(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION),
    (snapshot) => {
      const matchingDocs = snapshot.docs.filter((item) =>
        String(item.data()?.username || "").trim().toLowerCase() === lookup
      );
      onChange(mergeQaTypingChallengeQueuesV5(normalizedUsername, matchingDocs));
    },
    (error) => onError?.(error)
  );
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
