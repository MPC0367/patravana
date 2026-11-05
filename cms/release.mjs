// The last step of every build of the website (Phase 3, 4 November 2026): the published content is applied to the
// pages and dictionaries, the scripts are re-stamped, and the build's identity is written (build.json and a marker in
// each page). The studio's exporter and the build on GitHub both end with this one function, so a page built either way
// is the same page.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dictionaries, serialise, page, head, markers, enScript, PVCMS } from './apply.mjs';

const md5 = (s) => createHash('md5').update(s).digest('hex').slice(0, 8);
const STAMPED = ['facts.js', 'i18n.js', 'i18n-en.js'];
// the scripts' ?v= stamps follow their contents, so a visitor's browser never pairs a new page with an old dictionary
function restamp(html, files) {
  for (const f of STAMPED) {
    if (!(f in files)) continue;
    const re = new RegExp('"' + f.replace(/\./g, '\\.') + '(?:\\?v=[0-9a-f]+)?"', 'g');
    html = html.replace(re, '"' + f + '?v=' + md5(files[f]) + '"');
  }
  return html;
}
// nothing withdrawn may reach a page, a dictionary or the offers file, whoever built it
export function guard(texts) {
  const bad = [];
  for (const [name, text] of Object.entries(texts)) for (const [re, what] of PVCMS.WITHDRAWN) { const m = re.exec(text); if (m) bad.push(name + ': ' + what + ' ("' + text.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' ') + '")'); }
  if (bad.length) throw new Error('withdrawn content in the build: ' + bad.join('; '));
}

/* dir: the site folder (an export, or the deploy checkout on GitHub). snap: the published snapshot, or null before the
   first publication. build: { sourceRevision, mode, builtAt }. Writes the files back and returns build.json. */
export function applyRelease(dir, snap, build) {
  const read = (f) => readFileSync(dir + f, 'utf8');
  let en = read('index.html'), th = read('th.html');
  const files = {}; let newerKeys = [];
  if (snap) {
    const d = dictionaries(read('i18n.js'), read('facts.js'), snap, { production: build.mode === 'production' });
    const pe = page(en, 'en', snap, d), pt = page(th, 'th', snap, d), prod = build.mode === 'production';
    // the raw page's head follows the Sheet too (title, description, link previews, lodging data): Phase 4
    en = head(pe.html, 'en', d, snap, prod); th = head(pt.html, 'th', d, snap, prod);
    Object.assign(files, serialise(d, snap.generation));
    // the Thai page's English (for a switch to English there): every key it uses, from the snapshot
    // texts newer than the publication keep the English the page was built with
    const old = (() => { try { const w = {}; new Function('window', read('i18n-en.js'))(w); return w.PV_EN || { t: {}, a: {} }; } catch (e) { return { t: {}, a: {} }; } })();
    files['i18n-en.js'] = enScript({ t: { ...old.t, ...pt.en.t }, a: { ...old.a, ...pt.en.a } }, snap.generation);
    newerKeys = [...new Set(pe.newer.concat(pt.newer))];
  }
  const contentRevision = snap ? snap.generation : 0;
  const buildId = String(build.sourceRevision || 'unknown').slice(0, 12) + '-c' + contentRevision;
  const liveUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(build.liveUrl || '')) ? build.liveUrl : null;
  en = markers(restamp(en, files), { buildId, contentRevision, liveUrl });
  th = markers(restamp(th, files), { buildId, contentRevision, liveUrl });
  // (facts.js is checked by its sentences: its withdrawn list has to name what it keeps out)
  const factsText = (() => { const w = {}; new Function('window', files['facts.js'] || read('facts.js'))(w); return JSON.stringify(w.PV_FACTS.text); })();
  const { 'facts.js': _f, ...checked } = files;
  guard({ 'index.html': en, 'th.html': th, ...checked, 'facts.js sentences': factsText, ...(existsSync(dir + 'offers.json') ? { 'offers.json': read('offers.json') } : {}) });
  const manifest = {
    about: 'What this build of the Patravana website is. Public and machine-readable: no paths, credentials or private details.',
    schema: 'patravana.build/1', buildId, mode: build.mode, sourceRevision: build.sourceRevision || null,
    contentRevision, contentHash: snap ? createHash('sha256').update(PVCMS.canonical(snap)).digest('hex') : null,
    contentSchema: PVCMS.SCHEMA, registryVersion: snap ? snap.registryVersion : null, builtAt: build.builtAt || new Date().toISOString(), liveUrl,
    newerThanContent: newerKeys,
    pages: { 'index.html': createHash('sha256').update(en).digest('hex'), 'th.html': createHash('sha256').update(th).digest('hex') }
  };
  writeFileSync(dir + 'index.html', en); writeFileSync(dir + 'th.html', th);
  for (const [f, text] of Object.entries(files)) writeFileSync(dir + f, text);
  writeFileSync(dir + 'build.json', JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}
