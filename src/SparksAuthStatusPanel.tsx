import React, { useEffect, useMemo, useState } from "react";
import "./sparksAuthStatus.css";

type AuthStatus = "signed-in-before" | "not-signed-in" | "not-linked";
type Member = {
  username: string;
  displayName: string;
  role: string;
  loginStatus: AuthStatus;
  authAccounts: number;
  lastSignedInAt: string;
  rosterUpdatedAt: string;
};
type Report = { ok: boolean; users: Member[]; checkedAt: string };
type Filter = "all" | AuthStatus;

function bangkokDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function statusLabel(value: AuthStatus) {
  if (value === "signed-in-before") return "เคย Login แล้ว";
  if (value === "not-signed-in") return "ยังไม่พบการ Login";
  return "ยังไม่เชื่อม Auth";
}

export default function SparksAuthStatusPanel() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch("/api/sparks-auth?action=auth-status", {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || !Array.isArray(result.users)) {
        throw new Error(String(result.error || "ไม่สามารถตรวจสอบสถานะบัญชี Supabase ได้"));
      }
      if (active) setData(result as Report);
    }).catch(reason => {
      if (active && !controller.signal.aborted) {
        setData(null); // Never present a cached status as current after a failed refresh.
        setError(reason instanceof Error ? reason.message : "การตรวจสอบสถานะไม่สำเร็จ");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [revision]);

  const users = data?.users ?? [];
  const signedIn = users.filter(row => row.loginStatus === "signed-in-before").length;
  const notSignedIn = users.filter(row => row.loginStatus === "not-signed-in").length;
  const notLinked = users.filter(row => row.loginStatus === "not-linked").length;
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th");
    return users.filter(row =>
      (filter === "all" || row.loginStatus === filter) &&
      (!term || [row.username, row.displayName, row.role].some(value =>
        String(value || "").toLocaleLowerCase("th").includes(term)))
    );
  }, [users, filter, search]);

  return <section className="sa-auth" data-sparks-auth-status-panel="true" aria-label="User Authentication Status">
    <div className="sa-auth-heading">
      <div>
        <span className="sa-auth-eyebrow">SUPABASE AUTH / OWNER REPORT</span>
        <h3>User Authentication Status</h3>
        <p>ตรวจสอบสิทธิ์การเข้าสู่ QA Sparks ของพนักงานจาก Supabase Auth โดยตรง</p>
      </div>
      <button type="button" onClick={() => setRevision(n => n + 1)}
        disabled={loading} aria-label="ตรวจสอบสถานะล่าสุด">
        {loading ? "กำลังตรวจสอบ..." : "รีเฟรชสถานะ"}
      </button>
    </div>

    <div className="sa-auth-provider" role="note">
      <div><strong>QA Dashboard</strong><span>Firebase · ระบบประเมินและรายงาน</span></div>
      <div><strong>QA Sparks</strong><span>Supabase · คะแนนและรางวัล</span></div>
      <div><strong>Sparks Login</strong><span>Supabase Auth เท่านั้น</span></div>
    </div>

    {error ? <div role="alert" className="sa-auth-error">
      {error} — ระบบไม่แสดงผลเก่าราวกับเป็นข้อมูลล่าสุด
    </div> : null}

    <div className="sa-auth-metrics" aria-label="ภาพรวมบัญชี Supabase">
      <div><span>พนักงาน Active</span><strong>{data ? users.length : "—"}</strong></div>
      <div><span>เคย Login แล้ว</span><strong>{data ? signedIn : "—"}</strong></div>
      <div><span>มีบัญชี แต่ยังไม่ Login</span><strong>{data ? notSignedIn : "—"}</strong></div>
      <div><span>ยังไม่เชื่อม Auth</span><strong>{data ? notLinked : "—"}</strong></div>
    </div>

    <div className="sa-auth-toolbar">
      <label className="sa-auth-search">ค้นหาพนักงาน
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="ชื่อ / Username / Role"/>
      </label>
      <label className="sa-auth-filter">สถานะ
        <select value={filter} onChange={event => setFilter(event.target.value as Filter)}>
          <option value="all">ทั้งหมด</option>
          <option value="signed-in-before">เคย Login แล้ว</option>
          <option value="not-signed-in">มีบัญชี แต่ยังไม่ Login</option>
          <option value="not-linked">ยังไม่เชื่อม Auth</option>
        </select>
      </label>
      <span className="sa-auth-checked">ตรวจสอบล่าสุด: {data ? bangkokDate(data.checkedAt) : "—"}</span>
    </div>

    <div className="sa-auth-list" role="table" aria-label="สถานะการเข้าสู่ Supabase รายผู้ใช้งาน">
      <div className="sa-auth-row sa-auth-row--head" role="row">
        <span role="columnheader">ผู้ใช้งาน</span><span role="columnheader">Supabase Auth</span>
        <span role="columnheader">สถานะ Login</span><span role="columnheader">Login ล่าสุด</span>
      </div>
      {!loading && visible.map(row => <div className="sa-auth-row" role="row" key={row.username}>
        <div className="sa-auth-identity" role="cell">
          <strong>{row.displayName || row.username}</strong>
          <span>@{row.username} · {row.role || "User"}</span>
        </div>
        <div role="cell"><span className={"sa-auth-pill " + (row.authAccounts > 0 ? "sa-auth-pill--ready" : "sa-auth-pill--missing")}>
          {row.authAccounts > 0 ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}
        </span>{row.authAccounts > 1 ? <small className="sa-auth-duplicate">พบบัญชี Auth มากกว่า 1 รายการ</small> : null}</div>
        <div className="sa-auth-cell" role="cell"><span className={"sa-auth-status sa-auth-status--" + row.loginStatus}>
          {statusLabel(row.loginStatus)}</span></div>
        <div className="sa-auth-last-login" role="cell">{bangkokDate(row.lastSignedInAt)}</div>
      </div>)}
      {loading ? <p className="sa-auth-empty" role="status">กำลังอ่านข้อมูลจาก Supabase...</p> : null}
      {!loading && data && visible.length === 0 ? <p className="sa-auth-empty">ไม่พบรายชื่อที่ตรงกับตัวกรอง</p> : null}
    </div>
    <p className="sa-auth-footnote">
      “เคย Login แล้ว” หมายถึงมีประวัติยืนยันตัวตนสำเร็จใน Supabase ไม่ใช่สถานะออนไลน์แบบเรียลไทม์
      ผู้ที่ยังไม่เชื่อม Auth ต้องเตรียมบัญชีก่อนเข้า QA Sparks รายงานนี้ไม่แก้คะแนนหรือสิทธิ์ของพนักงาน
    </p>
  </section>;
}
