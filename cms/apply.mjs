// Applies a published content snapshot to the website's files (Phase 3, 4 November 2026).
// Used by the build on GitHub (cms/build.mjs) and by the studio's exporter (export-pages.mjs), so a page built either
// way reads exactly the same. The HTML is changed only inside the elements the page itself marks as translatable
// (data-i18n, data-i18n-attr, data-fact); nothing else in the page is touched.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PVCMS = require('./core.js');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;
const ATTR = /\s+([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescAttr = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function parseAttrs(src) { const out = []; let m; ATTR.lastIndex = 0; while ((m = ATTR.exec(src))) out.push([m[1], m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : null]); return out; }
const writeAttrs = (list) => list.map(([k, v]) => ' ' + k + (v == null ? '' : '="' + escAttr(unescAttr(v)) + '"')).join('');
const PROD_TITLES = { 'js.docTitle': 'seo.title', 'js.docDesc': 'seo.description', 'js.viewTitle': 'seo.viewTitle' };
const plain = (html) => unescAttr(String(html).replace(/<[^>]+>/g, ''));

/* Rewrites one page. edit(tag, attrs) is called for every element carrying data-i18n, data-i18n-attr or data-fact; it
   returns { attrs, inner } (either may be undefined: left as it is). Keyed elements never nest (checked). */
export function rewrite(html, edit) {
  const out = []; let last = 0, m; const stack = []; let raw = null;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const close = m[1] === '/', name = m[2].toLowerCase();
    if (raw) { if (close && name === raw) raw = null; continue; }   // script and style bodies are not HTML
    if (!close) {
      if (name === 'script' || name === 'style') { raw = name; continue; }
      const attrs = parseAttrs(m[3] || '');
      const keyed = attrs.some(([k]) => k === 'data-i18n' || k === 'data-i18n-attr' || k === 'data-fact');
      const selfClose = m[4] === '/' || VOID.has(name);
      if (keyed) {
        const r = edit(name, attrs) || {};
        const newTag = r.attrs ? '<' + m[2] + writeAttrs(r.attrs) + (m[4] ? ' /' : '') + '>' : m[0];
        out.push(html.slice(last, m.index), newTag); last = m.index + m[0].length;
        if (!selfClose) stack.push({ name, keyed: true, inner: r.inner, at: out.length });
        else if (r.inner != null) throw new Error('a ' + name + ' element cannot hold text');
      } else if (!selfClose) stack.push({ name, keyed: false });
    } else {
      // close back to the matching element (tolerating optional closing tags such as </p> or </li>)
      let i = stack.length - 1; while (i >= 0 && stack[i].name !== name) i--;
      if (i < 0) continue;
      const opened = stack.splice(i);
      const k = opened[0];
      if (k.keyed && opened.slice(1).some((x) => x.keyed)) throw new Error('keyed elements nest inside a ' + name + ': the build will not guess which wins');
      if (k.keyed && k.inner != null) {
        // drop everything written since the start tag, put the new inner HTML in its place
        out.splice(k.at); out.push(k.inner); last = m.index;
      }
    }
  }
  out.push(html.slice(last));
  return out.join('');
}

// the dictionaries the page's scripts read, with a snapshot applied (facts.js and i18n.js are pure data)
export function dictionaries(i18nSrc, factsSrc, snap, opts) {
  const win = {};
  new Function('window', factsSrc + '\n' + i18nSrc)(win);
  const TH = win.PV_TH, JS = win.PV_JS, FX = win.PV_FACTS, EN = { t: {}, a: {} };
  if (snap) {
    for (const [k, v] of Object.entries(snap.content)) {
      if (k.startsWith('js.')) { if (opts && opts.production && PROD_TITLES[k]) continue; JS[k.slice(3)] = { en: v.en, th: v.th }; continue; }
      if (k.startsWith('fact.')) { FX.text[k.slice(5)] = { en: v.en, th: v.th }; continue; }
      if (k.startsWith('seo.')) continue;                                  // the production head (export-pages.mjs)
      TH[k] = PVCMS.render(v.th, 'accent');
    }
    for (const [k, v] of Object.entries(snap.facts || {})) PVCMS.setFact(FX, k, v);
    // production: the page's own titles come from the SEO tab, never the preview's (which say it is a concept)
    if (opts && opts.production) for (const [k, from] of Object.entries(PROD_TITLES)) if (snap.content[from]) JS[k.slice(3)] = { en: snap.content[from].en, th: snap.content[from].th };
  }
  return { TH, JS, FX, EN };
}
export function serialise(d, rev) {
  const head = (what) => '/* PATRAVANA v2, ' + what + '. Written by cms/apply.mjs' + (rev ? ' from content revision ' + rev + ' (the Patravana Website Content sheet)' : '') + ': edit the Sheet, not this file. */\n';
  return {
    'i18n.js': head('Thai dictionary and script texts') + 'window.PV_TH = ' + JSON.stringify(d.TH, null, 1) + ';\nwindow.PV_JS = ' + JSON.stringify(d.JS, null, 1) + ';\n',
    'facts.js': head('operational facts') + 'window.PV_FACTS = ' + JSON.stringify(d.FX, null, 1) + ';\n'
  };
}

/* One page in one language: keyed texts, keyed attributes and fact sentences from the snapshot.
   Returns { html, en } where en is what i18n-en.js needs (the English of every key the page uses). */
export function page(html, lang, snap, d) {
  const C = snap ? snap.content : null, en = { t: {}, a: {} }, problems = [], newer = new Set();
  const out = rewrite(html, (tag, attrs) => {
    const get = (n) => { const a = attrs.find(([k]) => k === n); return a ? a[1] : null; };
    const r = {};
    const key = get('data-i18n'), fact = get('data-fact'), pairs = get('data-i18n-attr');
    if (key && C) {
      if (!C[key]) newer.add(key);                       // a text newer than the last publication: kept as the page has it
      else { r.inner = PVCMS.render(C[key][lang], 'accent'); en.t[key] = PVCMS.render(C[key].en, 'accent'); }
    }
    if (fact && d) { const v = PVCMS.factText(d.FX, fact, lang); if (v) r.inner = v; }
    if (pairs && C) {
      const list = attrs.map((a) => a.slice());
      unescAttr(pairs).split(';').forEach((p) => {
        const i = p.indexOf(':'); if (i < 0) return;
        const attr = p.slice(0, i).trim(), k = p.slice(i + 1).trim();
        if (!C[k]) { newer.add(k); return; }
        const v = plain(PVCMS.render(C[k][lang], 'accent')); en.a[k] = plain(PVCMS.render(C[k].en, 'accent'));
        const at = list.find(([n]) => n === attr); if (at) at[1] = escAttr(v); else list.push([attr, escAttr(v)]);
      });
      r.attrs = list;
    }
    return r;
  });
  if (problems.length) throw new Error('the page and the snapshot disagree: ' + [...new Set(problems)].slice(0, 12).join('; '));
  return { html: out, en, newer: [...newer] };
}

// the build's identity in each page: a machine-readable marker, never shown
export function markers(html, build) {
  const tag = '<meta name="pv-build" content="' + escAttr(build.buildId) + '">\n<meta name="pv-content" content="' + build.contentRevision + '">' + (build.liveUrl ? '\n<meta name="pv-live" content="' + escAttr(build.liveUrl) + '">' : '');
  html = html.replace(/<meta name="pv-(?:build|content|live)"[^>]*>\s*/g, '');
  if (!/<meta charset="utf-8">/i.test(html)) throw new Error('no charset meta to place the build marker after');
  return html.replace(/(<meta charset="utf-8">)/i, '$1\n' + tag);
}
export function enScript(en, rev) {
  return '/* Generated by ' + (rev ? 'cms/apply.mjs from content revision ' + rev : 'export-pages.mjs') + ': the English of every translated text in the page, for a switch to English on the\n   Thai page (th.html), which is written in Thai. */\nwindow.PV_EN = ' + JSON.stringify(en) + ';\n';
}
export { PVCMS };
