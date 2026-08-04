import React, { useEffect, useMemo, useState } from "react";
import {
  deleteStoredAnnouncement,
  fetchAnnouncementReceipts,
  fetchStoredAnnouncements,
  subscribeAnnouncementReceipts,
  subscribeStoredAnnouncements,
  upsertAnnouncementReceipt,
  upsertStoredAnnouncement,
  type AnnouncementMedia,
  type AnnouncementMediaType,
  type AnnouncementPriority,
  type AnnouncementReceipt,
  type StoredAnnouncement,
} from "./announcementStore";

type HubUser = {
  username: string;
  displayName: string;
  role: string;
  agentName?: string;
  teamName?: string;
  email?: string;
};

type AnnouncementHubProps = {
  currentUser: HubUser;
  users: HubUser[];
};

type HubView = "inbox" | "control" | "analytics";
type PopupDeliveryKind = "legacy" | "immediate" | "reminder";

const ROLE_OPTIONS = [
  "Admin Live Chat",
  "Virtual Rider",
  "Senior",
  "Supervisor",
  "Quality Assurance",
];

const CATEGORY_OPTIONS = [
  "General",
  "QA Update",
  "Process Update",
  "System Maintenance",
  "Coaching",
  "Schedule / OT",
  "Urgent Notice",
];

const CATEGORY_LABELS: Record<string, string> = {
  General: "ทั่วไป",
  "QA Update": "อัปเดต QA",
  "Process Update": "อัปเดตขั้นตอนการทำงาน",
  "System Maintenance": "แจ้งปิดปรับปรุงระบบ",
  Coaching: "Coaching",
  "Schedule / OT": "ตารางงาน / OT",
  "Urgent Notice": "ประกาศเร่งด่วน",
};

const PRIORITY_LABELS: Record<AnnouncementPriority, string> = {
  Normal: "ปกติ",
  Important: "สำคัญ",
  Urgent: "เร่งด่วน",
};

const STATUS_LABELS: Record<string, string> = {
  Active: "กำลังแสดง",
  Scheduled: "ตั้งเวลาแล้ว",
  Expired: "หมดเวลา",
  Archived: "เก็บถาวร",
};

const POLL_MS = 30_000;
const SESSION_SNOOZE_KEY = "qa-announcement-session-snooze-v1";

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function canManageAnnouncements(user: HubUser) {
  return normalize(user.role) === "quality assurance";
}

function localDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function localDatePart(value: string) {
  const raw = String(value || "").trim();
  const direct = /^(\d{4}-\d{2}-\d{2})(?:T\d{0,2}:?\d{0,2})?$/.exec(raw);
  if (direct) return direct[1];
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : localDateTimeInput(date).slice(0, 10);
}

function localTimePart(value: string) {
  const raw = String(value || "").trim();
  const direct = /^(?:\d{4}-\d{2}-\d{2})?T(\d{0,2}:?\d{0,2})$/.exec(raw);
  if (direct) return direct[1];
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : localDateTimeInput(date).slice(11, 16);
}

function typedTime(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
  return digits.length >= 3
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function joinLocalDateTime(date: string, time: string) {
  return `${date || ""}T${time || ""}`;
}

function formatThaiSchedule(dateValue: string, timeValue: string) {
  const date = new Date(`${dateValue}T00:00`);
  if (Number.isNaN(date.getTime())) return "ยังไม่ได้เลือกวันที่";
  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${dateLabel} เวลา ${timeValue || "--:--"} น.`;
}

function timeMinutes(value: string) {
  if (!isValidTime(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function localDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function receiptMatchesCurrentVersion(
  item: StoredAnnouncement,
  receiptValue: string | undefined
) {
  if (!receiptValue) return false;
  const receiptAt = new Date(receiptValue).getTime();
  const announcementAt = new Date(
    item.updatedAt || item.createdAt || 0
  ).getTime();
  return (
    !Number.isNaN(receiptAt) &&
    (Number.isNaN(announcementAt) || receiptAt >= announcementAt)
  );
}

function wasShownToday(
  item: StoredAnnouncement,
  receipt: AnnouncementReceipt | undefined,
  now: Date
) {
  return Boolean(
    receiptMatchesCurrentVersion(item, receipt?.lastShownAt) &&
      localDayKey(receipt?.lastShownAt || "") === localDayKey(now)
  );
}

function wasRead(item: StoredAnnouncement, receipt: AnnouncementReceipt | undefined) {
  return receiptMatchesCurrentVersion(item, receipt?.readAt);
}

function wasAcknowledged(
  item: StoredAnnouncement,
  receipt: AnnouncementReceipt | undefined
) {
  return receiptMatchesCurrentVersion(item, receipt?.acknowledgedAt);
}

function pendingModernDeliveryKind(
  item: StoredAnnouncement,
  receipt: AnnouncementReceipt | undefined,
  now: Date
): Exclude<PopupDeliveryKind, "legacy"> | null {
  if (item.deliveryModel !== "immediate-reminder") return null;
  if (
    item.showImmediately &&
    !receiptMatchesCurrentVersion(item, receipt?.immediateReadAt)
  ) {
    return "immediate";
  }

  const reminderAt = new Date(item.reminderAt || "");
  if (
    item.reminderEnabled &&
    !Number.isNaN(reminderAt.getTime()) &&
    reminderAt.getTime() <= now.getTime() &&
    !receiptMatchesCurrentVersion(item, receipt?.reminderReadAt)
  ) {
    return "reminder";
  }
  return null;
}

function isCurrentDeliveryRead(
  item: StoredAnnouncement,
  receipt: AnnouncementReceipt | undefined,
  now: Date
) {
  if (item.deliveryModel !== "immediate-reminder") {
    return wasRead(item, receipt);
  }
  const immediateDone =
    !item.showImmediately ||
    receiptMatchesCurrentVersion(item, receipt?.immediateReadAt);
  const reminderAt = new Date(item.reminderAt || "");
  const reminderIsDue =
    item.reminderEnabled &&
    !Number.isNaN(reminderAt.getTime()) &&
    reminderAt.getTime() <= now.getTime();
  const reminderDone =
    !reminderIsDue ||
    receiptMatchesCurrentVersion(item, receipt?.reminderReadAt);
  return immediateDone && reminderDone;
}

function deliveryKey(
  item: StoredAnnouncement,
  kind: PopupDeliveryKind = "legacy"
) {
  return `${item.id}@@${item.updatedAt || item.createdAt || "initial"}@@${kind}`;
}

function isDailyDisplayWindow(item: StoredAnnouncement, now: Date) {
  if (item.repeatMode !== "daily") return true;
  const start = timeMinutes(item.dailyStartTime || localTimePart(item.startsAt));
  const end = timeMinutes(item.dailyEndTime || localTimePart(item.endsAt));
  if (start === null || end === null) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end
    ? current >= start && current <= end
    : current >= start || current <= end;
}

function announcementStatus(item: StoredAnnouncement, now = new Date()) {
  if (item.archived) return "Archived";
  if (item.deliveryModel === "immediate-reminder") return "Active";
  const start = item.startsAt ? new Date(item.startsAt) : null;
  const end = item.endsAt ? new Date(item.endsAt) : null;
  if (start && start.getTime() > now.getTime()) return "Scheduled";
  if (end && end.getTime() < now.getTime()) return "Expired";
  return "Active";
}

function matchesTarget(item: StoredAnnouncement, user: HubUser) {
  if (item.targetAll) return true;
  const username = normalize(user.username);
  const role = normalize(user.role);
  const team = normalize(user.teamName);
  return (
    item.targetUsernames.some((value) => normalize(value) === username) ||
    item.targetRoles.some((value) => normalize(value) === role) ||
    Boolean(
      team &&
        item.targetTeams.some((value) => normalize(value) === team)
    )
  );
}

function readSnoozedIds() {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(SESSION_SNOOZE_KEY) || "[]"
    );
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveSnoozedIds(ids: string[]) {
  window.sessionStorage.setItem(
    SESSION_SNOOZE_KEY,
    JSON.stringify([...new Set(ids)])
  );
}

function priorityClasses(priority: AnnouncementPriority) {
  if (priority === "Urgent") {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      panel: "from-rose-700 via-rose-600 to-orange-500",
    };
  }
  if (priority === "Important") {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      panel: "from-violet-800 via-violet-700 to-fuchsia-600",
    };
  }
  return {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    panel: "from-slate-900 via-violet-900 to-violet-700",
  };
}

function MediaPreview({ media, spotlight = false }: { media: AnnouncementMedia; spotlight?: boolean }) {
  if (media.type === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer">
        <img
          src={media.url}
          alt={media.label || "Announcement media"}
          className={spotlight ? "max-h-[72vh] w-full rounded-[26px] bg-slate-950 object-contain" : "max-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain"}
        />
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        controls
        className={spotlight ? "max-h-[72vh] w-full rounded-[26px] bg-slate-950" : "max-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-950"}
      />
    );
  }

  return (
    <a
      href={media.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100"
    >
      <span>{media.label || (media.type === "pdf" ? "Open PDF" : "Open Link")}</span>
      <span>Open ↗</span>
    </a>
  );
}

function ToggleChoice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-black transition ${
        active
          ? "border-violet-500 bg-violet-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"
      }`}
    >
      {label}
    </button>
  );
}

