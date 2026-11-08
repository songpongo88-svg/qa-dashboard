import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { checkGuideReview, recordGuideReview } from './check-user-guide.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(rootDir, 'node_modules/.cache'); fs.mkdirSync(cache, { recursive: true });
const temp = fs.mkdtempSync(path.join(cache, 'knowledge-test-'));
const require = createRequire(import.meta.url);
const fixture = path.join(rootDir, 'scripts/fixtures/knowledge-firestore.mjs');
const entry = [
  'export * from "./src/knowledge/model.ts";', 'export * from "./src/knowledge/guideModel.ts";',
  'export * from "./src/knowledge/termsStore.ts";', 'export * from "./src/knowledge/guideStore.ts";',
  'export * from "./src/knowledge/Terms.tsx";', 'export { default as TermsWorkspace } from "./src/knowledge/Terms.tsx";',
  'export { default as UserGuide } from "./src/knowledge/UserGuide.tsx";', 'export * from "./src/knowledge/pdf.ts";', 'export * from "./src/officialPdf.ts";', 'export {pdfState} from "./scripts/fixtures/knowledge-pdfjs.mjs";',
  'export { state as mock, reset as resetMock } from "./scripts/fixtures/knowledge-firestore.mjs";',
].join('\n');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'https://local.qa.test/' });
for (const key of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'MouseEvent', 'HTMLCanvasElement']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { constructor(callback){this.callback=callback;} observe(){this.callback([{contentRect:{width:760}}]);} disconnect(){} };
dom.window.HTMLCanvasElement.prototype.getContext = () => ({});
globalThis.fetch = async (url) => { assert.match(String(url), /^\/guide\/[a-z0-9-]+\.png$/); return new Response(fs.readFileSync(path.join(rootDir,'public',String(url))),{status:200}); };

