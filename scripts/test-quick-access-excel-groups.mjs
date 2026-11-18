import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../src/QuickAccessMenu.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/qa-dashboard-quick-access/index.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/quickAccess.css", import.meta.url), "utf8");

const catalog = ui.match(/const INITIAL_LINKS: QuickLink\[\] = \[([\s\S]*?)\];/)?.[1] || "";
const entries = [...catalog.matchAll(/\{ id:"initial-[^"]+", title:"([^"]+)", url:"([^"]+)", category:"[^"]+", icon:"[^"]+", sortOrder:\d+, groupName:"([^"]+)" \}/g)]
  .map((match) => ({ title: match[1], url: match[2], group: match[3] }));
assert.equal(entries.length, 10, "Excel catalog must have exactly ten links");
const order = ["Oho Chat","Process","Admin Panel","Operations Portal","Sheet Share Point","Promotion Check"];
assert.deepEqual([...new Set(entries.map((item) => item.group))], order, "Excel group order must be retained");
assert.equal(entries.filter((item) => item.group === "Admin Panel").length, 2);
assert.equal(entries.filter((item) => item.group === "Sheet Share Point").length, 4);
assert.ok(entries.every((item) => item.url.startsWith("https://")));
assert.ok(entries.some((item) => item.title === "New Procees 2026"), "Keep Excel's original display label");
assert.ok(entries.some((item) => item.title === "promotion-engine"));
assert.ok(entries.some((item) => item.title.startsWith("แบบทดสอบวัดความรู้ผู้เข้าอบรมคนขับใหม่")));
assert.ok(!catalog.includes("Consumer Profile"), "Hide legacy shortcut not in Excel");
assert.match(ui, /group\.links\.length === 1 \?/);
assert.match(ui, /mode === "group"/);
assert.match(ui, /visibleGroups\.length \+ " Items"/);
assert.match(ui, /draft\.groupName/);
assert.match(edge, /group_name as "groupName"/);
assert.match(edge, /group_name=\$\{link\.groupName\}/);
assert.match(css, /qa-quick-group-link/);
console.log("PASS Quick Access Excel: six Items, ten exact source links, grouped choices, editable persisted group names");
