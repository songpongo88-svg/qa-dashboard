import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { assessmentReasonRawTextPatch } from '../build/assessmentReasonRawTextPatch.js';
import { richTextToolbarReliabilityPatch } from '../build/richTextToolbarReliabilityPatch.js';

const rootPath = fileURLToPath(new URL('../', import.meta.url));
const cachePath = path.join(rootPath, 'node_modules/.cache');
mkdirSync(cachePath, { recursive: true });
const tempPath = mkdtempSync(path.join(cachePath, 'toolbar-test-'));
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'Node', 'HTMLElement', 'DOMParser', 'Event', 'MouseEvent']) {
  globalThis[key] = dom.window[key];
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act, createElement: h } = React;
const root = createRoot(document.getElementById('root'));

try {
  const source = readFileSync(path.join(rootPath, 'src/richText.tsx'), 'utf8');
  richTextToolbarReliabilityPatch().transform(source, '/src/richText.tsx');
  const modulePath = path.join(tempPath, 'richText.mjs');
  writeFileSync(modulePath, transformSync(source, { loader: 'tsx', jsx: 'automatic', format: 'esm' }).code);
  const { RichTextEditor, RichTextToolbar, RichTextContent, sanitizeRichTextHtml, richTextToPlainText, parseRichTextRuns, hasRichTextContent } = await import(pathToFileURL(modulePath).href);

  const formSource = readFileSync(path.join(rootPath, 'src/CreateEvaluationMockup.tsx'), 'utf8');
  const transformedForm = assessmentReasonRawTextPatch().transform(formSource, '/src/CreateEvaluationMockup.tsx').code;
  assert.match(transformedForm, /<RichTextEditor\s+value=\{topicState\[topic.code\]\?\.reason[\s\S]*?editorLabel=\{`Assessment Reason · \$\{topic.code\}`\}\s+preserveWhitespace/);
  assert.doesNotMatch(transformedForm, /<AutoGrowTextarea\s+value=\{topicState\[topic.code\]\?\.reason/);
  console.log('PASS: the production transform retains an Assessment Reason rich-text editor');

  const raw = '  เหตุผลบรรทัดแรก\n\n\nบรรทัดสุดท้าย  \n';
  const html = sanitizeRichTextHtml(raw, true);
  assert.equal(richTextToPlainText(html, true), raw);
  assert.equal(richTextToPlainText(raw, true), raw);
  assert.equal(richTextToPlainText('a<br><br><br>b'), 'a\n\n\nb');
  const formatted = '<span style="font-weight: bold; color: rgb(220, 38, 38); text-decoration: underline;">เหตุผล</span><br><br><br>บรรทัดท้าย<br>';
  const saved = JSON.parse(JSON.stringify({ topics: [{ comment: sanitizeRichTextHtml(formatted, true) }] })).topics[0].comment;
  assert.equal(richTextToPlainText(saved, true), 'เหตุผล\n\n\nบรรทัดท้าย\n');
  assert.deepEqual(parseRichTextRuns(saved, true)[0], { text: 'เหตุผล', bold: true, underline: true, color: '#dc2626' });
  assert.doesNotMatch(sanitizeRichTextHtml('<b onclick="alert(1)">safe</b><script>alert(2)</script>', true), /onclick|script|alert/);
  assert.ok(hasRichTextContent('<table><tr><td><br></td></tr></table>'));
  assert.ok(hasRichTextContent('<hr>'));
  console.log('PASS: formatting, Thai text, whitespace and structural content survive serialization');

  const values = { reason: raw, description: 'Case description', note: 'Sticky note' };
  let generation = 0;
  const render = () => act(() => root.render(h(React.Fragment, null,
    h(RichTextToolbar),
    ...Object.entries(values).map(([key, value]) => h(RichTextEditor, {
      key: `${key}-${generation}`, value, editorLabel: key, placeholder: key,
      preserveWhitespace: key === 'reason', onChange: next => { values[key] = next; render(); },
    })),
    h('textarea', { 'aria-label': 'plain inquiry' }),
    h(RichTextContent, { value: values.reason, preserveWhitespace: true }),
  )));
  const editor = key => document.querySelector(`[data-rich-text-editor][aria-label="${key}"]`);
  const button = label => [...document.querySelectorAll('button')].find(node => node.getAttribute('aria-label') === label || node.textContent.trim() === label);
  const select = (key, start = 0, end = 4) => act(() => {
    const element = editor(key);
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, start);
    range.setEnd(element.firstChild, end);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  const click = label => act(() => {
    const node = button(label);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    node.dispatchEvent(down);
    assert.ok(down.defaultPrevented, 'toolbar mouse-down must preserve editor focus');
    node.click();
  });

  // jsdom has no native editing engine. Verify the application boundary: each
  // action must reach execCommand with the right editor and original selection.
  // Native formatting/undo behavior still needs a real-browser smoke check.
  const calls = [];
  document.execCommand = (command, _showUi, value) => {
    if (command === 'styleWithCSS') return true;
    calls.push({ command, value, editor: document.activeElement.getAttribute('aria-label'), selection: window.getSelection().toString() });
    if (command === 'insertHTML') {
      const range = window.getSelection().getRangeAt(0);
      range.deleteContents();
      range.insertNode(range.createContextualFragment(value));
    }
    return true;
  };

  render();
  assert.ok(button('ตัวหนา').disabled);
  for (const key of ['reason', 'description', 'note']) {
    select(key);
    assert.ok(!button('ตัวหนา').disabled, `${key} must activate the toolbar`);
    const selected = window.getSelection().toString();
    for (const [label, command] of [['ตัวหนา', 'bold'], ['ตัวเอียง', 'italic'], ['ขีดเส้นใต้', 'underline'], ['สีตัวอักษร #dc2626', 'foreColor'], ['ล้างรูปแบบ', 'removeFormat']]) {
      click(label);
      assert.equal(calls.at(-1).command, command);
      assert.equal(calls.at(-1).editor, key);
      assert.equal(calls.at(-1).selection, selected);
    }
  }
  assert.equal(values.reason, raw, 'focusing and leaving an unchanged reason must retain its raw string');
  console.log('PASS: all three fields activate formatting commands and retain the selected range');

  select('reason');
  const selected = window.getSelection().toString();
  act(() => { button('ตัวหนา').focus(); button('ตัวหนา').click(); });
  assert.equal(calls.at(-1).selection, selected, 'keyboard activation must restore the selection');
  act(() => document.querySelector('textarea').focus());
  assert.ok(button('ตัวหนา').disabled, 'an unrelated plain-text field must not format the previous editor');
  console.log('PASS: keyboard activation and field switching use the correct target');

  for (const [markup, expected] of [
    ['พิมพ์ใหม่<br><br><br>ท้าย<br>', 'พิมพ์ใหม่\n\n\nท้าย\n'],
    ['พิมพ์ใหม่<div><br></div><div><br></div><div>ท้าย</div>', 'พิมพ์ใหม่\n\n\nท้าย'],
    ['<div>เริ่ม</div><div><br></div><div><br></div>', 'เริ่ม\n\n'],
    ['  เว้นวรรคต้นและท้าย  ', '  เว้นวรรคต้นและท้าย  '],
  ]) {
    act(() => {
      editor('reason').focus();
      editor('reason').innerHTML = markup;
      editor('reason').dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(values.reason, expected, 'unformatted input must remain plain text with exact blank lines');
  }
  console.log('PASS: typing and browser-created paragraph blocks retain plain text and blank lines');

  values.reason = '';
  generation += 1;
  render();
  act(() => editor('reason').focus());
  click('▦ ตาราง');
  click('2 × 2');
  assert.match(values.reason, /<table>/);
  assert.equal(editor('reason').querySelectorAll('td').length, 4);
  const roundTrip = JSON.parse(JSON.stringify(values));
  generation += 1;
  render();
  assert.equal(editor('reason').querySelectorAll('td').length, 4);
  assert.equal(values.reason, roundTrip.reason);
  values.reason = '';
  generation += 1;
  render();
  act(() => editor('reason').focus());
  click('— เส้นคั่น');
  assert.match(values.reason, /<hr>/);
  console.log('PASS: empty tables and dividers remain saved and reload into the editor');
} finally {
  act(() => root.unmount());
  dom.window.close();
  rmSync(tempPath, { recursive: true, force: true });
}
