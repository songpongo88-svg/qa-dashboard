export function adminNameUserProfilePatch() {
  return {
    name: "admin-name-user-profile",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      let next = code;
      const original = code;

      if (normalized.endsWith("/src/userRoleStore.ts")) {
        next = next.replace(
          "  displayName: string;\n  agentName: string;",
          "  displayName: string;\n  adminName?: string;\n  agentName: string;"
        );
        next = next.replace(
          "    displayName: fullName,\n    agentName: fullName,",
          "    displayName: fullName,\n    adminName: String(row.adminName || row.admin_name || \"\"),\n    agentName: fullName,"
        );
        next = next.replace(
          "    displayName: fullName,\n    agentName: fullName,\n    email: profile.email,",
          "    displayName: fullName,\n    adminName: String(profile.adminName || \"\"),\n    agentName: fullName,\n    email: profile.email,"
        );
      }

      if (normalized.endsWith("/src/CorporateUserDirectoryProfile.tsx")) {
        next = next.replace(
          "  displayName: string;\n  agentName: string;\n  email?: string;",
          "  displayName: string;\n  adminName?: string;\n  agentName: string;\n  email?: string;"
        );
        next = next.replace(
          "  displayName: string;\n  agentName: string;\n  email: string;",
          "  displayName: string;\n  adminName?: string;\n  agentName: string;\n  email: string;"
        );

        next = next.replace(
          "          row.displayName,\n          row.agentName,\n          row.username,",
          "          row.displayName,\n          row.adminName || \"\",\n          row.agentName,\n          row.username,"
        );

        next = next.replace(
          "            displayName: user.displayName,\n            agentName: user.agentName,",
          "            displayName: user.displayName,\n            adminName: user.adminName || \"\",\n            agentName: user.agentName,"
        );

        next = next.replace(
          "      displayName: user.displayName,\n      agentName: user.agentName || user.displayName,",
          "      displayName: user.displayName,\n      adminName: user.adminName || \"\",\n      agentName: user.agentName || user.displayName,"
        );

        next = next.replace(
          "      displayName: user.displayName,\n      agentName:\n        user.agentName ||\n        user.displayName,",
          "      displayName: user.displayName,\n      adminName: user.adminName || \"\",\n      agentName:\n        user.agentName ||\n        user.displayName,"
        );

        next = next.replace(
          "  add(\n    \"Agent Name\",\n    beforeAccount.agentName,",
          "  add(\n    \"Admin Name\",\n    beforeAccount.adminName,\n    afterAccount.adminName\n  );\n  add(\n    \"Agent Name\",\n    beforeAccount.agentName,"
        );

        next = next.replace(
          "          username: user.username,\n          preferredName:",
          "          username: user.username,\n          adminName: String(update.adminName || \"\").trim(),\n          preferredName:"
        );

        const oldAccountBlock = `<Section id="profile-account" icon="◎" title="Account Information" subtitle="ข้อมูลบัญชี Role ทีม สิทธิ์ และวันที่สร้าง User">\n                  <div className="grid gap-x-6 xl:grid-cols-2">\n                    <Field label="ชื่อ–นามสกุล" value={account.displayName} editing={editing} onChange={(value) => updateAccount("displayName", value)} />\n                    <Field\n                      label="ชื่อเล่น"\n                      value={meta.preferredName}\n                      editing={editing}\n                      onChange={(value) =>\n                        updateMeta("preferredName", value)\n                      }\n                      placeholder="กรอกชื่อเล่นภาษาอังกฤษ"\n                    />\n                    <Field label="Username" value={account.username} editing={false} />\n                    <Field label="อีเมลสำหรับงาน" value={account.email} editing={editing} onChange={(value) => updateAccount("email", value)} />\n                    <Field label="รหัสพนักงาน" value={meta.employeeId} editing={editing} onChange={(value) => updateMeta("employeeId", value)} />\n                    <Field\n                      label="วันที่สร้าง User"`;
        const newAccountBlock = `<Section id="profile-account" icon="◎" title="Account Information" subtitle="Account details, role, team, permissions, and user timestamps">\n                  <div className="grid gap-x-6 xl:grid-cols-2">\n                    <Field label="Full Name" value={account.displayName} editing={editing} onChange={(value) => updateAccount("displayName", value)} />\n                    <Field\n                      label="Nickname"\n                      value={meta.preferredName}\n                      editing={editing}\n                      onChange={(value) =>\n                        updateMeta("preferredName", value)\n                      }\n                      placeholder="Enter nickname"\n                    />\n                    <Field label="Username" value={account.username} editing={false} />\n                    <Field label="Admin Name" value={account.adminName || \"\"} editing={editing} onChange={(value) => updateAccount("adminName", value)} placeholder="Name used when replying to chat" />\n                    <Field label="Work Email" value={account.email} editing={editing} onChange={(value) => updateAccount("email", value)} />\n                    <Field label="Employee ID" value={meta.employeeId} editing={editing} onChange={(value) => updateMeta("employeeId", value)} />\n                    <Field\n                      label="User Created At"`;
        next = next.replace(oldAccountBlock, newAccountBlock);

        next = next
          .replace('label="อัปเดตข้อมูลล่าสุด"', 'label="Last Updated"')
          .replace('label="ผู้แก้ไขล่าสุด"', 'label="Last Updated By"')
          .replace('label="ทีม" value={account.teamName}', 'label="Team" value={account.teamName}')
          .replace('label="หัวหน้าทีม"', 'label="Team Lead"')
          .replace('label="สถานะรหัสผ่าน" value="ตั้งค่าแล้ว"', 'label="Password Status" value="Configured"')
          .replace('label="สิทธิ์ที่เปิดใช้งาน" value={`${permissionCount} สิทธิ์`}', 'label="Enabled Permissions" value={`${permissionCount} permissions`}')
          .replace('label="อัปเดตรหัสผ่านล่าสุด"', 'label="Last Password Update"');
      }

      if (normalized.endsWith("/src/UserRoleAdminMockup.tsx")) {
        next = next.replace(
          "  displayName: string;\n  role: UserRole;\n  agentName: string;",
          "  displayName: string;\n  adminName?: string;\n  role: UserRole;\n  agentName: string;"
        );
        next = next.replace(
          "          displayName:\n            update.displayName.trim(),\n          agentName:",
          "          displayName:\n            update.displayName.trim(),\n          adminName: String(update.adminName || \"\").trim(),\n          agentName:"
        );
      }

      if (normalized.endsWith("/src/App.tsx")) {
        next = next.replace(
          /type UserAccount = \{([\s\S]*?)  displayName: string;\n  role:/,
          (match) => match.replace("  displayName: string;\n  role:", "  displayName: string;\n  adminName?: string;\n  role:")
        );
        next = next.replace(
          /type UserProfileSnapshot = \{([\s\S]*?)  displayName: string;\n  role:/,
          (match) => match.replace("  displayName: string;\n  role:", "  displayName: string;\n  adminName?: string;\n  role:")
        );
        next = next.replace(
          /type CurrentUser = \{([\s\S]*?)  displayName: string;\n  role:/,
          (match) => match.replace("  displayName: string;\n  role:", "  displayName: string;\n  adminName?: string;\n  role:")
        );

        next = next.replace(
          "      displayName: String(item.details?.displayName || item.details?.agentName || username),\n      agentName:",
          "      displayName: String(item.details?.displayName || item.details?.agentName || username),\n      adminName: String(item.details?.adminName || \"\"),\n      agentName:"
        );
        next = next.replace(
          "      displayName: row.displayName || row.agentName || username,\n      agentName:",
          "      displayName: row.displayName || row.agentName || username,\n      adminName: row.adminName || \"\",\n      agentName:"
        );
        next = next.replace(
          "      displayName: profile.displayName,\n      role: profile.role,",
          "      displayName: profile.displayName,\n      adminName: profile.adminName || \"\",\n      role: profile.role,"
        );

        next = next.replace(
          "          displayName: String(firebaseProfileData.displayName || firebaseProfileData.agentName || firebaseProfileId),\n          role:",
          "          displayName: String(firebaseProfileData.displayName || firebaseProfileData.agentName || firebaseProfileId),\n          adminName: String(firebaseProfileData.adminName || firebaseProfileData.admin_name || \"\"),\n          role:"
        );
        next = next.replace(
          "      displayName: matchedUser.displayName,\n      role: matchedUser.role,",
          "      displayName: matchedUser.displayName,\n      adminName: matchedUser.adminName || \"\",\n      role: matchedUser.role,"
        );

        next = next.replace(
          "        const nextDisplayName = profile?.displayName || previousUser.displayName;\n        const nextAgentName = profile?.agentName || previousUser.agentName;",
          "        const nextDisplayName = profile?.displayName || previousUser.displayName;\n        const nextAdminName = profile?.adminName || \"\";\n        const nextAgentName = profile?.agentName || previousUser.agentName;"
        );
        next = next.replace(
          "          nextDisplayName === previousUser.displayName &&\n          nextAgentName === previousUser.agentName &&",
          "          nextDisplayName === previousUser.displayName &&\n          nextAdminName === (previousUser.adminName || \"\") &&\n          nextAgentName === previousUser.agentName &&"
        );
        next = next.replace(
          "          displayName: nextDisplayName,\n          agentName: nextAgentName,",
          "          displayName: nextDisplayName,\n          adminName: nextAdminName,\n          agentName: nextAgentName,"
        );

        const welcomeBlock = `  const welcomeName = useMemo(() => {\n    if (!currentUser) return \"\";\n    return currentUser.displayName || currentUser.username;\n  }, [currentUser]);`;
        const welcomeWithAdminName = `${welcomeBlock}\n\n  const workspaceAdminName = useMemo(() => {\n    if (!currentUser) return \"\";\n    return String(currentUser.adminName || \"\").trim();\n  }, [currentUser]);`;
        next = next.replace(welcomeBlock, welcomeWithAdminName);

        next = next.replace(
          `<div className="truncate text-[15px] font-semibold">{welcomeName}</div><div className="mt-0.5 truncate text-[10px] font-normal text-violet-200">{currentUser.role}</div>`,
          `<div className="truncate text-[15px] font-semibold">{welcomeName}</div>{workspaceAdminName ? <div className="mt-0.5 truncate text-[10px] font-semibold text-violet-100">{workspaceAdminName}</div> : null}<div className="mt-0.5 truncate text-[10px] font-normal text-violet-200">{currentUser.role}</div>`
        );

        next = next.replace(
          `<div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px]"><svg`,
          `{workspaceWorkSim !== "—" ? <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px]"><svg`
        );
        next = next.replace(
          `{workspaceWorkSim}</span></div></div> : null}`,
          `{workspaceWorkSim}</span></div> : null}</div> : null}`
        );
      }

      return next === original ? null : { code: next, map: null };
    },
  };
}
