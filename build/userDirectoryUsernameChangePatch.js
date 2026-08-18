export function userDirectoryUsernameChangePatch() {
  let adminPatched = false;
  let profilePatched = false;

  return {
    name: "user-directory-username-change",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/UserRoleAdminMockup.tsx")) {
        let next = code;

        const importAnchor = 'import { appendUserProfileHistory } from "./profileHistoryStore";';
        if (!next.includes(importAnchor)) {
          this.error("Username change patch could not find profile history import.");
        }
        if (!next.includes('from "./usernameMigrationStore"')) {
          next = next.replace(
            importAnchor,
            `${importAnchor}\nimport { migrateUsernameReferences } from "./usernameMigrationStore";`
          );
        }

        const saveDirectoryAnchor = "  const handleSaveDirectory = async () => {";
        if (!next.includes(saveDirectoryAnchor)) {
          this.error("Username change patch could not find handleSaveDirectory anchor.");
        }

        const usernameHandler = `  const changeSingleUsername = async (oldUsername: string, newUsername: string) => {\n    const original = rows.find(\n      (row) => normalizeUsername(row.username) === normalizeUsername(oldUsername)\n    );\n    if (!original) throw new Error(\`ไม่พบผู้ใช้ \${oldUsername}\`);\n\n    const oldKey = normalizeUsername(original.username);\n    const nextUsername = normalizeUsername(newUsername);\n    if (oldKey === "songpon") {\n      throw new Error("บัญชีเจ้าของระบบ Songpon ไม่สามารถเปลี่ยน Username ได้");\n    }\n    if (!nextUsername) throw new Error("กรุณาระบุ Username ใหม่");\n    if (nextUsername === oldKey) throw new Error("Username ใหม่เหมือน Username เดิม");\n    if (!/^[a-z0-9._-]{3,50}$/.test(nextUsername)) {\n      throw new Error("Username ใช้ได้เฉพาะ a-z, 0-9, จุด (.), ขีดล่าง (_) และขีดกลาง (-) จำนวน 3–50 ตัวอักษร");\n    }\n    if (rows.some((row) => normalizeUsername(row.username) === nextUsername && normalizeUsername(row.username) !== oldKey)) {\n      throw new Error(\`Username \${nextUsername} มีผู้ใช้งานแล้ว\`);\n    }\n\n    setSaving(true);\n    setMessage("");\n    try {\n      const changedBy = currentUser?.displayName || currentUser?.username || "System";\n      await migrateUsernameReferences({\n        oldUsername: original.username,\n        newUsername: nextUsername,\n        updatedBy: changedBy,\n      });\n\n      await logUsageEventBestEffort(currentUser, "user_profile_saved", {\n        tab: "user-roles",\n        target_agent: nextUsername,\n        details: {\n          username: nextUsername,\n          previousUsername: original.username,\n          changeType: "username_changed",\n          updatedBy: changedBy,\n          updatedAt: new Date().toISOString(),\n        },\n      });\n\n      await onRolesChanged();\n      setMessage(\`เปลี่ยน Username \${original.username} → \${nextUsername} แล้ว ระบบได้ย้ายข้อมูลที่ผูกกับบัญชีและยกเลิก Session เดิม\`);\n      return nextUsername;\n    } finally {\n      setSaving(false);\n    }\n  };\n\n`;
        next = next.replace(saveDirectoryAnchor, `${usernameHandler}${saveDirectoryAnchor}`);

        const propAnchor = "                onSaveAccount={saveSingleUserAccount}\n              />";
        if (!next.includes(propAnchor)) {
          this.error("Username change patch could not find User Directory save-account prop.");
        }
        next = next.replace(
          propAnchor,
          "                onSaveAccount={saveSingleUserAccount}\n                onChangeUsername={changeSingleUsername}\n              />"
        );

        adminPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/CorporateUserDirectoryProfile.tsx")) {
        let next = code;

        const propsAnchor = "  onSaveAccount: (update: CorporateUserAccountUpdate) => Promise<void>;\n};";
        if (!next.includes(propsAnchor)) {
          this.error("Username change patch could not find Corporate Directory Props anchor.");
        }
        next = next.replace(
          propsAnchor,
          "  onSaveAccount: (update: CorporateUserAccountUpdate) => Promise<void>;\n  onChangeUsername: (oldUsername: string, newUsername: string) => Promise<string>;\n};"
        );

        const destructureAnchor = "  onManageTeams,\n  onSaveAccount,\n}: Props) {";
        if (!next.includes(destructureAnchor)) {
          this.error("Username change patch could not find Corporate Directory prop destructuring.");
        }
        next = next.replace(
          destructureAnchor,
          "  onManageTeams,\n  onSaveAccount,\n  onChangeUsername,\n}: Props) {"
        );

        const stateAnchor = '  const [toast, setToast] = useState("");';
        if (!next.includes(stateAnchor)) {
          this.error("Username change patch could not find Corporate Directory state anchor.");
        }
        next = next.replace(
          stateAnchor,
          `${stateAnchor}\n  const [usernameChangeOpen, setUsernameChangeOpen] = useState(false);\n  const [usernameDraft, setUsernameDraft] = useState("");\n  const [usernameChanging, setUsernameChanging] = useState(false);`
        );

        const handlerAnchor = "  const copyContact = async () => {";
        if (!next.includes(handlerAnchor)) {
          this.error("Username change patch could not find copyContact anchor.");
        }
        const handlers = `  const openUsernameChange = () => {\n    if (!user || !canManageUsers) return;\n    if (normalizeUsername(user.username) === "songpon") {\n      setToast("บัญชีเจ้าของระบบ Songpon ไม่สามารถเปลี่ยน Username ได้");\n      return;\n    }\n    setUsernameDraft(normalizeUsername(user.username));\n    setUsernameChangeOpen(true);\n  };\n\n  const submitUsernameChange = async () => {\n    if (!user || usernameChanging) return;\n    const nextUsername = normalizeUsername(usernameDraft);\n    if (!nextUsername) {\n      setToast("กรุณาระบุ Username ใหม่");\n      return;\n    }\n    if (!/^[a-z0-9._-]{3,50}$/.test(nextUsername)) {\n      setToast("Username ใช้ได้เฉพาะ a-z, 0-9, จุด (.), ขีดล่าง (_) และขีดกลาง (-) จำนวน 3–50 ตัวอักษร");\n      return;\n    }\n    if (nextUsername === normalizeUsername(user.username)) {\n      setToast("Username ใหม่เหมือน Username เดิม");\n      return;\n    }\n\n    const confirmed = window.confirm(\`ยืนยันเปลี่ยน Username จาก \"\${user.username}\" เป็น \"\${nextUsername}\"?\\n\\nSession เดิมของบัญชีนี้จะถูกยกเลิก และผู้ใช้ต้อง Login ด้วย Username ใหม่\`);\n    if (!confirmed) return;\n\n    setUsernameChanging(true);\n    try {\n      const changedUsername = await onChangeUsername(user.username, nextUsername);\n      setUsernameChangeOpen(false);\n      setUsernameDraft("");\n      setEditing(false);\n      setAccountDraft(null);\n      setSelectedUsername(normalizeUsername(changedUsername));\n      setSearch(user.displayName || changedUsername);\n      setToast(\`เปลี่ยน Username เป็น \${changedUsername} แล้ว\`);\n    } catch (error) {\n      setToast(error instanceof Error ? error.message : "เปลี่ยน Username ไม่สำเร็จ");\n    } finally {\n      setUsernameChanging(false);\n    }\n  };\n\n`;
        next = next.replace(handlerAnchor, `${handlers}${handlerAnchor}`);

        const usernameFieldAnchor = '                    <Field label="Username" value={account.username} editing={false} />';
        if (!next.includes(usernameFieldAnchor)) {
          this.error("Username change patch could not find Username field.");
        }
        const usernameUi = `                    <div>\n                      <Field label="Username" value={account.username} editing={false} />\n                      {editing && canManageUsers ? (\n                        <button\n                          type="button"\n                          onClick={openUsernameChange}\n                          disabled={normalizeUsername(account.username) === "songpon"}\n                          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"\n                        >\n                          Change Username\n                        </button>\n                      ) : null}\n                    </div>\n\n                    {usernameChangeOpen && user ? (\n                      <div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">\n                        <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.32)]">\n                          <div className="h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-600" />\n                          <div className="p-6">\n                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">Account Identity</div>\n                            <h3 className="mt-1 text-2xl font-semibold text-slate-950">Change Username</h3>\n                            <p className="mt-2 text-sm leading-6 text-slate-500">ระบบจะย้าย Profile, รูปโปรไฟล์, QA Access Check/History, QA Evaluation references และข้อมูลที่ผูกกับ Username ไปยังบัญชีใหม่</p>\n\n                            <div className="mt-5 grid gap-3 sm:grid-cols-2">\n                              <label className="text-xs font-semibold text-slate-600">\n                                Username เดิม\n                                <input value={user.username} disabled className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-500" />\n                              </label>\n                              <label className="text-xs font-semibold text-slate-600">\n                                Username ใหม่\n                                <input\n                                  value={usernameDraft}\n                                  onChange={(event) => setUsernameDraft(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}\n                                  autoFocus\n                                  disabled={usernameChanging}\n                                  placeholder="username.new"\n                                  className="mt-2 w-full rounded-xl border border-violet-300 bg-white px-3 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"\n                                />\n                              </label>\n                            </div>\n\n                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-800">\n                              หลังเปลี่ยน Username ระบบจะยกเลิก Session เดิมของบัญชีนี้ ผู้ใช้ต้อง Login ใหม่ด้วย Username ใหม่ ส่วน Password เดิมยังคงใช้ได้\n                            </div>\n\n                            <div className="mt-6 flex justify-end gap-2">\n                              <button\n                                type="button"\n                                onClick={() => { setUsernameChangeOpen(false); setUsernameDraft(""); }}\n                                disabled={usernameChanging}\n                                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50"\n                              >\n                                ยกเลิก\n                              </button>\n                              <button\n                                type="button"\n                                onClick={() => void submitUsernameChange()}\n                                disabled={usernameChanging || !usernameDraft.trim() || normalizeUsername(usernameDraft) === normalizeUsername(user.username)}\n                                className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"\n                              >\n                                {usernameChanging ? "กำลังย้ายข้อมูล..." : "ยืนยันเปลี่ยน Username"}\n                              </button>\n                            </div>\n                          </div>\n                        </div>\n                      </div>\n                    ) : null}`;
        next = next.replace(usernameFieldAnchor, usernameUi);

        profilePatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!adminPatched) this.error("Username change patch was not applied to UserRoleAdminMockup.tsx.");
      if (!profilePatched) this.error("Username change patch was not applied to CorporateUserDirectoryProfile.tsx.");
    },
  };
}
