function replaceSection(context, code, startMarker, endMarker, replacement, label) {
  const start = code.indexOf(startMarker);
  if (start < 0) context.error(`QA Access Check direct-write fix could not find ${label} start.`);
  const end = code.indexOf(endMarker, start);
  if (end < 0) context.error(`QA Access Check direct-write fix could not find ${label} end.`);
  return code.slice(0, start) + replacement + code.slice(end);
}

export function qaAccessCheckDirectWriteFixPatch() {
  let storePatched = false;
  let adminPatched = false;
  let overviewPatched = false;

  return {
    name: "qa-access-check-direct-write-fix",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/qaTypingChallengeStore.ts")) {
        let next = code;

        const directUpdate = `export async function updateQaTypingChallengeRepeatCount(
  username: string,
  challengeId: string,
  repeatCount: number,
  documentId = ""
) {
  const normalizedUsername = String(username || "").trim();
  const normalizedChallengeId = String(challengeId || "").trim();
  const safeRepeatCount = Math.max(1, Math.min(500, Math.floor(Number(repeatCount) || 1)));
  if (!normalizedUsername || !normalizedChallengeId) {
    throw new Error("Missing QA Access Check target");
  }

  const resolvedDocumentId = await resolveQaTypingChallengeDocumentIdV3(normalizedUsername, documentId);
  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, resolvedDocumentId);
  const snap = await getDoc(challengeRef);
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
      ? { ...item, repeatCount: safeRepeatCount, allowedMistakes, timeLimitSeconds }
      : item
  );

  await setDoc(
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
}

`;
        next = replaceSection(
          this,
          next,
          "export async function updateQaTypingChallengeRepeatCount(",
          "export async function replaceQaTypingChallengeQueue(",
          directUpdate,
          "repeat-count update"
        );

        const directAssign = `export async function assignQaTypingChallenge(challenge: NewQaTypingChallenge) {
  const username = String(challenge.username || "").trim();
  const word = String(challenge.word || "").trim();
  const mode: QaTypingChallengeMode = challenge.mode === "sentence" || challenge.mode === "word"
    ? challenge.mode
    : detectChallengeMode(word);
  const repeatCount = Math.max(1, Math.min(500, Math.floor(Number(challenge.repeatCount) || 1)));
  const allowedMistakes = Math.max(0, Math.min(repeatCount, Math.floor(Number(challenge.allowedMistakes) || 0)));
  const timeLimitSeconds = Math.max(10, Math.min(3600, Math.floor(Number(challenge.timeLimitSeconds) || 60)));
  const assignedAt = challenge.assignedAt || new Date().toISOString();
  const caseIds = normalizeCaseIds(challenge.caseIds);
  const topicCode = String(challenge.topicCode || "4").trim() || "4";
  if (!username) throw new Error("Missing target username");
  if (!word) throw new Error("Missing typing text");

  const challengeDocumentId = await resolveQaTypingChallengeDocumentIdV3(username);
  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, challengeDocumentId);
  const snap = await getDoc(challengeRef);
  const queue = snap.exists() ? normalizeQueue(username, snap.data()) : [];
  if (queue.length >= MAX_QUEUE_ITEMS) {
    throw new Error(\`QA Access Check queue limit is \${MAX_QUEUE_ITEMS} items per agent\`);
  }

  const nextChallenge: QaTypingChallenge = {
    id: String(challenge.id || createChallengeId(username, assignedAt, word)).trim(),
    username,
    displayName: String(challenge.displayName || "").trim(),
    word,
    mode,
    repeatCount,
    allowedMistakes,
    timeLimitSeconds,
    assignedAt,
    assignedBy: String(challenge.assignedBy || "").trim(),
    caseIds,
    topicCode,
  };

  const nextQueue = [...queue, nextChallenge];
  await setDoc(
    challengeRef,
    {
      username,
      displayName: nextChallenge.displayName || queue[0]?.displayName || "",
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
          "export async function assignQaTypingChallenge(",
          "export async function removeQaTypingChallenge(",
          directAssign,
          "challenge assignment"
        );

        storePatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaTypingChallengeAdmin.tsx")) {
        let next = code;
        const functionStart = next.indexOf("  const assignChallenge = async () => {");
        if (functionStart < 0) this.error("QA Access Check direct-write fix could not find admin assignChallenge.");
        const catchStart = next.indexOf("    } catch (assignError) {", functionStart);
        const finallyStart = next.indexOf("    } finally {", catchStart);
        if (catchStart < 0 || finallyStart < 0) this.error("QA Access Check direct-write fix could not find admin assign catch.");
        const replacement = `    } catch (assignError) {
      console.warn("Assign QA typing challenge failed", assignError);
      const detail = assignError instanceof Error ? assignError.message : String(assignError || "");
      const code = typeof assignError === "object" && assignError && "code" in assignError
        ? String((assignError as any).code || "")
        : "";
      const normalizedDetail = (code + " " + detail).toLowerCase();
      setError(
        detail.includes("queue limit")
          ? "Queue ของ Agent นี้เต็มแล้ว (สูงสุด 50 รายการ)"
          : normalizedDetail.includes("permission-denied") || normalizedDetail.includes("insufficient permissions")
            ? "ส่ง QA Access Check ไม่สำเร็จ: ไม่มีสิทธิ์บันทึกข้อมูล (permission-denied)"
            : normalizedDetail.includes("resource-exhausted") || normalizedDetail.includes("quota")
              ? "ส่ง QA Access Check ไม่สำเร็จ: โควตาการจัดเก็บข้อมูลเต็มชั่วคราว"
              : normalizedDetail.includes("unavailable") || normalizedDetail.includes("network")
                ? "ส่ง QA Access Check ไม่สำเร็จ: เชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว"
                : \`ส่ง QA Access Check ไม่สำเร็จ\${code ? \` (\${code})\` : ""}\${!code && detail ? \`: \${detail.slice(0, 120)}\` : ""}\`
      );
`;
        next = next.slice(0, catchStart) + replacement + next.slice(finallyStart);
        adminPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/QaAccessCheckOverview.tsx")) {
        let next = code;
        const functionStart = next.indexOf("  const saveRepeatCount = async (");
        if (functionStart < 0) this.error("QA Access Check direct-write fix could not find overview saveRepeatCount.");
        const catchStart = next.indexOf("    } catch (saveError) {", functionStart);
        const finallyStart = next.indexOf("    } finally {", catchStart);
        if (catchStart < 0 || finallyStart < 0) this.error("QA Access Check direct-write fix could not find overview save catch.");
        const replacement = `    } catch (saveError) {
      console.warn("Update QA Access Check repeat count failed", saveError);
      const detail = saveError instanceof Error ? saveError.message : String(saveError || "");
      const code = typeof saveError === "object" && saveError && "code" in saveError
        ? String((saveError as any).code || "")
        : "";
      const normalizedDetail = (code + " " + detail).toLowerCase();
      setError(
        normalizedDetail.includes("permission-denied") || normalizedDetail.includes("insufficient permissions")
          ? "แก้จำนวนคำ/รอบไม่สำเร็จ: ไม่มีสิทธิ์บันทึกข้อมูล (permission-denied)"
          : normalizedDetail.includes("resource-exhausted") || normalizedDetail.includes("quota")
            ? "แก้จำนวนคำ/รอบไม่สำเร็จ: โควตาการจัดเก็บข้อมูลเต็มชั่วคราว"
            : normalizedDetail.includes("unavailable") || normalizedDetail.includes("network")
              ? "แก้จำนวนคำ/รอบไม่สำเร็จ: เชื่อมต่อฐานข้อมูลไม่ได้ชั่วคราว"
              : \`แก้จำนวนคำ/รอบไม่สำเร็จ\${code ? \` (\${code})\` : ""}\${!code && detail ? \`: \${detail.slice(0, 120)}\` : ""}\`
      );
`;
        next = next.slice(0, catchStart) + replacement + next.slice(finallyStart);
        overviewPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!storePatched) this.error("QA Access Check direct-write store fix was not applied.");
      if (!adminPatched) this.error("QA Access Check direct-write admin fix was not applied.");
      if (!overviewPatched) this.error("QA Access Check direct-write overview fix was not applied.");
    },
  };
}
