export function qaAccessCheckPermissionPatch() {
  let appPatched = false;
  let roleAdminPatched = false;

  const insertPermissionType = (code, context) => {
    const anchor = '  | "createEvaluation"\n  | "takePreTest"';
    if (!code.includes(anchor)) {
      throw new Error(`QA Access Check permission patch could not find ${context} permission type anchor.`);
    }
    return code.replace(
      anchor,
      '  | "createEvaluation"\n  | "manageQaAccessCheck"\n  | "takePreTest"'
    );
  };

  const insertDefaultFalse = (code, context) => {
    const anchor = '    createEvaluation: true,\n    takePreTest:';
    const occurrences = code.split(anchor).length - 1;
    if (occurrences < 4) {
      throw new Error(`QA Access Check permission patch expected at least 4 ${context} default role anchors, found ${occurrences}.`);
    }
    return code.split(anchor).join(
      '    createEvaluation: true,\n    manageQaAccessCheck: false,\n    takePreTest:'
    );
  };

  return {
    name: "qa-access-check-role-permission",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];

      if (cleanId.endsWith("/src/App.tsx")) {
        let next = code;
        next = insertPermissionType(next, "App");

        const keysAnchor = '  "createEvaluation",\n  "takePreTest",';
        if (!next.includes(keysAnchor)) {
          this.error("QA Access Check permission patch could not find App PERMISSION_KEYS anchor.");
        }
        next = next.replace(
          keysAnchor,
          '  "createEvaluation",\n  "manageQaAccessCheck",\n  "takePreTest",'
        );

        next = insertDefaultFalse(next, "App");

        const allowedAnchor = '  const createEvaluationAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "createEvaluation") : false;';
        if (!next.includes(allowedAnchor)) {
          this.error("QA Access Check permission patch could not find createEvaluationAllowed anchor.");
        }
        next = next.replace(
          allowedAnchor,
          `${allowedAnchor}\n  const qaAccessCheckManageAllowed = currentUser ? hasRolePermission(currentUser, rolePermissions, "manageQaAccessCheck") : false;`
        );

        const workspaceAnchor = '            canManage={createEvaluationAllowed}\n';
        if (!next.includes(workspaceAnchor)) {
          this.error("QA Access Check permission patch could not find QA workspace canManage anchor. Ensure qaTypingChallengeFeaturePatch runs before this patch.");
        }
        next = next.replace(
          workspaceAnchor,
          '            canManage={qaAccessCheckManageAllowed}\n'
        );

        appPatched = true;
        return { code: next, map: null };
      }

      if (cleanId.endsWith("/src/UserRoleAdminMockup.tsx")) {
        let next = code;
        next = insertPermissionType(next, "Role Admin");

        const definitionAnchor = '  { key: "createEvaluation", label: "Create QA Evaluation", category: "Review", description: "Open Create QA Evaluation and submit new QA assessment records." },';
        if (!next.includes(definitionAnchor)) {
          this.error("QA Access Check permission patch could not find Role Admin permission definition anchor.");
        }
        next = next.replace(
          definitionAnchor,
          `${definitionAnchor}\n  { key: "manageQaAccessCheck", label: "QA Access Check - Manage", category: "Review", description: "Open QA Access Check Setup, assign or remove typing challenges, manage queues, and view all Agent history." },`
        );

        const thaiHelpAnchor = '  createEvaluation: "อนุญาตให้เปิดหน้า Evaluate และสร้างผลประเมิน QA ใหม่",';
        if (!next.includes(thaiHelpAnchor)) {
          this.error("QA Access Check permission patch could not find Role Admin Thai help anchor.");
        }
        next = next.replace(
          thaiHelpAnchor,
          `${thaiHelpAnchor}\n  manageQaAccessCheck: "อนุญาตให้เปิด Setup ของ QA Access Check เลือก Agent ส่งคำหรือประโยค จัดการ Queue ยกเลิกโจทย์ และดู History ของ Agent ทุกคน",`
        );

        next = insertDefaultFalse(next, "Role Admin");

        roleAdminPatched = true;
        return { code: next, map: null };
      }

      return null;
    },

    buildEnd(error) {
      if (error) return;
      if (!appPatched) this.error("QA Access Check permission patch was not applied to App.tsx.");
      if (!roleAdminPatched) this.error("QA Access Check permission patch was not applied to UserRoleAdminMockup.tsx.");
    },
  };
}
