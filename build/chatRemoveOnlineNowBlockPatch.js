export function chatRemoveOnlineNowBlockPatch() {
  let patched = false;

  return {
    name: "chat-move-online-now-above-all-team",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/TeamChatV2.tsx")) return null;

      const startMarker = '              <div className="group relative mt-2 flex cursor-default items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3">';
      const endMarker = '              <div className="max-h-[560px] overflow-y-auto pr-1">';
      const conversationsMarker = '            <div className="mt-4 space-y-1">';

      const start = code.indexOf(startMarker);
      const end = code.indexOf(endMarker, start >= 0 ? start : 0);

      if (start < 0 || end < 0 || end <= start) {
        this.error("Chat Online Now move patch could not find the sidebar Online Now block.");
      }

      const onlineNowBlock = code.slice(start, end);
      const withoutOnlineNow = code.slice(0, start) + code.slice(end);
      const conversationsStart = withoutOnlineNow.indexOf(conversationsMarker);

      if (conversationsStart < 0) {
        this.error("Chat Online Now move patch could not find the All Team conversation section.");
      }

      const insertAt = conversationsStart + conversationsMarker.length;
      const movedBlock = `\n${onlineNowBlock}`;
      const next = withoutOnlineNow.slice(0, insertAt) + movedBlock + withoutOnlineNow.slice(insertAt);

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Chat Online Now move patch was not applied.");
    },
  };
}
