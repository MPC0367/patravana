// The publication build (Phase 3, 4 November 2026). Runs on GitHub Actions in the deploy repository whenever the Sheet
// publisher sends a new snapshot (.github/workflows/cms-publish.yml), and can be run the same way by hand:
//   node cms/build.mjs <inbox.json> [result.json]
// It accepts the snapshot only if it is complete, valid, unchanged in transit and newer than what is live; then writes
// the immutable revision file, applies it to the pages and dictionaries (cms/release.mjs) and promotes the manifest.
// Nothing is written unless every check passes, so a bad snapshot leaves the current site exactly as it is.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyRelease } from './release.mjs';
import { PVCMS } from './apply.mjs';

const [inboxPath, resultPath] = process.argv.slice(2);
const DIR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const result = { schema: 'patravana.publish-result/1', at: new Date().toISOString(), status: 'rejected', generation: null, problems: [] };
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, k + '=' + v + '\n'); };
function finish(code) {
  if (resultPath) writeFileSync(resultPath, JSON.stringify(result, null, 1) + '\n');
  console.log(JSON.stringify(result, null, 1));
  out('changed', result.status === 'built' ? 'true' : 'false'); out('generation', result.generation || '');
  process.exit(code);
}
try {
  const text = readFileSync(inboxPath, 'utf8');
  if (text.length > 3 * 1024 * 1024) { result.problems.push('the snapshot is larger than 3 MB'); finish(1); }
  const inbox = JSON.parse(text);
  const env = inbox.envelope || {}, snap = inbox.snapshot;
  result.generation = env.generation || null;
  if (env.schema !== 'patravana.publish/1') result.problems.push('not a publication from the Sheet publisher');
  if (!snap || env.generation !== snap.generation) result.problems.push('the envelope and the snapshot name different generations');
  if (snap && sha256(PVCMS.canonical(snap)) !== env.contentHash) result.problems.push('the content hash does not match: the snapshot changed on its way');
  if (!/^[0-9a-f]{16,64}$/.test(String(env.nonce || ''))) result.problems.push('no nonce');
  const registry = JSON.parse(readFileSync(DIR + 'cms/registry.json', 'utf8'));
  if (snap) result.problems.push(...PVCMS.verify(snap, registry));
  if (result.problems.length) finish(1);
  // never older than what is live: a delayed publication can never put back older content
  const mpath = DIR + 'content/manifest.json';
  const live = existsSync(mpath) ? JSON.parse(readFileSync(mpath, 'utf8')) : null;
  if (live && snap.generation <= live.revision) { result.status = 'superseded'; result.problems.push('revision ' + snap.generation + ' is not newer than the live revision ' + live.revision); finish(0); }
  if (live && live.nonces && live.nonces.includes(env.nonce)) { result.status = 'duplicate'; finish(0); }
  // the immutable revision file first, then the pages, then the manifest that points at both
  mkdirSync(DIR + 'content', { recursive: true });
  const body = JSON.stringify(snap) + '\n';
  const file = 'content/r' + snap.generation + '.json';
  writeFileSync(DIR + file, body);
  const prevBuild = existsSync(DIR + 'build.json') ? JSON.parse(readFileSync(DIR + 'build.json', 'utf8')) : {};
  // the Sheet's fast lane (its web app address), only ever a Google Apps Script /exec address
  const liveUrl = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(env.liveUrl || '')) ? env.liveUrl : prevBuild.liveUrl || null;
  const build = applyRelease(DIR, snap, { sourceRevision: prevBuild.sourceRevision || null, mode: prevBuild.mode || 'preview', builtAt: new Date().toISOString(), liveUrl });
  const manifest = {
    schema: 'patravana.manifest/1', revision: snap.generation, url: file, sha256: sha256(body), contentHash: env.contentHash,
    publishedAt: new Date().toISOString(), rollbackOf: snap.rollbackOf || null, build: build.buildId,
    html: { revision: snap.generation, state: 'deployed together with this manifest' },
    nonces: [env.nonce].concat((live && live.nonces) || []).slice(0, 8)
  };
  writeFileSync(mpath, JSON.stringify(manifest, null, 1) + '\n');
  Object.assign(result, { status: 'built', revision: snap.generation, buildId: build.buildId, sha256: manifest.sha256, sentAt: env.createdAt || null, changed: (() => { try { return live ? PVCMS.changes(JSON.parse(readFileSync(DIR + live.url, 'utf8')), snap) : 'first publication'; } catch (e) { return 'unknown'; } })() });
  finish(0);
} catch (e) {
  result.problems.push(String(e && e.message || e).slice(0, 600));
  finish(1);
}
