// Editor behavior lives in the source component. This guard prevents a future
// source replacement from silently restoring the broken toolbar behavior.
export function richTextToolbarReliabilityPatch() {
  return {
    name: "rich-text-toolbar-reliability",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").split("?")[0].endsWith("/src/richText.tsx")) return null;
      if (!code.includes('data-rich-text-toolbar="true"') || !code.includes('data-rich-text-editor="true"')) {
        throw new Error("Rich Text toolbar guard failed: editor/toolbar registration is missing");
      }
      if (!code.includes('document.addEventListener("selectionchange", captureSelection)')) {
        throw new Error("Rich Text toolbar guard failed: selection tracking is missing");
      }
      if (!code.includes("onClick={() => runActiveEditorCommand(command)}")) {
        throw new Error("Rich Text toolbar guard failed: accessible command activation is missing");
      }
      return null;
    },
  };
}
