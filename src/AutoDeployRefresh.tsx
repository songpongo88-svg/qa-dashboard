import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type BuildMeta = {
  buildId?: string;
  buildNumber?: number;
  displayVersion?: string;
  releaseLabel?: string;
  updatedAt?: string;
  commitHash?: string;
  commitMessage?: string;
  changedFiles?: string[];
  releaseNotesTitle?: string;
  releaseNotes?: string[];
};

const CHECK_INTERVAL_MS = 30_000;
const REFRESH_COUNTDOWN_SECONDS = 10;
const EMBEDDED_BUILD_META: BuildMeta = import.meta.env.VITE_BUILD_META || {};

function getBuildKey(meta: BuildMeta) {
  return String(
    meta.buildId ||
      meta.commitHash ||
      meta.buildNumber ||
      meta.displayVersion ||
      meta.releaseLabel ||
      ""
  ).trim();
}

async function fetchLatestBuildMeta(): Promise<BuildMeta | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`/build-meta.json?check=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as BuildMeta;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isTypingOrEditing() {
  const activeElement = document.activeElement as HTMLElement | null;
  if (!activeElement) return false;

  if (activeElement.isContentEditable) return true;
  if (activeElement instanceof HTMLTextAreaElement) return true;
  if (activeElement instanceof HTMLSelectElement) return true;

  if (activeElement instanceof HTMLInputElement) {
    const safeInputTypes = new Set([
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "range",
      "reset",
      "submit",
    ]);
    return !safeInputTypes.has(activeElement.type);
  }

  return false;
}

function hasUnsavedChanges() {
  return Boolean(
    document.querySelector(
      '[data-unsaved-changes="true"], [data-dirty="true"], [aria-busy="true"][data-saving]'
    )
  );
}

function getChangeNotes(meta: BuildMeta) {
  const notes = Array.isArray(meta.releaseNotes)
    ? meta.releaseNotes.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (notes.length) return notes.slice(0, 5);

  const commitMessage = String(meta.commitMessage || "").trim();
  if (commitMessage) {
    return commitMessage
      .split(/\r?\n/)
      .map((item) => item.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  return [];
}

export default function AutoDeployRefresh() {
  const baselineBuildKey = useRef(getBuildKey(EMBEDDED_BUILD_META));
  const latestBuildKey = useRef("");
  const reloading = useRef(false);

  const [latestMeta, setLatestMeta] = useState<BuildMeta | null>(null);
  const [refreshBlocked, setRefreshBlocked] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_COUNTDOWN_SECONDS);

  const refreshNow = useCallback(() => {
    if (reloading.current) return;
    reloading.current = true;

    try { if (latestBuildKey.current) {
      window.sessionStorage.setItem(
        "qa-dashboard:last-applied-build",
        latestBuildKey.current
      );
    } } catch { /* Storage restrictions must not prevent an explicit refresh. */ }

    window.location.reload();
  }, []);

  useEffect(() => {
    let disposed = false;
    let checking = false;

    const checkForNewBuild = async () => {
      if (checking) return;
      checking = true;
      const meta = await fetchLatestBuildMeta();
      checking = false;
      if (disposed || !meta) return;

      const nextKey = getBuildKey(meta);
      if (!nextKey) return;

      if (!baselineBuildKey.current) {
        baselineBuildKey.current = nextKey;
        return;
      }

      if (nextKey !== baselineBuildKey.current && nextKey !== latestBuildKey.current) {
        latestBuildKey.current = nextKey;
        setLatestMeta(meta);
        setDeferred(false);
      } else if (nextKey === baselineBuildKey.current && latestBuildKey.current) {
        latestBuildKey.current = "";
        setLatestMeta(null);
      }
    };

    void checkForNewBuild();

    const intervalId = window.setInterval(
      checkForNewBuild,
      CHECK_INTERVAL_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForNewBuild();
      }
    };

    const handleWindowFocus = () => {
      void checkForNewBuild();
    };

    const handleOnline = () => {
      void checkForNewBuild();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!latestMeta) return;

    const updateBlockedState = () => {
      setRefreshBlocked(document.visibilityState !== "visible" || hasUnsavedChanges() || isTypingOrEditing());
    };

    updateBlockedState();
    const intervalId = window.setInterval(updateBlockedState, 750);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestMeta]);

  useEffect(() => {
    if (!latestMeta || refreshBlocked || deferred) {
      setCountdown(REFRESH_COUNTDOWN_SECONDS);
      return;
    }

    setCountdown(REFRESH_COUNTDOWN_SECONDS);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || hasUnsavedChanges() || isTypingOrEditing()) {
        setRefreshBlocked(true);
        return;
      }

      setCountdown(current => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestMeta, refreshBlocked, deferred]);

  useEffect(() => {
    if (latestMeta && countdown === 0 && !refreshBlocked && !deferred &&
      document.visibilityState === "visible" && !hasUnsavedChanges() && !isTypingOrEditing()) refreshNow();
  }, [latestMeta, countdown, refreshBlocked, deferred, refreshNow]);

  if (!latestMeta) return null;

  const versionLabel =
    latestMeta.releaseLabel ||
    latestMeta.displayVersion ||
    "เวอร์ชันล่าสุด";
  const changeNotes = getChangeNotes(latestMeta);
  const changedFilesCount = Array.isArray(latestMeta.changedFiles)
    ? latestMeta.changedFiles.length
    : 0;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-[200] w-[min(470px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] ${
        refreshBlocked ? "border-amber-200" : "border-violet-200"
      }`}
      data-deploy-notice="true"
      style={{ fontFamily: "'Kanit', sans-serif", zIndex: 2147483647 }}
    >
      <div
        className={`h-1.5 ${
          refreshBlocked
            ? "bg-amber-400"
            : "bg-gradient-to-r from-violet-600 to-fuchsia-500"
        }`}
        style={
          refreshBlocked
            ? undefined
            : {
                width: `${
                  (countdown / REFRESH_COUNTDOWN_SECONDS) * 100
                }%`,
                transition: "width 1s linear",
              }
        }
      />

      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${
              refreshBlocked
                ? "bg-amber-50 text-amber-700"
                : "bg-violet-50 text-violet-700"
            }`}
          >
            ↻
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold text-slate-950">
              มีเวอร์ชันใหม่พร้อมใช้งาน
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-violet-700">
              <span>{versionLabel}</span>
              {latestMeta.commitHash ? (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                  {latestMeta.commitHash.slice(0, 7)}
                </span>
              ) : null}
            </div>

            <div className="mt-2 text-sm font-normal leading-6 text-slate-600">
              {deferred ? "พักการรีเฟรชไว้แล้ว กดรีเฟรชตอนนี้เมื่อพร้อม" : refreshBlocked
                ? "ระบบพักการรีเฟรชไว้เพื่อป้องกันข้อมูลที่กำลังกรอกหรือยังไม่ได้บันทึก เมื่อบันทึกเสร็จ ระบบจะเริ่มนับถอยหลังอัตโนมัติ"
                : `ระบบจะรีเฟรชหน้าเว็บอัตโนมัติใน ${countdown} วินาที`}
            </div>

            {changeNotes.length ? (
              <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-3.5">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-700">
                  เวอร์ชันนี้ปรับอะไร
                </div>
                <div className="mt-2 space-y-1.5">
                  {changeNotes.map((note, index) => (
                    <div key={`${note}-${index}`} className="flex gap-2 text-xs font-medium leading-5 text-slate-700">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-normal text-slate-400">
              {latestMeta.updatedAt ? <span>Deploy เมื่อ {latestMeta.updatedAt}</span> : null}
              {changedFilesCount ? <span>{changedFilesCount} files changed</span> : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setDeferred(true)} disabled={deferred}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
            เลื่อนการรีเฟรช
          </button>
          <button
            type="button"
            onClick={refreshNow}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-95 ${
              refreshBlocked
                ? "bg-amber-600"
                : "bg-gradient-to-r from-violet-700 to-fuchsia-600"
            }`}
          >
            รีเฟรชตอนนี้
          </button>
        </div>
      </div>
    </div>, document.body
  );
}
