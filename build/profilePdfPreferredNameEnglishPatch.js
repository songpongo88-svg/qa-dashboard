export function profilePdfPreferredNameEnglishPatch() {
  let patched = false;

  return {
    name: "profile-pdf-preferred-name-english",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/CorporateUserDirectoryProfile.tsx")) return null;

      const anchor = '    add("ชื่อเล่น", savedMeta.preferredName);';
      if (!code.includes(anchor)) {
        this.error("Profile PDF preferred-name patch could not find the Thai label anchor.");
      }

      const next = code.replace(
        anchor,
        '    add("Preferred Name", savedMeta.preferredName);'
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) {
        this.error("Profile PDF preferred-name patch was not applied.");
      }
    },
  };
}
