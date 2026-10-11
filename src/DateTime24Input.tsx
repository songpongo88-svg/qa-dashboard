import React, { useEffect, useRef, useState } from 'react';
import Time24Input from './Time24Input';

type Props = {
  value: string;onValueChange: (value: string) => void;className?: string;min?: string;max?: string;
  disabled?: boolean;required?: boolean;dateLabel?: string;timeLabel?: string;
};

export default function DateTime24Input({ value, onValueChange, className, min, max, disabled, required, dateLabel = 'วันที่', timeLabel = 'เวลา (24 ชั่วโมง)' }: Props) {
  const [date, setDate] = useState(value.split('T')[0] || '');
  const [time, setTime] = useState(value.split('T')[1]?.slice(0, 5) || '');
  const sent = useRef(value);
  const dateRef = useRef<HTMLInputElement>(null);
  const complete = date && time ? `${date}T${time}` : '';
  const outOfRange = Boolean(complete && ((min && complete < min) || (max && complete > max)));
  useEffect(() => {
    dateRef.current?.setCustomValidity(outOfRange ? 'เลือกวันและเวลาให้อยู่ในช่วงที่กำหนด' : '');
  }, [outOfRange]);
  useEffect(() => {
    if (value !== sent.current) { sent.current = value;setDate(value.split('T')[0] || '');setTime(value.split('T')[1]?.slice(0, 5) || ''); }
  }, [value]);
  const publish = (nextDate: string, nextTime: string) => {
    const next = nextDate && nextTime ? `${nextDate}T${nextTime}` : '';
    sent.current = next;onValueChange(next);
  };
  return <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(85px, .65fr)', gap: 8 }}>
    <input ref={dateRef} type="date" aria-label={dateLabel} aria-invalid={outOfRange || undefined} className={className} style={{ minWidth: 0 }} value={date} min={min?.split('T')[0]} max={max?.split('T')[0]} disabled={disabled} required={required}
      onChange={event => { setDate(event.target.value);publish(event.target.value, time); }} />
    <Time24Input aria-label={timeLabel} className={className} value={time} disabled={disabled} required={required}
      onValueChange={next => { setTime(next);publish(date, next); }} />
  </span>;
}
