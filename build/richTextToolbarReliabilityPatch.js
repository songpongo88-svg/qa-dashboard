export function richTextToolbarReliabilityPatch() {
  return {
    name: "rich-text-toolbar-reliability",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/richText.tsx")) return null;

      const original = code;
      let next = code;

      // Never recapture selection after the pointer has already moved toward the toolbar.
      // Use only the last Range captured while the user was actually inside the editor.
      next = next.replace(
        `  target.rememberSelection();\n  target.restoreSelection();\n  target.element.focus({ preventScroll: true });\n  target.restoreSelection();`,
        `  // Restore the last Range captured inside the editor before the toolbar takes pointer focus.\n  target.restoreSelection();\n  target.element.focus({ preventScroll: true });\n  target.restoreSelection();`
      );

      // Prevent the toolbar surface from taking focus. This keeps the highlighted text alive
      // while buttons/colors/table actions execute against the saved Range.
      next = next.replace(
        `<div className={\`rounded-[22px] border border-violet-200 bg-white shadow-[0_14px_38px_rgba(76,29,149,0.12)] \${className}\`}>`,
        `<div data-rich-text-toolbar="true" onMouseDownCapture={(event) => { event.preventDefault(); target?.restoreSelection(); }} className={\`rounded-[22px] border border-violet-200 bg-white shadow-[0_14px_38px_rgba(76,29,149,0.12)] \${className}\`}>`
      );

      next = next.replace(
        `<div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกช่องข้อความก่อน แล้วใช้เครื่องมือชุดนี้ได้ทันที</div>`,
        `<div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกข้อความในช่อง Rich Text เช่น Case Description หรือ Sticky Note แล้วใช้เครื่องมือได้ทันที</div>`
      );

      // Programmatic focus from the toolbar must not overwrite the stored highlighted Range
      // with a collapsed caret. MouseUp/KeyUp remain responsible for capturing live selection.
      next = next.replace(
        `        onFocus={() => {\n          activateEditor();\n          rememberSelection();\n        }}`,
        `        onFocus={() => {\n          activateEditor();\n        }}`
      );

      next = next.replace(
        `        onBlur={() => commit(true)}`,
        `        onBlur={() => {\n          rememberSelection();\n          commit(true);\n        }}`
      );

      next = next.replace(
        `          document.execCommand("insertText", false, text);\n          commit(false);`,
        `          document.execCommand("insertText", false, text);\n          rememberSelection();\n          commit(false);`
      );

      if (!next.includes('data-rich-text-toolbar="true"')) throw new Error("Rich Text toolbar patch failed: toolbar surface marker missing");
      if (!next.includes("event.preventDefault(); target?.restoreSelection();")) throw new Error("Rich Text toolbar patch failed: toolbar still steals focus");
      if (!next.includes("target.restoreSelection();\n  target.element.focus")) throw new Error("Rich Text toolbar patch failed: stable Range restore missing");
      if (next.includes("onFocus={() => {\n          activateEditor();\n          rememberSelection();")) throw new Error("Rich Text toolbar patch failed: focus still overwrites highlighted Range");
      if (!next.includes("rememberSelection();\n          commit(true);")) throw new Error("Rich Text toolbar patch failed: blur selection capture missing");
      if (next === original) throw new Error("Rich Text toolbar patch failed: no source changes were applied");

      return { code: next, map: null };
    },
  };
}
