import React, { useEffect, useRef, useState } from 'react';

export function normalizeTime24(value: string) {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/) || text.match(/^(\d{2})(\d{2})$/);
  if (!match) return '';
  const hour = Number(match[1]), minute = Number(match[2] || 0);
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` : '';
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

export default function Time24Input({ value, onValueChange, onBlur, onKeyDown, ...props }: Props) {
  const [draft, setDraft] = useState(() => normalizeTime24(value) || value);
  const [invalid, setInvalid] = useState(false);
  const sent = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== sent.current) { sent.current = value;setDraft(normalizeTime24(value) || value);setInvalid(false);inputRef.current?.setCustomValidity(''); }
  }, [value]);
  const publish = (next: string) => { sent.current = next;onValueChange(next); };
  const commit = (node: HTMLInputElement) => {
    const next = normalizeTime24(draft);
    const error = Boolean(draft.trim() && !next);
    node.setCustomValidity(error ? 'กรอกเวลา 24 ชั่วโมง เช่น 13:00 (00:00–23:59)' : '');
    setInvalid(error);
    if (!error) { setDraft(next);publish(next); }
  };
  return <input {...props} ref={inputRef} type="text" inputMode="numeric" placeholder="HH:mm" maxLength={5}
    pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value={draft} aria-invalid={invalid || undefined}
    onChange={event => {
      const next = event.target.value;
      setDraft(next);setInvalid(false);event.target.setCustomValidity('');
      publish(/^\d{2}:\d{2}$/.test(next) ? normalizeTime24(next) : '');
    }}
    onBlur={event => { commit(event.currentTarget);onBlur?.(event); }}
    onKeyDown={event => { if (event.key === 'Enter') commit(event.currentTarget);onKeyDown?.(event); }} />;
}
