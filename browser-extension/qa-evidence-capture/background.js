const CONTEXT_KEY = "qaEvidenceCaptureContext";
const QA_TAB_KEY = "qaEvidenceCaptureQaTabId";
const PENDING_KEY = "qaEvidencePendingCaptures";
const ACTIVE_KEY = "qaEvidenceCaptureActive";
const ACTIVE_CAPTURE_TAB_KEY = "qaEvidenceCaptureActiveTabId";
const MAX_PENDING = 50;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

function captureVisibleTab(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!dataUrl) reject(new Error("Browser did not return a screenshot"));
      else resolve(dataUrl);
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

async function getContextState() {
  const stored = await storageGet([
    CONTEXT_KEY,
    QA_TAB_KEY,
    ACTIVE_KEY,
    ACTIVE_CAPTURE_TAB_KEY,
  ]);
  return {
    context: stored[CONTEXT_KEY] || null,
    qaTabId: Number.isInteger(stored[QA_TAB_KEY]) ? stored[QA_TAB_KEY] : null,
    active: Boolean(stored[ACTIVE_KEY]),
    activeCaptureTabId: Number.isInteger(stored[ACTIVE_CAPTURE_TAB_KEY])
      ? stored[ACTIVE_CAPTURE_TAB_KEY]
      : null,
  };
}

async function setContext(context, qaTabId) {
  await storageSet({
    [CONTEXT_KEY]: context || null,
    [QA_TAB_KEY]: Number.isInteger(qaTabId) ? qaTabId : null,
  });
}

async function setCaptureActive(active, activeCaptureTabId = null) {
  await storageSet({
    [ACTIVE_KEY]: Boolean(active),
    [ACTIVE_CAPTURE_TAB_KEY]:
      Boolean(active) && Number.isInteger(activeCaptureTabId) ? activeCaptureTabId : null,
  });
}

async function setActiveCaptureTab(tabId) {
  await storageSet({
    [ACTIVE_CAPTURE_TAB_KEY]: Number.isInteger(tabId) ? tabId : null,
  });
}

function isCapturableUrl(url) {
  if (!url) return false;
  return /^(https?|file):/i.test(url);
}

function sameContext(a, b) {
  const leftCase = String(a?.caseId || "").trim();
  const rightCase = String(b?.caseId || "").trim();
  if (leftCase || rightCase) return Boolean(leftCase && rightCase && leftCase === rightCase);
  const leftDraft = String(a?.draftId || "").trim();
  const rightDraft = String(b?.draftId || "").trim();
  if (leftDraft || rightDraft) return Boolean(leftDraft && rightDraft && leftDraft === rightDraft);
  return true;
}

async function getPendingCaptures() {
  const stored = await storageGet([PENDING_KEY]);
  return Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] : [];
}

async function savePendingCaptures(items) {
  await storageSet({ [PENDING_KEY]: items.slice(-MAX_PENDING) });
}

async function addPendingCapture(capture) {
  const pending = await getPendingCaptures();
  pending.push(capture);
  await savePendingCaptures(pending);
}

async function removePendingCapture(captureId) {
  if (!captureId) return;
  const pending = await getPendingCaptures();
  await savePendingCaptures(pending.filter((item) => item.captureId !== captureId));
}

async function deliverCaptureToQa(capture) {
  const { qaTabId } = await getContextState();
  if (!qaTabId) return false;
  try {
    await sendTabMessage(qaTabId, { type: "QA_EVIDENCE_CAPTURED", payload: capture });
    return true;
  } catch (error) {
    console.warn("QA Evidence Capture: QA tab is not reachable", error);
    return false;
  }
}

async function deliverPendingToQa(qaTabId, context) {
  const pending = await getPendingCaptures();
  const matching = pending.filter((item) => sameContext(item.context, context));
  for (const capture of matching) {
    try {
      await sendTabMessage(qaTabId, { type: "QA_EVIDENCE_CAPTURED", payload: capture });
    } catch (error) {
      console.warn("QA Evidence Capture: pending delivery failed", error);
      break;
    }
  }
  return matching.length;
}

async function stopSelectionOnTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    await sendTabMessage(tabId, { type: "QA_EVIDENCE_STOP_SELECTION" });
  } catch {
    // The old tab can be restricted, closed, or not have the content script.
  }
}

async function startSelection(tab) {
  if (!tab?.id || !isCapturableUrl(tab.url)) return false;
  try {
    await sendTabMessage(tab.id, { type: "QA_EVIDENCE_START_SELECTION" });
    await setActiveCaptureTab(tab.id);
    return true;
  } catch (error) {
    console.warn("QA Evidence Capture: cannot start selection on this page", error);
    return false;
  }
}