function emptyDraft(user: HubUser): StoredAnnouncement {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: "",
    title: "",
    body: "",
    category: "General",
    priority: "Normal",
    popupMode: "Once",
    deliveryModel: "immediate-reminder",
    showImmediately: true,
    reminderEnabled: false,
    reminderAt: localDateTimeInput(tomorrow),
    repeatMode: "once",
    dailyStartTime: localDateTimeInput(now).slice(11, 16),
    dailyEndTime: localDateTimeInput(tomorrow).slice(11, 16),
    displayMode: "Media Only",
    actionRequired: "Read Only",
    startsAt: localDateTimeInput(now),
    endsAt: localDateTimeInput(tomorrow),
    targetAll: true,
    targetRoles: [],
    targetTeams: [],
    targetUsernames: [],
    media: [],
    createdBy: user.username,
    createdByName: user.displayName,
    createdAt: "",
    updatedAt: "",
    archived: false,
  };
}

export default function AnnouncementHub({
  currentUser,
  users,
}: AnnouncementHubProps) {
  const [announcements, setAnnouncements] = useState<StoredAnnouncement[]>([]);
  const [receipts, setReceipts] = useState<AnnouncementReceipt[]>([]);
  const [hubOpen, setHubOpen] = useState(false);
  const [view, setView] = useState<HubView>("inbox");
  const [draft, setDraft] = useState<StoredAnnouncement>(() =>
    emptyDraft(currentUser)
  );
  const [selectedMessage, setSelectedMessage] =
    useState<StoredAnnouncement | null>(null);
  const [popupMessage, setPopupMessage] =
    useState<StoredAnnouncement | null>(null);
  const [popupDeliveryKind, setPopupDeliveryKind] =
    useState<PopupDeliveryKind>("legacy");
  const [mediaDescriptionOpen, setMediaDescriptionOpen] = useState(false);
  const [mediaType, setMediaType] =
    useState<AnnouncementMediaType>("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaLabel, setMediaLabel] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [snoozedIds, setSnoozedIds] = useState<string[]>(readSnoozedIds);
  const [scheduleTick, setScheduleTick] = useState(0);

  const manageAllowed = canManageAnnouncements(currentUser);
  const currentUsername = normalize(currentUser.username);

  useEffect(() => {
    setMediaDescriptionOpen(false);
  }, [popupMessage?.id]);

  const loadData = async () => {
    try {
      const [nextAnnouncements, nextReceipts] = await Promise.all([
        fetchStoredAnnouncements(),
        fetchAnnouncementReceipts(),
      ]);
      setAnnouncements(nextAnnouncements);
      setReceipts(nextReceipts);
    } catch (error) {
      console.warn("Announcement polling failed", error);
    }
  };

  useEffect(() => {
    void loadData();
    const stopAnnouncements = subscribeStoredAnnouncements(
      setAnnouncements,
      (error) => console.warn("Announcement live update failed", error)
    );
    const stopReceipts = subscribeAnnouncementReceipts(
      setReceipts,
      (error) => console.warn("Announcement receipt live update failed", error)
    );
    const timer = window.setInterval(() => void loadData(), POLL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      stopAnnouncements();
      stopReceipts();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currentUsername]);

  useEffect(() => {
    let minuteTimer = 0;
    const now = new Date();
    const delayToNextMinute = Math.max(
      50,
      60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50
    );
    const boundaryTimer = window.setTimeout(() => {
      setScheduleTick((current) => current + 1);
      minuteTimer = window.setInterval(
        () => setScheduleTick((current) => current + 1),
        60_000
      );
    }, delayToNextMinute);

    return () => {
      window.clearTimeout(boundaryTimer);
      if (minuteTimer) window.clearInterval(minuteTimer);
    };
  }, [currentUsername]);

  const myReceiptMap = useMemo(() => {
    const map = new Map<string, AnnouncementReceipt>();
    receipts
      .filter((item) => normalize(item.username) === currentUsername)
      .forEach((item) => map.set(item.announcementId, item));
    return map;
  }, [receipts, currentUsername]);

  const myAnnouncements = useMemo(
    () =>
      announcements
        .filter((item) => matchesTarget(item, currentUser))
        .filter((item) => announcementStatus(item) !== "Archived")
        .sort(
          (a, b) =>
            new Date(b.startsAt || b.createdAt || 0).getTime() -
            new Date(a.startsAt || a.createdAt || 0).getTime()
        ),
    [announcements, currentUser]
  );

  const unreadAnnouncements = useMemo(
    () =>
      myAnnouncements.filter((item) => {
        const now = new Date();
        const receipt = myReceiptMap.get(item.id);
        if (item.deliveryModel === "immediate-reminder") {
          return Boolean(pendingModernDeliveryKind(item, receipt, now));
        }
        if (announcementStatus(item, now) !== "Active") return false;
        if (item.repeatMode === "daily") {
          return isDailyDisplayWindow(item, now) && !wasShownToday(item, receipt, now);
        }
        if (item.repeatMode === "until-read") {
          return !wasAcknowledged(item, receipt);
        }
        return !wasRead(item, receipt);
      }),
    [myAnnouncements, myReceiptMap, scheduleTick]
  );

  useEffect(() => {
    if (popupMessage) return;
    if (document.visibilityState !== "visible") return;

    let next: StoredAnnouncement | null = null;
    let nextKind: PopupDeliveryKind = "legacy";
    for (const item of myAnnouncements) {
      const now = new Date();
      if (
        item.popupMode === "Mailbox Only" ||
        item.displayMode === "Mailbox Only" ||
        item.displayMode === "Banner"
      )
        continue;
      const receipt = myReceiptMap.get(item.id);
      if (item.deliveryModel === "immediate-reminder") {
        const kind = pendingModernDeliveryKind(item, receipt, now);
        if (kind && !snoozedIds.includes(deliveryKey(item, kind))) {
          next = item;
          nextKind = kind;
          break;
        }
        continue;
      }
      if (announcementStatus(item, now) !== "Active") continue;
      if (item.repeatMode === "daily") {
        if (isDailyDisplayWindow(item, now) && !wasShownToday(item, receipt, now)) {
          next = item;
          break;
        }
        continue;
      }
      if (item.repeatMode === "until-read") {
        if (!wasAcknowledged(item, receipt)) {
          next = item;
          break;
        }
        continue;
      }
      if (!wasRead(item, receipt) && !snoozedIds.includes(deliveryKey(item))) {
        next = item;
        break;
      }
    }

    if (next) {
      setPopupMessage(next);
      setPopupDeliveryKind(nextKind);
      const current = myReceiptMap.get(next.id);
      const shownAt = new Date().toISOString();
      void upsertAnnouncementReceipt({
        id: `${next.id}__${currentUsername}`,
        announcementId: next.id,
        username: currentUsername,
        displayName: currentUser.displayName,
        readAt: wasRead(next, current) ? current?.readAt || "" : "",
        acknowledgedAt: wasAcknowledged(next, current)
          ? current?.acknowledgedAt || ""
          : "",
        lastShownAt: shownAt,
        immediateShownAt:
          nextKind === "immediate"
            ? shownAt
            : receiptMatchesCurrentVersion(next, current?.immediateShownAt)
              ? current?.immediateShownAt || ""
              : "",
        immediateReadAt: receiptMatchesCurrentVersion(
          next,
          current?.immediateReadAt
        )
          ? current?.immediateReadAt || ""
          : "",
        reminderShownAt:
          nextKind === "reminder"
            ? shownAt
            : receiptMatchesCurrentVersion(next, current?.reminderShownAt)
              ? current?.reminderShownAt || ""
              : "",
        reminderReadAt: receiptMatchesCurrentVersion(
          next,
          current?.reminderReadAt
        )
          ? current?.reminderReadAt || ""
          : "",
      }).then(() => void loadData());
    }
  }, [
    myAnnouncements,
    myReceiptMap,
    popupMessage,
    snoozedIds,
    currentUsername,
    currentUser.displayName,
    scheduleTick,
  ]);

  const markRead = async (
    item: StoredAnnouncement,
    acknowledge = false,
    kind: PopupDeliveryKind = "legacy"
  ) => {
    const current = myReceiptMap.get(item.id);
    const now = new Date().toISOString();
    const immediateReadAt = receiptMatchesCurrentVersion(
      item,
      current?.immediateReadAt
    )
      ? current?.immediateReadAt || ""
      : "";
    const reminderReadAt = receiptMatchesCurrentVersion(
      item,
      current?.reminderReadAt
    )
      ? current?.reminderReadAt || ""
      : "";
    await upsertAnnouncementReceipt({
      id: `${item.id}__${currentUsername}`,
      announcementId: item.id,
      username: currentUsername,
      displayName: currentUser.displayName,
      readAt: wasRead(item, current) ? current?.readAt || now : now,
      acknowledgedAt: acknowledge
        ? wasAcknowledged(item, current)
          ? current?.acknowledgedAt || now
          : now
        : wasAcknowledged(item, current)
          ? current?.acknowledgedAt || ""
          : "",
      lastShownAt: receiptMatchesCurrentVersion(item, current?.lastShownAt)
        ? current?.lastShownAt || now
        : now,
      immediateShownAt: receiptMatchesCurrentVersion(
        item,
        current?.immediateShownAt
      )
        ? current?.immediateShownAt || now
        : kind === "immediate"
          ? now
          : "",
      immediateReadAt: kind === "immediate" ? now : immediateReadAt,
      reminderShownAt: receiptMatchesCurrentVersion(
        item,
        current?.reminderShownAt
      )
        ? current?.reminderShownAt || now
        : kind === "reminder"
          ? now
          : "",
      reminderReadAt: kind === "reminder" ? now : reminderReadAt,
    });
    await loadData();
  };

  const acknowledgePopup = async () => {
    if (!popupMessage) return;
    await markRead(popupMessage, true, popupDeliveryKind);
    setPopupMessage(null);
  };

  const readLater = () => {
    if (!popupMessage) return;
    const next = [
      ...snoozedIds,
      deliveryKey(popupMessage, popupDeliveryKind),
    ];
    setSnoozedIds(next);
    saveSnoozedIds(next);
    setPopupMessage(null);
  };

  const openInboxMessage = (item: StoredAnnouncement) => {
    setSelectedMessage(item);
  };

  const saveAnnouncement = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      setSaveMessage("กรุณากรอกหัวข้อและรายละเอียดประกาศ");
      return;
    }
    if (!draft.media.some((item) => item.type === "image" || item.type === "video")) {
      setSaveMessage("กรุณาแนบรูปภาพหรือวิดีโอสำหรับ Media Popup");
      return;
    }
    const reminderDate = localDatePart(draft.reminderAt);
    const reminderTime = localTimePart(draft.reminderAt);
    const reminderDateTime = new Date(
      joinLocalDateTime(reminderDate, reminderTime)
    );
    if (
      draft.reminderEnabled &&
      (!reminderDate ||
        !isValidTime(reminderTime) ||
        Number.isNaN(reminderDateTime.getTime()))
    ) {
      setSaveMessage("กรุณากรอกวันและเวลาแจ้งซ้ำให้ครบ เช่น 04/08/2026 เวลา 09:00");
      return;
    }
    if (
      draft.reminderEnabled &&
      reminderDateTime.getTime() <= Date.now()
    ) {
      setSaveMessage("เวลาแจ้งซ้ำต้องเป็นเวลาในอนาคต");
      return;
    }
    if (
      !draft.targetAll &&
      !draft.targetRoles.length &&
      !draft.targetTeams.length &&
      !draft.targetUsernames.length
    ) {
      setSaveMessage("กรุณาเลือกผู้รับอย่างน้อย 1 กลุ่มหรือ 1 User");
      return;
    }

    setBusy(true);
    try {
      const publishedAt = new Date().toISOString();
      const reminderAt = draft.reminderEnabled
        ? reminderDateTime.toISOString()
        : "";

      await upsertStoredAnnouncement({
        ...draft,
        popupMode: "Once",
        deliveryModel: "immediate-reminder",
        showImmediately: true,
        reminderEnabled: draft.reminderEnabled,
        reminderAt,
        repeatMode: "once",
        dailyStartTime: reminderTime,
        dailyEndTime: "",
        displayMode: "Media Only",
        actionRequired: "Read Only",
        id: draft.id || `announcement-${Date.now()}`,
        startsAt: publishedAt,
        endsAt: reminderAt || publishedAt,
        createdBy: currentUser.username,
        createdByName: currentUser.displayName,
      });
      setSaveMessage(
        draft.reminderEnabled
          ? `ส่ง Popup เข้าคิวผู้รับทันทีแล้ว และจะเด้งซ้ำ ${formatThaiSchedule(
              reminderDate,
              reminderTime
            )}`
          : "ส่ง Popup เข้าคิวผู้รับทันทีแล้ว"
      );
      setDraft(emptyDraft(currentUser));
      await loadData();
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "บันทึกประกาศไม่สำเร็จ"
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAnnouncement = async (item: StoredAnnouncement) => {
    if (!window.confirm(`ลบประกาศ "${item.title}" ใช่หรือไม่`)) return;
    await deleteStoredAnnouncement(item.id);
    if (draft.id === item.id) setDraft(emptyDraft(currentUser));
    await loadData();
  };

  const editAnnouncement = (item: StoredAnnouncement) => {
    const toLocal = (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : localDateTimeInput(date);
    };
    const legacyStart = new Date(item.startsAt || "");
    const legacyReminderEnabled =
      item.deliveryModel === "legacy" &&
      !Number.isNaN(legacyStart.getTime()) &&
      legacyStart.getTime() > Date.now();
    const fallbackReminder = localDateTimeInput(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );
    const reminderAt =
      item.deliveryModel === "immediate-reminder" && item.reminderAt
        ? toLocal(item.reminderAt)
        : legacyReminderEnabled
          ? toLocal(item.startsAt)
          : fallbackReminder;
    setDraft({
      ...item,
      popupMode: "Once",
      deliveryModel: "immediate-reminder",
      showImmediately: true,
      reminderEnabled:
        item.deliveryModel === "immediate-reminder"
          ? item.reminderEnabled
          : legacyReminderEnabled,
      reminderAt,
      repeatMode: "once",
      dailyStartTime: localTimePart(reminderAt),
      dailyEndTime: "",
      displayMode: "Media Only",
      actionRequired: "Read Only",
      startsAt: localDateTimeInput(new Date()),
      endsAt: reminderAt,
    });
    setView("control");
    setHubOpen(true);
  };

  const inferMediaType = (file: File): AnnouncementMediaType => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    return "image";
  };

  const handleFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const remainingSlots = Math.max(0, 5 - draft.media.length);
    if (!remainingSlots) {
      setUploadMessage("แนบได้สูงสุด 5 ไฟล์ต่อประกาศ");
      return;
    }

    const selected = files.slice(0, remainingSlots);
    const unsupported = selected.filter(
      (file) =>
        !file.type.startsWith("image/") && !file.type.startsWith("video/")
    );
    if (unsupported.length) {
      setUploadMessage("Media Popup รองรับเฉพาะรูปภาพและวิดีโอ");
      return;
    }
    const tooLarge = selected.filter((file) => file.size > 700 * 1024);
    if (tooLarge.length) {
      setUploadMessage(
        `ไฟล์ต้องไม่เกิน 700 KB ต่อไฟล์: ${tooLarge
          .map((file) => file.name)
          .join(", ")}`
      );
      return;
    }

    setUploadMessage("กำลังอ่านไฟล์...");
    try {
      const nextMedia = await Promise.all(
        selected.map(
          (file) =>
            new Promise<AnnouncementMedia>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: `file-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}`,
                  type: inferMediaType(file),
                  url: String(reader.result || ""),
                  label: file.name,
                });
              reader.onerror = () =>
                reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
              reader.readAsDataURL(file);
            })
        )
      );
      setDraft((current) => ({
        ...current,
        media: [...current.media, ...nextMedia],
      }));
      setUploadMessage(`แนบไฟล์สำเร็จ ${nextMedia.length} ไฟล์`);
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "แนบไฟล์ไม่สำเร็จ"
      );
    }
  };

  const addMedia = () => {
    if (!mediaUrl.trim()) return;
    setDraft({
      ...draft,
      media: [
        ...draft.media,
        {
          id: `media-${Date.now()}`,
          type: mediaType,
          url: mediaUrl.trim(),
          label: mediaLabel.trim(),
        },
      ],
    });
    setMediaUrl("");
    setMediaLabel("");
  };

  const teams = useMemo(
    () =>
      [...new Set(users.map((item) => item.teamName || "").filter(Boolean))].sort(),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const keyword = normalize(search);
    return users
      .filter((item) => {
        if (!keyword) return true;
        return (
          normalize(item.username).includes(keyword) ||
          normalize(item.displayName).includes(keyword) ||
          normalize(item.role).includes(keyword) ||
          normalize(item.teamName).includes(keyword)
        );
      })
      .slice(0, 100);
  }, [users, search]);

  const receiptCountFor = (announcementId: string, field: "readAt" | "acknowledgedAt") =>
    receipts.filter(
      (item) => item.announcementId === announcementId && Boolean(item[field])
    ).length;

  const activeBanner = myAnnouncements.find(
    (item) =>
      announcementStatus(item) === "Active" &&
      item.displayMode === "Banner" &&
      !wasAcknowledged(item, myReceiptMap.get(item.id))
  );

  const spotlightMode = popupMessage?.displayMode === "Media Spotlight" || popupMessage?.displayMode === "Media Only";
  const mediaOnlyMode = popupMessage?.displayMode === "Media Only";
  const spotlightMedia = popupMessage?.media?.[0] || null;
  const draftReminderDate = localDatePart(draft.reminderAt);
  const draftReminderTime = localTimePart(draft.reminderAt);
  const fallbackReminderDate = localDateTimeInput(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  ).slice(0, 10);
  const updateReminderDate = (nextDate: string) => {
    setDraft((current) => ({
      ...current,
      reminderAt: joinLocalDateTime(
        nextDate,
        localTimePart(current.reminderAt) || "09:00"
      ),
    }));
  };
  const updateReminderTime = (nextValue: string) => {
    const nextTime = typedTime(nextValue);
    setDraft((current) => ({
      ...current,
      reminderAt: joinLocalDateTime(
        localDatePart(current.reminderAt) || fallbackReminderDate,
        nextTime
      ),
    }));
  };
  const draftReminderValue = new Date(
    joinLocalDateTime(draftReminderDate, draftReminderTime)
  );
  const reminderReady =
    !draft.reminderEnabled ||
    (!Number.isNaN(draftReminderValue.getTime()) &&
      isValidTime(draftReminderTime) &&
      draftReminderValue.getTime() > Date.now());
  const scheduleStatus = !draft.reminderEnabled
    ? {
        label: "ส่งทันที",
        detail: "บันทึกแล้ว Popup จะเด้งให้ผู้รับทันที 1 รอบ",
      }
    : !reminderReady
      ? {
          label: "ตรวจสอบเวลา",
          detail: "วันและเวลาแจ้งซ้ำต้องเป็นเวลาในอนาคต",
        }
      : {
          label: "ส่งทันที + เตือนซ้ำ",
          detail: `Popup จะเด้งทันที 1 รอบ และเด้งซ้ำ ${formatThaiSchedule(
            draftReminderDate,
            draftReminderTime
          )}`,
        };

  return (
    <>
      {/* data-announcement-media-spotlight-v4 */}
      {activeBanner ? (
        <div className="fixed left-1/2 top-4 z-[130] w-[min(94vw,1100px)] -translate-x-1/2 rounded-[22px] border border-white/30 bg-gradient-to-r from-violet-800 to-fuchsia-600 px-5 py-4 text-white shadow-[0_20px_60px_rgba(76,29,149,0.35)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200">
                {activeBanner.category} • {activeBanner.priority}
              </div>
              <div className="mt-1 text-base font-black">
                {activeBanner.title}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-white/80">
                {activeBanner.body}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void markRead(activeBanner, true)}
              className="rounded-xl border border-white/25 bg-white/15 px-4 py-2 text-xs font-black text-white hover:bg-white/25"
            >
              รับทราบ
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        data-announcement-delivery-v3="true"
        onClick={() => {
          setHubOpen(true);
          setView("inbox");
        }}
        className="fixed bottom-5 right-5 z-[80] flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-violet-700 to-fuchsia-600 text-2xl text-white shadow-[0_18px_48px_rgba(109,40,217,0.38)] transition hover:-translate-y-1"
        title="ประกาศและกล่องข้อความ"
      >
        <span aria-hidden="true">🔔</span>
        {unreadAnnouncements.length ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1.5 text-[10px] font-black text-white">
            {unreadAnnouncements.length > 99 ? "99+" : unreadAnnouncements.length}
          </span>
        ) : null}
      </button>

      {popupMessage && mediaOnlyMode ? (
        spotlightMedia ? (
          <div className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center">
            <div className="pointer-events-auto relative max-h-[92vh] max-w-[94vw] overflow-hidden rounded-[28px] shadow-[0_24px_80px_rgba(15,23,42,0.32)]">
              <button
                type="button"
                onClick={() => void acknowledgePopup()}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-lg font-black text-white shadow-lg backdrop-blur-sm transition hover:bg-slate-950"
                aria-label="ปิดประกาศ"
              >
                ×
              </button>

              {spotlightMedia.type === "image" ? (
                <button
                  type="button"
                  onClick={() => setMediaDescriptionOpen((current) => !current)}
                  className="block cursor-pointer bg-transparent p-0"
                  aria-label="เปิดหรือปิดรายละเอียดประกาศ"
                >
                  <img
                    src={spotlightMedia.url}
                    alt={spotlightMedia.label || popupMessage.title}
                    className="block max-h-[92vh] max-w-[94vw] object-contain"
                  />
                </button>
              ) : (
                <video
                  src={spotlightMedia.url}
                  controls
                  onClick={() => setMediaDescriptionOpen((current) => !current)}
                  className="block max-h-[92vh] max-w-[94vw] bg-transparent object-contain"
                />
              )}

              {mediaDescriptionOpen && popupMessage.body ? (
                <button
                  type="button"
                  onClick={() => setMediaDescriptionOpen(false)}
                  className="absolute inset-x-0 bottom-0 z-10 max-h-[46%] overflow-y-auto bg-slate-950/90 px-5 py-4 text-left text-sm leading-7 text-white backdrop-blur-md sm:px-7 sm:py-5"
                >
                  <span className="mb-1 block text-xs font-black text-violet-200">
                    {popupMessage.title}
                  </span>
                  <span className="block whitespace-pre-wrap">
                    {popupMessage.body}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : null
      ) : popupMessage ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div
            className={`overflow-hidden border border-white/20 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.5)] ${
              popupMessage.displayMode === "Full Screen" || spotlightMode
                ? "h-[94vh] w-[96vw] rounded-[34px]"
                : "max-h-[92vh] w-full max-w-3xl rounded-[34px]"
            }`}
          >
            <div className={`bg-gradient-to-r ${priorityClasses(popupMessage.priority).panel} px-7 py-6 text-white`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">{popupMessage.category}</span>
                <span className="text-xs font-bold text-white/80">{formatDateTime(popupMessage.startsAt)}</span>
              </div>
              <h2 className="mt-4 text-2xl font-black sm:text-3xl">{popupMessage.title}</h2>
              <div className="mt-2 text-sm font-bold text-white/80">จาก: {popupMessage.createdByName || popupMessage.createdBy}</div>
            </div>
            {spotlightMode ? (
              <div className="flex h-[calc(94vh-92px)] flex-col overflow-hidden bg-slate-950">
                <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
                  {spotlightMedia ? <div className="w-full"><MediaPreview media={spotlightMedia} spotlight /></div> : <div className="text-white">ไม่พบ Media</div>}
                </div>
                {popupMessage.body ? (
                  <details className="border-t border-white/10 bg-slate-900 px-5 py-3 text-white">
                    <summary className="cursor-pointer text-sm font-black">ดูรายละเอียดประกาศ</summary>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/75">{popupMessage.body}</div>
                  </details>
                ) : null}
                {popupMessage.media.length > 1 ? (
                  <div className="flex gap-3 overflow-x-auto border-t border-white/10 bg-slate-900 p-3">
                    {popupMessage.media.slice(1).map((media) => <div key={media.id} className="min-w-[180px] max-w-[260px]"><MediaPreview media={media} /></div>)}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="max-h-[62vh] overflow-y-auto p-7">
                <div className="whitespace-pre-wrap text-base leading-8 text-slate-700">{popupMessage.body}</div>
                {popupMessage.media.length ? <div className="mt-6 space-y-4">{popupMessage.media.map((media) => <MediaPreview key={media.id} media={media} />)}</div> : null}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50 px-7 py-5">
              {popupMessage.popupMode !== "Until Acknowledged" &&
              popupMessage.actionRequired !== "Acknowledge" ? (
                <button
                  type="button"
                  onClick={readLater}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600"
                >
                  อ่านภายหลัง
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void acknowledgePopup()}
                className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-lg"
              >
                รับทราบ
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hubOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[34px] border border-white/30 bg-[#f7f5ff] shadow-[0_40px_120px_rgba(15,23,42,0.5)]">
            <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200">
                  ศูนย์จัดการการสื่อสาร
                </div>
                <div className="mt-1 text-2xl font-black">
                  ประกาศและกล่องข้อความ
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHubOpen(false)}
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/20"
              >
                ปิด
              </button>
            </header>

            <div className="grid grid-cols-2 gap-2 border-b border-violet-100 bg-white p-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setView("inbox")}
                className={`rounded-2xl px-4 py-3 text-sm font-black ${
                  view === "inbox"
                    ? "bg-violet-700 text-white"
                    : "bg-slate-50 text-slate-600"
                }`}
              >
                ประกาศของฉัน ({unreadAnnouncements.length})
              </button>
              {manageAllowed ? (
                <button
                  type="button"
                  onClick={() => setView("control")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black ${
                    view === "control"
                      ? "bg-violet-700 text-white"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  จัดการประกาศ
                </button>
              ) : null}
              {manageAllowed ? (
                <button
                  type="button"
                  onClick={() => setView("analytics")}
                  className={`rounded-2xl px-4 py-3 text-sm font-black ${
                    view === "analytics"
                      ? "bg-violet-700 text-white"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  สถิติการอ่าน
                </button>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {view === "inbox" ? (
                <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <div className="space-y-3">
                    {myAnnouncements.length ? (
                      myAnnouncements.map((item) => {
                        const receipt = myReceiptMap.get(item.id);
                        const deliveryRead = isCurrentDeliveryRead(
                          item,
                          receipt,
                          new Date()
                        );
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => openInboxMessage(item)}
                            className={`w-full rounded-[24px] border p-4 text-left transition hover:border-violet-300 ${
                              deliveryRead
                                ? "border-slate-200 bg-white"
                                : "border-violet-300 bg-violet-50 shadow-md"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                                  priorityClasses(item.priority).badge
                                }`}
                              >
                                {PRIORITY_LABELS[item.priority]}
                              </span>
                              {!deliveryRead ? (
                                <span className="h-2.5 w-2.5 rounded-full bg-violet-600" />
                              ) : null}
                            </div>
                            <div className="mt-3 font-black text-slate-950">
                              {item.title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                              {item.body}
                            </div>
                            <div className="mt-3 text-[10px] font-bold text-slate-400">
                              {formatDateTime(item.startsAt)} •{" "}
                              {STATUS_LABELS[announcementStatus(item)]}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                        ยังไม่มีประกาศ
                      </div>
                    )}
                  </div>

                  <div className="min-h-[420px] rounded-[28px] border border-violet-100 bg-white p-6 shadow-sm">
                    {selectedMessage ? (
                      <>
                        {selectedMessage.media[0]?.type === "image" ? <img src={selectedMessage.media[0].url} alt={selectedMessage.media[0].label || selectedMessage.title} className="mb-6 max-h-[420px] w-full rounded-[26px] bg-slate-950 object-contain" /> : null}
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                              {CATEGORY_LABELS[selectedMessage.category] || selectedMessage.category}
                            </div>
                            <h2 className="mt-2 text-2xl font-black text-slate-950">
                              {selectedMessage.title}
                            </h2>
                            <div className="mt-2 text-sm font-bold text-slate-500">
                              จาก:{" "}
                              {selectedMessage.createdByName ||
                                selectedMessage.createdBy}{" "}
                              • {formatDateTime(selectedMessage.startsAt)}
                            </div>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1.5 text-xs font-black ${
                              priorityClasses(selectedMessage.priority).badge
                            }`}
                          >
                            {PRIORITY_LABELS[selectedMessage.priority]}
                          </span>
                        </div>
                        <div className="mt-6 whitespace-pre-wrap text-sm leading-8 text-slate-700">
                          {selectedMessage.body}
                        </div>
                        {selectedMessage.media.length ? (
                          <div className="mt-6 space-y-4">
                            {selectedMessage.media.map((media) => (
                              <MediaPreview key={media.id} media={media} />
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex min-h-[380px] items-center justify-center text-center">
                        <div>
                          <div className="text-4xl">📩</div>
                          <div className="mt-4 text-lg font-black text-slate-900">
                            เลือกประกาศเพื่อดูรายละเอียด
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {view === "control" && manageAllowed ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
                  <section className="rounded-[28px] border border-violet-100 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                          สร้างประกาศ
                        </div>
                        <div className="mt-1 text-2xl font-black text-slate-950">
                          {draft.id ? "แก้ไขประกาศ" : "ประกาศใหม่"}
                        </div>
                      </div>
                      {draft.id ? (
                        <button
                          type="button"
                          onClick={() => setDraft(emptyDraft(currentUser))}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
                        >
                          สร้างใหม่
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <label className="md:col-span-2">
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          หัวข้อประกาศ
                        </span>
                        <input
                          value={draft.title}
                          onChange={(event) =>
                            setDraft({ ...draft, title: event.target.value })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          ประเภท
                        </span>
                        <select
                          value={draft.category}
                          onChange={(event) =>
                            setDraft({ ...draft, category: event.target.value })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          {CATEGORY_OPTIONS.map((item) => (
                            <option key={item} value={item}>
                              {CATEGORY_LABELS[item] || item}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          ระดับประกาศ
                        </span>
                        <select
                          value={draft.priority}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              priority: event.target.value as AnnouncementPriority,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <option value="Normal">ปกติ</option>
                          <option value="Important">สำคัญ</option>
                          <option value="Urgent">เร่งด่วน</option>
                        </select>
                      </label>

                      <div
                        data-announcement-schedule-redesign-v2="true"
                        className="md:col-span-2 rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/50 p-4 sm:p-5"
                      >
                        <div className="text-sm font-black text-slate-900">
                          การแจ้งเตือน
                        </div>

                        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-lg font-black text-white">
                            ✓
                          </span>
                          <div>
                            <div className="text-sm font-black text-emerald-900">
                              แจ้งทันทีหลังบันทึก
                            </div>
                            <div className="mt-0.5 text-xs text-emerald-700">
                              ผู้รับที่เปิดเว็บอยู่จะเห็น Popup ทันที ผู้รับที่ยังไม่เข้าเว็บจะเห็นเมื่อเข้าใช้งาน
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              reminderEnabled: !draft.reminderEnabled,
                            })
                          }
                          className={`mt-3 flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                            draft.reminderEnabled
                              ? "border-violet-500 bg-violet-600 text-white shadow-md"
                              : "border-violet-200 bg-white text-slate-700 hover:border-violet-400"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-black">
                              แจ้งเตือนซ้ำตามกำหนด
                            </span>
                            <span
                              className={`mt-0.5 block text-xs ${
                                draft.reminderEnabled
                                  ? "text-violet-100"
                                  : "text-slate-500"
                              }`}
                            >
                              เด้ง Popup อีกรอบตามวันและเวลาที่เลือก
                            </span>
                          </span>
                          <span
                            className={`relative h-7 w-12 rounded-full transition ${
                              draft.reminderEnabled
                                ? "bg-white/30"
                                : "bg-slate-200"
                            }`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                                draft.reminderEnabled ? "left-6" : "left-1"
                              }`}
                            />
                          </span>
                        </button>

                        {draft.reminderEnabled ? (
                          <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
                            <div className="text-sm font-black text-slate-900">
                              วันและเวลาแจ้งซ้ำ
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label>
                                <span className="mb-2 block text-xs font-black text-slate-500">
                                  วันที่แจ้งซ้ำ
                                </span>
                                <input
                                  type="date"
                                  value={draftReminderDate}
                                  onClick={(event) =>
                                    event.currentTarget.showPicker?.()
                                  }
                                  onChange={(event) =>
                                    updateReminderDate(event.target.value)
                                  }
                                  className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3"
                                />
                              </label>

                              <label>
                                <span className="mb-2 block text-xs font-black text-slate-500">
                                  เวลาแจ้งซ้ำ
                                </span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  value={draftReminderTime}
                                  placeholder="เช่น 09:00"
                                  onChange={(event) =>
                                    updateReminderTime(event.target.value)
                                  }
                                  className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-center font-black tracking-wider"
                                />
                              </label>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              พิมพ์เวลาแบบ 24 ชั่วโมง เช่น 09:00 หรือพิมพ์ 0900 ระบบจะจัดเป็น 09:00
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-black text-slate-900">
                              สรุปการแจ้งเตือน
                            </div>
                            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                              {scheduleStatus.label}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600">
                            <div>รอบแรก: ทันทีหลังบันทึก</div>
                            <div>
                              รอบแจ้งซ้ำ:{" "}
                              {draft.reminderEnabled
                                ? formatThaiSchedule(
                                    draftReminderDate,
                                    draftReminderTime
                                  )
                                : "ไม่แจ้งซ้ำ"}
                            </div>
                            <div className="font-black text-violet-700">
                              {scheduleStatus.detail}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                        <div className="text-xs font-black text-violet-800">
                          Media Popup
                        </div>
                        <div className="mt-1 text-xs leading-5 text-violet-700">
                          แสดงเฉพาะรูปภาพหรือวิดีโอบนหน้าเว็บ ไม่มีกรอบและไม่มีพื้นที่ว่างรอบ Media ผู้ใช้กด Media เพื่ออ่านรายละเอียดได้
                        </div>
                      </div>

                      <label className="md:col-span-2">
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          รายละเอียดเมื่อกด Media
                        </span>
                        <textarea
                          value={draft.body}
                          onChange={(event) =>
                            setDraft({ ...draft, body: event.target.value })
                          }
                          rows={8}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 leading-7 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>
                    </div>

                    <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">
                            เพิ่มรูปภาพหรือวิดีโอ
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            แนบ Media สูงสุด 5 ไฟล์ และไม่เกิน 700 KB ต่อไฟล์
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-black text-white shadow-md"
                        >
                          เลือกไฟล์
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          onChange={(event) => void handleFilesSelected(event)}
                          className="hidden"
                        />
                      </div>
                      {uploadMessage ? (
                        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">
                          {uploadMessage}
                        </div>
                      ) : null}

                      <div className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                        หรือแนบด้วย URL
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,0.7fr)_auto]">
                        <select
                          value={mediaType}
                          onChange={(event) =>
                            setMediaType(event.target.value as AnnouncementMediaType)
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        >
                          <option value="image">รูปภาพ</option>
                          <option value="video">วิดีโอ</option>
                        </select>
                        <input
                          value={mediaUrl}
                          onChange={(event) => setMediaUrl(event.target.value)}
                          placeholder="URL รูปภาพหรือวิดีโอ"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        />
                        <input
                          value={mediaLabel}
                          onChange={(event) => setMediaLabel(event.target.value)}
                          placeholder="ชื่อ Media"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        />
                        <button
                          type="button"
                          onClick={addMedia}
                          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
                        >
                          เพิ่ม
                        </button>
                      </div>
                      {draft.media.length ? (
                        <div className="mt-3 space-y-2">
                          {draft.media.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                            >
                              <span className="truncate">
                                {item.type}: {item.label || item.url}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    media: draft.media.filter(
                                      (media) => media.id !== item.id
                                    ),
                                  })
                                }
                                className="font-black text-rose-600"
                              >
                                ลบ
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-6 rounded-[24px] border border-violet-100 bg-violet-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-900">
                          ผู้รับประกาศ
                        </div>
                        <ToggleChoice
                          active={draft.targetAll}
                          label="ผู้ใช้ทั้งหมด"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              targetAll: !draft.targetAll,
                            })
                          }
                        />
                      </div>

                      {!draft.targetAll ? (
                        <div className="mt-4 space-y-5">
                          <div>
                            <div className="mb-2 text-xs font-black text-slate-500">
                              ส่งตาม Role
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {ROLE_OPTIONS.map((role) => (
                                <ToggleChoice
                                  key={role}
                                  label={role}
                                  active={draft.targetRoles.includes(role)}
                                  onClick={() =>
                                    setDraft({
                                      ...draft,
                                      targetRoles: draft.targetRoles.includes(role)
                                        ? draft.targetRoles.filter(
                                            (item) => item !== role
                                          )
                                        : [...draft.targetRoles, role],
                                    })
                                  }
                                />
                              ))}
                            </div>
                          </div>

                          {teams.length ? (
                            <div>
                              <div className="mb-2 text-xs font-black text-slate-500">
                                ส่งตาม Team
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {teams.map((team) => (
                                  <ToggleChoice
                                    key={team}
                                    label={team}
                                    active={draft.targetTeams.includes(team)}
                                    onClick={() =>
                                      setDraft({
                                        ...draft,
                                        targetTeams: draft.targetTeams.includes(team)
                                          ? draft.targetTeams.filter(
                                              (item) => item !== team
                                            )
                                          : [...draft.targetTeams, team],
                                      })
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div>
                            <div className="mb-2 text-xs font-black text-slate-500">
                              ส่งราย User
                            </div>
                            <input
                              value={search}
                              onChange={(event) => setSearch(event.target.value)}
                              placeholder="ค้นหาชื่อ Username Role หรือ Team"
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                            />
                            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                              {filteredUsers.map((user) => {
                                const key = normalize(user.username);
                                const active =
                                  draft.targetUsernames.includes(key);
                                return (
                                  <button
                                    type="button"
                                    key={key}
                                    onClick={() =>
                                      setDraft({
                                        ...draft,
                                        targetUsernames: active
                                          ? draft.targetUsernames.filter(
                                              (item) => item !== key
                                            )
                                          : [...draft.targetUsernames, key],
                                      })
                                    }
                                    className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${
                                      active
                                        ? "bg-violet-600 text-white"
                                        : "hover:bg-violet-50"
                                    }`}
                                  >
                                    <span className="font-black">
                                      {user.displayName}
                                    </span>
                                    <span className="opacity-70">
                                      {user.role}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {saveMessage ? (
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
                        {saveMessage}
                      </div>
                    ) : null}

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void saveAnnouncement()}
                        disabled={busy}
                        className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50"
                      >
                        {busy
                          ? "กำลังบันทึก..."
                          : draft.id
                            ? "บันทึกและส่งรอบใหม่"
                            : draft.reminderEnabled
                              ? "บันทึก ส่งทันที และตั้งเตือน"
                              : "บันทึกและส่งทันที"}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                      รายการประกาศ
                    </div>
                    <div className="mt-1 text-xl font-black text-slate-950">
                      ทั้งหมด {announcements.length} รายการ
                    </div>
                    <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                      {announcements.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-black text-slate-950">
                                {item.title}
                              </div>
                              <div className="mt-1 text-[10px] font-bold text-slate-400">
                                {STATUS_LABELS[announcementStatus(item)]} •{" "}
                                {formatDateTime(item.startsAt)}
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-black ${
                                priorityClasses(item.priority).badge
                              }`}
                            >
                              {PRIORITY_LABELS[item.priority]}
                            </span>
                          </div>
                          <div className="mt-3 line-clamp-3 text-xs leading-5 text-slate-600">
                            {item.body}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => editAnnouncement(item)}
                              className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700"
                            >
                              แก้ไข
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeAnnouncement(item)}
                              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600"
                            >
                              ลบ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              {view === "analytics" && manageAllowed ? (
                <div className="space-y-4">
                  {announcements.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[26px] border border-violet-100 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-slate-950">
                            {item.title}
                          </div>
                          <div className="mt-1 text-xs font-bold text-slate-400">
                            {announcementStatus(item)} •{" "}
                            {formatDateTime(item.startsAt)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <span className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">
                            อ่านแล้ว {receiptCountFor(item.id, "readAt")}
                          </span>
                          <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                            รับทราบแล้ว{" "}
                            {receiptCountFor(item.id, "acknowledgedAt")}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {receipts
                          .filter(
                            (receipt) =>
                              receipt.announcementId === item.id
                          )
                          .map((receipt) => (
                            <div
                              key={receipt.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                            >
                              <div className="font-black text-slate-800">
                                {receipt.displayName || receipt.username}
                              </div>
                              <div className="mt-1 text-slate-500">
                                อ่าน: {formatDateTime(receipt.readAt)}
                              </div>
                              <div className="text-slate-500">
                                รับทราบ:{" "}
                                {formatDateTime(receipt.acknowledgedAt)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
