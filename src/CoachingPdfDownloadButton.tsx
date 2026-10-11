import React, { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { coachingMonthLabel, monthlyCoachingPdfFileName, type CoachingAccount } from './monthlyCoachingModel';

export default function CoachingPdfDownloadButton({ account, month, available, disabled, onClick }: {
  account: CoachingAccount;month: string;available: boolean;disabled: boolean;onClick: () => void;
}) {
  const id = useId();
  const [position, setPosition] = useState<{ top: number;left: number } | null>(null);
  const name = account.displayName || account.agentName || account.username;
  const description = available
    ? `${monthlyCoachingPdfFileName(month, account.username)}\nMonthly Coaching · ${name}\n${coachingMonthLabel(month)}\nนัดหมาย สรุป QA ผล Coaching Action Plan และ QA Review ที่บันทึกไว้`
    : `Monthly Coaching · ${name}\n${coachingMonthLabel(month)}\nยังไม่มีข้อมูล Coaching ที่บันทึกสำหรับดาวน์โหลด`;
  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPosition({ top: rect.bottom + 180 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 170), left: Math.max(8, Math.min(window.innerWidth - 320, rect.right - 312)) });
  };
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener('scroll', hide, true);window.addEventListener('resize', hide);
    return () => { window.removeEventListener('scroll', hide, true);window.removeEventListener('resize', hide); };
  }, [position]);
  return <span className="mc-pdf-control" onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setPosition(null)}>
    <button type="button" className="mc-pdf-download" aria-label={`ดาวน์โหลด Coaching PDF ${name}`} aria-describedby={position ? id : undefined}
      disabled={disabled || !available} onClick={onClick} onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)} onKeyDown={event => { if (event.key === 'Escape') setPosition(null); }}>
      <svg viewBox="0 0 32 36" width="26" height="30" aria-hidden="true"><path d="M6 1h14l9 9v24H6z" fill="white" stroke="currentColor" strokeWidth="1.5"/><path d="M20 1v9h9" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="17" width="27" height="12" rx="2" fill="currentColor"/><text x="14.5" y="25.8" textAnchor="middle" fontFamily="Arial,sans-serif" fontSize="9" fontWeight="700" fill="white">PDF</text></svg>
    </button>
    {position && createPortal(<div id={id} role="tooltip" className="mc-pdf-tooltip" style={position}>{description}</div>, document.body)}
  </span>;
}
