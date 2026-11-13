import React, { useCallback, useEffect, useState } from "react";
import { qaServerSessionRequest } from "./qaSingleSessionClient";

type SessionRow = {
  username: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  pendingTakeover: boolean;
};

export default function QaSessionAdminPanel() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await qaServerSessionRequest("admin-list");
      if (!response.ok || !Array.isArray(response.sessions)) throw Error("Session list unavailable");
      setSessions(response.sessions);
    } catch {
      setError("ไม่สามารถตรวจสอบ Active Sessions ได้ กรุณาลองอีกครั้ง");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const revoke = async (username: string) => {
    if (revoking || !window.confirm(`ยืนยันให้บัญชี ${username} ออกจากระบบบน Browser ที่กำลังใช้งานหรือไม่?`)) return;
    setRevoking(username);
    setError("");
    try {
      const result = await qaServerSessionRequest("admin-revoke", { username });
      if (!result.ok) throw Error("Revoke not acknowledged");
      await refresh();
    } catch {
      setError("การบังคับ Logout ไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองอีกครั้ง");
    } finally { setRevoking(""); }
  };

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="qa-sessions-admin">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="qa-sessions-admin" className="text-lg font-bold text-slate-900">Active Session Management</h2>
          <p className="mt-1 text-sm text-slate-500">1 บัญชี / 1 Browser · ตรวจสอบและบังคับ Logout โดยเจ้าของ QA Dashboard</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
          {loading ? "กำลังโหลด..." : "รีเฟรช"}
        </button>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="p-3">บัญชี</th>
              <th scope="col" className="p-3">Browser</th>
              <th scope="col" className="p-3">สถานะ</th>
              <th scope="col" className="p-3">Session หมดอายุ</th>
              <th scope="col" className="p-3">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map(item => (
              <tr key={item.username}>
                <td className="p-3 font-semibold text-slate-800">{item.username}</td>
                <td className="p-3 text-slate-600">{item.deviceLabel}</td>
                <td className="p-3 text-slate-600">{item.active ? item.pendingTakeover ? "กำลังขอสลับเครื่อง" : "Active" : "Expired"}</td>
                <td className="p-3 text-slate-600">{item.expiresAt ? new Date(item.expiresAt).toLocaleString("th-TH") : "—"}</td>
                <td className="p-3">
                  <button type="button" disabled={!item.active || Boolean(revoking)}
                    onClick={() => void revoke(item.username)}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
                    {revoking === item.username ? "กำลังยกเลิก..." : "บังคับ Logout"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sessions.length && !loading ? <p className="p-4 text-center text-sm text-slate-500">ไม่พบข้อมูล Session ที่พร้อมแสดง</p> : null}
      </div>
    </section>
  );
}
