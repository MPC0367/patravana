// Reads a published revision back from the live site (Phase 4, 5 November 2026), for the publishing workflow's confirm
// job and for the studio. A revision is live-verified only when the content manifest, the English page and the Thai page
// all carry it, and both pages carry the manifest's build id.
//   node cms/readback.mjs <site> <revision>                          prints {"ok":true|false,...}
//   node cms/readback.mjs --record <current-result.json> <revision> <out.json>   (writes the live state for the Sheet,
//                                                                     unless a newer revision's result is already there)
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--record') {
  const [, curFile, want, out] = args;
  let r = {};
  try { const cur = JSON.parse(readFileSync(curFile, 'utf8')); r = JSON.parse(Buffer.from(cur.content || '', 'base64').toString('utf8') || '{}'); } catch (e) { r = {}; }
  if (r.generation && r.generation > +want) { console.log('a newer result is already recorded (' + r.generation + ')'); process.exit(0); }
  r.generation = r.generation || +want; r.status = process.env.STATE || 'timed-out'; r.liveCheckedAt = new Date().toISOString();
  try { r.readback = JSON.parse(process.env.READBACK || '{}'); } catch (e) { r.readback = null; }
  // live-verified clears what an earlier step left (a duplicate run reporting "superseded" for the same revision); the
  // record names the run that verified it
  if (r.status === 'live-verified') { r.problems = []; r.run = process.env.GITHUB_RUN_ID || r.run; }
  else (r.problems = r.problems || []).push('not seen live within 10 minutes: GitHub Pages may still finish; the Sheet keeps checking the live site');
  writeFileSync(out, JSON.stringify(r, null, 1));
  console.log(r.status);
} else {
  const [site, want] = [args[0].replace(/\/?$/, '/'), +args[1]];
  const q = () => '?check=' + Date.now() + Math.random().toString(36).slice(2);
  const meta = (html, name) => ((html.match(new RegExp('<meta name="' + name + '" content="([^"]*)"')) || [])[1] || '');
  const get = async (u) => { const r = await fetch(u + q(), { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' answered ' + r.status); return r.text(); };
  try {
    const m = JSON.parse(await get(site + 'content/manifest.json'));
    const en = await get(site), th = await get(site + 'th');
    const out = { manifest: m.revision, build: m.build, en: +meta(en, 'pv-content'), enBuild: meta(en, 'pv-build'), th: +meta(th, 'pv-content'), thBuild: meta(th, 'pv-build') };
    const ok = m.revision === want && out.en === want && out.th === want && out.enBuild === m.build && out.thBuild === m.build;
    console.log(JSON.stringify(Object.assign({ ok }, out)));
  } catch (e) { console.log(JSON.stringify({ ok: false, error: String(e.message || e) })); }
}
