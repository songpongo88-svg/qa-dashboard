import React, { useRef, useState } from 'react';
import { InkIcon } from './LineDrawing';

export function InkLoginArtwork() {
  return <>
    <div className="qa-ink-login-artwork" aria-hidden="true">
      <img className="qa-ink-login-house" src="/line-drawing/login-house.svg" alt="" />
      <img className="qa-ink-login-tree" src="/line-drawing/login-tree.svg" alt="" />
      <img className="qa-ink-login-sun" src="/line-drawing/sun.svg" alt="" />
      <svg className="qa-ink-login-birds" viewBox="0 0 280 80" fill="none"><path d="m8 38 13-19q7-8 9 7 8-17 16-10l17 10 19-3m72-4 11-13q6-5 6 8 7-12 13-8l14 8 18-4m-79 53 13-12q6-6 7 8 7-12 13-5l12 6 17-4" /></svg>
    </div>
    <header className="qa-ink-login-title"><img src="/line-drawing/logo.svg" alt="QA Dashboard" /></header>
  </>;
}

type Props = {
  username: string;
  password: string;
  verified: boolean;
  checking: boolean;
  submitting: boolean;
  remember: boolean;
  error: string;
  notice: string;
  maintenance?: React.ReactNode;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: () => Promise<void>;
};

export function InkLoginForm(props: Props) {
  const [visible, setVisible] = useState(false);
  const pending = useRef(false);
  const ready = props.verified && props.password.trim().length >= 6 && !props.submitting;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || pending.current) return;
    pending.current = true;
    try { await props.onSubmit(); }
    finally { pending.current = false; }
  };
  return <form className="qa-ink-login-fields" onSubmit={submit} aria-label="Sign in" aria-busy={props.submitting}>
    <img className="qa-ink-login-face" src="/line-drawing/face.svg" alt="" />
    <h1>Welcome back</h1>
    {props.maintenance}
    <label htmlFor="qa-login-username">Username</label>
    <div className="qa-ink-login-input">
      <svg className="qa-ink-login-user" aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6c-5 8 9 13 10 4 2-8-9-10-10-4M4 29q-1-13 12-13 13 0 12 13L4 29m1-2 22 .5" /></svg>
      <input id="qa-login-username" name="username" type="text" autoComplete="username" autoFocus value={props.username} disabled={props.submitting} onChange={event => props.onUsernameChange(event.target.value)} aria-invalid={Boolean(props.error) && !props.verified} aria-describedby="qa-ink-login-status" />
      {props.checking ? <span className="qa-login-spinner" aria-hidden="true" /> : null}
    </div>
    <label htmlFor="qa-ink-login-password">Password</label>
    <div className="qa-ink-login-input">
      <InkIcon kind="lock" />
      <input id="qa-ink-login-password" name="password" aria-label="Login Password" aria-describedby="qa-ink-login-status" type={visible ? 'text' : 'password'} autoComplete="current-password" value={props.password} disabled={!props.verified || props.submitting} onChange={event => props.onPasswordChange(event.target.value)} />
      <button type="button" className="qa-ink-login-eye" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(value => !value)} disabled={!props.verified || props.submitting}>
        <InkIcon kind="preview" />{visible ? <span className="qa-ink-eye-slash" /> : null}
      </button>
    </div>
    <div className="qa-ink-login-options">
      <label><input type="checkbox" checked={props.remember} disabled={props.submitting} onChange={event => props.onRememberChange(event.target.checked)} />Remember me</label>
      <button type="button" onClick={props.onForgotPassword} disabled={props.submitting}>Forgot password?</button>
    </div>
    <div id="qa-ink-login-status" className="qa-ink-login-status" aria-live="polite">
      {props.submitting ? 'กำลังเข้าสู่ระบบ…' : props.checking ? 'กำลังตรวจสอบบัญชี…' : props.error ? <span role="alert">{props.error}</span> : props.notice || null}
    </div>
    <button className="qa-ink-login-submit" type="submit" disabled={!ready}>Sign in <span aria-hidden="true">⟶</span></button>
  </form>;
}
