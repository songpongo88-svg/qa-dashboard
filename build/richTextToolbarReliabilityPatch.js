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
        `<div className="mt-0.5 text-xs font-semibold text-slate-500">เลือกข้อความใน Assessment Reason, Case Description หรือ Sticky Note แล้วใช้เครื่องมือได้ทันที</div>`
      );

      // Preserve repeated blank lines. Do not collapse 3+ BR/newline sequences.
      next = next.replace(
        `  return output.innerHTML\n    .replace(/(?:<br>\\s*){3,}/gi, "<br><br>")\n    .trim();`,
        `  return output.innerHTML.trim();`
      );
      next = next.replace(
        `    .replace(/[ \\t]+\\n/g, "\\n")\n    .replace(/\\n{3,}/g, "\\n\\n")\n    .trim();`,
        `    .replace(/[ \\t]+\\n/g, "\\n")\n    .trim();`
      );

      // Add a raw-text-preserving mode for Assessment Reason. Plain text stays plain text
      // (including repeated blank lines); HTML is stored only after the user applies formatting.
      const editorAnchor = `export function RichTextEditor({`;
      if (!next.includes("function richEditorPlainTextV2")) {
        const helper = `function richEditorPlainTextV2(root: HTMLElement) {\n  let text = \"\";\n  const blockTags = new Set([\"DIV\", \"P\", \"LI\"]);\n  const walk = (node: Node) => {\n    if (node.nodeType === Node.TEXT_NODE) {\n      text += String(node.textContent || \"\").replace(/\\u00a0/g, \" \ ");\n      return;\n    }\n    if (node.nodeType !== Node.ELEMENT_NODE) return;\n    const element = node as HTMLElement;\n    const tag = element.tagName.toUpperCase();\n    if (tag === \"BR\") {\n      text += \"\\n\";\n      return;\n    }\n    const isBlock = blockTags.has(tag);\n    if (isBlock && text && !text.endsWith(\"\\n\")) text += \"\\n\";\n    Array.from(element.childNodes).forEach(walk);\n    if (isBlock && !text.endsWith(\"\\n\")) text += \"\\n\";\n  };\n  Array.from(root.childNodes).forEach(walk);\n  return text.replace(/\\r/g, \"\").replace(/\\u00a0/g, \" \ ").replace(/\\n$/, \"\");\n}\n\nfunction richEditorHasFormattingV2(html: string) {\n  return /<(?:strong|b|em|i|u|span|table|thead|tbody|tfoot|tr|td|th|hr|ul|ol|li)\\b/i.test(html);\n}\n\n`;
        if (!next.includes(editorAnchor)) throw new Error("Rich Text toolbar patch failed: RichTextEditor anchor missing");
        next = next.replace(editorAnchor, helper + editorAnchor);
      }

      next = next.replace(
        `  editorLabel = "ช่องข้อความ",\n}: {`,
        `  editorLabel = "ช่องข้อความ",\n  preservePlainText = false,\n}: {`
      );
      next = next.replace(
        `  editorLabel?: string;\n}) {`,
        `  editorLabel?: string;\n  preservePlainText?: boolean;\n}) {`
      );

      next = next.replace(
        `    const safeHtml = sanitizeRichTextHtml(value);\n    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;\n  }, [value]);`,
        `    const safeHtml = preservePlainText && !looksLikeRichText(value)\n      ? plainTextToHtml(String(value || ""))\n      : sanitizeRichTextHtml(value);\n    if (editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;\n  }, [value, preservePlainText]);`
      );

      next = next.replace(
        `    const safeHtml = sanitizeRichTextHtml(editor.innerHTML);\n    if (normalizeEditor && editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;\n    onChange(hasRichTextContent(safeHtml) ? safeHtml : "");`,
        `    const rawHtml = editor.innerHTML;\n    if (preservePlainText && !richEditorHasFormattingV2(rawHtml)) {\n      const rawText = richEditorPlainTextV2(editor);\n      onChange(rawText);\n      return;\n    }\n    const safeHtml = sanitizeRichTextHtml(rawHtml);\n    if (normalizeEditor && editor.innerHTML !== safeHtml) editor.innerHTML = safeHtml;\n    onChange(hasRichTextContent(safeHtml) ? safeHtml : "");`
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
      if (!next.includes("preservePlainText?: boolean")) throw new Error("Rich Text toolbar patch failed: raw-text preserving editor mode missing");
      if (!next.includes("richEditorPlainTextV2")) throw new Error("Rich Text toolbar patch failed: plain text serializer missing");
      if (next === original) throw new Error("Rich Text toolbar patch failed: no source changes were applied");

      return { code: next, map: null };
    },
  };
}
