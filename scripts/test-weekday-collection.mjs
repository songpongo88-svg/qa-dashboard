import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as calendar from "../src/weekdayCollection.mjs";

const { getBangkokWeekdayTheme, millisecondsUntilBangkokMidnight, resolveWeekdayPreference } = calendar;
for (let day = 0; day < 7; day++) {
  const date = new Date(Date.UTC(2026, 8, 14 + day, 5));
  assert.equal(getBangkokWeekdayTheme(date), calendar.WEEKDAY_IDS[day]);
}
assert.equal(getBangkokWeekdayTheme(new Date("2026-09-14T16:59:59.999Z")), "weekday-monday");
assert.equal(getBangkokWeekdayTheme(new Date("2026-09-14T17:00:00.000Z")), "weekday-tuesday");
assert.equal(getBangkokWeekdayTheme(new Date("2026-09-20T17:00:00.000Z")), "weekday-monday");
assert.equal(getBangkokWeekdayTheme(new Date("2026-12-31T17:00:00.000Z")), "weekday-friday");
assert.equal(millisecondsUntilBangkokMidnight(new Date("2026-09-14T16:59:59.950Z")), 50);
assert.equal(millisecondsUntilBangkokMidnight(new Date("2026-09-14T17:00:00.000Z")), 86400000);
assert.equal(resolveWeekdayPreference("weekday-friday", new Date("2026-09-14T05:00:00Z")), "weekday-monday");
assert.equal(resolveWeekdayPreference("ocean", new Date("2026-09-14T05:00:00Z")), "ocean");

const customKey = "qa-dashboard:custom-theme-v1";
const baseKey = "qa-dashboard:theme-v1";
function runtimeHarness({ custom = "", base = "ocean", blocked = false } = {}) {
  let now = new Date("2026-09-14T16:59:59.000Z").getTime();
  const stored = new Map([[customKey, custom], [baseKey, base]]);
  const listeners = {};
  const timeouts = [];
  const root = { dataset: { qaTheme: base } };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock, Intl, console,
    CustomEvent: class { constructor(type,options){ this.type=type; this.detail=options?.detail; } },
    document: { documentElement: root, body: {}, hidden: false, querySelector: () => null, addEventListener: (name, fn) => { listeners[name] = fn; } },
    localStorage: {
      getItem: (key) => { if (blocked) throw Error("blocked"); return stored.get(key) || null; },
      setItem: (key, value) => { if (blocked) throw Error("blocked"); stored.set(key, value); },
      removeItem: (key) => { if (blocked) throw Error("blocked"); stored.delete(key); },
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
    clearTimeout: () => {}, setInterval: () => 1, requestAnimationFrame: (fn) => fn(),
    window: { dispatchEvent: event => { listeners[event.type]?.(event); return true; }, addEventListener: (name, fn) => { listeners[name] = fn; } },
  });
  const source = fs.readFileSync(new URL("../src/seasonalThemeRuntime2.ts", import.meta.url), "utf8").replace(/^import .*?;\n/, "").replace(/export \{\};?/, "");
  const calendarSource = fs.readFileSync(new URL("../src/weekdayCollection.mjs", import.meta.url), "utf8").replaceAll("export ", "");
  const exposed = calendarSource + "\n" + source + "\n globalThis.testApi = { applyEffectiveTheme, select: () => { sessionCustomTheme = WEEKDAY_COLLECTION_ID; applyEffectiveTheme(); } };";
  vm.runInContext(ts.transpileModule(exposed, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  return { root, stored, listeners, timeouts, api: context.testApi, setDate: (date) => { now = new Date(date).getTime(); } };
}
const h = runtimeHarness({ custom: "weekday-friday" });
h.api.applyEffectiveTheme();
assert.equal(h.root.dataset.qaTheme, "weekday-monday");
assert.equal(h.stored.get(customKey), "weekday-auto");
assert.equal(h.root.dataset.qaWeekdayCollection, "auto");
h.setDate("2026-09-14T17:00:00.100Z");
h.timeouts.find((timer) => timer.ms > 0).fn();
assert.equal(h.root.dataset.qaTheme, "weekday-tuesday");
h.setDate("2026-12-25T05:00:00Z");
h.api.applyEffectiveTheme();
assert.equal(h.root.dataset.qaTheme, "festival-christmas");
assert.equal(h.stored.get(customKey), "weekday-auto");
h.setDate("2027-01-10T05:00:00Z");
h.api.applyEffectiveTheme();
assert.equal(h.root.dataset.qaTheme, "weekday-sunday");
h.stored.delete(customKey);
h.listeners.storage({ key: customKey });
assert.equal(h.root.dataset.qaTheme, "ocean");
const weather = runtimeHarness({custom:"weather-auto"});
weather.setDate("2026-12-25T05:00:00Z"); weather.api.applyEffectiveTheme();
assert.equal(weather.root.dataset.qaTheme,"robinhood");
assert.equal(weather.root.dataset.qaFestivalOverride,"");
const ordinary = runtimeHarness();
ordinary.api.applyEffectiveTheme();
assert.equal(ordinary.root.dataset.qaTheme, "ocean");
const unavailable = runtimeHarness({ blocked: true });
unavailable.api.select();
assert.equal(unavailable.root.dataset.qaTheme, "weekday-monday");
unavailable.setDate("2026-09-14T17:00:00.100Z");
unavailable.listeners.focus();
assert.equal(unavailable.root.dataset.qaTheme, "weekday-tuesday");

const css = fs.readFileSync(new URL("../src/weekdayThemeEditorial.css", import.meta.url), "utf8");
assert.ok(!css.includes("--day-motif"));
assert.ok(fs.statSync(new URL("../public/weekday-scenes-v3.png", import.meta.url)).size > 100000);
console.log("Weekday collection: seven days, Bangkok midnight, legacy migration, festival restore, storage sync and blocked storage passed.");
