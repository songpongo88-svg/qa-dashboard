import React, { useEffect, useMemo, useState } from "react";
import {
  deleteStoredAnnouncement,
  fetchAnnouncementReceipts,
  fetchStoredAnnouncements,
  upsertAnnouncementReceipt,
  upsertStoredAnnouncement,
  type AnnouncementMedia,
  type AnnouncementActionRequired,
  type AnnouncementDisplayMode,
  type AnnouncementMediaType,
  type AnnouncementPopupMode,
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

function announcementStatus(item: StoredAnnouncement, now = new Date()) {
  if (item.archived) return "Archived";
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

function MediaPreview({ media }: { media: AnnouncementMedia }) {
  if (media.type === "image") {
    return (
      <a href={media.url} target="_blank" rel="noreferrer">
        <img
          src={media.url}
          alt={media.label || "Announcement media"}
          className="max-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain"
        />
      </a>
    );
  }

  if (media.type === "video") {
    return (
      <video
        src={media.url}
        controls
        className="max-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-950"
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
    displayMode: "Popup",
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

  const manageAllowed = canManageAnnouncements(currentUser);
  const currentUsername = normalize(currentUser.username);

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
    const timer = window.setInterval(() => void loadData(), POLL_MS);
    return () => window.clearInterval(timer);
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
        if (announcementStatus(item) !== "Active") return false;
        return !myReceiptMap.get(item.id)?.readAt;
      }),
    [myAnnouncements, myReceiptMap]
  );

  useEffect(() => {
    if (popupMessage) return;

    const next = myAnnouncements.find((item) => {
      if (announcementStatus(item) !== "Active") return false;
      if (
        item.popupMode === "Mailbox Only" ||
        item.displayMode === "Mailbox Only" ||
        item.displayMode === "Banner"
      )
        return false;
      const receipt = myReceiptMap.get(item.id);
      if (item.popupMode === "Until Acknowledged") {
        return !receipt?.acknowledgedAt;
      }
      return !receipt?.readAt && !snoozedIds.includes(item.id);
    });

    if (next) {
      setPopupMessage(next);
      void upsertAnnouncementReceipt({
        id: `${next.id}__${currentUsername}`,
        announcementId: next.id,
        username: currentUsername,
        displayName: currentUser.displayName,
        readAt: myReceiptMap.get(next.id)?.readAt || "",
        acknowledgedAt: myReceiptMap.get(next.id)?.acknowledgedAt || "",
        lastShownAt: new Date().toISOString(),
      }).then(() => void loadData());
    }
  }, [
    myAnnouncements,
    myReceiptMap,
    popupMessage,
    snoozedIds,
    currentUsername,
    currentUser.displayName,
  ]);

  const markRead = async (
    item: StoredAnnouncement,
    acknowledge = false
  ) => {
    const current = myReceiptMap.get(item.id);
    const now = new Date().toISOString();
    await upsertAnnouncementReceipt({
      id: `${item.id}__${currentUsername}`,
      announcementId: item.id,
      username: currentUsername,
      displayName: currentUser.displayName,
      readAt: current?.readAt || now,
      acknowledgedAt: acknowledge
        ? current?.acknowledgedAt || now
        : current?.acknowledgedAt || "",
      lastShownAt: current?.lastShownAt || now,
    });
    await loadData();
  };

  const acknowledgePopup = async () => {
    if (!popupMessage) return;
    await markRead(popupMessage, true);
    setPopupMessage(null);
  };

  const readLater = () => {
    if (!popupMessage) return;
    const next = [...snoozedIds, popupMessage.id];
    setSnoozedIds(next);
    saveSnoozedIds(next);
    setPopupMessage(null);
  };

  const openInboxMessage = async (item: StoredAnnouncement) => {
    setSelectedMessage(item);
    await markRead(item, false);
  };

  const saveAnnouncement = async () => {
    if (!draft.title.trim() || !draft.body.trim()) {
      setSaveMessage("กรุณากรอกหัวข้อและรายละเอียดประกาศ");
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
      const startsAt = draft.startsAt
        ? new Date(draft.startsAt).toISOString()
        : new Date().toISOString();
      const endsAt = draft.endsAt
        ? new Date(draft.endsAt).toISOString()
        : "";

      await upsertStoredAnnouncement({
        ...draft,
        id: draft.id || `announcement-${Date.now()}`,
        startsAt,
        endsAt,
        createdBy: currentUser.username,
        createdByName: currentUser.displayName,
      });
      setSaveMessage("บันทึกประกาศเรียบร้อยแล้ว");
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
    setDraft({
      ...item,
      startsAt: toLocal(item.startsAt),
      endsAt: toLocal(item.endsAt),
    });
    setView("control");
    setHubOpen(true);
  };

  const inferMediaType = (file: File): AnnouncementMediaType => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type === "application/pdf") return "pdf";
    return "file";
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
      !myReceiptMap.get(item.id)?.acknowledgedAt
  );

  return (
    <>
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
        onClick={() => {
          setHubOpen(true);
          setView("inbox");
        }}
        className="fixed bottom-5 right-5 z-[80] flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-violet-700 to-fuchsia-600 text-2xl text-white shadow-[0_18px_48px_rgba(109,40,217,0.38)] transition hover:-translate-y-1"
        title="Announcements & Mailbox"
      >
        <span aria-hidden="true">🔔</span>
        {unreadAnnouncements.length ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1.5 text-[10px] font-black text-white">
            {unreadAnnouncements.length > 99 ? "99+" : unreadAnnouncements.length}
          </span>
        ) : null}
      </button>

      {popupMessage ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
          <div
            className={`overflow-hidden border border-white/20 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.5)] ${
              popupMessage.displayMode === "Full Screen"
                ? "h-[94vh] w-[96vw] rounded-[34px]"
                : "max-h-[92vh] w-full max-w-3xl rounded-[34px]"
            }`}
          >
            <div
              className={`bg-gradient-to-r ${
                priorityClasses(popupMessage.priority).panel
              } px-7 py-6 text-white`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
                  {popupMessage.category}
                </span>
                <span className="text-xs font-bold text-white/80">
                  {formatDateTime(popupMessage.startsAt)}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-black sm:text-3xl">
                {popupMessage.title}
              </h2>
              <div className="mt-2 text-sm font-bold text-white/80">
                From: {popupMessage.createdByName || popupMessage.createdBy}
              </div>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-7">
              <div className="whitespace-pre-wrap text-base leading-8 text-slate-700">
                {popupMessage.body}
              </div>
              {popupMessage.media.length ? (
                <div className="mt-6 space-y-4">
                  {popupMessage.media.map((media) => (
                    <MediaPreview key={media.id} media={media} />
                  ))}
                </div>
              ) : null}
            </div>
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
                  Communication Control
                </div>
                <div className="mt-1 text-2xl font-black">
                  Announcement & Mailbox
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHubOpen(false)}
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/20"
              >
                Close
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
                Mailbox ({unreadAnnouncements.length})
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
                  Announcement Control
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
                  Read Analytics
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
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => void openInboxMessage(item)}
                            className={`w-full rounded-[24px] border p-4 text-left transition hover:border-violet-300 ${
                              receipt?.readAt
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
                                {item.priority}
                              </span>
                              {!receipt?.readAt ? (
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
                              {announcementStatus(item)}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                        ยังไม่มีข้อความใน Mailbox
                      </div>
                    )}
                  </div>

                  <div className="min-h-[420px] rounded-[28px] border border-violet-100 bg-white p-6 shadow-sm">
                    {selectedMessage ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                              {selectedMessage.category}
                            </div>
                            <h2 className="mt-2 text-2xl font-black text-slate-950">
                              {selectedMessage.title}
                            </h2>
                            <div className="mt-2 text-sm font-bold text-slate-500">
                              From:{" "}
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
                            {selectedMessage.priority}
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
                        <div className="mt-7 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void markRead(selectedMessage, true)
                            }
                            className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white"
                          >
                            รับทราบข้อความ
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[380px] items-center justify-center text-center">
                        <div>
                          <div className="text-4xl">📩</div>
                          <div className="mt-4 text-lg font-black text-slate-900">
                            เลือกข้อความจาก Mailbox
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
                          Create Announcement
                        </div>
                        <div className="mt-1 text-2xl font-black text-slate-950">
                          {draft.id ? "Edit Announcement" : "New Announcement"}
                        </div>
                      </div>
                      {draft.id ? (
                        <button
                          type="button"
                          onClick={() => setDraft(emptyDraft(currentUser))}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
                        >
                          New
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
                            <option key={item}>{item}</option>
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
                          <option>Normal</option>
                          <option>Important</option>
                          <option>Urgent</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          เริ่มแสดง
                        </span>
                        <input
                          type="datetime-local"
                          value={draft.startsAt}
                          onChange={(event) =>
                            setDraft({ ...draft, startsAt: event.target.value })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          สิ้นสุด
                        </span>
                        <input
                          type="datetime-local"
                          value={draft.endsAt}
                          onChange={(event) =>
                            setDraft({ ...draft, endsAt: event.target.value })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        />
                      </label>

                      <label className="md:col-span-2">
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          รูปแบบการแจ้งเตือน
                        </span>
                        <select
                          value={draft.popupMode}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              popupMode: event.target.value as AnnouncementPopupMode,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <option>Once</option>
                          <option>Until Acknowledged</option>
                          <option>Mailbox Only</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          รูปแบบการแสดงผล
                        </span>
                        <select
                          value={draft.displayMode}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              displayMode: event.target.value as AnnouncementDisplayMode,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <option>Banner</option>
                          <option>Popup</option>
                          <option>Full Screen</option>
                          <option>Mailbox Only</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          การตอบสนองของผู้ใช้
                        </span>
                        <select
                          value={draft.actionRequired}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              actionRequired: event.target.value as AnnouncementActionRequired,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <option>Read Only</option>
                          <option>Acknowledge</option>
                        </select>
                      </label>

                      <label className="md:col-span-2">
                        <span className="mb-2 block text-xs font-black text-slate-500">
                          รายละเอียด
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
                            แนบไฟล์หรือ Media
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            รูปภาพ วิดีโอ PDF Word Excel PowerPoint สูงสุด 5 ไฟล์ และไม่เกิน 700 KB ต่อไฟล์
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-sm font-black text-white shadow-md"
                        >
                          Add File
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
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
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="pdf">PDF</option>
                          <option value="file">Other File</option>
                          <option value="link">Link</option>
                        </select>
                        <input
                          value={mediaUrl}
                          onChange={(event) => setMediaUrl(event.target.value)}
                          placeholder="URL / Google Drive public link"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        />
                        <input
                          value={mediaLabel}
                          onChange={(event) => setMediaLabel(event.target.value)}
                          placeholder="ชื่อไฟล์หรือลิงก์"
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                        />
                        <button
                          type="button"
                          onClick={addMedia}
                          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
                        >
                          Add
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
                                Remove
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
                          label="All Users"
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
                        {busy ? "Saving..." : draft.id ? "Update Announcement" : "Publish / Schedule"}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                      Announcement List
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
                                {announcementStatus(item)} •{" "}
                                {formatDateTime(item.startsAt)}
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-black ${
                                priorityClasses(item.priority).badge
                              }`}
                            >
                              {item.priority}
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
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeAnnouncement(item)}
                              className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600"
                            >
                              Delete
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
                            Read {receiptCountFor(item.id, "readAt")}
                          </span>
                          <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                            Acknowledged{" "}
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
                                Read: {formatDateTime(receipt.readAt)}
                              </div>
                              <div className="text-slate-500">
                                Ack:{" "}
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
