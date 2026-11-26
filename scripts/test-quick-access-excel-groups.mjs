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
assert.match(ui, /visibleGroups\.length \+ " Items(?: · "|")/);
assert.match(ui, /draft\.groupName/);
assert.match(edge, /group_name as "groupName"/);
assert.match(edge, /group_name=\$\{link\.groupName\}/);
assert.match(css, /qa-quick-group-link/);
console.log("PASS Quick Access Excel: six Items, ten exact source links, grouped choices, editable persisted group names");
const processSvg = readFileSync(new URL("../public/quick-access/process-workflow.svg", import.meta.url), "utf8");
assert.match(processSvg, /<svg[\s>]/, "Process icon is a real bundled SVG");
assert.match(ui, /group\.name === "Process"/, "Process should render a unique workflow icon");
assert.match(ui, /qa-quick-tile-label/g, "All tile names share the same explicit class");
assert.equal((ui.match(/className="qa-quick-tile-label"/g) || []).length, 2, "Both single links and folders use identical title markup");
assert.match(ui, /qa-quick-tile-count/, "Folder counts are badges, not different-sized title text");
assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/, "Two equal columns prevent uneven wrapping");
assert.match(css, /font: 600 12px\/17px/, "Tile title font size and line height must match");
assert.doesNotMatch(css, /\.qa-quick-tile span:last-child/, "No descendant selector that accidentally targets folder count");
assert.match(css, /\.qa-quick-icon--process img/, "Process icon should render independently of SharePoint favicon");
console.log("PASS Quick Access presentation: balanced two-column tiles, equal text, badge counts and distinct Process SVG");


assert.match(ui, /host === "operations-portal\.apps\.prod\.riderplatform\.com"\) return \["\/quick-access\/operations-portal\.png"\];/);
assert.match(ui, /host === "onecallvoicerecord\.dtac\.co\.th"\) return \["\/quick-access\/dtac-orkui\.png"\];/);
for (const asset of ["operations-portal.png", "dtac-orkui.png"]) {
  const png = readFileSync(new URL("../public/quick-access/" + asset, import.meta.url));
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16),24); assert.equal(png.readUInt32BE(20),24);
}
assert.match(ui, /host === "operations-portal\.apps\.prod\.riderplatform\.com"\) return "bike";/);
assert.match(ui, /host === "onecallvoicerecord\.dtac\.co\.th"\) return "file";/);
assert.doesNotMatch(ui, /host === "operations-portal\.apps\.prod\.riderplatform\.com"\) return "OPS";/);
assert.match(ui, /host === "adminpanel-v2-prod\.robinhood\.in\.th" \|\|\s+host === "adminpanel\.robinhood\.in\.th"\)\s+return \["\/robinhood-logo\.png", direct, googleFavicon\];/);
console.log("PASS Quick Access: user-supplied OPS and OrkUI favicon assets, no misleading server icons; Admin Panel unchanged");
