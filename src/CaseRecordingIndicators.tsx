import React from "react";

/** Voice-recording badges use the saved Call Log Contact Type, never the case Intent. */
type RecordingContact = { recordingUrl?: string | null; contactType?: string | null };
type RecordingType = "Merchant" | "Customer" | "Rider" | "Unknown";

const CONTACT_TYPES: { type: RecordingType; label: string }[] = [
  { type: "Merchant", label: "ร้านค้า" },
  { type: "Customer", label: "ลูกค้า" },
  { type: "Rider", label: "ไรเดอร์" },
  { type: "Unknown", label: "ไม่ระบุ" },
];

function VoiceTypeIcon({ type }: { type: RecordingType }) {
  if (type === "Merchant") return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10h18l-2-6H5l-2 6Z" /><path d="M4 10v10h16V10M9 20v-6h6v6" />
      <path d="M3 10c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0" />
    </svg>
  );
  if (type === "Customer") return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.5" /><path d="M4.5 20v-1a7.5 7.5 0 0 1 15 0v1H4.5Z" />
    </svg>
  );
  if (type === "Rider") return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
      <path d="m5 17 4.5-7H15l4 7M11 17h4.2l-2.8-6M10 10h-2M13 5.8h2l2 2" />
      <circle cx="12.6" cy="5.2" r="1.5" />
    </svg>
  );
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13v-2a7 7 0 0 1 14 0v2" /><rect x="3" y="12" width="4" height="7" rx="1.5" /><rect x="17" y="12" width="4" height="7" rx="1.5" />
    </svg>
  );
}

export default function CaseRecordingIndicators({ callLogs }: { callLogs?: readonly RecordingContact[] | null }) {
  const counts: Record<RecordingType, number> = { Merchant: 0, Customer: 0, Rider: 0, Unknown: 0 };
  for (const call of callLogs || []) {
    if (!String(call?.recordingUrl || "").trim()) continue;
    const type = String(call?.contactType || "").trim().toLowerCase();
    if (type === "merchant") counts.Merchant++;
    else if (type === "customer") counts.Customer++;
    else if (type === "rider") counts.Rider++;
    else counts.Unknown++;
  }
  const available = CONTACT_TYPES.filter(({ type }) => counts[type] > 0);
  if (available.length === 0) {
    return <span className="qa-case-record-voice-none" data-case-record-voice-empty="true" title="เคสนี้ไม่มีไฟล์เสียง">—</span>;
  }
  return (
    <span className="qa-case-record-voice-badges" aria-label={available.map(({ type, label }) => `${label} ${counts[type]} ไฟล์เสียง`).join(", ")}>
      {available.map(({ type, label }) => (
        <span key={type} className={`qa-case-record-voice-badge qa-case-record-voice-badge--${type.toLowerCase()}`}
          data-case-record-voice-type={type} data-case-record-voice-count={counts[type]}
          title={`${label}: ${counts[type]} ไฟล์เสียง`}>
          <VoiceTypeIcon type={type} />
          <span className="qa-case-record-voice-label">{label}</span>
          <strong className="qa-case-record-voice-count">{counts[type]}</strong>
        </span>
      ))}
    </span>
  );
}
