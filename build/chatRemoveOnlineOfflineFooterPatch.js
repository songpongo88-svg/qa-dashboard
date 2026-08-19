export function chatRemoveOnlineOfflineFooterPatch() {
  let patched = false;

  return {
    name: "chat-remove-online-offline-footer",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/TeamChatV2.tsx")) return null;

      const footer = `            <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-500">\n              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Online {contacts.filter((user) => user.online).length}</span>\n              <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />Offline {contacts.filter((user) => !user.online).length}</span>\n            </div>\n`;

      if (!code.includes(footer)) {
        this.error("Chat footer removal patch could not find Online/Offline summary footer.");
      }

      patched = true;
      return { code: code.replace(footer, ""), map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Chat Online/Offline footer removal patch was not applied.");
    },
  };
}
