/* Patravana website content: the shared rules (Phase 3, 4 November 2026).

   One file, used unchanged in three places, so the rules can never drift apart:
     - the Sheet publisher (Google Apps Script; pasted in as Core.gs),
     - the build that turns a published snapshot into the website (GitHub Actions, cms/build.mjs),
     - the tests (_qa/cms.mjs).
   It reads no files, sends nothing and holds no credentials. Every function is pure.

   The editing format is plain text. One mark is allowed, and only where the field's type is "accent": *words* prints
   the words in the page's italic accent. Nothing else in a cell is ever treated as markup: < and > are refused, and
   the trusted renderer below escapes everything before it adds the accent. */
var PVCMS = (function () {
  "use strict";
  var SCHEMA = "patravana.content/1";
  var MODES = ["LIVE", "DRAFT", "HOLD"];
  var TYPES = ["text", "label", "paragraph", "accent", "alt", "template", "message", "int", "time", "days", "date"];
  // the withdrawn 30% campaign, the compounded 41%, and the Doc's stale offers: refused anywhere in published text
  // (4 November 2026; bringing one back needs a new instruction from the owner, and a change to this list)
  var WITHDRAWN = [
    [/\b(?:30|41|45)\s*%/, "a withdrawn offer (30%, 41% or 45%)"],
    [/ลด\s*(?:30|41|45)/, "a withdrawn offer (ลด 30, 41 หรือ 45)"],
    [/welcome2024/i, "the withdrawn code welcome2024"],
    [/stacks on the best available/i, "a stacked-saving claim"],
    [/฿\s?1,800/, "an old group price"],
    [/10% off (?:dining|every food)/i, "an old dining discount"]
  ];
  // the studio's copy rules: these glyphs never appear in visible copy
  var BANNED = [["·", "a middle dot (·)"], ["—", "a long dash (—)"], ["•", "a bullet (•)"], ["–", "a dash (–)"]];

  function str(v) { return v == null ? "" : String(v); }
  // a cell's text as one line: runs of spaces, tabs and line breaks become one space (HTML would collapse them anyway)
  function oneLine(v) { return str(v).replace(/[\s ]+/g, " ").trim(); }
  // a message template keeps its line breaks (they are the lines of the guest's message); other whitespace is tidied
  function lines(v) { return str(v).replace(/\r\n?/g, "\n").split("\n").map(function (l) { return l.replace(/[ \t ]+/g, " ").trim(); }).join("\n").trim(); }
  function escapeHtml(s) { return str(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  // trusted rendering of an editor value into the page's HTML: everything escaped, then *words* -> the accent
  function render(value, type) {
    var h = escapeHtml(value);
    if (type === "accent") h = h.replace(/\*([^*]+)\*/g, '<em class="it">$1</em>');
    return h;
  }
  // the page's current HTML as an editor value (used once, to seed the Sheet): the accent becomes *words*
  function toEditor(html, type) {
    var s = str(html);
    if (type !== "message") s = s.replace(/\s+/g, " ");
    s = s.replace(/<em class="it">([\s\S]*?)<\/em>/g, "*$1*").replace(/<[^>]+>/g, "");
    s = s.replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    return type === "message" ? lines(s) : s.trim();
  }
  function tokens(s) { var m = str(s).match(/\{[a-zA-Z0-9_.]+\}/g) || []; var u = {}; m.forEach(function (t) { u[t] = 1; }); return Object.keys(u).sort(); }
  function sameList(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }

  // canonical JSON: keys sorted at every level, no spaces. The content hash is SHA-256 over this text.
  function canonical(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  }

  function realDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return false;
    var y = +m[1], mo = +m[2] - 1, d = +m[3], dt = new Date(Date.UTC(y, mo, d));
    return y >= 2020 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d;
  }
  /* Checks one value against its field. Returns a list of plain-language problems, each ready for the Sheet. */
  function checkValue(field, lang, raw) {
    var p = [], L = lang === "th" ? "Thai" : "English", t = field.type;
    if (t === "int") {
      if (!/^\d+$/.test(str(raw).trim())) p.push(L + ": must be a whole number");
      else if (field.min != null && +raw < field.min) p.push(L + ": must be at least " + field.min);
      else if (field.max != null && +raw > field.max) p.push(L + ": must be at most " + field.max);
      return p;
    }
    if (t === "time") { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(str(raw).trim())) p.push("must be a time like 07:00 (24-hour, resort time)"); return p; }
    if (t === "days") { if (!/^[0-6](,[0-6])*$/.test(str(raw).replace(/\s/g, ""))) p.push("must be days as numbers 0 to 6 (0 is Sunday), for example 0,3,4,5,6"); return p; }
    // a real calendar day: year, month and day must all come back unchanged (2026-13-01 and 2026-02-30 are refused,
    // 29 February only in a leap year), between 2020 and 2100 (Phase 4, 5 November 2026)
    if (t === "date") { if (!realDay(str(raw).trim())) p.push("must be a real date written 2026-11-04"); return p; }
    var v = t === "message" ? lines(raw) : oneLine(raw);
    if (!v) { if (field.required !== false) p.push(L + " is empty"); return p; }
    if (/[<>]/.test(v)) p.push(L + ": < and > are not allowed (no HTML in cells)");
    if (/^=/.test(v)) p.push(L + ": a formula is not allowed, type the text itself");
    if (t === "accent") {
      if ((v.match(/\*/g) || []).length % 2) p.push(L + ": a * is not closed (write *words* for the italic accent)");
    } else if (/\*/.test(v)) p.push(L + ": * is only for the italic accent, which this field does not use");
    var want = field.tokens || [], got = tokens(v);
    if (!sameList(want, got)) {
      var miss = want.filter(function (x) { return got.indexOf(x) < 0; }), extra = got.filter(function (x) { return want.indexOf(x) < 0; });
      if (miss.length) p.push(L + ": keep " + miss.join(" ") + " exactly as written (the page fills it in)");
      if (extra.length) p.push(L + ": " + extra.join(" ") + " is not something the page can fill in here");
    } else if (/[{}]/.test(v.replace(/\{[a-zA-Z0-9_.]+\}/g, ""))) p.push(L + ": a { or } on its own is not allowed");
    if (field.maxLen && v.length > field.maxLen) p.push(L + ": " + v.length + " characters, the limit here is " + field.maxLen);
    BANNED.forEach(function (b) { if (v.indexOf(b[0]) > -1) p.push(L + ": " + b[1] + " is not used in the site's copy"); });
    WITHDRAWN.forEach(function (w) { if (w[0].test(v)) p.push(L + ": mentions " + w[1] + ", which the owner withdrew"); });
    if (/https?:\/\/|www\./i.test(v) && t !== "message") p.push(L + ": web addresses are set by the studio, not typed into text");
    return p;
  }
  function normalise(field, raw) {
    var t = field.type;
    if (t === "int") return parseInt(str(raw).trim(), 10);
    if (t === "time" || t === "date") return str(raw).trim();
    if (t === "days") return str(raw).replace(/\s/g, "").split(",").map(Number);
    return t === "message" ? lines(raw) : oneLine(raw);
  }

  /* Builds the complete snapshot from what the Sheet holds.
     rows: [{ tab, sheetId, row, key, en, th, mode, value? }] (value is used for typed facts, en/th for texts)
     registry: the field list (cms/registry.json). prev: the last published snapshot (or the bundled baseline).
     A LIVE row publishes what is in its cells. A DRAFT or HOLD row keeps its last published value.
     Returns { snapshot (or null), problems: [{ tab, row, key, text }], notes: [{ key, text }] } */
  function build(rows, registry, prev, meta) {
    var problems = [], notes = [], byKey = {}, fields = {}, content = {}, facts = {};
    registry.fields.forEach(function (f) { fields[f.key] = f; });
    rows.forEach(function (r) {
      var k = str(r.key).trim();
      if (!k) { if (oneLine(r.en) || oneLine(r.th) || oneLine(r.value)) problems.push({ tab: r.tab, row: r.row, key: "", text: "This row has text but no field key: the key column must not be cleared" }); return; }
      if (byKey[k]) { problems.push({ tab: r.tab, row: r.row, key: k, text: "The field key " + k + " is also on " + byKey[k].tab + " row " + byKey[k].row + ": each key appears once" }); return; }
      byKey[k] = r;
      // a text the website no longer has is marked Retired by the publisher and left out; any other unknown key is a mistake
      if (!fields[k] && !/^Retired/.test(oneLine(r.status))) problems.push({ tab: r.tab, row: r.row, key: k, text: "Unknown field key " + k + " (keys are set by the studio: was it changed?)" });
    });
    var P = (prev && prev.content) || {}, PF = (prev && prev.facts) || {};
    registry.fields.forEach(function (f) {
      var r = byKey[f.key];
      if (!r) { problems.push({ tab: f.tab, row: "", key: f.key, text: "The row for " + f.key + " is missing (rows are never deleted: set its Mode to HOLD instead)" }); return; }
      var mode = oneLine(r.mode).toUpperCase() || "LIVE";
      if (MODES.indexOf(mode) < 0) { problems.push({ tab: r.tab, row: r.row, key: f.key, text: "Mode must be LIVE, DRAFT or HOLD" }); return; }
      if (f.kind === "fact") {
        if (!f.editable) { facts[f.key] = normalise(f, f.value); return; }
        if (mode !== "LIVE") { facts[f.key] = f.key in PF ? PF[f.key] : normalise(f, f.value); return; }
        var fp = checkValue(f, "en", r.value);
        fp.forEach(function (t) { problems.push({ tab: r.tab, row: r.row, key: f.key, text: t }); });
        if (!fp.length) facts[f.key] = normalise(f, r.value);
        return;
      }
      var last = P[f.key] || { en: f.en, th: f.th };
      if (!f.editable || mode !== "LIVE") { content[f.key] = { en: last.en, th: last.th }; if (f.editable && mode !== "LIVE" && (oneLine(r.en) !== last.en || oneLine(r.th) !== last.th)) notes.push({ key: f.key, text: mode + ": the published text stays as it was" }); return; }
      var pe = checkValue(f, "en", r.en), pt = checkValue(f, "th", r.th);
      pe.concat(pt).forEach(function (t) { problems.push({ tab: r.tab, row: r.row, key: f.key, text: t }); });
      if (pe.length || pt.length) return;
      var en = normalise(f, r.en), th = normalise(f, r.th);
      // English changed and Thai did not: published, and flagged for a translation check (no automatic translation)
      if (en !== last.en && th === last.th) notes.push({ key: f.key, text: "Translation review: the English changed, the Thai is the last approved one" });
      content[f.key] = { en: en, th: th };
    });
    if (problems.length) return { snapshot: null, problems: problems, notes: notes };
    var snap = {
      schema: SCHEMA,
      registryVersion: registry.version,
      generation: meta && meta.generation || 0,
      parentGeneration: prev && prev.generation || 0,
      rollbackOf: meta && meta.rollbackOf || null,
      createdAt: meta && meta.createdAt || null,
      source: meta && meta.source || "sheet",
      content: content,
      facts: facts
    };
    return { snapshot: snap, problems: [], notes: notes };
  }

  /* Checks a finished snapshot against the registry: run by the build before anything is written, whoever sent it. */
  function verify(snap, registry) {
    var p = [], fields = {};
    if (!snap || typeof snap !== "object") return ["not a snapshot"];
    if (snap.schema !== SCHEMA) p.push("schema is " + snap.schema + ", expected " + SCHEMA);
    if (snap.registryVersion !== registry.version) p.push("made for registry " + snap.registryVersion + ", this build has " + registry.version);
    if (!(snap.generation > 0) || Math.floor(snap.generation) !== snap.generation) p.push("generation must be a positive whole number");
    var c = snap.content || {}, f = snap.facts || {};
    registry.fields.forEach(function (x) { fields[x.key] = x; });
    Object.keys(c).forEach(function (k) { if (!fields[k] || fields[k].kind === "fact") p.push("unknown content key " + k); });
    Object.keys(f).forEach(function (k) { if (!fields[k] || fields[k].kind !== "fact") p.push("unknown fact key " + k); });
    registry.fields.forEach(function (x) {
      if (x.kind === "fact") {
        if (!(x.key in f)) { p.push("missing fact " + x.key); return; }
        if (!x.editable) { if (canonical(f[x.key]) !== canonical(normalise(x, x.value))) p.push(x.key + " is protected and was changed"); return; }
        var raw = x.type === "days" ? f[x.key].join(",") : String(f[x.key]);
        checkValue(x, "en", raw).forEach(function (t) { p.push(x.key + ": " + t); });
        return;
      }
      var v = c[x.key];
      if (!v) { p.push("missing " + x.key); return; }
      if (!x.editable) { if (v.en !== x.en || v.th !== x.th) p.push(x.key + " is protected and was changed"); return; }
      checkValue(x, "en", v.en).forEach(function (t) { p.push(x.key + ": " + t); });
      checkValue(x, "th", v.th).forEach(function (t) { p.push(x.key + ": " + t); });
    });
    return p;
  }

  // what changed between two snapshots (keys), for the Sheet's statuses and the page's in-place update
  function changes(a, b) {
    var out = [], A = (a && a.content) || {}, B = (b && b.content) || {}, FA = (a && a.facts) || {}, FB = (b && b.facts) || {};
    Object.keys(B).forEach(function (k) { if (!A[k] || A[k].en !== B[k].en || A[k].th !== B[k].th) out.push(k); });
    Object.keys(FB).forEach(function (k) { if (canonical(FA[k]) !== canonical(FB[k])) out.push(k); });
    return out;
  }

  /* Typed facts (facts.js, window.PV_FACTS). A "facts.*" key names where its value lives; only these can be set. */
  function setFact(FX, key, value) {
    var p = key.replace(/^facts\./, "").split(".");
    if (p[0] === "hall" && p[1] === "area") { FX.hall.areaSqm = value; return true; }
    if (p[0] === "hall") { var l = FX.hall.layouts.filter(function (x) { return x.key === p[1]; })[0]; if (l && p[2] in l) { l[p[2]] = value; return true; } return false; }
    if (p[0] === "dining" && p[1] === "seats") { FX.dining.seats = value; return true; }
    if (p[0] === "dining" && FX.dining[p[1]] && /^(open|close|days|lastOrder)$/.test(p[2])) { FX.dining[p[1]][p[2]] = value; return true; }
    if (key === "facts.reviewed") { FX.reviewed = value; return true; }
    if (key === "facts.pet.reviewed") { FX.pet.lastReviewedAt = value; return true; }
    return false;                                        // protected facts are never set from a snapshot
  }
  // the same figures and sentences the page prints (main.js FACTS.val / FACTS.t), for the build
  function longDate(s, lang) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return "";
    return new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  }
  function factValue(FX, path, lang) {
    var clock = function (t) { return String(t).replace(/^0/, ""); };
    var hall = FX.hall, lay = function (k) { return hall.layouts.filter(function (x) { return x.key === k; })[0]; };
    var p = path.split(".");
    if (path === "reviewed") return longDate(FX.reviewed, lang);
    if (path === "pet.reviewed") return longDate(FX.pet.lastReviewedAt, lang);
    if (p[0] === "hall") {
      if (p[1] === "area") return hall.areaSqm;
      if (p[1] === "size") return hall.size && hall.size[p[2]] != null ? hall.size[p[2]] : null;          // the floor plan's measurements (sales kit)
      if (p[1] === "name") return hall.name ? hall.name[lang] || hall.name.en : null;                     // Patra Hall
      var l = lay(p[1]); return l ? l[p[2]] : null;
    }
    if (p[0] === "dining") { if (p[1] === "seats") return FX.dining.seats; var sv = FX.dining[p[1]]; return sv && sv[p[2]] ? clock(sv[p[2]]) : null; }
    if (path === "contact.phone.show") return FX.contact.phone.show;
    if (path === "contact.phone.local") return FX.contact.phone.local;
    if (path === "contact.dining.show") return FX.contact.diningPhones[0].show;
    if (path === "contact.address.br") return FX.contact.address[lang].join("<br>");
    if (path === "contact.address.line") return FX.contact.address[lang].join(" ");
    if (path === "booking.adultsMax") return FX.booking.adultsMax;
    return null;
  }
  function factText(FX, key, lang, slots) {
    var e = FX.text[key]; if (!e) return "";
    return (e[lang] || e.en).replace(/\{([a-zA-Z0-9_.]+)\}/g, function (m, path) { if (slots && path in slots) return slots[path]; var v = factValue(FX, path, lang); return v == null ? m : v; });
  }

  return { SCHEMA: SCHEMA, MODES: MODES, TYPES: TYPES, WITHDRAWN: WITHDRAWN, render: render, toEditor: toEditor, tokens: tokens, canonical: canonical, checkValue: checkValue, normalise: normalise, build: build, verify: verify, changes: changes, oneLine: oneLine, lines: lines, setFact: setFact, factValue: factValue, factText: factText };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PVCMS;
