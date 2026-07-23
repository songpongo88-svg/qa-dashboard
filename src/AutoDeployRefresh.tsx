import { useCallback, useEffect, useRef, useState } from "react";

type BuildMeta = {
  buildNumber?: number;
  displayVersion?: string;
  releaseLabel?: string;
  updatedAt?: string;
  commitHash?: string;
};

const CHECK_INTERVAL_MS = 30_000;
const REFRESH_COUNTDOWN_SECONDS = 5;

function getBuildKey(meta: BuildMeta) {
  return String(
    meta.buildNumber ||
      meta.commitHash ||
      meta.displayVersion ||
      meta.releaseLabel ||
      ""
  ).trim();
}

async function fetchLatestBuildMeta(): Promise<BuildMeta | null> {
  try {
    const response = await fetch(`/build-meta.json?check=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as BuildMeta;
  } catch {
    return null;
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

export default function AutoDeployRefresh() {
  const baselineBuildKey = useRef("");
  const latestBuildKey = useRef("");
  const reloading = useRef(false);

  const [latestMeta, setLatestMeta] = useState<BuildMeta | null>(null);
  const [refreshBlocked, setRefreshBlocked] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_COUNTDOWN_SECONDS);

  const refreshNow = useCallback(() => {
    if (reloading.current) return;
    reloading.current = true;

    if (latestBuildKey.current) {
      window.sessionStorage.setItem(
        "qa-dashboard:last-applied-build",
        latestBuildKey.current
      );
    }

    window.location.reload();
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkForNewBuild = async () => {
      const meta = await fetchLatestBuildMeta();
      if (disposed || !meta) return;

      const nextKey = getBuildKey(meta);
      if (!nextKey) return;

      if (!baselineBuildKey.current) {
        baselineBuildKey.current = nextKey;
        return;
      }

      if (nextKey !== baselineBuildKey.current) {
        latestBuildKey.current = nextKey;
        setLatestMeta(meta);
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
      setRefreshBlocked(hasUnsavedChanges() || isTypingOrEditing());
    };

    updateBlockedState();
    const intervalId = window.setInterval(updateBlockedState, 750);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestMeta]);

  useEffect(() => {
    if (!latestMeta || refreshBlocked) {
      setCountdown(REFRESH_COUNTDOWN_SECONDS);
      return;
    }

    setCountdown(REFRESH_COUNTDOWN_SECONDS);

    const intervalId = window.setInterval(() => {
      if (hasUnsavedChanges() || isTypingOrEditing()) {
        setRefreshBlocked(true);
        return;
      }

      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          refreshNow();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestMeta, refreshBlocked, refreshNow]);

  if (!latestMeta) return null;

  const versionLabel =
    latestMeta.releaseLabel ||
    latestMeta.displayVersion ||
    "เวอร์ชันล่าสุด";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-[200] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] ${
        refreshBlocked ? "border-amber-200" : "border-violet-200"
      }`}
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

            <div className="mt-1 text-xs font-medium text-violet-700">
              {versionLabel}
            </div>

            <div className="mt-2 text-sm font-normal leading-6 text-slate-600">
              {refreshBlocked
                ? "ระบบพักการรีเฟรชไว้เพื่อป้องกันข้อมูลที่กำลังกรอกหรือยังไม่ได้บันทึก เมื่อบันทึกเสร็จ ระบบจะเริ่มนับถอยหลังอัตโนมัติ"
                : `ระบบจะรีเฟรชหน้าเว็บอัตโนมัติใน ${countdown} วินาที`}
            </div>

            {latestMeta.updatedAt ? (
              <div className="mt-1 text-xs font-normal text-slate-400">
                Deploy เมื่อ {latestMeta.updatedAt}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
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
    </div>
  );
}