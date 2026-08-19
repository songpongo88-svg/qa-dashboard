export function usernameMigrationBootstrapBypassPatch() {
  let patched = false;

  return {
    name: "username-migration-bootstrap-bypass",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/main.tsx")) return null;

      let next = code;

      const migrationImport = 'import { ensureUsernamePolicyMigration } from "./usernamePolicyMigrationStore";\n';
      if (!next.includes(migrationImport)) {
        throw new Error("Username migration bypass: migration import anchor not found.");
      }
      next = next.replace(migrationImport, "");

      const bootstrapStart = next.indexOf("function UsernamePolicyBootstrap");
      const renderAnchor = 'ReactDOM.createRoot(document.getElementById("root")!).render(';
      const renderStart = next.indexOf(renderAnchor);
      if (bootstrapStart < 0 || renderStart < 0 || renderStart <= bootstrapStart) {
        throw new Error("Username migration bypass: bootstrap block anchor not found.");
      }
      next = next.slice(0, bootstrapStart) + next.slice(renderStart);

      const openWrapper = '      <UsernamePolicyBootstrap>\n';
      const closeWrapper = '      </UsernamePolicyBootstrap>\n';
      if (!next.includes(openWrapper) || !next.includes(closeWrapper)) {
        throw new Error("Username migration bypass: root wrapper anchor not found.");
      }
      next = next.replace(openWrapper, "").replace(closeWrapper, "");

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Username migration bootstrap bypass was not applied.");
    },
  };
}
