import React, { useEffect, useState } from "react";
import type { SparksVerifiedActor } from "./SparksEmailAuth";
import "./SparksEmailAuth.css";

// The user signs in with the same QA username/password. The browser never
// provisions new identities and never stores passwords or Supabase tokens.
export default function SparksQaPasswordAuth({
  username = "", onVerified,
}: {
  username?: string;
  onVerified: (actor: SparksVerifiedActor) => void;
}) {
  const [enteredUsername, setEnteredUsername] = useState(username);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setEnteredUsername(username);
  }, [username]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/sparks-auth", {
          credentials: "same-origin", cache: "no-store",
        });
        if (!alive || !response.ok) return;
        const data = await response.json();
        const actor = data?.actor as SparksVerifiedActor | undefined;
        if (actor?.status === "Active" && actor.username &&
            (!username || actor.username.toLowerCase() === username.toLowerCase())) {
          onVerified(actor);
        }
      } catch {
        // A failed session lookup must not grant access or block manual sign-in.
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => { alive = false; };
  }, [username, onVerified]);
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || checking) return;
    setSubmitting(true);
    setError("");
    const requested = (username || enteredUsername).trim().toLowerCase();
    try {
      if (!requested || !password) throw Error("กรุณากรอก Username และ Password");
      const response = await fetch("/api/sparks-auth", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", username: requested, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok !== true || !result.actor) {
        throw Error(response.status === 503
          ? "ระบบเข้าสู่ระบบชั่วคราวไม่พร้อมใช้งาน กรุณาลองอีกครั้ง"
          : "Username หรือ Password ไม่ถูกต้อง หรือบัญชียังไม่ได้เปิดสิทธิ์");
      }
      const actor = result.actor as SparksVerifiedActor;
      if (actor.username.toLowerCase() !== requested || actor.status !== "Active") {
        await fetch("/api/sparks-auth", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
        throw Error("บัญชีที่ยืนยันได้ไม่ตรงกับ Username ที่กรอก");
      }
      setPassword("");
      onVerified(actor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }
  return <main className="sparks-email-auth" aria-label="เข้าสู่ระบบ QA Sparks">
    <section className="sparks-email-auth-card">
      <div className="sparks-email-auth-kicker">QA Sparks · Supabase</div>
      <h2>เข้าใช้ QA Sparks</h2>
      <p>ใช้ Username และ Password เดียวกับ QA Dashboard ไม่ต้องสมัครบัญชีใหม่หรือใช้ OTP</p>
      {checking ? <p role="status">กำลังตรวจสอบ Session...</p> : (
        <form onSubmit={signIn} autoComplete="on">
          <label htmlFor="sparks-qa-username">Username QA</label>
          <input id="sparks-qa-username" type="text" name="username" autoComplete="username"
            required value={username || enteredUsername} disabled={Boolean(username) || submitting}
            onChange={event => setEnteredUsername(event.target.value)} />
          <label htmlFor="sparks-qa-password">Password QA</label>
          <input id="sparks-qa-password" type="password" name="password" autoComplete="current-password"
            required value={password} disabled={submitting}
            onChange={event => setPassword(event.target.value)} />
          {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังตรวจสอบ..." : "เข้าสู่ QA Sparks"}
          </button>
        </form>
      )}
      <p style={{ fontSize: 12, marginTop: 12 }}>
        หากลืมรหัสผ่าน ให้ใช้เมนู Forgot Password ของ QA Dashboard
      </p>
    </section>
  </main>;
}
