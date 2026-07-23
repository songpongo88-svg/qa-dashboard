import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStoredRolePermissions } from "./userRoleStore";
import {
  DEFAULT_MAINTENANCE_CONTROL_STATE,
  fetchMaintenanceControlState,
  isMaintenanceOwnerUsername,
  MaintenanceControlState,
  saveMaintenanceControlState,
} from "./maintenanceControlStore";

type CurrentUserSnapshot = {
  username?: string;
  displayName?: string;
  role?: string;
};

const CURRENT_USER_STORAGE_KEY = "qa_current_user";
const RUNTIME_CHECK_INTERVAL_MS = 15_000;

function readCurrentUser(): CurrentUserSnapshot | null {
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUserSnapshot) : null;
  } catch {
    return null;
  }
}

function getUserKey(user: CurrentUserSnapshot | null) {
  return `${String(user?.username || "").toLowerCase()}|${String(
    user?.role || ""
  ).toLowerCase()}`;
}

function formatThaiDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function getCountdown(target: string, now: number) {
  const targetTime = new Date(target).getTime();
  const totalSeconds = Number.isFinite(targetTime)
    ? Math.max(0, Math.floor((targetTime - now) / 1000))
    : 0;

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds };
}

export default function MaintenanceRuntime() {
  const syncing = useRef(false);
  const lastUserKey = useRef("");

  const [control, setControl] = useState<MaintenanceControlState>(
    DEFAULT_MAINTENANCE_CONTROL_STATE
  );
  const [currentUser, setCurrentUser] =
    useState<CurrentUserSnapshot | null>(() => readCurrentUser());
  const [canBypass, setCanBypass] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loginNoticeDismissed, setLoginNoticeDismissed] = useState(false);

  const syncRuntimeState = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;

    try {
      let next = await fetchMaintenanceControlState();
      const nowTime = Date.now();
      let transitioned = false;

      const startTime = new Date(next.scheduledStartAt).getTime();
      const endTime = new Date(next.scheduledEndAt).getTime();

      if (
        next.status === "scheduled" &&
        Number.isFinite(startTime) &&
        startTime <= nowTime
      ) {
        next = {
          ...next,
          enabled: true,
          status: "active",
          updatedAt: new Date().toISOString(),
          updatedBy: next.updatedBy || "System Scheduler",
        };
        await saveMaintenanceControlState(next);
        transitioned = true;
      }

      if (
        next.enabled &&
        next.autoOpenEnabled &&
        Number.isFinite(endTime) &&
        endTime <= nowTime
      ) {
        next = {
          ...next,
          enabled: false,
          status: "completed",
          updatedAt: new Date().toISOString(),
          updatedBy: "System Scheduler",
        };
        await saveMaintenanceControlState(next);
        transitioned = true;
      }

      setControl(next);

      if (transitioned) {
        window.setTimeout(() => window.location.reload(), 700);
      }
    } finally {
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    void syncRuntimeState();

    const intervalId = window.setInterval(
      syncRuntimeState,
      RUNTIME_CHECK_INTERVAL_MS
    );

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncRuntimeState();
      }
    };

    window.addEventListener("focus", syncRuntimeState);
    window.addEventListener("online", syncRuntimeState);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncRuntimeState);
      window.removeEventListener("online", syncRuntimeState);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncRuntimeState]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());

      const nextUser = readCurrentUser();
      const nextKey = getUserKey(nextUser);

      if (nextKey !== lastUserKey.current) {
        lastUserKey.current = nextKey;
        setCurrentUser(nextUser);
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveBypass() {
      if (!currentUser) {
        if (!cancelled) setCanBypass(false);
        return;
      }

      if (isMaintenanceOwnerUsername(currentUser.username)) {
        if (!cancelled) setCanBypass(true);
        return;
      }

      try {
        const permissions = await fetchStoredRolePermissions();
        const rolePermission = permissions.find(
          (item) =>
            String(item.roleName || "").trim().toLowerCase() ===
            String(currentUser.role || "").trim().toLowerCase()
        );

        if (!cancelled) {
          setCanBypass(
            Boolean(rolePermission?.permissions?.manageMaintenance)
          );
        }
      } catch {
        if (!cancelled) setCanBypass(false);
      }
    }

    void resolveBypass();

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    setLoginNoticeDismissed(false);
  }, [
    control.enabled,
    control.status,
    control.updatedAt,
    control.scheduledStartAt,
    control.scheduledEndAt,
    control.title,
    control.message,
  ]);

  const scheduledCountdown = useMemo(
    () => getCountdown(control.scheduledStartAt, now),
    [control.scheduledStartAt, now]
  );

  const reopenCountdown = useMemo(
    () => getCountdown(control.scheduledEndAt, now),
    [control.scheduledEndAt, now]
  );

  const scheduledSoon =
    control.status === "scheduled" &&
    Boolean(control.scheduledStartAt) &&
    scheduledCountdown.totalSeconds > 0;

  const active = control.enabled || control.status === "active";

  if (!active && !scheduledSoon) return null;

  const severityClass =
    control.severity === "emergency"
      ? "border-rose-300 bg-gradient-to-br from-rose-50 via-white to-orange-50"
      : control.severity === "important"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-orange-50"
        : "border-violet-300 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50";

  const accentClass =
    control.severity === "emergency"
      ? "bg-rose-600"
      : control.severity === "important"
        ? "bg-amber-500"
        : "bg-violet-600";

  if (currentUser && canBypass) {
    return (
      <div className="fixed right-4 top-4 z-[220] max-w-sm rounded-2xl border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-white ${accentClass}`}>
            ⚙
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">
              {active ? "Maintenance เปิดอยู่" : "มี Maintenance ที่ตั้งเวลาไว้"}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Owner/Admin Access · คุณยังใช้งานระบบได้
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentUser && active && !canBypass) {
    return (
      <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm">
        <div className={`w-full max-w-2xl overflow-hidden rounded-[30px] border bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)] ${severityClass}`}>
          <div className={`h-2 w-full ${accentClass}`} />
          <div className="p-7 md:p-9">
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-[26px] text-4xl text-white shadow-lg ${accentClass}`}>
                !
              </div>

              <div className="min-w-0 flex-1">
                <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  {control.reasonName || "Maintenance"}
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  {control.title || "ระบบอยู่ระหว่างการปรับปรุง"}
                </h1>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {control.message ||
                    "ระบบปิดใช้งานชั่วคราว กรุณากลับมาใช้งานอีกครั้งตามเวลาที่แจ้ง"}
                </p>

                {control.autoOpenEnabled && control.scheduledEndAt ? (
                  <div className="mt-6 rounded-2xl border border-white/80 bg-white/80 p-4">
                    <div className="text-xs font-medium text-slate-500">
                      ระบบจะเปิดให้ใช้งานอีกครั้ง
                    </div>
                    <div className="mt-1 text-base font-semibold text-slate-950">
                      {formatThaiDateTime(control.scheduledEndAt)}
                    </div>
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      {[
                        ["วัน", reopenCountdown.days],
                        ["ชั่วโมง", reopenCountdown.hours],
                        ["นาที", reopenCountdown.minutes],
                        ["วินาที", reopenCountdown.seconds],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
                          <div className="text-xl font-semibold text-slate-950">
                            {String(value).padStart(2, "0")}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void syncRuntimeState()}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
                  >
                    ตรวจสอบสถานะอีกครั้ง
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
                      window.location.reload();
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser && !loginNoticeDismissed) {
    return (
      <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/28 p-4 backdrop-blur-[1px]">
        <div className={`relative w-full max-w-[680px] overflow-hidden rounded-[30px] border bg-white shadow-[0_32px_100px_rgba(15,23,42,0.22)] ${severityClass}`}>
          <div className={`h-2 w-full ${accentClass}`} />
          <button
            type="button"
            aria-label="ปิดข้อความแจ้งเตือน"
            onClick={() => setLoginNoticeDismissed(true)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
          >
            ✕
          </button>

          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] text-3xl text-white shadow-lg ${accentClass}`}>
                {active ? "!" : "⏱"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {active
                    ? control.reasonName || "ปิดระบบชั่วคราว"
                    : "แจ้งล่วงหน้า"}
                </div>

                <div className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-slate-950">
                  {active
                    ? control.title || "ระบบอยู่ระหว่างการปรับปรุง"
                    : "ระบบจะปิดปรับปรุงเร็ว ๆ นี้"}
                </div>

                <div className="mt-3 text-base leading-8 text-slate-600">
                  {control.message ||
                    "ขณะนี้ระบบอยู่ระหว่างการอัปเดตและปรับปรุงประสิทธิภาพ กรุณากลับมาใช้งานอีกครั้งตามเวลาที่แจ้ง"}
                </div>

                <div className="mt-5 rounded-[24px] border border-white/90 bg-white/90 p-5 shadow-sm">
                  <div className="text-sm font-medium text-slate-500">
                    {active ? "คาดว่าจะเปิดระบบ" : "กำหนดปิดระบบ"}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {formatThaiDateTime(
                      active
                        ? control.scheduledEndAt
                        : control.scheduledStartAt
                    )}
                  </div>
                  <div className="mt-3 text-sm font-medium text-slate-500">
                    {active
                      ? `เหลือประมาณ ${reopenCountdown.days} วัน ${reopenCountdown.hours} ชม. ${reopenCountdown.minutes} นาที`
                      : `อีก ${scheduledCountdown.days} วัน ${scheduledCountdown.hours} ชม. ${scheduledCountdown.minutes} นาที`}
                  </div>
                </div>

                <div className="mt-4 text-xs leading-6 text-slate-500">
                  ผู้ดูแลระบบและเจ้าของระบบยังสามารถเข้าสู่ระบบได้
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setLoginNoticeDismissed(true)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
                  >
                    ปิดข้อความ
                  </button>
                  <button
                    type="button"
                    onClick={() => void syncRuntimeState()}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
                  >
                    ตรวจสอบสถานะอีกครั้ง
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}