let root;
try {
  await build({ stdin: { contents: entry, resolveDir: rootDir, loader: 'ts' }, outfile: path.join(temp, 'bundle.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'isolated-knowledge-transport', setup(plugin) {
    plugin.onResolve({ filter: /^pdfjs-dist$/ },()=>({path:path.join(rootDir,'scripts/fixtures/knowledge-pdfjs.mjs')}));
    plugin.onResolve({ filter: /pdf\.worker.*\?url$/ },()=>({path:'pdf-worker',namespace:'pdf-worker'}));
    plugin.onLoad({filter:/.*/,namespace:'pdf-worker'},()=>({contents:'export default "/test-pdf-worker.mjs";'}));
    plugin.onResolve({ filter: /pdfjs-dist\/web\/pdf_viewer\.css$/ },()=>({path:'pdf-style',namespace:'pdf-style'}));
    plugin.onLoad({filter:/.*/,namespace:'pdf-style'},()=>({contents:'',loader:'js'}));
    plugin.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: fixture }));
    plugin.onResolve({ filter: /\/(firebaseClient|sessionStore|signatureStore)$/ }, () => ({ path: fixture }));
  } }] });
  const k = require(path.join(temp, 'bundle.cjs'));
  const user = { ...k.mock.identity };
  const confirmed = { confirmed: true, readToEnd: true, signatureDataUrl: '', signatureSource: 'none' };
  const currentHash = await k.documentHash(k.CURRENT_TERMS);
  assert.throws(() => k.validateTermsInput({ ...confirmed, confirmed: false }));
  assert.throws(() => k.validateTermsInput({ ...confirmed, readToEnd: false }));
  assert.throws(() => k.validateTermsInput({ ...confirmed, signatureDataUrl: 'https://outside.invalid/pixel', signatureSource: 'saved' }));
  assert.equal(k.acceptanceId(' Test.Agent ', '1.0'), 'test.agent__1.0');
  assert.equal(k.CURRENT_TERMS.version, '1.2');
  assert.deepEqual(k.TERMS_VERSIONS, ['1.2', '1.1', '1.0']);
  console.log('PASS: explicit confirmation, reading checkpoint and signature validation');

  const legacyId = k.acceptanceId(user.username, '1.1');
  const legacy = { username: user.username, user: { ...user }, version: '1.1', contentHash: 'legacy-hash',
    document: { ...k.CURRENT_TERMS, version: '1.1', statement: 'Original acknowledgement' }, status: 'Accepted',
    acceptedAtServer: { toDate: () => new Date('2026-10-10T03:00:00.000Z') }, signatureDataUrl: '', signatureSource: 'none' };
  k.mock.docs.set('qa_terms_acceptances/' + legacyId, legacy);
  const legacyBefore = JSON.stringify(legacy);
  k.mock.reads.length = 0;
  const missing = await Promise.all(Array.from({ length: 20 }, () => k.termsRepository.current(user)));
  assert.ok(missing.every((record) => record === null), 'v1.1 must not unlock v1.2');
  assert.equal(k.mock.reads.length, 1, 'concurrent gate checks share one current-edition read');
  const simultaneous = await Promise.all(Array.from({ length: 20 }, () => k.termsRepository.accept(user, confirmed)));
  const accepted = simultaneous[0];
  assert.ok(simultaneous.every((record) => record.acceptedAt === accepted.acceptedAt));
  assert.equal(k.mock.reads.length, 6, 'one gate + two session + profile + transaction + confirmation reads');
  assert.equal(k.mock.writes.length, 1, 'only an explicit acknowledgement creates a new receipt');
  assert.equal(JSON.stringify(k.mock.docs.get('qa_terms_acceptances/' + legacyId)), legacyBefore);
  assert.ok((await k.termsRepository.history(user)).some((record) => record.version === '1.1'));
  console.log('PASS: v1.2 needs explicit reacceptance; 20 concurrent attempts use 6 reads / 1 write; v1.1 evidence remains');

  const again = await k.termsRepository.accept(user, confirmed);
  assert.equal(accepted.acceptedAt, again.acceptedAt);
  assert.equal(k.mock.writes.filter((item) => item.startsWith('qa_terms_acceptances/')).length, 1);
  assert.ok(k.mock.writes.every((item) => !item.includes('signature')));
  assert.equal(accepted.document.statement, k.CURRENT_TERMS.statement);
  assert.equal(accepted.contentHash, currentHash);
  assert.ok(k.isCurrentAcceptance(accepted, user.username, currentHash));
  assert.equal(k.isCurrentAcceptance(accepted, 'another.user', currentHash), false);
  assert.equal(k.isCurrentAcceptance({ ...accepted, version: '0.9' }, user.username, currentHash), false);
  assert.equal(k.isCurrentAcceptance(accepted, user.username, 'different'), false);
  console.log('PASS: first acceptance wins with server time, wording snapshot and no monthly signature writes');

  const saved = k.mock.docs.get('qa_terms_acceptances/' + accepted.id);
  saved.contentHash = 'different';
  await assert.rejects(k.termsRepository.accept(user, confirmed), /เวอร์ชันใหม่/);
  saved.contentHash = currentHash;
  await assert.rejects(k.termsRepository.accept({ ...user, sessionId: 'wrong' }, confirmed), /ยืนยันบัญชี/);
  const isolated = await Promise.allSettled([
    k.termsRepository.accept(user, confirmed), k.termsRepository.accept({ ...user, sessionId: 'wrong' }, confirmed),
  ]);
  assert.equal(isolated[0].status, 'fulfilled'); assert.equal(isolated[1].status, 'rejected');
  k.mock.failRead = true;
  await assert.rejects(k.termsRepository.current(user), /offline/);
  k.mock.failRead = false;
  assert.equal((await k.termsRepository.current(user)).id, accepted.id, 'failed requests are never cached');
  await assert.rejects(k.termsRepository.management(user), /ไม่มีสิทธิ์/);
  await assert.rejects(k.guideRepository.publish(user, k.MANUAL.chapters[0], 0), /ไม่มีสิทธิ์/);
  console.log('PASS: conflicting wording, invalid sessions and unauthorized management are rejected');

  // A team transfer retains the acknowledgement, while a manager cannot see another current team.
  k.mock.identity.role = 'Supervisor';
  k.mock.docs.set('qa_role_permissions/Supervisor', { permissions: { manageUsers: true, viewAllTeams: false, manageRubric: true } });
  k.mock.docs.set('qa_user_profiles/test.agent', { ...k.mock.identity });
  k.mock.docs.set('qa_user_profiles/other.agent', { username: 'other.agent', displayName: 'Other Agent', role: 'Admin Live Chat', teamName: 'Team B' });
  saved.teamName = 'Old Team';
  k.mock.docs.set('qa_terms_acceptances/' + k.acceptanceId('other.agent', k.CURRENT_TERMS.version), { ...saved, username: 'other.agent', user: { ...saved.user, username: 'other.agent' } });
  const managed = await k.termsRepository.management(user);
  assert.equal(managed.accounts.length, 1); assert.equal(managed.records.length, 1); assert.equal(managed.records[0].username, 'test.agent');
  const previousEdition = await k.termsRepository.management(user, '1.1');
  assert.equal(previousEdition.records.length, 1); assert.equal(previousEdition.records[0].version, '1.1');
  const teamQueries = k.mock.queries.filter((row) => row.path === 'qa_terms_acceptances' && row.conditions?.some((condition) => condition.field === '__name__'));
  assert.ok(teamQueries.length >= 2);
  assert.ok(teamQueries.at(-1).conditions[0].value.every((id) => id.endsWith('__1.1')));
  console.log('PASS: current team scope includes transferred users without exposing another team');

  k.mock.docs.set('qa_role_permissions/Supervisor', { permissions: { manageUsers: true, viewAllTeams: true, manageRubric: true } });
  const queryStart = k.mock.queries.length;
  const globalManaged = await k.termsRepository.management(user);
  assert.ok(globalManaged.records.every((record) => record.version === '1.2'));
  const receiptQueries = k.mock.queries.slice(queryStart).filter((row) => row.path === 'qa_terms_acceptances');
  assert.deepEqual(receiptQueries.map((row) => row.conditions), [[{ field: 'version', op: '==', value: '1.2' }]]);
  const writeCount = k.mock.writes.length;
  assert.ok((await k.termsRepository.management(user, '1.1')).records.some((record) => record.version === '1.1'));
  assert.equal(k.mock.writes.length, writeCount, 'switching historical editions is read-only');
  console.log('PASS: management reads only the selected edition; historical views never rewrite receipts');

  const originalIdentity = { ...k.mock.identity };
  const readsBeforeGroup = k.mock.reads.length, writesBeforeGroup = k.mock.writes.length;
  const simulatedReceipts = [];
  try {
    for (let index = 0; index < 100; index++) {
      Object.assign(k.mock.identity, { username: `quota.agent.${index}`, sessionId: `quota-session-${index}` });
      const account = { ...k.mock.identity };
      assert.equal(await k.termsRepository.current(account), null);
      const receipt = await k.termsRepository.accept(account, confirmed);
      simulatedReceipts.push('qa_terms_acceptances/' + receipt.id);
    }
    assert.equal(k.mock.reads.length - readsBeforeGroup, 600);
    assert.equal(k.mock.writes.length - writesBeforeGroup, 100);
    assert.ok(k.mock.writes.slice(writesBeforeGroup).every((path) => path.startsWith('qa_terms_acceptances/')));
  } finally {
    Object.assign(k.mock.identity, originalIdentity);
    for (const path of simulatedReceipts) k.mock.docs.delete(path);
    k.mock.writes.length = writesBeforeGroup;
  }
  console.log('PASS: 100 simulated users use 600 reads / 100 writes; no bulk user, score, wallet or old-receipt writes');

  const chapter = k.MANUAL.chapters[0];
  await k.guideRepository.publish(user, { ...chapter, title: 'คู่มือที่แก้ไข', permissions: [] }, 0);
  const guide = await k.guideRepository.load();
  assert.equal(guide.chapters[0].title, 'คู่มือที่แก้ไข'); assert.equal(guide.chapters[0].revision, 1);
  await assert.rejects(k.guideRepository.publish(user, chapter, 0), /มีผู้เผยแพร่/);
  const guideRow = k.mock.docs.get('qa_user_guide_chapters/' + chapter.id); guideRow.baseContentHash = 'old-base';
  const stale = await k.guideRepository.load();
  assert.equal(stale.chapters[0].title, chapter.title); assert.ok(stale.stale.includes(chapter.id)); assert.equal(stale.chapters[0].revision, 1);
  assert.equal(k.mock.docs.has('qa_user_guide_history/' + chapter.id + '__1'), true);
  const onlyAgent = k.MANUAL.chapters.filter((row) => k.canReadChapter(row, { viewDashboard: true, submitAppeal: true }));
  assert.equal(onlyAgent.some((row) => row.id === 'appeal-review'), true, 'every role can read the guide for its scoped Appeal Review');
  assert.equal(onlyAgent.some((row) => row.id === 'administration'), false);
  assert.ok(k.findChapters(onlyAgent, 'Last Updated').some(chapter=>chapter.id==='case-detail'));
  assert.equal(k.contextualChapter('case:AA0000|Test', onlyAgent), 'case-detail');
  assert.throws(() => k.cleanGuideContent(chapter, { ...chapter, images: [{ src: 'https://external.invalid/x.png', caption: '' }] }));
  console.log('PASS: role-aware guide, search, immutable revisions and stale-override protection');

  const React = require('react'); const act = React.act || require('react-dom/test-utils').act; const { createRoot } = require('react-dom/client');
  root = createRoot(document.getElementById('root'));
  const h = React.createElement;
  const settle = async (predicate) => { for (let i = 0; i < 40 && !predicate(); i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); assert.ok(predicate(), 'UI did not settle'); };
  const button = (label) => [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
  let calls = 0;
  const fakeRepo = { ...k.termsRepository, current: async () => null, accept: async () => { calls++; if (calls === 1) throw Object.assign(new Error('quota exceeded'), { code: 'resource-exhausted' }); return accepted; } };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 900 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 });
  await act(async () => root.render(h(k.TermsAccessBoundary, { user, onLogout() {}, repository: fakeRepo }, h('div', { id: 'protected' }, 'Workspace'))));
  await settle(() => button('รับทราบและยอมรับ'));
  assert.equal(document.getElementById('protected'), null); assert.equal(document.querySelector('input[type=checkbox]').disabled, true);
  await act(async () => { const scroll = document.querySelector('.terms-scroll'); scroll.scrollTop = 700; scroll.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await act(async () => document.querySelector('input[type=checkbox]').click());
  await act(async () => { button('รับทราบและยอมรับ').click(); button('รับทราบและยอมรับ').click(); });
  await settle(() => document.querySelector('[role=alert]'));
  assert.equal(calls, 1, 'double clicking cannot start a second save before React renders');
  assert.match(document.querySelector('[role=alert]').textContent, /เกินโควตา/);
  assert.equal(document.getElementById('protected'), null);
  await act(async () => button('รับทราบและยอมรับ').click());
  await settle(() => document.getElementById('protected'));
  console.log('PASS: workspace stays blocked until a successful confirmed write; failed saves can retry');

  const requestedEditions = [];
  const managementRepo = { ...fakeRepo, management: async (_user, version) => {
    requestedEditions.push(version);
    return { accounts: [{ ...user, status: 'Active' }], records: version === '1.1'
      ? [{ ...accepted, id: legacyId, version: '1.1', document: legacy.document }] : [accepted] };
  } };
  await act(async () => root.render(h(k.TermsWorkspace, { user, management: true, canManage: true, repository: managementRepo })));
  await settle(() => document.querySelector('.knowledge-stats'));
  assert.deepEqual(requestedEditions, ['1.2']);
  await act(async () => { const select = document.querySelectorAll('.knowledge-filters select')[1]; select.value = '1.1'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle(() => requestedEditions.length === 2 && document.querySelector('.knowledge-stats'));
  assert.deepEqual(requestedEditions, ['1.2', '1.1']);
  await act(async () => button('ดูรายละเอียด').click());
  assert.match(document.querySelector('.knowledge-record').textContent, /Original acknowledgement/);
  await act(async () => { const select = document.querySelector('.knowledge-filters select'); select.value = 'accepted'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(requestedEditions.length, 2, 'status filters and receipt details use already loaded records');
  console.log('PASS: choosing an older edition reloads only that edition; filters/details add no reads');

  await act(async () => root.render(h(k.TermsWorkspace, { user, management: true, canManage: true, repository: { ...fakeRepo, management: async () => { throw new Error('offline'); } } })));
  await settle(() => document.querySelector('[role=alert]'));
  assert.equal(document.querySelector('.knowledge-stats'), null);
  await act(async () => root.render(h(k.UserGuide, { user, permissions: { viewDashboard: true, submitAppeal: true }, canManage: false, repository: { ...k.guideRepository, load: async () => ({ chapters: k.MANUAL.chapters, stale: [] }) } })));
  await settle(() => !document.body.textContent.includes('กำลังตรวจคู่มือ'));
  assert.equal(document.body.textContent.includes('พิจารณาคำขออุทธรณ์'), true);
  assert.equal(document.querySelectorAll('.guide-complete-toc button').length,k.MANUAL.chapters.length);
  await settle(()=>document.querySelector('.guide-pdf-page')?.style.display==='block');
  assert.ok(k.pdfState.rendered.length);
  await act(async()=>[...document.querySelectorAll('.guide-complete-toc button')].find(node=>node.textContent.includes('ลงนามเกินกำหนด')).click());
  await settle(()=>k.pdfState.destroyed>0 && document.querySelector('a[download]')?.getAttribute('download').includes('signature-overdue'));
  assert.ok(document.querySelector('.guide-pdf-page'));
  const search=document.querySelector('input[aria-label="ค้นหาใน PDF"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(search,'72');search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>button('ค้นหาใน PDF').click());
  await settle(()=>document.querySelector('.guide-pdf-matches')?.textContent.includes('พบใน'));
  assert.ok(document.querySelector('.guide-pdf-matches button'));
  assert.equal(document.querySelectorAll('.guide-complete-toc button').length,k.MANUAL.chapters.length);
  assert.equal(button('แก้ไขบทนี้'), undefined);
  console.log('PASS: failed admin reads never imply Not Accepted; guide actions respect permissions');

  const fixtureRoot = path.join(temp, 'review');
  fs.mkdirSync(path.join(fixtureRoot, 'src/knowledge'), { recursive: true });
  for (const name of ['manual.json', 'terms.json']) fs.copyFileSync(path.join(rootDir, 'src/knowledge', name), path.join(fixtureRoot, 'src/knowledge', name));
  recordGuideReview(fixtureRoot, ['--reason', 'Reviewed the user workflow and guide content', '--chapters', 'all']);
  checkGuideReview(fixtureRoot);
  fs.writeFileSync(path.join(fixtureRoot, 'src/change.ts'), 'export const changed = true;');
  assert.throws(() => checkGuideReview(fixtureRoot), /ยังไม่ได้ตรวจ/);
  recordGuideReview(fixtureRoot, ['--reason', 'Verified code-only change with no changed workflow', '--no-content-change']);
  const changedTerms = { ...k.CURRENT_TERMS, introduction: 'changed without a new version' };
  fs.writeFileSync(path.join(fixtureRoot, 'src/knowledge/terms.json'), JSON.stringify(changedTerms));
  assert.throws(() => recordGuideReview(fixtureRoot, ['--reason', 'Attempt to change existing policy version', '--chapters', 'all']), /เวอร์ชันเดิม/);
  console.log('PASS: unreviewed releases and in-place T&C edits fail the build guard');

  if (process.env.QA_KNOWLEDGE_PDF_QA_DIR) {
    const fonts = undefined;
    const output = process.env.QA_KNOWLEDGE_PDF_QA_DIR; fs.mkdirSync(output, { recursive: true });
    const sample = { ...accepted, user: { ...accepted.user, displayName: 'แอดมินเฉาก๊วย — ตัวอย่างทดสอบ', teamName: 'ทีมตัวอย่าง', username: 'sample.agent' } };
    globalThis.fetch = async (url) => { assert.match(String(url), /^\/guide\/[a-z0-9-]+\.png$/); const bytes = fs.readFileSync(path.join(rootDir, 'public', String(url))); return new Response(bytes, { status: 200 }); };
    const termsPdf = await k.generateTermsPdf(sample, fonts);
    const guidePdf = await k.generateGuidePdf(k.MANUAL.chapters.filter(c=>['deadlines','signatures','weather'].includes(c.id)), fonts);
    const whole=await k.generateGuidePdf(k.MANUAL.chapters);
    fs.writeFileSync(path.join(output,'guide-complete.pdf'),Buffer.from(whole.output('arraybuffer')));
    const legacy = new k.jsPDF(); legacy.setFont('helvetica','bold'); legacy.setFontSize(20); legacy.text('ทดสอบเอกสารอย่างเป็นทางการ',18,25);
    assert.equal(legacy.getFont().fontName,'THSarabunNew');
    fs.writeFileSync(path.join(output,'legacy-font-sample.pdf'),Buffer.from(legacy.output('arraybuffer')));
    fs.writeFileSync(path.join(output, 'terms-sample.pdf'), Buffer.from(termsPdf.output('arraybuffer')));
    fs.writeFileSync(path.join(output, 'guide-sample.pdf'), Buffer.from(guidePdf.output('arraybuffer')));
    console.log(`PASS: sample PDFs generated (${termsPdf.getNumberOfPages()} terms pages; ${guidePdf.getNumberOfPages()} guide pages)`);
  }
  console.log('All knowledge checks passed. No production records were used or modified.');
} finally {
  if (root) { const React = require('react'); const act = React.act || require('react-dom/test-utils').act; await act(async () => root.unmount()); }
  dom.window.close(); fs.rmSync(temp, { recursive: true, force: true });
}
