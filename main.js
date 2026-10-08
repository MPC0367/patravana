/* ============================================================
   PATRAVANA v2: interactions, motion, bilingual engine
   GSAP 3.13 (ScrollTrigger, SplitText) for the scroll reveals; scrolling itself is the browser's own.
   Nothing here stands between the visitor and the page: there is no loading gate, and if a script from the CDN
   does not arrive the page is still read, booked and navigated as it is.
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof gsap !== "undefined";
  const hasST = hasGSAP && typeof ScrollTrigger !== "undefined";
  const hasSplit = hasGSAP && typeof SplitText !== "undefined";
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const pad2 = (n) => String(n).padStart(2, "0");
  // the resort's wall clock wherever the visitor is: read the result with getUTC*()
  const bkk = () => new Date(Date.now() + 7 * 3600 * 1000);

  if (hasGSAP) {
    gsap.registerPlugin.apply(gsap, [hasST && ScrollTrigger, hasSplit && SplitText].filter(Boolean));
    gsap.defaults({ ease: "power3.out", duration: 1 });
    if (hasST) ScrollTrigger.config({ ignoreMobileResize: true });   // a phone's address bar sliding away is not a reason to re-measure the page
  }

  /* ---------- calendar dates ----------
     A stay is made of plain dates ("2026-11-17"), never moments in time. They are counted as whole days in UTC so
     no browser timezone can move one, and "today" is always the resort's today (Asia/Bangkok). */
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function dayNum(s) {
    const m = DATE_RE.exec(s || ""); if (!m) return NaN;
    const y = +m[1], mo = +m[2] - 1, d = +m[3], t = Date.UTC(y, mo, d), dt = new Date(t);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d ? t / 864e5 : NaN;   // 31 February is not a date
  }
  const isoDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  const addDays = (s, n) => isoDay(dayNum(s) + n);
  const todayBkk = () => { const n = bkk(); return n.getUTCFullYear() + "-" + pad2(n.getUTCMonth() + 1) + "-" + pad2(n.getUTCDate()); };
  const longDate = (s, lang) => new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(dayNum(s) * 864e5));
  const shortDate = (s, lang) => new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(dayNum(s) * 864e5));

  /* ---------- the facts (facts.js) ----------
     Operational facts are written once, in facts.js. FACTS.t(key) returns the sentence for the current language with
     its {figures} filled in; FACTS.render() prints every [data-fact] element. The English already in the page is the
     same text (checked by _qa/check-facts.mjs), so the page is right before, and without, this script. */
  const FX = window.PV_FACTS || null;
  const FACTS = {
    lang: "en",
    val(path, lang) {
      if (!FX) return null;
      const L = lang || this.lang, clock = (t) => String(t).replace(/^0/, "");      // "07:00" prints as 7:00
      const hall = FX.hall, lay = (k) => hall.layouts.find((x) => x.key === k);
      const p = path.split(".");
      if (path === "reviewed") return longDate(FX.reviewed, L);
      if (path === "pet.reviewed") return longDate(FX.pet.lastReviewedAt, L);
      if (p[0] === "hall") { if (p[1] === "area") return hall.areaSqm; const l = lay(p[1]); return l ? l[p[2]] : null; }
      if (p[0] === "dining") { if (p[1] === "seats") return FX.dining.seats; const sv = FX.dining[p[1]]; return sv && sv[p[2]] ? clock(sv[p[2]]) : null; }
      if (p[0] === "offers") {
        const o = FX.offers[p[1]]; if (!o) return null;
        if (p[2] === "until") return longDate(o.stayUntil, L);
        if (p[2] === "total") return Math.round((1 - (1 - FX.offers.direct.percent / 100) * (1 - o.percent / 100)) * 100);   // 30% then 15% is 40.5% in all
        return o[p[2]];
      }
      if (path === "contact.phone.show") return FX.contact.phone.show;
      if (path === "contact.phone.local") return FX.contact.phone.local;
      if (path === "contact.dining.show") return FX.contact.diningPhones[0].show;
      if (path === "contact.address.br") return FX.contact.address[L].join("<br>");
      if (path === "contact.address.line") return FX.contact.address[L].join(" ");
      if (path === "booking.adultsMax") return FX.booking.adultsMax;
      return null;
    },
    // slots: values the caller supplies ({dates}, {guests}); anything else in braces is looked up in the facts
    t(key, slots, lang) {
      const L = lang || this.lang, e = FX && FX.text[key]; if (!e) return "";
      return (e[L] || e.en).replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, path) => { if (slots && path in slots) return slots[path]; const v = this.val(path, L); return v == null ? m : v; });
    },
    render(lang) {
      this.lang = lang || this.lang; if (!FX) return;
      $$("[data-fact]").forEach((el) => { const v = this.t(el.getAttribute("data-fact")); if (v && el.innerHTML !== v) el.innerHTML = v; });
    }
  };

  /* ---------- language engine ---------- */
  const I18N = {
    en: {}, enAttr: new Map(), lang: "en",
    capture() {
      $$("[data-i18n]").forEach((el) => { const k = el.getAttribute("data-i18n"); if (!(k in this.en)) this.en[k] = el.innerHTML; });
      $$("[data-i18n-attr]").forEach((el) => {
        const map = {};
        el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
          const i = pair.indexOf(":"); if (i > 0) { const attr = pair.slice(0, i).trim(), key = pair.slice(i + 1).trim(); map[attr] = { key, en: el.getAttribute(attr) || "" }; }
        });
        this.enAttr.set(el, map);
      });
      const missing = Object.keys(this.en).filter((k) => !(k in (window.PV_TH || {})));
      if (missing.length) console.warn("PV i18n, keys missing Thai:", missing);
    },
    apply(lang) {
      this.lang = lang;
      const th = window.PV_TH || {};
      $$("[data-i18n]").forEach((el) => { const k = el.getAttribute("data-i18n"); const v = lang === "th" ? th[k] : this.en[k]; if (v != null && el.innerHTML !== v) el.innerHTML = v; });
      this.enAttr.forEach((map, el) => { Object.keys(map).forEach((attr) => { const v = lang === "th" ? (th[map[attr].key] || map[attr].en) : map[attr].en; el.setAttribute(attr, v); }); });
      FACTS.render(lang);                                // the sentences that quote a fact, before anything reads them
      document.documentElement.lang = lang;
      // the tab title and the description follow the language too
      if (this.t("docTitle")) document.title = this.t("docTitle");
      const desc = $('meta[name="description"]'); if (desc && this.t("docDesc")) desc.setAttribute("content", this.t("docDesc"));
      $$(".lang__opt").forEach((o) => o.classList.toggle("is-on", o.dataset.langOpt === lang));
      const tg = $("#langToggle"); if (tg && window.PV_JS) tg.setAttribute("aria-label", PV_JS.langAria[lang]);
      try { localStorage.setItem("pv2-lang", lang); } catch (e) { /* private mode */ }
      document.dispatchEvent(new CustomEvent("pv:lang"));
    },
    // a string the scripts speak (i18n.js, PV_JS); {slots} are filled from the object given
    t(key, slots) { const d = (window.PV_JS || {})[key]; let v = d ? d[this.lang] || d.en : ""; if (slots) v = v.replace(/\{(\w+)\}/g, (m, k) => (k in slots ? slots[k] : m)); return v; }
  };
  function initialLang() {
    try { const q = new URLSearchParams(location.search).get("lang"); if (q === "th" || q === "en") return q; } catch (e) { /* ignore */ }
    try { const s = localStorage.getItem("pv2-lang"); if (s === "th" || s === "en") return s; } catch (e) { /* ignore */ }
    return (navigator.language || "").toLowerCase().startsWith("th") ? "th" : "en";
  }

  /* ---------- split registry ---------- */
  const splits = [];
  function buildSplit(el) {
    const rec = { el, split: null, trigger: null, revealed: el.dataset.revealed === "1" };
    const done = () => { rec.revealed = true; el.dataset.revealed = "1"; };
    const passed = () => el.getBoundingClientRect().top < window.innerHeight * .86;
    rec.make = function () {
      if (!hasSplit) {
        if (!rec.revealed && hasST && !passed()) {
          rec.trigger = gsap.from(el, { opacity: 0, y: 30, duration: 1, scrollTrigger: { trigger: el, start: "top 86%", once: true }, onComplete: done }).scrollTrigger;
        } else done();
        return;
      }
      rec.split = new SplitText(el, { type: "lines", linesClass: "st-line", mask: "lines" });
      if (rec.revealed || passed()) { gsap.set(rec.split.lines, { yPercent: 0 }); done(); return; }
      gsap.set(rec.split.lines, { yPercent: 115 });
      rec.trigger = gsap.to(rec.split.lines, { yPercent: 0, duration: 1.15, stagger: .09, ease: "power4.out", scrollTrigger: { trigger: el, start: "top 86%", once: true }, onComplete: done }).scrollTrigger;
    };
    rec.destroy = function () { if (rec.trigger) { rec.trigger.kill(); rec.trigger = null; } if (rec.split) { rec.split.revert(); rec.split = null; } };
    rec.make(); splits.push(rec); return rec;
  }
  const releaseSplits = () => splits.forEach((r) => { r.revealed = r.el.dataset.revealed === "1"; r.destroy(); });
  const remakeSplits = () => splits.forEach((r) => r.make());

  /* ---------- hero films ----------
     The hero is a photograph first: the opening frame of the first film, in the page from the start. The films are
     an enhancement laid over it. If none of them can be played, the photograph, the headline and the booking bar
     are all still there. */
  const heroVideo = $("#heroVideo");

  /* hero slideshow: each clip crossfades into the next, the last back into the first.
     The slide control shows which film is on, how far through it is, and lets the visitor step or pause. */
  const FADE = 1.4;                                   // seconds, matches the .hero__video opacity transition
  let clips = $$(".hero__video"), clipIdx = 0, handing = false, userPaused = false;
  const allClips = clips.slice();                     // stable order for the counter and the captions
  const slidesEl = $("#heroSlides"), slideNow = $("#slideNow"), slideTotal = $("#slideTotal"), slideBars = $$(".slides__bars b"), slideCaps = $$("#slideCap span"), pauseBtn = $("#slidePause");
  const activeClip = () => clips[clipIdx];
  function paintSlide() {
    if (!slidesEl) return;
    const i = Math.max(0, allClips.indexOf(activeClip()));
    if (slideNow) slideNow.textContent = pad2(i + 1);
    if (slideTotal) slideTotal.textContent = pad2(allClips.length);
    slideCaps.forEach((c, k) => c.classList.toggle("is-on", k === i));
    slidesEl.dataset.clips = String(clips.length);
    if (!clips.length) slidesEl.classList.remove("is-film");
  }
  function paintBars() {
    const cur = activeClip(), i = allClips.indexOf(cur);
    slideBars.forEach((b, k) => {
      let p = k < i ? 1 : 0;
      if (k === i && cur && cur.duration && isFinite(cur.duration)) p = Math.min(1, cur.currentTime / Math.max(.1, cur.duration - FADE));
      b.style.transform = "scaleX(" + p.toFixed(4) + ")";
    });
  }
  let warmed = false, heroSeen = true, gestureArmed = false, gestureAt = -1e9;
  const filmLog = [];                                 // what happened to the films, newest last; #diag shows it
  const note = (c, text) => { filmLog.push("film " + (allClips.indexOf(c) + 1) + ": " + text); if (filmLog.length > 8) filmLog.shift(); };

  /* How each film gets played, best first:
       stream  in parts, at the size the screen can show (film-stream.js)
       file    one file: the size the screen warrants, then the smaller ones
       memory  that file fetched whole and played from memory, for a host that cannot serve part of a file,
               which Safari on iPhone and iPad insists on
     A way that errors, or is asked to play and never moves, is dropped for the next one down. So every device ends up
     on the best version it can really play, and on the poster only if it can play none of them. */
  const ua = navigator.userAgent;
  const forced = (function () { try { return new URLSearchParams(location.search).get("film") || ""; } catch (e) { return ""; } })();   // ?film=nostream | memory | norange (an Apple browser on a host without ranges), for testing a way
  const apple = forced === "memory" || forced === "norange" || /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) || (/Safari\//.test(ua) && !/Chrom(e|ium)|Android|Edg\//.test(ua));
  let rangeProbe = null;
  // can this host serve part of a file? Asked once, with a two-byte request
  function hostRanges(url) {
    if (forced === "memory" || forced === "norange" || /^data:/.test(url)) return Promise.resolve(false);
    if (!rangeProbe) rangeProbe = fetch(url, { headers: { Range: "bytes=0-1" } }).then((r) => { const ok = r.status === 206; try { if (r.body) r.body.cancel(); } catch (e) { /* ignore */ } return ok; }, () => true);
    return rangeProbe;
  }
  function dataToBlob(u) { const bin = atob(u.slice(u.indexOf(",") + 1)), a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return new Blob([a], { type: "video/mp4" }); }
  function waysFor(c) {
    const srcEl = c.querySelector("source");
    const files = { sd: (srcEl && srcEl.getAttribute("src")) || c.getAttribute("src") || "", hq: c.dataset.hq || "", uhd: c.dataset.uhd || "" };
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const touch = window.matchMedia("(pointer: coarse)").matches || /iP(hone|ad|od)|Android/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const phone = touch && Math.min(screen.width, screen.height) < 600;
    // the film is cover-fitted: on a tall screen it is the height, not the width, that decides how big the frame is drawn
    const px = Math.max(window.innerWidth, window.innerHeight * 16 / 9) * (window.devicePixelRatio || 1);
    const stream = forced !== "nostream" && forced !== "memory" && !reduced && typeof window.PVStream === "function" && (window.PV_STREAMS || {})[c.id] ? { kind: "stream" } : null;
    // the largest single file: where the page marks it as fit for tablets (a 1440p file) anything but a phone may have it;
    // otherwise it is a 4K file and only a large desktop screen gets it. Phones stop at the 1080p file.
    const top = !!files.uhd && (c.dataset.uhdTouch === "1" ? !phone : !touch);
    const order = saveData ? ["sd"] : px >= 2200 && top ? ["uhd", "hq", "sd"] : px >= 1400 ? ["hq", "sd"] : ["sd"];
    const fileWays = [];
    const sizeRank = { uhd: 0, hq: 1, sd: 2 };          // a larger number is a lighter file
    order.forEach((k) => { if (files[k] && !fileWays.some((w) => w.url === files[k])) fileWays.push({ kind: "file", url: files[k], rank: sizeRank[k] }); });
    // Safari (every browser on an iPhone or iPad) plays a plain file natively, starts it quickly and is strict about
    // streams, so there the file comes first and the stream is the fallback. Everywhere else the stream comes first.
    const ways = apple ? fileWays.concat(stream ? [stream] : []) : (stream ? [stream] : []).concat(fileWays);
    const mem = (px >= 1400 && !saveData && files.hq) || files.sd;
    if (mem) ways.push({ kind: "memory", url: mem });
    return ways;
  }
  // at: where to pick the film up (a film moved to a smaller file carries on from where it was)
  function setFile(c, url, at) {
    c._pv = null; c._stalls = 0; c._waitAt = 0; c._fileAt = performance.now();
    $$("source", c).forEach((s) => s.remove());
    c.src = url; c.load();
    if (at > .3) c.addEventListener("loadedmetadata", () => { try { c.currentTime = at; } catch (e) { /* starts from the top */ } }, { once: true });
  }
  function dropClip(c) {
    // nothing plays this film here: it leaves the rotation, and the other one (or the poster) carries the hero
    note(c, "cannot be played on this device");
    c._pv = null; c._way = null;
    clips = clips.filter((x) => x !== c); c.classList.remove("is-on", "is-prev"); c.style.display = "none";
    clipIdx = Math.min(clipIdx, Math.max(0, clips.length - 1));
    if (clips.length === 1) { clips[0].loop = true; clips[0].classList.add("is-on"); playHero(); }
    paintSlide();
  }
  async function startWay(c, at) {
    const w = c._ways[0];
    if (!w) { dropClip(c); return; }
    c._way = w; c._asked = performance.now(); c._moved = 0;
    if (w.kind === "stream") {
      const ctl = window.PVStream(c, window.PV_STREAMS[c.id], (e) => { if (c._way === w) nextWay(c, "stream stopped: " + (e && e.message ? e.message : e)); }, armGesture);
      if (!ctl) { nextWay(c, "this browser cannot stream"); return; }
      c._pv = ctl;
      $$("source", c).forEach((s) => s.remove()); c.removeAttribute("src"); c.load();   // nothing of the single file is fetched
      if (c === allClips[0] || warmed) ctl.start();          // the opening film starts buffering at once; the others wait their turn
    } else if (w.kind === "file") {
      // the file is asked for at once. Whether this host can serve part of a file (Safari insists on it) is checked
      // alongside, not first: on a host that can, which is the usual case, the film starts a round trip sooner
      setFile(c, w.url, at);
      if (apple) hostRanges(w.url).then((can) => { if (!can && c._way === w) nextWay(c, "this host cannot serve part of a file"); });
    } else {
      if (!apple || (await hostRanges(w.url))) { if (c._way === w) nextWay(c, "file would not play"); return; }
      let blob = null;
      try { blob = /^data:/.test(w.url) ? dataToBlob(w.url) : await (await fetch(w.url)).blob(); } catch (e) { blob = null; }
      if (c._way !== w) return;
      if (!blob) { nextWay(c, "could not fetch the file"); return; }
      setFile(c, URL.createObjectURL(blob));
    }
    note(c, w.kind + (w.url && !/^data:|^blob:/.test(w.url) ? " " + w.url.split("/").pop().slice(0, 28) : ""));
    if (c === activeClip()) playHero();
  }
  function nextWay(c, why, keepTime) {
    if (!c._ways || !c._ways.length) return;
    const at = keepTime ? c.currentTime : 0;
    note(c, why);
    if (c._pv && !c._pv.dead) { const old = c._pv; c._pv = null; c._way = null; old.fail(); }   // shut the stream; its own report is ignored
    c._ways.shift();
    startWay(c, at);
  }
  // a browser may refuse to start a film until the page has been touched (Low Power Mode does this): the first tap starts it
  function armGesture() {
    if (gestureArmed) return; gestureArmed = true;
    filmLog.push("playback waits for a first touch"); if (filmLog.length > 8) filmLog.shift();
    // the control shows as a play button with a line saying what to do, so the still hero reads as paused, not broken
    if (slidesEl) slidesEl.classList.add("is-film", "is-waiting");
    if (pauseBtn) pauseBtn.setAttribute("aria-pressed", "true");
    const types = ["touchend", "click", "keydown"];
    const go = () => {
      gestureArmed = false; gestureAt = performance.now();
      types.forEach((t) => document.removeEventListener(t, go, true));
      if (slidesEl) slidesEl.classList.remove("is-waiting");
      if (pauseBtn) pauseBtn.setAttribute("aria-pressed", String(userPaused));
      // a touch unlocks only the films played inside it, so each one is started here; the ones not on screen are paused again
      const on = activeClip();
      clips.forEach((c) => { c._asked = 0; if (c === on) return; const p = c.play(); if (p) p.then(() => { if (c !== activeClip() && !handing) c.pause(); }, () => {}); });
      playHero();
    };
    types.forEach((t) => document.addEventListener(t, go, true));
  }
  // a film that streams is started and paused through its stream; a plain file directly
  function clipPlay(v) {
    if (!v._asked || v.paused) v._asked = performance.now();
    if (v._pv) { v._pv.play(); return; }
    const p = v.play(); if (p) p.catch((e) => { if (e && e.name === "NotAllowedError") armGesture(); });
  }
  function clipPause(v) { if (v._pv) v._pv.pause(); else v.pause(); }
  function playHero() {
    if (reduced || userPaused || !clips.length) return;
    const v = activeClip(); if (!v) return;
    clipPlay(v);
    // the queued clips only buffer once the first one is running and its own download has gone quiet,
    // so a phone never pulls two films at once
    if (!warmed && clips.length > 1) {
      const warm = () => {
        const a = activeClip();
        if (a && a._pv && a._pv.busy()) { setTimeout(warm, 1500); return; }
        warmed = true;
        clips.forEach((c) => { if (c === a) return; if (c._pv) c._pv.start(); else { c.preload = "auto"; c.load(); } });
      };
      if (!playHero.warming) { playHero.warming = true; setTimeout(warm, 4000); }
    }
  }
  function handOver(toIdx) {
    if (handing || clips.length < 2) return;
    const next = toIdx == null ? (clipIdx + 1) % clips.length : toIdx;
    if (next === clipIdx) return;
    handing = true;
    const from = clips[clipIdx], to = clips[next];
    try { to.currentTime = 0; } catch (e) { /* not seekable yet */ }
    clipPlay(to);
    from.classList.remove("is-on"); from.classList.add("is-prev");   // held visible underneath while the next fades in
    to.classList.add("is-on");
    clipIdx = next; paintSlide(); paintBars();
    setTimeout(() => {
      from.classList.remove("is-prev");
      clipPause(from); try { from.currentTime = 0; } catch (e) { /* ignore */ }
      if (from._pv) from._pv.rewound();                 // off screen and wound back: a good moment to rebuild it in one size
      handing = false;
    }, FADE * 1000);
  }
  function setPaused(p) {
    userPaused = p;
    if (pauseBtn) pauseBtn.setAttribute("aria-pressed", String(p));
    if (p) clips.forEach(clipPause); else playHero();
  }
  function initHeroClips() {
    if (!clips.length) return;
    // Nothing here ever hides a film that is still trying to load: Safari will not start, and will pause, a film it
    // cannot see, so a hidden film would stay hidden for good. An unloaded film is transparent over the poster anyway.
    clips.forEach((c) => { c._ways = waysFor(c); });
    // the slide control only shows once a film is really running, and follows the playing clip
    clips.forEach((v) => {
      v.addEventListener("playing", () => { if (slidesEl) slidesEl.classList.add("is-film"); }, { once: true });
      v.addEventListener("timeupdate", () => { if (v === activeClip()) paintBars(); });
      // a plain file that stops to load, after it had been running, counts against it (the first two seconds of a file do not)
      v.addEventListener("waiting", () => { if (v._way && v._way.kind === "file" && !v.seeking && v.currentTime > .2 && performance.now() - (v._fileAt || 0) > 2000) { v._stalls = (v._stalls || 0) + 1; v._waitAt = performance.now(); } });
      v.addEventListener("playing", () => { v._waitAt = 0; });
      // an error on the current way moves the film to its next way
      v.addEventListener("error", () => { if (!v._way) return; if (v._pv && !v._pv.dead) v._pv.fail(new Error("the browser reported a media error")); else nextWay(v, "the browser reported a media error"); }, true);
    });
    paintSlide();
    const step = (d) => { if (clips.length < 2 || handing) return; if (userPaused) setPaused(false); handOver((clipIdx + d + clips.length) % clips.length); };
    const prevBtn = $("#slidePrev"), nextBtn = $("#slideNext");
    if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => step(1));
    if (pauseBtn) pauseBtn.addEventListener("click", () => { if (performance.now() - gestureAt < 500) return; setPaused(!userPaused); });   // the tap that started the film is not also a pause
    if (clips.length < 2) clips[0].loop = true;
    else clips.forEach((v) => {
      v.loop = false;
      v.addEventListener("timeupdate", () => {
        if (v !== activeClip() || !v.duration || !isFinite(v.duration) || v.loop) return;
        if (v.duration - v.currentTime <= FADE) handOver();
      });
      v.addEventListener("ended", () => { if (v === activeClip() && !v.loop) handOver(); });
    });
    if (reduced) return;                                   // reduced motion shows the poster: no film is fetched at all
    clips.slice().forEach((c) => startWay(c));
    // the watch: the film on screen was asked to play. If it has not moved for a while and there is another way to play
    // it, take that way. The last way left is never given up on for being slow, only for failing outright.
    setInterval(() => {
      const v = activeClip();
      if (!v || !v._way || reduced || userPaused || gestureArmed || document.hidden) return;
      const now = performance.now();
      // too heavy for this line: a file that has stopped to load twice, or for more than a few seconds, gives way to the
      // next smaller one, picking up where it was.
      const lighter = v._way.kind === "file" && v._ways[1] && v._ways[1].kind === "file";
      if (lighter && (v._stalls >= 2 || (v._waitAt && now - v._waitAt > 2500))) {
        nextWay(v, v._stalls >= 2 ? "kept stopping to load" : "stopped to load for too long", true);
        // what the line could not carry for this film it cannot carry for the others: they move to the same size now, off screen
        const rank = v._ways[0] && v._ways[0].rank;
        if (rank != null) clips.forEach((c) => { if (c === v || !c._way || c._way.kind !== "file") return; let moved = false; while (c._ways[0] && c._ways[0].kind === "file" && c._ways[0].rank < rank && c._ways[1] && c._ways[1].kind === "file") { c._ways.shift(); moved = true; } if (moved) { note(c, "moved to the lighter file as well"); startWay(c); } });
        return;
      }
      if (!heroSeen) return;
      if (v.currentTime !== v._lastT) { v._lastT = v.currentTime; v._moved = now; return; }
      const idle = now - Math.max(v._moved || 0, v._asked || 0);
      // a film that has never moved is still making its first start, which now happens in the open: it gets a little longer
      const limit = (v._way.kind === "stream" ? (v.readyState >= 3 ? 5000 : 10000) : v._way.kind === "memory" ? 45000 : lighter ? 7000 : 15000) + (v._moved ? 0 : 3500);
      if (idle > limit && v._ways.length > 1) nextWay(v, "asked to play and did not move for " + Math.round(idle / 1000) + " s");
      else if (idle > 4000 && v.paused && !v._pv) { const p = v.play(); if (p) p.catch((e) => { if (e && e.name === "NotAllowedError") armGesture(); }); }   // a film stopped from outside is asked again, without restarting its clock
    }, 1000);
  }
  if (heroVideo) {
    initHeroClips();
    new IntersectionObserver((en) => en.forEach((x) => {
      heroSeen = x.isIntersecting;
      if (reduced) return;
      if (x.isIntersecting) playHero(); else clips.forEach(clipPause);
    })).observe($("#hero") || heroVideo);
  }

  /* ---------- scrolling ----------
     The browser scrolls the page. A jump to a section lands just under the fixed header, moves smoothly unless the
     visitor has asked for less motion, and (see the link handler below) leaves a real address behind it. */
  function scrollToEl(target, offset) {
    const el = typeof target === "string" ? $(target) : target; if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY + (offset == null ? -60 : offset);
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  }
  /* While a dialog is open the page behind it holds still. The scrollbar is left alone (hiding it would nudge the whole
     layout sideways): instead a wheel, a swipe or a scroll key that would move the page is turned away, anything that
     can scroll inside the dialog still does, and if the page is moved some other way it is put back where it was. */
  const locks = new Set();
  let lockY = 0;
  const scrollsInside = (target) => {
    for (let n = target; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return true;
      if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
    }
    return false;
  };
  const holdStill = (e) => { if (locks.size && !scrollsInside(e.target)) e.preventDefault(); };
  window.addEventListener("wheel", holdStill, { passive: false });
  window.addEventListener("touchmove", holdStill, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (!locks.size) return;
    const t = e.target, tag = t && t.tagName, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag || "");
    const pageKey = e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End";
    const softKey = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === " ";
    if ((pageKey && !typing || softKey && !typing && !/^(BUTTON|A|SUMMARY)$/.test(tag || "")) && !scrollsInside(t)) e.preventDefault();
  });
  window.addEventListener("scroll", () => { if (locks.size && Math.abs(window.scrollY - lockY) > 1) window.scrollTo({ top: lockY, behavior: "instant" }); }, { passive: true });
  function lockPage(name, on) {
    if (on && !locks.size) lockY = window.scrollY;
    if (on) locks.add(name); else locks.delete(name);
    document.documentElement.classList.toggle("is-locked", locks.size > 0);
  }
  const setInert = (el, on) => { if (!el) return; if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); };
  /* A dialog that covers the page takes the page out of reach: everything beside it is made inert while it is open, and
     given back when it closes. This does not depend on catching the Tab key, which matters in Safari, where Tab skips
     links unless the visitor has changed a system setting. keep: things that must stay live (a scrim that closes on
     a click, the header that holds the phone menu's close control). Only what is switched off here is switched back on. */
  function setBehind(dialog, on, keep) {
    const main = $("#main"), pool = Array.from(document.body.children).concat(main && main.contains(dialog) ? Array.from(main.children) : []);
    pool.forEach((el) => {
      if (el === dialog || el.contains(dialog) || /^(SCRIPT|STYLE|svg)$/i.test(el.tagName) || el.id === "toast" || (keep || []).indexOf(el) > -1) return;
      if (on) { if (!el.hasAttribute("inert")) { el.setAttribute("inert", ""); el.dataset.held = "1"; } }
      else if (el.dataset.held) { el.removeAttribute("inert"); delete el.dataset.held; }
    });
  }
  // Tab stays inside an open dialog: the first and last things that can take focus wrap round to each other
  function trapTab(e, root) {
    if (e.key !== "Tab") return;
    const f = $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]', root).filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); return; }
    if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); return; }
    // Safari's Tab skips links unless a system setting says otherwise, so its last stop may not be ours. If this press
    // carries focus out of the dialog, it is brought round to the other end instead of being lost
    const back = e.shiftKey ? last : first;
    setTimeout(() => { if (root.isConnected && !root.hasAttribute("inert") && !root.contains(document.activeElement)) back.focus(); }, 0);
  }

  /* ---------- top bar, chapter index, the Stay submenu, the phone menu ---------- */
  const top = $("#topbar"), burger = $("#burger"), mnav = $("#mnav");
  let menuOpen = false, menuReturn = null;
  const mbar = $("#mbar");
  const cindex = $("#cindex"), cLinks = cindex ? $$("a", cindex) : [];
  const cSecs = cLinks.map((a) => $(a.getAttribute("href")));
  const darkEls = $$("section[data-dark], footer[data-dark]");
  const wide = window.matchMedia("(min-width: 80em) and (min-height: 40em)");
  function onScroll() {
    const y = window.scrollY, h = ($(".hero") || {}).offsetHeight || 600;
    top.classList.toggle("is-solid", y > 40);            // header never hides: the Book entry stays within reach
    // the bottom bar is only there for the keyboard and for screen readers while it is on screen
    if (mbar) { const on = y > h * .5; if (on !== mbar.classList.contains("is-on")) { mbar.classList.toggle("is-on", on); setInert(mbar, !on); } }
    if (cindex && wide.matches) {
      // the dot for the chapter under the middle of the screen, and light dots while that middle sits on a dark band
      const mid = window.innerHeight * .5;
      let cur = -1;
      cSecs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= mid) cur = i; });
      cLinks.forEach((a, i) => { if (i === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      cindex.classList.toggle("is-light", darkEls.some((d) => { const r = d.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; }));
    }
  }
  function setOverlay(on) { document.body.classList.toggle("has-overlay", on); }
  let scrollTick = false;
  const queueScroll = () => { if (scrollTick) return; scrollTick = true; requestAnimationFrame(() => { scrollTick = false; onScroll(); }); };
  window.addEventListener("scroll", queueScroll, { passive: true });
  window.addEventListener("resize", queueScroll, { passive: true });

  /* The phone menu covers the screen, so it behaves like one: the page behind it is out of reach, the first link takes
     the keyboard, Escape or the burger closes it, and the keyboard goes back to where it was. The header stays live
     above it, which is where its close control (the burger) sits. */
  function toggleMenu(open, opts) {
    if (!burger || !mnav || open === menuOpen) return;
    if (open) menuReturn = document.activeElement;
    menuOpen = open; burger.setAttribute("aria-expanded", String(open)); top.classList.toggle("is-menu", open); setOverlay(open); lockPage("menu", open);
    setInert(mnav, !open);
    setBehind(mnav, open, [top]);
    if (hasGSAP && !reduced) {
      if (open) { gsap.set(mnav, { visibility: "visible" }); gsap.to(mnav, { clipPath: "inset(0% 0 0% 0)", duration: .6, ease: "power4.inOut", overwrite: true }); gsap.fromTo(".mnav nav a", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: .04, duration: .55, delay: .12, overwrite: true, clearProps: "transform,opacity" }); }
      else gsap.to(mnav, { clipPath: "inset(0 0 100% 0)", duration: .5, ease: "power4.inOut", overwrite: true, onComplete: () => { if (!menuOpen) gsap.set(mnav, { visibility: "hidden" }); } });
    } else { mnav.style.visibility = open ? "visible" : "hidden"; mnav.style.clipPath = open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)"; }
    if (open) { const first = $("a", mnav); if (first) first.focus({ preventScroll: true }); }
    else if (!(opts && opts.keepFocus) && menuReturn && menuReturn.focus) menuReturn.focus({ preventScroll: true });
  }
  setInert(mnav, true); setInert(mbar, true);
  if (burger) burger.addEventListener("click", () => toggleMenu(!menuOpen));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) toggleMenu(false); });
  // a phone turned on its side, or a window made wide: the burger is gone, so its menu goes with it
  try { window.matchMedia("(min-width: 62.5625em)").addEventListener("change", (e) => { if (e.matches && menuOpen) toggleMenu(false, { keepFocus: true }); }); } catch (e) { /* older browsers keep the menu until it is closed */ }

  // "Stay" opens a short list: the suites, the comparison, pet-friendly stays. It answers the pointer and the keyboard alike
  $$("[data-submenu]").forEach((g) => {
    const btn = $(".menu__more", g), sub = $(".submenu", g); if (!btn || !sub) return;
    let timer = null;
    const set = (on) => { clearTimeout(timer); g.classList.toggle("is-open", on); btn.setAttribute("aria-expanded", String(on)); };
    const links = $$("a", sub);
    btn.addEventListener("click", (e) => {
      const on = btn.getAttribute("aria-expanded") !== "true"; set(on);
      if (on && e.detail === 0 && links[0]) setTimeout(() => links[0].focus(), 60);   // e.detail is 0 for a key press, not a pointer
    });
    g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") set(true); });
    g.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") timer = setTimeout(() => set(false), 180); });
    g.addEventListener("focusout", (e) => { if (!g.contains(e.relatedTarget)) set(false); });
    g.addEventListener("keydown", (e) => {
      const isOpen = g.classList.contains("is-open"), i = links.indexOf(document.activeElement);
      if (e.key === "Escape" && isOpen) { e.stopPropagation(); set(false); btn.focus(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); if (!isOpen) set(true);
        const next = i < 0 ? (e.key === "ArrowDown" ? 0 : links.length - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        setTimeout(() => links[next].focus(), isOpen ? 0 : 60);
      }
    });
    links.forEach((a) => a.addEventListener("click", () => set(false)));
  });

  /* In-page links: a smooth move that lands under the header, takes the keyboard along, and leaves an address behind
     it, so a section can be shared (…/#pet-friendly) and the Back button returns to where the visitor was. */
  function goTo(id, push) {
    const el = id === "#hero" ? document.body : $(id); if (!el) return false;
    if (id === "#hero") window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    else {
      scrollToEl(el);
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
    }
    if (push) { try { const to = id === "#hero" ? location.pathname + location.search : id; if ((location.hash || "") !== (id === "#hero" ? "" : id)) history.pushState(null, "", to); } catch (e) { /* a sandboxed frame may refuse */ } }
    return true;
  }
  $$('a[href^="#"]:not(.skip):not([data-enquiry]):not([data-compare-open]):not([data-pet-details])').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) { e.preventDefault(); return; }
    if (!$(id)) return; e.preventDefault(); if (menuOpen) toggleMenu(false, { keepFocus: true });
    goTo(id, true);
  }));
  const toTop = $("#toTop"); if (toTop) toTop.addEventListener("click", () => goTo("#hero", true));

  /* ---------- motion ---------- */
  function setStaticState() {
    // no motion available: show the real numbers, filled bars and finished reveals immediately
    $$("[data-count]").forEach((el) => { el.textContent = el.dataset.count; });
    $$(".bar__fill").forEach((b) => { b.style.width = b.dataset.w + "%"; });
    $$(".st-lines").forEach((el) => { el.dataset.revealed = "1"; });
    $$("[data-rv], [data-mr]").forEach((el) => el.classList.add("is-in"));
  }
  function initMotion() {
    if (!hasGSAP || !hasST || reduced) { setStaticState(); return; }
    gsap.to("#progress", { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: .4 } });

    // hero exit: the footage stays full-bleed (no shrink-into-frame, per client); only the copy lifts and fades as you scroll
    gsap.to(".hero__grid, .hero__meta", { opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "42% top", scrub: true } });
    gsap.to(".hero__content", { y: -70, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "60% top", scrub: true } });

    // active menu link
    $$(".menu > a, .menu__group > a").forEach((a) => {
      const sec = $(a.getAttribute("href")); if (!sec) return;
      ScrollTrigger.create({ trigger: sec, start: "top 45%", end: "bottom 45%", onToggle: (s) => a.classList.toggle("is-active", s.isActive) });
    });

    // headline lines are measured once the web fonts are in, so a line never breaks where the fallback font would have
    // broken it. If the fonts are slow the headlines are simply split a moment later; they are readable the whole time
    let splitDone = false;
    const splitAll = () => { if (splitDone) return; splitDone = true; $$(".st-lines").forEach(buildSplit); ScrollTrigger.refresh(); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(splitAll); setTimeout(splitAll, 1500); } else splitAll();
    // cards and tiles rise in; siblings follow one another by a beat
    $$("[data-rv]").forEach((el) => {
      const sibs = $$(":scope > [data-rv]", el.parentElement), i = Math.max(0, sibs.indexOf(el));
      gsap.from(el, { opacity: 0, y: 40, duration: 1.1, delay: i * .09, scrollTrigger: { trigger: el, start: "top 88%", once: true, onEnter: () => el.classList.add("is-in") } });
    });
    // photographs open from the bottom edge while the image settles back into its frame
    $$("[data-mr]").forEach((fig) => {
      const img = $("img", fig), st = { trigger: fig, start: "top 88%", once: true };
      gsap.fromTo(fig, { clipPath: "inset(100% 0% 0% 0% round 16px)" }, { clipPath: "inset(0% 0% 0% 0% round 16px)", duration: 1.4, ease: "power4.inOut", scrollTrigger: st, clearProps: "clipPath" });
      if (img && !img.hasAttribute("data-parallax")) gsap.fromTo(img, { scale: 1.2 }, { scale: 1, duration: 1.9, ease: "power3.out", scrollTrigger: st, clearProps: "transform", onComplete: () => fig.classList.add("is-in") });
    });
    $$(".chapter__side").forEach((el) => gsap.from(el.children, { opacity: 0, x: -16, stagger: .1, duration: .9, scrollTrigger: { trigger: el.parentElement, start: "top 80%", once: true } }));
    $$("[data-parallax]").forEach((img) => {
      const d = parseFloat(img.dataset.parallax) || 8;
      gsap.set(img, { scale: 1 + d / 70 });
      gsap.fromTo(img, { yPercent: -d / 2 }, { yPercent: d / 2, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
    });
    // the full-bleed bands drift behind their pull line
    $$("[data-band]").forEach((img) => gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true } }));
    $$(".band__cap, .closing__mark").forEach((el) => gsap.from(el, { opacity: 0, y: 14, duration: 1, delay: .3, scrollTrigger: { trigger: el, start: "top 92%", once: true } }));
    $$("[data-count]").forEach((el) => {
      // the page carries the real figure; it only counts up from nought if it has not been seen yet
      if (el.getBoundingClientRect().top < window.innerHeight * .88) { el.textContent = el.dataset.count; return; }
      el.textContent = "0";
      const target = parseFloat(el.dataset.count), o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.6, ease: "power2.out", snap: { v: 1 }, onUpdate: () => { el.textContent = String(Math.round(o.v)); }, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    const hall = $("[data-hall]");
    if (hall) ScrollTrigger.create({ trigger: hall, start: "top 82%", once: true, onEnter: () => $$(".bar__fill", hall).forEach((b, i) => gsap.to(b, { width: b.dataset.w + "%", duration: 1.3, delay: i * .12, ease: "power3.out" })) });
    ScrollTrigger.refresh();
    // web fonts change line heights after first layout; measure again once they are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ---------- stay: the rooms, their views, and a gallery for each ----------
     Each accordion item is a suite. Inside it, one set of photographs per view (.rg__set, carrying the booking engine's
     own room id). Wide screens show the open set in the sticky stage beside the list; small screens swipe the set in
     place. Choosing a view changes the photographs and the room the "Check dates" link asks the engine for. */
  function initStay() {
    const acc = $("[data-acc]"); if (!acc) return;
    const items = $$(".acc__item", acc);
    const stage = $("#stayStage"), view = $("#stayView"), cur = $("#stayImg"), nxt = $("#stayImgNext"), now = $("#stayNow"), total = $("#stayTotal"), capEl = $("#stayName"), thumbs = $("#stayThumbs"), roomLine = $("#stayRoom");
    let shown = items.find((i) => i.classList.contains("is-open")) || items[0], idx = 0, token = 0, showing = "";
    const setOf = (item) => $(".rg__set:not([hidden])", item) || $(".rg__set", item);
    const shotsOf = (item) => $$(".rg__shot", setOf(item));
    const capOf = (shot) => I18N.t("cap" + shot.dataset.cap.charAt(0).toUpperCase() + shot.dataset.cap.slice(1));
    // a room is called what the booking panel's list calls it, so the two always agree
    const roomLabel = (id) => { const o = $('#bookRoom option[value="' + id + '"]'); return o ? o.textContent.trim() : ""; };
    const fullList = (item) => shotsOf(item).map((s) => s.dataset.full);

    // a folded panel is out of reach for everyone: no tab stops in it, nothing for a screen reader to wander into
    const shut = (panel, on) => { panel.classList.toggle("is-shut", on); setInert(panel, on); };
    function setOpen(item, open) {
      const panel = $(".acc__panel", item), head = $(".acc__head", item);
      head.setAttribute("aria-expanded", String(open));
      if (!open && panel.contains(document.activeElement)) head.focus();   // the keyboard does not stay behind in a panel that is closing
      if (!hasGSAP || reduced) { item.classList.toggle("is-open", open); panel.style.height = open ? "auto" : "0px"; shut(panel, !open); return; }
      if (open) {
        shut(panel, false);
        item.classList.add("is-open");
        gsap.fromTo(panel, { height: 0 }, { height: "auto", duration: .7, ease: "power3.inOut", overwrite: true, onComplete: () => { if (hasST) ScrollTrigger.refresh(); } });
        gsap.fromTo($$(".acc__copy > *", panel), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .6, stagger: .07, delay: .2, clearProps: "transform,opacity" });
      } else {
        // freeze the current pixel height before dropping the class so the first close animates too
        gsap.set(panel, { height: panel.offsetHeight });
        item.classList.remove("is-open");
        setInert(panel, true);
        gsap.to(panel, { height: 0, duration: .55, ease: "power3.inOut", overwrite: true, onComplete: () => { if (!item.classList.contains("is-open")) panel.classList.add("is-shut"); if (hasST) ScrollTrigger.refresh(); } });
      }
    }

    // ---- the stage ----
    function paintText() {
      const shots = shotsOf(shown), s = shots[idx]; if (!s) return;
      const room = roomLabel(setOf(shown).dataset.room);
      if (now) now.textContent = pad2(idx + 1);
      if (total) total.textContent = pad2(shots.length);
      if (capEl) capEl.textContent = capOf(s);
      if (roomLine) roomLine.textContent = room;
      if (cur) cur.alt = room + ": " + capOf(s);
      $$(".stay-thumb", thumbs).forEach((t, k) => { t.classList.toggle("is-on", k === idx); if (k === idx) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); t.setAttribute("aria-label", capOf(shots[k])); });
      // every photograph of the set carries a real description too (the small-screen strip shows them directly)
      items.forEach((it) => $$(".rg__set", it).forEach((set) => { const name = roomLabel(set.dataset.room); $$(".rg__shot", set).forEach((b) => { const t = name + ": " + capOf(b); b.setAttribute("aria-label", t); const im = $("img", b); if (im) im.alt = t; }); }));
    }
    function show(i, instant) {
      const shots = shotsOf(shown); if (!shots.length) return;
      idx = (i + shots.length) % shots.length;
      paintText();
      const key = shots[idx].dataset.full;
      if (!cur || !nxt || key === showing) return;
      showing = key;
      const my = ++token;
      if (instant || reduced) { cur.src = key; return; }
      // the next photograph fades in over the current one once it has loaded; a newer request cancels an older one
      nxt.onload = () => {
        if (my !== token) return;
        stage.classList.remove("is-loading"); stage.classList.add("is-swapping");
        setTimeout(() => { if (my !== token) return; cur.src = key; stage.classList.remove("is-swapping"); }, 620);
      };
      nxt.onerror = () => { if (my === token) stage.classList.remove("is-loading"); };
      stage.classList.remove("is-swapping"); stage.classList.add("is-loading");
      nxt.src = key;
    }
    function buildThumbs() {
      if (!thumbs) return;
      thumbs.textContent = "";
      shotsOf(shown).forEach((s, k) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "stay-thumb";
        const im = document.createElement("img"); im.alt = ""; im.src = ($("img", s) || {}).src || s.dataset.full; b.appendChild(im);
        b.addEventListener("click", () => { if (k === idx) lightbox.open(fullList(shown), idx); else show(k); });   // the photo already showing opens full size
        thumbs.appendChild(b);
      });
    }
    function showRoom(item, instant) { shown = item; idx = 0; buildThumbs(); show(0, instant); }
    if ($("#stayPrev")) $("#stayPrev").addEventListener("click", (e) => { e.stopPropagation(); show(idx - 1); });
    if ($("#stayNext")) $("#stayNext").addEventListener("click", (e) => { e.stopPropagation(); show(idx + 1); });
    if (view) view.addEventListener("click", () => lightbox.open(fullList(shown), idx));
    if (stage) stage.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") show(idx - 1); else if (e.key === "ArrowRight") show(idx + 1); });

    items.forEach((item) => {
      $(".acc__head", item).addEventListener("click", () => {
        if (item.classList.contains("is-open")) { setOpen(item, false); return; }
        items.forEach((o) => { if (o !== item && o.classList.contains("is-open")) setOpen(o, false); });
        setOpen(item, true); showRoom(item);
      });
      // choosing a view: its photographs, and its room in the booking engine
      const chips = $$(".views .chip", item), book = $("[data-book-room]", item);
      const pickView = (v) => {
        chips.forEach((c) => { const on = c.dataset.view === v; c.classList.toggle("is-on", on); c.setAttribute("aria-pressed", String(on)); });
        $$(".rg__set", item).forEach((s) => { s.hidden = s.dataset.view !== v; });
        const id = setOf(item).dataset.room;
        if (book) { book.dataset.bookRoom = id; book.href = ENGINE + "?roomtype=" + id; }
        if (item === shown) showRoom(item); else paintText();
        if (hasST) ScrollTrigger.refresh();
      };
      chips.forEach((c) => c.addEventListener("click", () => pickView(c.dataset.view)));
      // small screens: the photographs sit in the panel; a tap opens them full size
      $$(".rg__shot", item).forEach((s) => s.addEventListener("focus", () => { try { s.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) { /* older browsers scroll it themselves */ } }));
      $$(".rg__shot", item).forEach((s) => s.addEventListener("click", () => { const set = s.closest(".rg__set"), list = $$(".rg__shot", set); lightbox.open(list.map((x) => x.dataset.full), list.indexOf(s)); }));
    });
    items.forEach((it) => { if (!it.classList.contains("is-open")) shut($(".acc__panel", it), true); });
    showRoom(shown, true);
    document.addEventListener("pv:lang", paintText);
  }

  /* ---------- roam: radius slider and kind-of-place chips, working together ---------- */
  function initRadius() {
    const range = $("#radiusRange"), val = $("#radiusVal"), count = $("#radiusCount"); if (!range) return;
    const places = $$("[data-places] .place"), chips = $$("[data-roam-chips] .chip"), empty = $("#roamEmpty");
    let cat = "all";
    function apply(animate) {
      const km = parseFloat(range.value);
      val.textContent = km;
      range.style.setProperty("--pct", ((km - range.min) / (range.max - range.min) * 100) + "%");
      let n = 0;
      places.forEach((p) => {
        const hidden = cat !== "all" && p.dataset.cat !== cat;
        p.classList.toggle("is-hidden", hidden);
        const out = parseFloat(p.dataset.km) > km; if (!out && !hidden) n++;
        const was = p.classList.contains("is-out"); p.classList.toggle("is-out", out);
        if (animate && was && !out && hasGSAP && !reduced) gsap.fromTo(p, { x: -10, opacity: .3 }, { x: 0, opacity: 1, duration: .5, ease: "power2.out", clearProps: "x,opacity" });
      });
      count.textContent = n;
      if (empty) { empty.hidden = n > 0; empty.textContent = n ? "" : I18N.t("roamEmpty", { km: km }); }
    }
    const labels = () => places.forEach((p) => { const a = $(".place__m", p), nm = $(".place__n", p); if (a && nm) a.setAttribute("aria-label", nm.textContent.trim() + ": " + I18N.t("mapSearch")); });
    document.addEventListener("pv:lang", () => { labels(); apply(false); });
    labels();
    range.addEventListener("input", () => apply(true));
    chips.forEach((c) => c.addEventListener("click", () => {
      cat = c.dataset.cat;
      chips.forEach((x) => { const on = x === c; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
      apply(false);
      // the matching places step in one after another
      let i = 0;
      places.forEach((p) => {
        p.classList.remove("is-enter"); if (p.classList.contains("is-hidden")) return;
        p.style.setProperty("--i", i++); void p.offsetWidth; p.classList.add("is-enter");
      });
      if (hasST) ScrollTrigger.refresh();
    }));
    places.forEach((p) => p.addEventListener("animationend", () => p.classList.remove("is-enter")));
    apply(false);
  }

  /* ---------- facilities map: hotspots, panel, legend sync, and a guided tour of the eight places ---------- */
  function initMap() {
    const map = $("[data-map]"); if (!map) return;
    const stage = $("#mapStage", map), panel = $("#mapPanel"), pImg = $("#mapPanelImg"), pTitle = $("#mapPanelTitle"), pDesc = $("#mapPanelDesc"), goBtn = $("#mapGo"), closeBtn = $("#mapClose");
    const tourBtn = $("#mapTour"), stepNow = $("#mapStepNow"), prog = $("#mapProg");
    const hots = $$(".hot", stage), facItems = $$("[data-fac] .fac__item");
    const copy = $("#hotCopy");
    const descFor = (key) => { const n = copy && copy.querySelector('[data-hot="' + key + '"]'); return n ? n.innerHTML : ""; };
    let active = null, lastFocus = null;

    function light(key, on) {
      hots.forEach((h) => h.classList.toggle("is-lit", on && h.dataset.hot === key));
      facItems.forEach((f) => f.classList.toggle("is-lit", on && f.dataset.hot === key));
    }
    function open(hot, fromTour) {
      if (!fromTour) { stopTour(); lastFocus = document.activeElement; }
      active = hot;
      hots.forEach((h) => h.classList.toggle("is-active", h === hot));
      const key = hot.dataset.hot;
      pTitle.textContent = $(".hot__label", hot).textContent;
      pDesc.innerHTML = descFor(key);
      pImg.classList.remove("is-swap"); void pImg.offsetWidth;
      pImg.src = hot.dataset.img; pImg.alt = pTitle.textContent; pImg.classList.add("is-swap");
      if (stepNow) stepNow.textContent = pad2(hots.indexOf(hot) + 1);
      setInert(panel, false); panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false"); setOverlay(true);
      // lean the photograph toward the chosen place
      const x = parseFloat(hot.style.getPropertyValue("--x")), y = parseFloat(hot.style.getPropertyValue("--y"));
      $(".map__img", stage).style.transformOrigin = x + "% " + y + "%";
      map.classList.add("is-zoomed");
      if (!fromTour) closeBtn.focus();
    }
    function close() {
      stopTour();
      active = null;
      hots.forEach((h) => h.classList.remove("is-active"));
      const had = panel.contains(document.activeElement);
      panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); setInert(panel, true); setOverlay(false);
      map.classList.remove("is-zoomed");
      if (stepNow) stepNow.textContent = "00";
      if (had && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    setInert(panel, true);

    // the tour: the map walks through its own markers, a few seconds each, and stops the moment the visitor takes over
    const STEP = 4600;
    let touring = false, tourTimer = null, tourI = -1;
    function setProg(p, ms) { if (!prog) return; prog.style.transition = ms ? "transform " + ms + "ms linear" : "none"; prog.style.transform = "scaleX(" + p + ")"; }
    function tourStep() {
      const r = stage.getBoundingClientRect();
      tourI++;
      if (tourI >= hots.length || r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
      open(hots[tourI], true);
      setProg(tourI / hots.length, 0); if (prog) void prog.offsetWidth; setProg((tourI + 1) / hots.length, STEP);
      tourTimer = setTimeout(tourStep, STEP);
    }
    function startTour() {
      if (active) close();
      touring = true; tourI = -1;
      tourBtn.setAttribute("aria-pressed", "true"); map.classList.add("is-touring");
      scrollToEl(map, -84);
      tourStep();
    }
    function stopTour() {
      if (!touring) return;
      touring = false; clearTimeout(tourTimer);
      tourBtn.setAttribute("aria-pressed", "false"); map.classList.remove("is-touring");
      setProg(0, 500);
    }
    if (tourBtn) tourBtn.addEventListener("click", () => (touring ? close() : startTour()));

    hots.forEach((h) => {
      h.addEventListener("click", () => (active === h && !touring ? close() : open(h)));
      h.addEventListener("mouseenter", () => { light(h.dataset.hot, true); const pre = new Image(); pre.src = h.dataset.img; });
      h.addEventListener("mouseleave", () => light(h.dataset.hot, false));
    });
    // the markers introduce themselves once, then rest (no loops)
    if (hasGSAP && hasST && !reduced) gsap.from(hots, { opacity: 0, scale: .6, duration: .7, stagger: .06, ease: "power3.out", transformOrigin: "50% 50%", clearProps: "opacity,scale,transform", scrollTrigger: { trigger: stage, start: "top 75%", once: true } });
    // "Find on the map" backlinks in other chapters
    $$("[data-map-open]").forEach((b) => b.addEventListener("click", () => { const h = hots.find((x) => x.dataset.hot === b.dataset.mapOpen); if (!h) return; scrollToEl(stage, -90); setTimeout(() => { open(h); lastFocus = b; }, 500); }));
    facItems.forEach((f) => {
      const key = f.dataset.hot; if (!key) return;
      f.addEventListener("mouseenter", () => light(key, true));
      f.addEventListener("mouseleave", () => light(key, false));
      f.addEventListener("click", () => { const h = hots.find((x) => x.dataset.hot === key); if (h) { scrollToEl(stage, -90); open(h); } });
    });
    goBtn.addEventListener("click", () => {
      if (!active) return;
      const target = $(active.dataset.go); close();
      if (target) { scrollToEl(target); if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
    });
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("is-open")) close(); });
    // language switch re-renders the open panel text
    document.addEventListener("pv:lang", () => { if (active) { pTitle.textContent = $(".hot__label", active).textContent; pDesc.innerHTML = descFor(active.dataset.hot); } });
  }

  /* ---------- lightbox: one viewer, used by the gallery reel and by the room galleries ---------- */
  const lightbox = (function () {
    const box = $("#lightbox"), img = $("#lbImg"), count = $("#lbCount");
    if (!box || !img) return { open() {} };
    let list = [], idx = 0, isOpen = false, lastFocus = null, onToggle = null;
    function render() { img.src = list[idx]; count.textContent = (idx + 1) + " / " + list.length; if (hasGSAP && !reduced) gsap.fromTo(img, { opacity: .2, scale: .97 }, { opacity: 1, scale: 1, duration: .45 }); }
    // items: the addresses of the full-size photographs. cb(true|false) tells the caller when the viewer opens and closes
    function open(items, i, cb) {
      if (!items || !items.length) return;
      list = items; idx = Math.max(0, i || 0); onToggle = cb || null; isOpen = true; lastFocus = document.activeElement;
      if (onToggle) onToggle(true);
      box.classList.add("is-open"); box.setAttribute("aria-hidden", "false"); setOverlay(true); render();
      if (hasGSAP && !reduced) gsap.to(box, { opacity: 1, duration: .35 }); else box.style.opacity = "1";
      lockPage("lightbox", true); setBehind(box, true);
      $("#lbClose").focus();
    }
    function close() {
      isOpen = false; if (onToggle) onToggle(false);
      const done = () => { box.classList.remove("is-open"); box.setAttribute("aria-hidden", "true"); };
      if (hasGSAP && !reduced) gsap.to(box, { opacity: 0, duration: .3, onComplete: done }); else { box.style.opacity = "0"; done(); }
      setOverlay(false); lockPage("lightbox", false); setBehind(box, false); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    const step = (d) => { idx = (idx + d + list.length) % list.length; render(); };
    $("#lbClose").addEventListener("click", close); $("#lbPrev").addEventListener("click", () => step(-1)); $("#lbNext").addEventListener("click", () => step(1));
    box.addEventListener("click", (e) => { if (e.target === box || e.target.classList.contains("lightbox__stage")) close(); });
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") { const f = [$("#lbClose"), $("#lbPrev"), $("#lbNext")]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    });
    return { open: open };
  })();

  /* ---------- gallery: a strip of photographs that drifts slowly ----------
     It can be paused for good, stepped with the arrows, dragged or flung, and any photo opens full size. Off screen or
     in a background tab it does no work at all. With reduced motion it is a plain strip that scrolls sideways. */
  function initReel() {
    const reel = $("#reel"), track = $("#reelTrack"); if (!reel || !track) return;
    const originals = $$(".reel__item", track);
    const gallery = originals.map((b) => b.dataset.full);
    const pauseBtn = $("#reelPause"), prevBtn = $("#reelPrev"), nextBtn = $("#reelNext");
    const state = { paused: false, mouse: false, focus: false, held: false, open: false, seen: false, dragged: false, caught: false };
    const openAt = (b) => lightbox.open(gallery, Math.max(0, gallery.indexOf(b.dataset.full)), (on) => { state.open = on; kick(); });
    let kick = function () {};
    if (reduced) {
      // nothing drifts, so there is nothing to pause: the strip scrolls natively and the arrows step it
      if (pauseBtn) pauseBtn.hidden = true;
      const stepNative = (d) => reel.scrollBy({ left: d * (originals[0].offsetWidth + 16), behavior: "auto" });
      if (prevBtn) prevBtn.addEventListener("click", () => stepNative(-1));
      if (nextBtn) nextBtn.addEventListener("click", () => stepNative(1));
      originals.forEach((b) => b.addEventListener("click", () => openAt(b)));
      return;
    }
    reel.classList.add("is-drift");
    // a copy of the set on both sides makes the loop seamless, including the left gutter. The copies are for the eye only
    const mk = () => originals.map((b) => { const c = b.cloneNode(true); c.setAttribute("aria-hidden", "true"); c.tabIndex = -1; c.classList.add("is-clone"); c.removeAttribute("data-i18n-attr"); return c; });
    const before = mk(), after = mk();
    before.forEach((c) => track.insertBefore(c, originals[0]));
    after.forEach((c) => track.appendChild(c));

    const SPEED = 36;                                    // px per second: a slow drift, not a ticker
    let setW = 0, x = 0, vel = 0, step = null, last = 0, raf = 0;
    // x is kept within one set's width, with the first photograph of the real set at the gutter when x is -setW
    const wrap = (v) => (setW ? -setW - ((((-v - setW) % setW) + setW) % setW) : v);
    const paint = () => { track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)"; };
    const measure = () => { const w = originals[0].offsetLeft - before[0].offsetLeft; if (w > 0) { setW = w; x = wrap(x); paint(); } };
    measure(); x = -setW; paint();
    window.addEventListener("resize", measure);

    const drifting = () => !state.paused && !state.mouse && !state.focus && !state.held && !state.open;
    const busy = () => state.held || step || Math.abs(vel) > 4 || drifting();
    function frame(t) {
      raf = 0;
      const dt = Math.min(64, last ? t - last : 16); last = t;
      if (state.held) { /* the pointer is moving it */ }
      else if (step) {                                   // an arrow press: one photograph along, eased
        const p = Math.min(1, (t - step.t0) / step.dur), e = 1 - Math.pow(1 - p, 3);
        x = wrap(step.from + step.by * e); if (p >= 1) step = null;
      } else if (Math.abs(vel) > 4) { x = wrap(x + vel * dt / 1000); vel *= Math.pow(.94, dt / 16.7); }   // a fling coasts to a stop
      else if (drifting()) { vel = 0; x = wrap(x - SPEED * dt / 1000); }
      paint();
      if (state.seen && !document.hidden && busy()) raf = requestAnimationFrame(frame); else last = 0;
    }
    kick = function () { if (!raf && state.seen && !document.hidden && busy()) raf = requestAnimationFrame(frame); };
    new IntersectionObserver((en) => en.forEach((e) => { state.seen = e.isIntersecting; kick(); }), { rootMargin: "10% 0px" }).observe(reel);
    document.addEventListener("visibilitychange", kick);

    // pause is the visitor's decision and it stays: hovering, focusing or dragging never switches the drift back on
    if (pauseBtn) pauseBtn.addEventListener("click", () => { state.paused = !state.paused; pauseBtn.setAttribute("aria-pressed", String(state.paused)); kick(); });
    const stepBy = (d) => { vel = 0; step = { from: x, by: -d * (originals[0].offsetWidth + 16), t0: performance.now(), dur: 520 }; last = 0; kick(); };
    if (prevBtn) prevBtn.addEventListener("click", () => stepBy(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => stepBy(1));

    // a mouse over the strip holds it still (a touch does not); keyboard focus holds it and brings the focused photo into view
    reel.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") state.mouse = true; });
    reel.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { state.mouse = false; kick(); } });
    const keyboardFocus = (el) => { try { return el.matches(":focus-visible"); } catch (err) { return true; } };
    reel.addEventListener("focusin", (e) => {
      const kb = keyboardFocus(e.target); state.focus = kb;
      const b = e.target.closest(".reel__item");
      if (kb && b && !b.classList.contains("is-clone")) { step = null; vel = 0; x = wrap(-setW - (b.offsetLeft - originals[0].offsetLeft)); paint(); }
    });
    reel.addEventListener("focusout", () => { state.focus = false; kick(); });

    // drag or fling. Sideways movement belongs to the strip; up and down still scrolls the page (touch-action: pan-y)
    let pid = null, px = 0, pt = 0, travelled = 0;
    reel.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      state.caught = Math.abs(vel) > 40 || !!step;         // a tap that catches a moving strip stops it; it does not open a photo
      pid = e.pointerId; px = e.clientX; pt = e.timeStamp; travelled = 0; vel = 0; step = null; state.held = true; state.dragged = false;
    });
    reel.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - px, dtm = Math.max(1, e.timeStamp - pt);
      travelled += Math.abs(dx);
      if (!state.dragged && travelled > 6) { state.dragged = true; reel.classList.add("is-held"); try { reel.setPointerCapture(pid); } catch (err) { /* the drag works without capture */ } }
      if (state.dragged) { x = wrap(x + dx); vel = .8 * (dx / dtm * 1000) + .2 * vel; paint(); }
      px = e.clientX; pt = e.timeStamp;
    });
    const release = (e) => {
      if (e.pointerId !== pid) return;
      pid = null; state.held = false; reel.classList.remove("is-held");
      if (!state.dragged || e.type === "pointercancel") vel = 0;
      setTimeout(() => { state.dragged = false; state.caught = false; }, 80);
      last = 0; kick();
    };
    reel.addEventListener("pointerup", release); reel.addEventListener("pointercancel", release);

    $$(".reel__item", track).forEach((b) => b.addEventListener("click", () => { if (state.dragged || state.caught) return; openAt(b); }));
  }

  /* ---------- drawers: room amenities, the suite comparison, and the enquiry composer ----------
     One drawer at a time. Open: the page behind is out of reach, Tab stays inside, Escape or the scrim closes it, and
     the keyboard returns to whatever opened it. Closed: nothing in it can be reached at all. */
  const Drawers = (function () {
    const drawers = $$(".drawer"); let cur = null, origin = null;
    drawers.forEach((d) => { setInert(d, true); $$(".drawer__list li, .cmp__t tbody tr", d).forEach((row, i) => row.style.setProperty("--i", i)); });
    function close(opts) {
      if (!cur) return;
      const d = cur; cur = null;
      d.classList.remove("is-open"); d.setAttribute("aria-hidden", "true"); setInert(d, true); setBehind(d, false);
      setOverlay(false); lockPage("drawer", false);
      if (!(opts && opts.keepFocus) && origin && origin.focus) origin.focus({ preventScroll: true });
    }
    // from: what to give the keyboard back to on close, when that is not simply whatever has it now
    function open(d, focusEl, from) {
      if (!d) return;
      let back = from || (cur ? origin : document.activeElement);
      if (cur) close({ keepFocus: true });
      if (menuOpen) { toggleMenu(false, { keepFocus: true }); back = burger; }
      cur = d; origin = back;
      setInert(d, false); setBehind(d, true); d.classList.add("is-open"); d.setAttribute("aria-hidden", "false"); setOverlay(true); lockPage("drawer", true);
      const c = focusEl || $("[data-drawer-close]", d); if (c) setTimeout(() => { if (cur === d) c.focus({ preventScroll: true }); }, 60);
    }
    drawers.forEach((d) => {
      $$("[data-drawer-close]", d).forEach((b) => b.addEventListener("click", () => close()));
      d.addEventListener("click", (e) => { if (e.target === d) close(); });
    });
    document.addEventListener("keydown", (e) => { if (!cur) return; if (e.key === "Escape") { e.preventDefault(); close(); } else trapTab(e, cur); });
    return { open: open, close: close, current: () => cur, origin: () => origin };
  })();
  function initDrawers() {
    $$("[data-amen-open]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); Drawers.open($("#amen")); }));
    $$("[data-compare-open]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); Drawers.open($("#compare")); }));
  }

  /* ---------- booking: one stay, wherever it is shown ----------
     The bar under the hero, the planner panel and the enquiry composer all show the same stay: arrival, departure,
     adults and (optionally) a room. Change it anywhere and it changes everywhere. Before any link to the resort's
     booking page is followed, the stay goes through one check; while it does not pass, the links carry no dates at all,
     so a stale or impossible search can never be sent. */
  const ENGINE = (FX && FX.booking.engine) || "https://letsbook.me/booking/patravanaresortkhaoyai";
  const A_MIN = (FX && FX.booking.adultsMin) || 1, A_MAX = (FX && FX.booking.adultsMax) || 3;
  const ROOM_IDS = FX ? FX.booking.rooms.map((r) => r.id) : [];
  let lastCode = "";
  const Booking = (function () {
    const t0 = todayBkk();
    // chosen: has the visitor picked dates, or are these still the page's suggestion
    const state = { checkin: addDays(t0, 14), checkout: addDays(t0, 16), adults: "2", room: "", chosen: false };
    const subs = [];
    // The check. It reads the calendar afresh each time, so a page left open overnight is judged by today's date.
    function check(s) {
      s = s || state;
      const e = {}, today = dayNum(todayBkk()), a = dayNum(s.checkin), b = dayNum(s.checkout);
      if (!s.checkin) e.checkin = "errIn"; else if (isNaN(a)) e.checkin = "errDate"; else if (a < today) e.checkin = "errPast";
      if (!s.checkout) e.checkout = "errOut"; else if (isNaN(b)) e.checkout = "errDate"; else if (!isNaN(a) && b <= a) e.checkout = "errOrder"; else if (b <= today) e.checkout = "errPast";
      const n = String(s.adults);
      if (n !== "more" && !(/^\d+$/.test(n) && +n >= A_MIN && +n <= A_MAX)) e.adults = "errAdults";
      return e;
    }
    const ok = (e) => !Object.keys(e).length;
    // What the resort's booking page is asked for: only what it is known to keep. A party of four or more goes over
    // with its dates alone, to choose rooms and guests there. Nothing about children, pets or codes is put in the address.
    function url(s) {
      s = s || state;
      const q = new URLSearchParams({ checkin: s.checkin, checkout: s.checkout });
      if (String(s.adults) !== "more") q.set("adults", String(s.adults));
      if (s.room && ROOM_IDS.includes(s.room)) q.set("roomtype", s.room);
      return ENGINE + "?" + q.toString();
    }
    function set(patch, from) {
      if ("room" in patch && patch.room && !ROOM_IDS.includes(patch.room)) patch.room = "";
      if ("checkin" in patch || "checkout" in patch) state.chosen = true;
      Object.assign(state, patch);
      // an arrival moved to or past the departure takes the departure along, one night on
      if ("checkin" in patch && !("checkout" in patch) && !isNaN(dayNum(state.checkin)) && !(dayNum(state.checkout) > dayNum(state.checkin))) state.checkout = addDays(state.checkin, 1);
      subs.forEach((fn) => fn(from));
    }
    return { state: state, check: check, ok: ok, url: url, set: set, nights: () => dayNum(state.checkout) - dayNum(state.checkin), onChange: (fn) => subs.push(fn) };
  })();
  let closeBookPanel = function () { return null; };       // set by initBooking: closes the planner and says what had opened it

  function initBooking() {
    const panel = $("#bookPanel"), scrim = $("#bookScrim"), form = $("#bookForm"); if (!panel || !form) return;
    const inEl = $("#bookIn"), outEl = $("#bookOut"), adults = $("#bookAdults"), promo = $("#bookPromo"), summary = $("#bookSummary"), roomSel = $("#bookRoom"), go = $("#bookGo"), more = $("#bookMore");
    const dock = $("#dock"), dIn = $("#dockIn"), dOut = $("#dockOut"), dAdults = $("#dockAdults"), dGo = $("#dockGo"), dErr = $("#dockErr"), dMore = $("#dockMore");
    const S = Booking.state, KEYS = ["checkin", "checkout", "adults"];
    const fields = { panel: { checkin: inEl, checkout: outEl, adults: adults }, dock: { checkin: dIn, checkout: dOut, adults: dAdults } };
    // a field shows its message once the visitor has changed it, or once they have tried to continue
    const shown = { panel: {}, dock: {} };
    const errText = (key) => I18N.t(key, { max: A_MAX });
    const put = (el, v) => { if (el && el !== document.activeElement && el.value !== v) el.value = v; };
    if (promo && FX && FX.offers.code.code) promo.placeholder = FX.offers.code.code;

    function render() {
      const today = todayBkk(), e = Booking.check(), valid = Booking.ok(e), href = valid ? Booking.url() : ENGINE;
      const afterIn = isNaN(dayNum(S.checkin)) || S.checkin < today ? addDays(today, 1) : addDays(S.checkin, 1);
      [inEl, dIn].forEach((el) => { if (el) { el.min = today; put(el, S.checkin); } });
      [outEl, dOut].forEach((el) => { if (el) { el.min = afterIn; put(el, S.checkout); } });
      [adults, dAdults].forEach((el) => put(el, String(S.adults)));
      put(roomSel, S.room);
      // the planner: each field carries its own message
      KEYS.forEach((k) => {
        const el = fields.panel[k], msg = $("#" + el.id + "Err"), key = shown.panel[k] && e[k];
        el.setAttribute("aria-invalid", String(!!key));
        if (msg) { msg.hidden = !key; msg.textContent = key ? errText(key) : ""; }
      });
      if (more) more.hidden = String(S.adults) !== "more";
      if (go) go.href = href;
      // the bar under the hero: the field at fault is marked, and one line under the bar says what is wrong
      if (dock) {
        const first = KEYS.find((k) => shown.dock[k] && e[k]);
        KEYS.forEach((k) => { const el = fields.dock[k]; if (!el) return; const bad = !!(shown.dock[k] && e[k]); el.setAttribute("aria-invalid", String(bad)); const f = el.closest(".dock__f"); if (f) f.classList.toggle("is-bad", bad); });
        if (dErr) { dErr.hidden = !first; dErr.textContent = first ? errText(e[first]) : ""; }
        if (dMore) dMore.hidden = String(S.adults) !== "more";
        if (dGo) dGo.href = href;
      }
      if (summary) {
        if (!valid) summary.textContent = "";
        else {
          const n = Booking.nights(), L = I18N.lang;
          const room = roomSel && roomSel.value ? roomSel.options[roomSel.selectedIndex].textContent.trim() + "   " : "";
          const who = String(S.adults) === "more" ? I18N.t("adultsMore") : I18N.t(String(S.adults) === "1" ? "guestsA1" : "guestsA", { n: S.adults });
          const code = promo ? promo.value.trim() : "";
          summary.textContent = room + shortDate(S.checkin, L) + "  →  " + shortDate(S.checkout, L) + "   " + n + " " + I18N.t(n === 1 ? "night" : "nights") + "   " + who + (code ? "   " + I18N.t("codeShort") + " " + code : "");
        }
      }
    }
    Booking.onChange(render);
    document.addEventListener("pv:lang", render);

    Object.keys(fields).forEach((surface) => KEYS.forEach((k) => {
      const el = fields[surface][k]; if (!el) return;
      el.addEventListener("input", () => { if (el.value) shown[surface][k] = true; Booking.set({ [k]: el.value }, surface); });
      el.addEventListener("change", () => { shown[surface][k] = true; Booking.set({ [k]: el.value }, surface); });
      el.addEventListener("blur", () => { if (!shown[surface][k]) { shown[surface][k] = true; render(); } });
    }));
    if (roomSel) roomSel.addEventListener("change", () => Booking.set({ room: roomSel.value }, "panel"));
    if (promo) promo.addEventListener("input", render);

    // Following a link to the booking page. The stay is checked again at this moment; if it does not pass, the link is
    // not followed, every message is shown and the first field at fault takes the keyboard.
    function proceed(e, link, surface) {
      const errs = Booking.check();
      if (!Booking.ok(errs)) {
        e.preventDefault();
        KEYS.forEach((k) => { shown[surface][k] = true; });
        render();
        const first = KEYS.find((k) => errs[k]), el = first && fields[surface][first]; if (el) el.focus();
        return;
      }
      link.href = Booking.url();
      // the booking page does not take a code from the address, so the code goes on the clipboard, and the message says what really happened
      const code = surface === "panel" && promo ? promo.value.trim() : "";
      if (!code) toast(I18N.t("openedEngine"));
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => toast(I18N.t("openedEngineCode") + ": " + code), () => toast(I18N.t("openedEngineNoCopy") + ": " + code));
      else toast(I18N.t("openedEngineNoCopy") + ": " + code);
    }
    if (go) go.addEventListener("click", (e) => proceed(e, go, "panel"));
    form.addEventListener("submit", (e) => { e.preventDefault(); if (go) go.click(); });   // Enter in a field follows the same link
    if (dGo) dGo.addEventListener("click", (e) => proceed(e, dGo, "dock"));
    if (dock) {
      dock.addEventListener("submit", (e) => { e.preventDefault(); if (dGo) dGo.click(); });
      // the whole field is the target: a click anywhere on it opens the date picker
      $$(".dock__f", dock).forEach((f) => f.addEventListener("click", (e) => {
        const input = $("input", f); if (!input || e.target === input || typeof input.showPicker !== "function") return;
        try { input.showPicker(); } catch (err) { input.focus(); }
      }));
    }

    // ---- the planner panel ----
    let lastFocus = null, isOpen = false;
    setInert(panel, true);
    function open(e) {
      if (e) e.preventDefault();
      const from = e && e.currentTarget;
      let back = document.activeElement;
      if (Drawers.current()) { back = Drawers.origin() || back; Drawers.close({ keepFocus: true }); }
      if (menuOpen) { toggleMenu(false, { keepFocus: true }); back = burger; }
      // opened from a room ("Check dates for this room"): the planner starts on that room
      if (from && from.dataset && from.dataset.bookRoom) Booking.set({ room: from.dataset.bookRoom }, "open");
      if (isOpen) return;
      isOpen = true; lastFocus = back;
      if (lastCode && promo && !promo.value) promo.value = lastCode;
      setInert(panel, false); setBehind(panel, true, [scrim]); panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false"); scrim.classList.add("is-on"); setOverlay(true); lockPage("book", true);
      render(); setTimeout(() => { if (isOpen) inEl.focus({ preventScroll: true }); }, 250);
    }
    function close(opts) {
      if (!isOpen) return null;
      isOpen = false;
      panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); setInert(panel, true); setBehind(panel, false, [scrim]); scrim.classList.remove("is-on"); setOverlay(false); lockPage("book", false);
      if (!(opts && opts.keepFocus) && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      return lastFocus;
    }
    closeBookPanel = close;
    $$("[data-book-open]").forEach((b) => b.addEventListener("click", open));
    $("#bookClose").addEventListener("click", () => close()); scrim.addEventListener("click", () => close());
    document.addEventListener("keydown", (e) => { if (!isOpen) return; if (e.key === "Escape") { e.preventDefault(); close(); } else trapTab(e, panel); });
    render();
  }

  /* ---------- enquiries: a message written here, sent by the guest ----------
     Two kinds: a pet-friendly stay, and a group event. The form writes a plain message from what the guest enters.
     The guest copies it, or opens it in their own mail app, and sends it to the resort themselves. Nothing leaves this
     page on its own, nothing is stored, and preparing a message confirms nothing: the page says so. */
  let hallLayout = "theatre", hallPicked = false;          // the layout chosen in the hall planner, for a group enquiry
  function initEnquiry() {
    const box = $("#enquiry"); if (!box || !FX) return;
    const el = (id) => $("#" + id);
    const inEl = el("enqIn"), outEl = el("enqOut"), und = el("enqUndecided"), adults = el("enqAdults"), kids = el("enqKids"), suite = el("enqSuite"), pet = el("enqPet"), petN = el("enqPetN"), petSize = el("enqPetSize"),
      purpose = el("enqPurpose"), layout = el("enqLayout"), people = el("enqPeople"), rooms = el("enqRooms"), note = el("enqNote"),
      text = el("enqText"), status = el("enqStatus"), copyBtn = el("enqCopy"), mail = el("enqMail"), title = el("enqTitle"), lead = el("enqLead"), help = el("enqHelp"), layoutHint = el("enqLayoutHint");
    const S = Booking.state, MAIL = "mailto:" + FX.contact.email;
    let mode = "pet", tried = false, touched = {}, saidUndecided = null;   // saidUndecided: the guest's own answer to "dates not decided yet", once given
    const whole = (v, min, max) => (/^\d+$/.test(String(v).trim()) && +v >= min && +v <= max ? +v : null);
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const order = { pet: ["enqIn", "enqOut", "enqAdults", "enqKids", "enqPet", "enqPetN"], group: ["enqIn", "enqOut", "enqPeople", "enqRooms"] };

    function errors() {
      const e = {};
      if (!und.checked) { const b = Booking.check(); if (b.checkin) e.enqIn = b.checkin; if (b.checkout) e.enqOut = b.checkout; }
      if (mode === "pet") {
        if (whole(adults.value, 1, 30) == null) e.enqAdults = "errCount";
        if (kids.value !== "" && whole(kids.value, 0, 30) == null) e.enqKids = "errCount0";
        if (!clean(pet.value)) e.enqPet = "errPet";
        if (petN.value !== "" && whole(petN.value, 1, 20) == null) e.enqPetN = "errCount";
      } else {
        if (whole(people.value, 1, 2000) == null) e.enqPeople = "errPeople";
        if (rooms.value !== "" && whole(rooms.value, 0, 64) == null) e.enqRooms = "errCount0";
      }
      return e;
    }
    // the message, in the language the guest is reading. Every part comes from what they entered; nothing is left as a blank to fill
    function compose() {
      const L = I18N.lang, n = Booking.nights();
      const dates = und.checked ? I18N.t("enqUndecided") : shortDate(S.checkin, L) + " " + I18N.t("enqTo") + " " + shortDate(S.checkout, L) + " (" + n + " " + I18N.t(n === 1 ? "night" : "nights") + ")";
      const q = clean(note.value), question = q ? "\n" + I18N.t("enqQuestion") + ": " + q : "";
      if (mode === "pet") {
        const a = +adults.value, k = +kids.value || 0;
        const guests = I18N.t(a === 1 ? "guestsA1" : "guestsA", { n: a }) + (k ? ", " + I18N.t(k === 1 ? "guestsC1" : "guestsC", { n: k }) : "");
        const petLine = clean(pet.value) + (petN.value ? "; " + I18N.t("enqPetCount") + ": " + petN.value : "") + (clean(petSize.value) ? "; " + I18N.t("enqPetSize") + ": " + clean(petSize.value) : "");
        return FACTS.t("enq.pet.msg", { dates: dates, guests: guests, suite: suite.value ? suite.options[suite.selectedIndex].textContent.trim() : I18N.t("enqNoPref"), pet: petLine, question: question });
      }
      return FACTS.t("enq.group.msg", { dates: dates, purpose: clean(purpose.value) || I18N.t("enqNotSaid"), layout: layout.value ? layout.options[layout.selectedIndex].textContent.trim() : I18N.t("enqNoLayout"), people: String(+people.value), rooms: rooms.value === "" ? I18N.t("enqNotSaid") : String(+rooms.value), question: question });
    }
    const say = (msg, bad) => { status.textContent = msg || ""; status.classList.toggle("is-bad", !!bad); };
    function update() {
      const e = errors(), valid = !Object.keys(e).length;
      order.pet.concat(order.group).forEach((id) => {
        const input = el(id), msg = el(id + "Err"), key = (tried || touched[id]) && e[id]; if (!input) return;
        input.setAttribute("aria-invalid", String(!!key));
        if (msg) { msg.hidden = !key; msg.textContent = key ? I18N.t(key, { max: A_MAX }) : ""; }
      });
      inEl.disabled = outEl.disabled = und.checked;
      if (layoutHint) layoutHint.textContent = layout.value ? I18N.t("enqLayoutCap", { n: FACTS.val("hall." + layout.value + ".full") }) : "";
      // the draft follows the form while the form is in order. When it is not, the last good draft stays as it was,
      // and the mail link carries no stale text
      if (valid) {
        text.value = compose();
        mail.href = MAIL + "?subject=" + encodeURIComponent(FACTS.t("enq." + mode + ".subject")) + "&body=" + encodeURIComponent(text.value);
        if (status.classList.contains("is-bad")) say("");
      } else mail.href = MAIL;
      return e;
    }
    function label() {
      title.textContent = I18N.t(mode === "pet" ? "enqPetTitle" : "enqGroupTitle");
      lead.textContent = mode === "pet" ? FACTS.t("pet.summary") + " " + I18N.t("enqPetLead") : I18N.t("enqGroupLead");
      help.textContent = I18N.t(mode === "pet" ? "enqPetHelp" : "enqGroupHelp");
      text.placeholder = I18N.t("enqEmpty");
    }
    function open(kind, opts) {
      const next = kind === "group" ? "group" : "pet";
      if (next !== mode) text.value = "";                  // a draft for the other kind of enquiry is not carried over
      mode = next; tried = false; touched = {};
      $$("[data-enq-mode]", box).forEach((d) => { d.hidden = d.dataset.enqMode !== mode; });
      // the stay already chosen on the page comes along. Dates nobody has chosen are not assumed
      und.checked = saidUndecided == null ? !S.chosen : saidUndecided;
      inEl.value = S.checkin; outEl.value = S.checkout; inEl.min = todayBkk();
      if (mode === "pet") { if (adults.value === "" && String(S.adults) !== "more") adults.value = String(S.adults); if (S.room) suite.value = S.room; }
      else if (opts && opts.layout) layout.value = opts.layout;
      say(""); label(); update();
      const back = closeBookPanel({ keepFocus: true });    // asked from inside the planner: the planner steps aside
      Drawers.open(box, null, back || undefined);
    }

    // the dates here are the page's dates: change them and the booking bar and the planner follow
    inEl.addEventListener("change", () => { touched.enqIn = true; Booking.set({ checkin: inEl.value }, "enquiry"); });
    outEl.addEventListener("change", () => { touched.enqOut = true; Booking.set({ checkout: outEl.value }, "enquiry"); });
    inEl.addEventListener("input", () => Booking.set({ checkin: inEl.value }, "enquiry"));
    outEl.addEventListener("input", () => Booking.set({ checkout: outEl.value }, "enquiry"));
    adults.addEventListener("input", () => { const n = whole(adults.value, 1, 30); if (n != null) Booking.set({ adults: n <= A_MAX ? String(n) : "more" }, "enquiry"); else update(); });
    Booking.onChange(() => { if (Drawers.current() !== box) return; if (inEl !== document.activeElement) inEl.value = S.checkin; if (outEl !== document.activeElement) outEl.value = S.checkout; update(); });
    [und, kids, suite, pet, petN, petSize, purpose, layout, people, rooms, note].forEach((f) => f.addEventListener("input", update));
    [adults, kids, pet, petN, people, rooms].forEach((f) => { const mark = () => { touched[f.id] = true; update(); }; f.addEventListener("change", mark); f.addEventListener("blur", mark); });
    und.addEventListener("change", () => { saidUndecided = und.checked; });
    el("enqForm").addEventListener("submit", (e) => e.preventDefault());

    // Copy. "Copied" is said only when the browser confirms it. If the browser refuses, the message is selected for the
    // guest to copy by hand, and the page says how.
    copyBtn.addEventListener("click", () => {
      tried = true;
      const e = update(), bad = order[mode].find((id) => e[id]);
      if (bad) { say(I18N.t("enqFix"), true); const f = el(bad); if (f && !f.disabled) f.focus(); return; }
      const done = () => { copyBtn.classList.add("is-done"); setTimeout(() => copyBtn.classList.remove("is-done"), 1900); say(I18N.t("enqCopied")); };
      const byHand = () => {
        text.focus(); text.select();
        let ok = false; try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        if (ok) { done(); copyBtn.focus({ preventScroll: true }); } else say(I18N.t("enqCopyFail"), true);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.value).then(done, byHand); else byHand();
    });
    // the mail link is a real link, so a refused or missing mail app loses nothing: the address is printed beside it
    mail.addEventListener("click", (e) => { tried = true; const er = update(); if (order[mode].some((id) => er[id])) { e.preventDefault(); say(I18N.t("enqFix"), true); } });

    $$("[data-enquiry]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      open(b.dataset.enquiry, { layout: b.hasAttribute("data-enquiry-layout") || hallPicked ? hallLayout : "" });
    }));
    document.addEventListener("pv:lang", () => { label(); update(); });
    label();
    // a link can ask for the form directly (…/?enquiry=pet). Nothing personal is ever put in the address
    try { const want = new URLSearchParams(location.search).get("enquiry"); if (want === "pet" || want === "group") setTimeout(() => open(want), 400); } catch (e) { /* ignore */ }
  }

  /* ---------- pet-friendly stays: the details list, and what happens if the policy changes ---------- */
  function initPet() {
    if (!FX) return;
    const P = FX.pet, off = !P.petStaysOffered || P.eligibilityMappingStatus === "suspended";
    // pet stays withdrawn or paused in facts.js: the section, its links and its enquiry all step back together
    document.documentElement.classList.toggle("no-pet", off);
    const list = $("#petDetailsList"), details = $("#pet-details");
    // owner-approved rules, once there are any. Until then the list holds only the confirmed statements already in the page
    const paint = () => {
      if (!list) return;
      $$("li[data-approved]", list).forEach((li) => li.remove());
      if (Array.isArray(P.approvedDetails)) P.approvedDetails.forEach((d) => { const li = document.createElement("li"); li.dataset.approved = "1"; li.textContent = d[I18N.lang] || d.en; list.appendChild(li); });
    };
    paint(); document.addEventListener("pv:lang", paint);
    $$("[data-pet-details]").forEach((a) => a.addEventListener("click", (e) => {
      if (!details) return; e.preventDefault();
      details.open = true; scrollToEl(details, -96);
      const sm = $("summary", details); if (sm) sm.focus({ preventScroll: true });
      try { history.pushState(null, "", "#pet-details"); } catch (err) { /* ignore */ }
    }));
    if (details && location.hash === "#pet-details") details.open = true;
  }

  /* ---------- copy, share, toast, clock ---------- */
  let toastTimer = null;
  function toast(msg) { const el = $("#toast"); if (!el) return; el.textContent = msg; el.classList.add("is-on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("is-on"), 2400); }
  function copyText(v, okMsg, btn) {
    const done = () => {
      toast(okMsg);
      if (btn && btn.classList.contains("pill--copy")) { btn.classList.add("is-done"); setTimeout(() => btn.classList.remove("is-done"), 1900); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, () => toast(I18N.t("copyFail")));
    else { const ta = document.createElement("textarea"); ta.value = v; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast(I18N.t("copyFail")); } ta.remove(); }
  }
  function initCopy() {
    $$("[data-copy], [data-copy-el]").forEach((btn) => btn.addEventListener("click", () => {
      if (btn.dataset.copyEl) {
        const src = $(btn.dataset.copyEl); if (!src) return;
        copyText(src.innerText.replace(/\s*\n\s*/g, " ").trim(), I18N.t(btn.dataset.copyMsg || "copied"), btn);
        return;
      }
      const v = btn.dataset.copy, isGPS = v.includes(",") && /\d+\.\d+/.test(v);
      if (!isGPS) lastCode = v;   // the booking panel prefills the last copied offer code
      copyText(v, (isGPS ? I18N.t("gpsCopied") : I18N.t("copied")) + ": " + v, btn);
    }));
    // share the resort's map pin through the phone's own share sheet; where there is none, copy the link
    const share = $("#shareLoc");
    if (share) share.addEventListener("click", () => {
      const url = "https://maps.app.goo.gl/nnPAtFGH4KwDBAJA9";
      if (navigator.share) navigator.share({ title: "Patravana Resort Khao Yai", text: I18N.t("shareText"), url: url }).catch((err) => { if (!err || err.name !== "AbortError") copyText(url, I18N.t("linkCopied")); });
      else copyText(url, I18N.t("linkCopied"));
    });
  }
  function initClock() {
    const els = $$("[data-clock]"); if (!els.length) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
    const tick = () => { const t = fmt.format(new Date()); els.forEach((el) => { el.textContent = t; }); }; tick(); setInterval(tick, 30000);
  }

  /* ---------- the sky over Pak Chong: today's sunset and tonight's moon, worked out in the browser ---------- */
  function initSky() {
    if (!$("[data-sky]")) return;
    const LAT = 14.5595, LON = 101.2563, RAD = Math.PI / 180;
    // NOAA's short solar equations: good to a minute or two, which is why the page says "about"
    function sunsetMinutes(now) {
      const start = Date.UTC(now.getUTCFullYear(), 0, 1), day = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000);
      const g = 2 * Math.PI / 365 * day;
      const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      const ha = Math.acos(Math.cos(90.833 * RAD) / (Math.cos(LAT * RAD) * Math.cos(decl)) - Math.tan(LAT * RAD) * Math.tan(decl)) / RAD;
      return 720 - 4 * (LON - ha) - eq + 420;            // minutes after midnight, resort time (UTC+7)
    }
    // mean lunar cycle counted from the new moon of 6 January 2000
    function moon() {
      const SYN = 29.530588853, age = (((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % SYN + SYN) % SYN, p = age / SYN;
      const idx = p < .03 || p >= .97 ? 0 : p < .22 ? 1 : p < .28 ? 2 : p < .47 ? 3 : p < .53 ? 4 : p < .72 ? 5 : p < .78 ? 6 : 7;
      return { p: p, lit: (1 - Math.cos(2 * Math.PI * p)) / 2, idx: idx };
    }
    function moonSvg(m) {
      const R = 17, rx = (R * Math.abs(1 - 2 * m.lit)).toFixed(2);
      // the lit limb is a half circle; the terminator is half an ellipse that bulges toward or away from it
      const lit = "M20 3A" + R + " " + R + " 0 0 1 20 37A" + rx + " " + R + " 0 0 " + (m.lit > .5 ? 1 : 0) + " 20 3Z";
      return '<circle class="m-disc" cx="20" cy="20" r="' + R + '"/>' + (m.lit < .015 ? "" : '<path class="m-lit" d="' + lit + '"' + (m.p > .5 ? ' transform="translate(40 0) scale(-1 1)"' : "") + "/>");
    }
    const paint = () => {
      const t = Math.round(sunsetMinutes(bkk())), txt = pad2(Math.floor(t / 60)) + ":" + pad2(t % 60), m = moon();
      $$('[data-sky="sunset"]').forEach((el) => { el.textContent = txt; });
      $$('[data-sky="moonname"]').forEach((el) => { el.textContent = I18N.t("moon" + m.idx); });
      $$('[data-sky="moonsvg"]').forEach((el) => { el.innerHTML = moonSvg(m); });
    };
    paint(); document.addEventListener("pv:lang", paint); setInterval(paint, 30 * 60 * 1000);
  }

  /* ---------- dining: which service the listed hours put Phu Yai Lee in right now ----------
     Worked out in resort time from the hours in facts.js. It names the service (breakfast, or lunch and dinner) and
     never says more than the listed hours do: the card asks guests to call to confirm on the day. */
  function initDining() {
    const el = $("#diningStatus"), text = $("#diningStatusText"); if (!el || !text || !FX) return;
    const mins = (t) => { const p = t.split(":"); return +p[0] * 60 + +p[1]; };
    const B = FX.dining.breakfast, K = FX.dining.kitchen, b0 = mins(B.open), b1 = mins(B.close), k0 = mins(K.open), k1 = mins(K.close);
    const paint = () => {
      const now = bkk(), day = now.getUTCDay(), min = now.getUTCHours() * 60 + now.getUTCMinutes();
      const bDay = B.days.includes(day), kDay = K.days.includes(day);
      let state = "closed", key = "dining.status.tomorrow";
      if (bDay && min >= b0 && min < b1) { state = "open"; key = "dining.status.breakfast"; }
      else if (kDay && min >= k0 && min < k1) { state = "open"; key = "dining.status.kitchen"; }
      else if (bDay && min < b0) key = "dining.status.early";
      else if (kDay && min < k0) { state = "soon"; key = "dining.status.soon"; }
      else if (!kDay && min < k1) key = "dining.status.rest";      // a Monday or Tuesday, after breakfast
      el.dataset.state = state; text.textContent = FACTS.t(key);
    };
    paint(); document.addEventListener("pv:lang", paint); setInterval(paint, 60000);
  }

  /* ---------- gather: pick a layout, see the hall set that way ---------- */
  function initHall() {
    const root = $("[data-hall]"), svg = $("#hallSvg"), num = $("#hallNum"); if (!root || !svg) return;
    const rows = $$(".bar", root);
    if (FX) {
      const max = Math.max.apply(null, FX.hall.layouts.map((l) => l.full));
      rows.forEach((b) => { const l = FX.hall.layouts.find((x) => x.key === b.dataset.layout); if (!l) return; b.dataset.n = l.full; $(".bar__n", b).textContent = l.full; $(".bar__fill", b).dataset.w = Math.round(l.full / max * 100); });
    }
    const f = (n) => (Math.round(n * 10) / 10);
    const seat = (x, y, r) => '<circle class="h-seat" cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '"/>';
    const shell = '<rect class="h-room" x="6" y="6" width="308" height="198" rx="12"/><rect class="h-stage" x="112" y="15" width="96" height="9" rx="3"/>';
    // each sketch shows the layout's arrangement as an illustration (the listed full-hall figures: 220, 168, 120, 64)
    const draw = {
      theatre() { let s = ""; for (let b = 0; b < 2; b++) for (let r = 0; r < 10; r++) for (let c = 0; c < 11; c++) s += seat(38 + b * 132 + c * 11.2, 48 + r * 14.6, 3); return s; },
      classroom() {
        let s = "";
        for (let b = 0; b < 2; b++) for (let r = 0; r < 7; r++) {
          const x0 = 38 + b * 132, y = 44 + r * 21.5;
          s += '<rect class="h-tablefill" x="' + (x0 - 3) + '" y="' + f(y) + '" width="116" height="5" rx="2"/>';
          for (let c = 0; c < 12; c++) s += seat(x0 + c * 10, y + 11, 2.7);
        }
        return s;
      },
      banquet() {
        let s = "";
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          const cx = 61 + c * 66, cy = 64 + r * 51;
          s += '<circle class="h-tablefill" cx="' + cx + '" cy="' + cy + '" r="11"/>';
          for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; s += seat(cx + Math.cos(a) * 17.5, cy + Math.sin(a) * 17.5, 2.7); }
        }
        return s;
      },
      ushape() {
        let s = '<path class="h-tablefill" d="M78 48H90V164H230V48H242V176H78Z"/>';
        for (let k = 0; k < 22; k++) { const y = 52 + k * (120 / 21); s += seat(71, y, 2.4) + seat(249, y, 2.4); }
        for (let k = 0; k < 20; k++) s += seat(84 + k * 8, 183, 2.4);
        return s;
      }
    };
    function show(key, animate) {
      const btn = rows.find((b) => b.dataset.layout === key); if (!btn || !draw[key]) return;
      rows.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      hallLayout = key;
      svg.innerHTML = shell + draw[key]();
      const n = parseInt(btn.dataset.n, 10);
      if (animate && hasGSAP && !reduced) {
        const o = { v: parseInt(num.textContent, 10) || 0 };
        gsap.to(o, { v: n, duration: .7, ease: "power2.out", overwrite: true, onUpdate: () => { num.textContent = String(Math.round(o.v)); } });
        gsap.fromTo($$(".h-seat", svg), { opacity: 0 }, { opacity: 1, duration: .3, ease: "none", stagger: { amount: .6 } });
        gsap.fromTo($$(".h-tablefill", svg), { opacity: 0 }, { opacity: 1, duration: .5 });
      } else if (num) num.textContent = String(n);
    }
    rows.forEach((b) => b.addEventListener("click", () => { hallPicked = true; if (b.getAttribute("aria-pressed") !== "true") show(b.dataset.layout, true); }));
    show("theatre", false);
  }

  /* ---------- after dark: two photographs of the same evening ---------- */
  function initNight() {
    const btns = $$("[data-night-set]"); if (!btns.length) return;
    btns.forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.nightSet;
      btns.forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
      $$("[data-night]").forEach((im) => im.classList.toggle("is-on", im.dataset.night === k));
      $$("[data-night-cap]").forEach((c) => c.classList.toggle("is-on", c.dataset.nightCap === k));
    }));
  }

  /* ---------- offers: the cards are printed from facts.js; one that has run out says so and steps back ---------- */
  function initOffers() {
    const tickets = $$(".ticket"); if (!tickets.length || !FX) return;
    const today = todayBkk();
    tickets.forEach((t) => {
      const o = FX.offers[t.dataset.offer]; if (!o) return;
      const codeEl = $("[data-offer-code]", t), btn = $("[data-copy]", t);
      if (o.code && codeEl) codeEl.textContent = o.code;
      if (o.code && btn) btn.dataset.copy = o.code;
      if (o.stayUntil && today > o.stayUntil) {
        t.classList.add("is-ended"); t.classList.remove("ticket--hot");
        $$("button", t).forEach((b) => { b.disabled = true; });
        const s = document.createElement("span"); s.className = "ticket__state"; s.dataset.key = "offerEnded"; t.insertBefore(s, t.firstChild);
      }
    });
    // the featured card is always one that is still running; ended ones go to the back
    if (!$(".ticket--hot")) { const d = $('.ticket[data-offer="direct"]:not(.is-ended)'); if (d) d.classList.add("ticket--hot"); }
    const wrap = tickets[0].parentElement, weight = (t) => (t.classList.contains("is-ended") ? 2 : t.classList.contains("ticket--hot") ? 0 : 1);
    const sorted = tickets.slice().sort((a, b) => weight(a) - weight(b));
    if (sorted.some((t, i) => t !== tickets[i])) sorted.forEach((t) => wrap.appendChild(t));
    const paint = () => {
      $$(".ticket__state").forEach((s) => { s.textContent = I18N.t(s.dataset.key); });
      $$(".ticket [data-copy]").forEach((b) => b.setAttribute("aria-label", I18N.t("copyCode", { code: b.dataset.copy })));
    };
    paint(); document.addEventListener("pv:lang", paint);
  }

  /* ---------- film readout: add #diag to the address to see what is really being played ---------- */
  function initDiag() {
    if (!/^#diag/.test(location.hash)) return;
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;background:rgba(0,0,0,.86);color:#9f9;font:11px/1.5 monospace;border-radius:6px;pointer-events:none;white-space:pre-wrap;word-break:break-word";
    document.body.appendChild(box);
    setInterval(() => {
      box.textContent = allClips.map((v, i) => {
        const on = v === activeClip() ? "> " : "  ", way = v._way ? v._way.kind : "none";
        const tail = ", decoded " + v.videoWidth + "x" + v.videoHeight + ", t " + v.currentTime.toFixed(1) + ", ready " + v.readyState + (v.paused ? ", paused" : "") + (v.error ? ", ERROR " + v.error.code : "");
        if (v._pv && !v._pv.dead) { const d = v._pv.info(); return on + "film " + (i + 1) + ": stream " + d.size + " " + d.mbps + " Mbps" + tail + ", ahead " + d.ahead + "s, net " + d.net + " Mbps, dropped " + d.dropped + ", " + d.via + (d.open ? "" : " (not open)") + ", shift " + d.shift; }
        return on + "film " + (i + 1) + ": " + way + " " + (v.currentSrc || "none").split("/").pop().slice(0, 24) + tail;
      }).join("\n") + "\nscreen " + window.innerWidth + "x" + window.innerHeight + " @" + (window.devicePixelRatio || 1) + (gestureArmed ? " | WAITING FOR A TOUCH" : "") +
        "\n" + filmLog.join("\n") + "\n" + navigator.userAgent.replace(/Mozilla\/5\.0 /, "").slice(0, 110);
    }, 1000);
  }

  /* ---------- language switch ---------- */
  function switchLang(lang) {
    if (lang === I18N.lang) return;
    const veil = $("#veil");
    const swap = () => {
      releaseSplits(); I18N.apply(lang); remakeSplits(); if (hasST) ScrollTrigger.refresh();
      try { const u = new URL(location.href); u.searchParams.set("lang", lang); history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (e) { /* a sandboxed frame may refuse */ }
    };
    if (!hasGSAP || reduced || !veil) { swap(); return; }
    gsap.timeline().set(veil, { transformOrigin: "left", scaleX: 0 }).to(veil, { scaleX: 1, duration: .45, ease: "power3.in" }).add(swap).set(veil, { transformOrigin: "right" }, "+=0.06").to(veil, { scaleX: 0, duration: .55, ease: "power3.out" });
  }
  function initLang() {
    const tg = $("#langToggle"); if (tg) tg.addEventListener("click", () => switchLang(I18N.lang === "en" ? "th" : "en"));
    $$("[data-lang-set]").forEach((b) => b.addEventListener("click", () => switchLang(b.dataset.langSet)));
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    // figures the page counts up to are facts too
    $$("[data-count-fact]").forEach((el) => { const v = FACTS.val(el.dataset.countFact); if (v != null) { el.dataset.count = v; el.textContent = v; } });
    I18N.capture(); I18N.apply(initialLang());
    document.body.classList.add("is-ready");
    initOffers(); initHall(); initMotion(); initStay(); initRadius(); initMap(); initReel(); initDrawers(); initBooking(); initEnquiry(); initPet(); initCopy(); initClock(); initSky(); initDining(); initNight(); initLang(); initDiag(); onScroll();
    // A link that names a section (…/#pet-friendly): the browser goes there as the page is parsed, and once everything
    // above it has taken its final size the landing is squared up, unless the visitor has already started to scroll
    try {
      const target = location.hash.length > 1 && /^#[A-Za-z][A-Za-z0-9_-]*$/.test(location.hash) ? $(location.hash) : null;
      if (target) {
        let moved = false;
        ["wheel", "touchstart", "keydown", "mousedown"].forEach((t) => window.addEventListener(t, () => { moved = true; }, { once: true, passive: true }));
        const land = () => { if (moved) return; const y = target.getBoundingClientRect().top; if (Math.abs(y - 60) > 24) window.scrollTo({ top: Math.max(0, y + window.scrollY - 60), behavior: "auto" }); };
        land(); setTimeout(land, 350);
        window.addEventListener("load", () => { land(); setTimeout(land, 500); }, { once: true });
      }
    } catch (e) { /* ignore */ }
    // ?goto=<section id> deep link: jump once the layout has settled (images sized), so the landing spot is exact
    try {
      const params = new URLSearchParams(location.search);
      const g = params.get("goto");
      if (g && document.getElementById(g)) window.addEventListener("load", () => setTimeout(() => {
        const el = document.getElementById(g);
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: "auto" });
      }, 400), { once: true });
      const blocksSel = "main > *, .closing, footer";
      // ?only=<section id>: capture helper. Shows just that section at the top of the page (headless screenshots cannot scroll)
      const only = params.get("only");
      const target = only && document.getElementById(only);
      if (target) {
        $$(blocksSel).forEach((s) => { if (s !== target && !s.contains(target)) s.style.display = "none"; });
        const t = $("#topbar"); if (t && target.id !== "foot") t.classList.add("is-solid");   // legible header on light grounds
        window.scrollTo(0, 0);
      }
      // ?at=<section id>&part=<n>: capture helper. Frames the viewport as if scrolled to that section (part n = n screens further,
      // the last part pinned to the section's bottom). Headless screenshots cannot scroll, so the page is shifted by a body margin,
      // re-applied on resize because headless Edge re-resolves vh units just before it paints.
      const at = params.get("at"), atEl = at && document.getElementById(at);
      if (atEl) {
        const part = parseInt(params.get("part") || "0", 10) || 0;
        // sections above the target are removed rather than scrolled past: a short document keeps every layer and image
        // painted in time, where a deep margin shift over the whole page left stale layers and half-rastered screens
        const blocks = $$(blocksSel);
        const idx = blocks.findIndex((s) => s === atEl || s.contains(atEl));
        blocks.forEach((s, i) => { if (i < idx) s.style.display = "none"; });
        blocks.slice(idx, idx + 2).forEach((s) => $$("img[loading=lazy]", s).forEach((im) => { im.loading = "eager"; }));
        const t = $("#topbar"); if (t && atEl.id !== "hero") t.classList.add("is-solid");
        const place = () => {
          document.body.style.marginTop = "0px";
          const vh = window.innerHeight, head = ($("#topbar") || { offsetHeight: 0 }).offsetHeight;
          const r = atEl.getBoundingClientRect(), y0 = r.top + window.scrollY;
          const docH = document.documentElement.scrollHeight;
          let y = y0 + part * (vh - head);
          if (part > 0) y = Math.min(y, y0 + r.height - vh);
          y += parseInt(params.get("dy") || "0", 10) || 0;
          y = Math.max(0, Math.min(y, docH - vh));
          document.body.style.marginTop = -y + "px";
        };
        place();
        if (document.fonts) document.fonts.ready.then(place);
        window.addEventListener("load", place); window.addEventListener("resize", place);
      }
      // ?click=<selector>: capture helper. Opens an overlay (booking panel, map place, drawer, lightbox, menu) for its screenshot
      const click = params.get("click"), clickEl = click && document.querySelector(click);
      if (clickEl) {
        clickEl.click();
        if (hasGSAP) gsap.globalTimeline.getChildren(true, true, false).forEach((tw) => { if (tw.repeat() !== -1) tw.progress(1); });
      }
    } catch (e) { /* ignore */ }
  });
})();