async function armActiveTab(windowId = null) {
  const state = await getContextState();
  if (!state.active) return false;

  const queryInfo = { active: true };
  if (Number.isInteger(windowId)) queryInfo.windowId = windowId;
  else queryInfo.currentWindow = true;

  const tabs = await queryTabs(queryInfo);
  const activeTab = tabs?.[0];
  if (!activeTab?.id) return false;

  if (
    Number.isInteger(state.activeCaptureTabId) &&
    state.activeCaptureTabId !== activeTab.id
  ) {
    await stopSelectionOnTab(state.activeCaptureTabId);
  }

  if (!isCapturableUrl(activeTab.url)) {
    await setActiveCaptureTab(null);
    return false;
  }

  return startSelection(activeTab);
}

async function startCaptureSession(tab, context, qaTabId) {
  if (context !== undefined || Number.isInteger(qaTabId)) {
    const state = await getContextState();
    await setContext(
      context !== undefined ? context || {} : state.context || {},
      Number.isInteger(qaTabId) ? qaTabId : state.qaTabId
    );
  }
  await setCaptureActive(true);
  return startSelection(tab);
}

async function stopCaptureSession() {
  const state = await getContextState();
  await setCaptureActive(false);
  await stopSelectionOnTab(state.activeCaptureTabId);
}

chrome.action.onClicked.addListener((tab) => {
  void startCaptureSession(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "capture-evidence") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const active = tabs?.[0];
    if (active) void startCaptureSession(active);
  });
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void armActiveTab(activeInfo.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || changeInfo.status !== "complete") return;
  void (async () => {
    const state = await getContextState();
    if (!state.active) return;
    await startSelection(tab);
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const state = await getContextState();
    if (state.qaTabId === tabId) {
      await storageSet({ [QA_TAB_KEY]: null });
    }
    if (state.activeCaptureTabId === tabId) {
      await setActiveCaptureTab(null);
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (message?.type === "QA_EVIDENCE_CONTEXT") {
        await setContext(message.payload || {}, sender.tab?.id ?? null);
        sendResponse({ ok: true, ready: true });
        return;
      }

      if (message?.type === "QA_EVIDENCE_ARM_CAPTURE") {
        await setContext(message.payload || {}, sender.tab?.id ?? null);
        await setCaptureActive(true);
        const armed = await armActiveTab(sender.tab?.windowId ?? null);
        sendResponse({ ok: true, ready: true, active: true, armed });
        return;
      }

      if (message?.type === "QA_EVIDENCE_STOP_CAPTURE") {
        await stopCaptureSession();
        sendResponse({ ok: true, active: false });
        return;
      }

      if (message?.type === "QA_EVIDENCE_PULL") {
        if (sender.tab?.id) {
          await setContext(message.payload || {}, sender.tab.id);
          const delivered = await deliverPendingToQa(sender.tab.id, message.payload || {});
          sendResponse({ ok: true, delivered });
        } else {
          sendResponse({ ok: false, delivered: 0 });
        }
        return;
      }

      if (message?.type === "QA_EVIDENCE_CAPTURE_ACK") {
        await removePendingCapture(message.payload?.captureId || "");
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "QA_EVIDENCE_SELECTION_READY") {
        const state = await getContextState();
        if (!state.active) {
          sendResponse({ ok: false, inactive: true });
          return;
        }
        if (!sender.tab?.id || !Number.isInteger(sender.tab.windowId)) {
          throw new Error("Active tab is unavailable");
        }
        const screenshotDataUrl = await captureVisibleTab(sender.tab.windowId);
        await sendTabMessage(sender.tab.id, {
          type: "QA_EVIDENCE_CROP_SCREENSHOT",
          payload: {
            screenshotDataUrl,
            rect: message.payload?.rect,
            viewport: message.payload?.viewport,
          },
        });
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "QA_EVIDENCE_CAPTURE_CROPPED") {
        const state = await getContextState();
        const payload = message.payload || {};
        const capture = {
          captureId:
            payload.captureId ||
            Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          dataUrl: payload.dataUrl,
          fileName: payload.fileName || "Evidence_Capture_" + Date.now() + ".png",
          capturedAt: payload.capturedAt || new Date().toISOString(),
          pageUrl: payload.pageUrl || sender.tab?.url || "",
          pageTitle: payload.pageTitle || sender.tab?.title || "",
          context: state.context || {},
        };
        if (!capture.dataUrl) throw new Error("Captured image is empty");
        await addPendingCapture(capture);
        await deliverCaptureToQa(capture);

        if (state.active) {
          await armActiveTab(sender.tab?.windowId ?? null);
        }

        sendResponse({ ok: true, captureId: capture.captureId, active: state.active });
        return;
      }

      sendResponse({ ok: false, ignored: true });
    } catch (error) {
      console.error("QA Evidence Capture background error", error);
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});
