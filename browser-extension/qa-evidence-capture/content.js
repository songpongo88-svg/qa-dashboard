let selectionCleanup = null;

function postToPage(type, payload = {}) {
  window.postMessage({ source: "qa-evidence-extension", type, payload }, "*");
}

function notifyReady() {
  postToPage("QA_EVIDENCE_EXTENSION_READY", {
    version: chrome.runtime.getManifest().version,
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const message = event.data;
  if (!message || message.source !== "qa-dashboard") return;
  if (
    ![
      "QA_EVIDENCE_CONTEXT",
      "QA_EVIDENCE_ARM_CAPTURE",
      "QA_EVIDENCE_PULL",
      "QA_EVIDENCE_CAPTURE_ACK",
      "QA_EVIDENCE_STOP_CAPTURE",
    ].includes(message.type)
  ) {
    return;
  }

  chrome.runtime.sendMessage(
    { type: message.type, payload: message.payload || {} },
    (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        postToPage("QA_EVIDENCE_CAPTURE_ERROR", { fileName: error.message });
        return;
      }
      if (
        message.type === "QA_EVIDENCE_CONTEXT" ||
        message.type === "QA_EVIDENCE_ARM_CAPTURE"
      ) {
        notifyReady();
      }
      if (response?.error) {
        postToPage("QA_EVIDENCE_CAPTURE_ERROR", { fileName: response.error });
      }
    }
  );
});

function removeSelectionOverlay() {
  if (typeof selectionCleanup === "function") selectionCleanup();
  selectionCleanup = null;
}

function stopCaptureSession() {
  removeSelectionOverlay();
  chrome.runtime.sendMessage({ type: "QA_EVIDENCE_STOP_CAPTURE" }, () => {
    void chrome.runtime.lastError;
  });
}

function startSelectionOverlay() {
  removeSelectionOverlay();

  const overlay = document.createElement("div");
  overlay.id = "qa-evidence-capture-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    background: "rgba(15, 23, 42, 0.16)",
    userSelect: "none",
  });

  const help = document.createElement("div");
  help.textContent =
    "ลากเมาส์ครอบพื้นที่ได้ต่อเนื่อง • เปลี่ยนแท็บได้ • Esc เพื่อจบ Capture";
  Object.assign(help.style, {
    position: "fixed",
    top: "18px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 16px",
    borderRadius: "12px",
    background: "rgba(15,23,42,0.92)",
    color: "white",
    font: "600 13px system-ui, sans-serif",
    boxShadow: "0 10px 30px rgba(15,23,42,0.28)",
    pointerEvents: "none",
  });

  const selection = document.createElement("div");
  Object.assign(selection.style, {
    position: "fixed",
    display: "none",
    border: "2px solid #0ea5e9",
    background: "rgba(14,165,233,0.08)",
    boxShadow: "0 0 0 99999px rgba(15,23,42,0.18)",
    pointerEvents: "none",
  });

  overlay.append(help, selection);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const updateSelection = (x, y) => {
    const left = Math.min(startX, x);
    const top = Math.min(startY, y);
    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    selection.style.display = "block";
    selection.style.left = left + "px";
    selection.style.top = top + "px";
    selection.style.width = width + "px";
    selection.style.height = height + "px";
  };

  const resetSelection = () => {
    dragging = false;
    selection.style.display = "none";
    selection.style.width = "0";
    selection.style.height = "0";
  };

  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    updateSelection(startX, startY);
    event.preventDefault();
    event.stopPropagation();
  };

  const onMouseMove = (event) => {
    if (!dragging) return;
    updateSelection(event.clientX, event.clientY);
    event.preventDefault();
    event.stopPropagation();
  };

  const onMouseUp = (event) => {
    if (!dragging) return;

    const left = Math.max(0, Math.min(startX, event.clientX));
    const top = Math.max(0, Math.min(startY, event.clientY));
    const width = Math.min(
      window.innerWidth - left,
      Math.abs(event.clientX - startX)
    );
    const height = Math.min(
      window.innerHeight - top,
      Math.abs(event.clientY - startY)
    );

    event.preventDefault();
    event.stopPropagation();

    if (width < 8 || height < 8) {
      resetSelection();
      return;
    }

    removeSelectionOverlay();

    window.setTimeout(() => {
      chrome.runtime.sendMessage(
        {
          type: "QA_EVIDENCE_SELECTION_READY",
          payload: {
            rect: { x: left, y: top, width, height },
            viewport: { width: window.innerWidth, height: window.innerHeight },
          },
        },
        (response) => {
          const error = chrome.runtime.lastError;
          if (error || response?.error) {
            postToPage("QA_EVIDENCE_CAPTURE_ERROR", {
              fileName: error?.message || response?.error || "Capture Evidence ไม่สำเร็จ",
            });
          }
        }
      );
    }, 80);
  };

  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stopCaptureSession();
  };

  overlay.addEventListener("mousedown", onMouseDown, true);
  overlay.addEventListener("mousemove", onMouseMove, true);
  overlay.addEventListener("mouseup", onMouseUp, true);
  window.addEventListener("keydown", onKeyDown, true);

  selectionCleanup = () => {
    overlay.removeEventListener("mousedown", onMouseDown, true);
    overlay.removeEventListener("mousemove", onMouseMove, true);
    overlay.removeEventListener("mouseup", onMouseUp, true);
    window.removeEventListener("keydown", onKeyDown, true);
    overlay.remove();
  };
}

function cropScreenshot(payload) {
  const { screenshotDataUrl, rect, viewport } = payload || {};
  if (!screenshotDataUrl || !rect || !viewport?.width || !viewport?.height) return;

  const image = new Image();
  image.onload = () => {
    try {
      const scaleX = image.naturalWidth / viewport.width;
      const scaleY = image.naturalHeight / viewport.height;
      const sx = Math.max(0, Math.round(rect.x * scaleX));
      const sy = Math.max(0, Math.round(rect.y * scaleY));
      const sw = Math.max(
        1,
        Math.min(image.naturalWidth - sx, Math.round(rect.width * scaleX))
      );
      const sh = Math.max(
        1,
        Math.min(image.naturalHeight - sy, Math.round(rect.height * scaleY))
      );

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

      const dataUrl = canvas.toDataURL("image/png");
      const capturedAt = new Date().toISOString();
      const fileName =
        "Evidence_Capture_" + capturedAt.replace(/[:.]/g, "-") + ".png";

      chrome.runtime.sendMessage(
        {
          type: "QA_EVIDENCE_CAPTURE_CROPPED",
          payload: {
            dataUrl,
            fileName,
            capturedAt,
            pageUrl: location.href,
            pageTitle: document.title,
          },
        },
        (response) => {
          const error = chrome.runtime.lastError;
          if (error || response?.error) {
            postToPage("QA_EVIDENCE_CAPTURE_ERROR", {
              fileName:
                error?.message ||
                response?.error ||
                "ไม่สามารถส่งภาพกลับ QA Dashboard ได้",
            });
          }
        }
      );
    } catch (error) {
      postToPage("QA_EVIDENCE_CAPTURE_ERROR", {
        fileName: String(error?.message || error),
      });
    }
  };
  image.onerror = () =>
    postToPage("QA_EVIDENCE_CAPTURE_ERROR", {
      fileName: "ไม่สามารถประมวลผลภาพหน้าจอได้",
    });
  image.src = screenshotDataUrl;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "QA_EVIDENCE_START_SELECTION") {
    startSelectionOverlay();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "QA_EVIDENCE_STOP_SELECTION") {
    removeSelectionOverlay();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "QA_EVIDENCE_CROP_SCREENSHOT") {
    cropScreenshot(message.payload);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "QA_EVIDENCE_CAPTURED") {
    postToPage("QA_EVIDENCE_CAPTURED", message.payload || {});
    sendResponse({ ok: true });
  }
});

notifyReady();
