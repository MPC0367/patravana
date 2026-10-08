/* ============================================================
   PATRAVANA v2: interactions, motion, bilingual engine
   GSAP 3.13 (ScrollTrigger, SplitText, Draggable, Inertia) + Lenis
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGSAP = typeof gsap !== "undefined";
  const hasST = hasGSAP && typeof ScrollTrigger !== "undefined";
  const hasSplit = hasGSAP && typeof SplitText !== "undefined";
  const hasDrag = hasGSAP && typeof Draggable !== "undefined";
  const hasInertia = hasGSAP && typeof InertiaPlugin !== "undefined";
  const hasLenis = typeof Lenis !== "undefined";
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const pad2 = (n) => String(n).padStart(2, "0");
  // the resort's wall clock wherever the visitor is: read the result with getUTC*()
  const bkk = () => new Date(Date.now() + 7 * 3600 * 1000);

  if (hasGSAP) {
    gsap.registerPlugin.apply(gsap, [hasST && ScrollTrigger, hasSplit && SplitText, hasDrag && Draggable, hasInertia && InertiaPlugin].filter(Boolean));
    gsap.defaults({ ease: "power3.out", duration: 1 });
  }

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
      document.documentElement.lang = lang;
      $$(".lang__opt").forEach((o) => o.classList.toggle("is-on", o.dataset.langOpt === lang));
      const tg = $("#langToggle"); if (tg && window.PV_JS) tg.setAttribute("aria-label", PV_JS.langAria[lang]);
      try { localStorage.setItem("pv2-lang", lang); } catch (e) { /* private mode */ }
      document.dispatchEvent(new CustomEvent("pv:lang"));
    },
    t(key) { const d = (window.PV_JS || {})[key]; return d ? d[this.lang] || d.en : ""; }
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

  /* ---------- loader + hero films ---------- */
  const loader = $("#loader");
  const heroVideo = $("#heroVideo");
  let booted = false;

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
  let warmed = false;
  // a film that streams (film-stream.js) is started and paused through its stream; a plain file directly
  function clipPlay(v) { if (v._pv) { v._pv.play(); return; } const p = v.play(); if (p) p.catch(() => {}); }
  function clipPause(v) { if (v._pv) v._pv.pause(); else v.pause(); }
  function playHero() {
    if (reduced || userPaused || !clips.length) return;
    const v = activeClip(); if (!v) return;
    clipPlay(v);
    // the queued clips only buffer once the first one is running and its own download has gone quiet,
    // so a phone never pulls two films at once
    if (!warmed && clips.length > 1) {
      warmed = true;
      const warm = () => {
        const a = activeClip();
        if (a && a._pv && a._pv.busy()) { setTimeout(warm, 1500); return; }
        clips.forEach((c) => { if (c === a) return; if (c._pv) c._pv.start(); else { c.preload = "auto"; c.load(); } });
      };
      setTimeout(warm, 4000);
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
  // Note for the single-file build: Safari/WebKit plays video only from a real HTTP source. Tested on
  // iOS WebKit, both data: and blob: URLs fail with MEDIA_ERR_SRC_NOT_SUPPORTED. Clips embedded as data
  // URIs therefore cannot play on iPhone/iPad; the error handler below drops them and the poster stands in.
  function initHeroClips() {
    if (!clips.length) return;
    // if a clip has produced nothing after a fair wait (iOS with the inlined build), take it out of the
    // way so the poster still carries the hero instead of an empty black rectangle; restore it if it does load
    clips.forEach((v) => v.addEventListener("loadeddata", () => { v.style.display = ""; }, { once: true }));
    setTimeout(() => clips.forEach((v) => { if (v.readyState === 0) v.style.display = "none"; }), 6000);
    // resolution is chosen before anything loads, because the first clip starts playing immediately.
    // the ladder is driven by the screen's real pixel width: 4K masters only go to screens that can show them,
    // phones and anyone on data-saver stay on the light file
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    // the film is cover-fitted: on a tall phone it is the screen height, not its width, that decides how big the frame is drawn
    const px = Math.max(window.innerWidth, window.innerHeight * 16 / 9) * (window.devicePixelRatio || 1);
    const ladder = (c) => (saveData ? null : (px >= 2200 && c.dataset.uhd) || (px >= 1400 && c.dataset.hq) || null);
    // Films that also exist as streamable parts (film-manifest.js) play through the streaming engine, which is not held to
    // the 20 MB a single stored file can be. Everything else, and any stream that fails, uses the single-file ladder.
    const streams = window.PV_STREAMS || {};
    if (!reduced && typeof window.PVStream === "function") clips.forEach((c, i) => {
      const man = streams[c.id]; if (!man) return;
      const srcEl = c.querySelector("source"), keepAttr = c.getAttribute("src");
      const ctl = window.PVStream(c, man, () => {
        c._pv = null;
        if (srcEl) { const pick = ladder(c); if (pick) srcEl.src = pick; c.appendChild(srcEl); } else if (keepAttr) c.setAttribute("src", keepAttr);
        c.load();
        if (c === activeClip() && booted) playHero();
      });
      if (!ctl) return;
      c._pv = ctl;
      if (srcEl) srcEl.remove();
      c.removeAttribute("src"); c.load();               // nothing of the single file is fetched
      if (i === 0) ctl.start();                          // the opening film buffers behind the loader
    });
    clips.forEach((c) => {
      if (c._pv) return;
      const pick = ladder(c), srcEl = c.querySelector("source");
      if (pick && srcEl && srcEl.getAttribute("src") !== pick) { srcEl.src = pick; c.load(); }
    });
    // the slide control only shows once a film is really running, and follows the playing clip
    clips.forEach((v) => {
      v.addEventListener("playing", () => { if (slidesEl) slidesEl.classList.add("is-film"); }, { once: true });
      v.addEventListener("timeupdate", () => { if (v === activeClip()) paintBars(); });
    });
    paintSlide();
    const step = (d) => { if (clips.length < 2 || handing) return; if (userPaused) setPaused(false); handOver((clipIdx + d + clips.length) % clips.length); };
    const prevBtn = $("#slidePrev"), nextBtn = $("#slideNext");
    if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
    if (nextBtn) nextBtn.addEventListener("click", () => step(1));
    if (pauseBtn) pauseBtn.addEventListener("click", () => setPaused(!userPaused));
    if (clips.length < 2) { clips[0].loop = true; return; }
    clips.forEach((v) => {
      v.loop = false;
      // a clip that cannot load drops out of the rotation rather than fading the hero to black
      v.addEventListener("error", () => {
        if (v._pv) { v._pv.fail(); return; }             // a stream that breaks goes back to its single file before anything is dropped
        clips = clips.filter((c) => c !== v); v.style.display = "none";
        clipIdx = Math.min(clipIdx, Math.max(0, clips.length - 1));
        if (clips.length === 1) { clips[0].loop = true; clips[0].classList.add("is-on"); playHero(); }
        paintSlide();
      }, true);
      v.addEventListener("timeupdate", () => {
        if (v !== activeClip() || !v.duration || !isFinite(v.duration)) return;
        if (v.duration - v.currentTime <= FADE) handOver();
      });
      v.addEventListener("ended", () => { if (v === activeClip()) handOver(); });
    });
  }
  function bootReveal() {
    if (booted) return; booted = true;
    document.body.classList.add("is-ready");
    playHero();
    if (!hasGSAP) { loader.style.display = "none"; return; }
    const tl = gsap.timeline();
    tl.to(loader, { yPercent: -100, duration: 1.05, ease: "power4.inOut" }, 0)
      .set(loader, { display: "none" })
      .from(".hero__word", { yPercent: 112, duration: 1.3, stagger: .13, ease: "power4.out" }, .35)
      .from(".hero__eyebrow > span", { opacity: 0, y: 12, duration: .8, stagger: .1 }, .55)
      .from(".hero__eyebrow > i", { scaleX: 0, duration: 1, ease: "power3.inOut" }, .6)
      .from(".hero__sub, .hero__cta > *", { opacity: 0, y: 18, stagger: .1, duration: .9 }, .9)
      .from(".hero__meta li", { opacity: 0, y: 10, stagger: .08, duration: .8 }, 1.1)
      .from(".dock", { opacity: 0, y: 40, duration: 1.15, ease: "power3.out", clearProps: "transform,opacity" }, 1.05)
      .from(".dock__note", { opacity: 0, duration: .8 }, 1.6)
      .from(".top", { opacity: 0, y: -10, duration: .8, clearProps: "transform,opacity" }, .9);
  }
  function runLoader() {
    if (!hasGSAP || reduced) { booted = true; loader.style.display = "none"; document.body.classList.add("is-ready"); playHero(); return; }
    const pct = $("#loaderPct"), bar = $("#loaderBar"), c = { v: 0 };
    const paint = () => { if (pct) pct.textContent = String(Math.round(c.v)); if (bar) bar.style.transform = "scaleX(" + (c.v / 100).toFixed(4) + ")"; };
    paint();
    gsap.timeline()
      // the brush mountain rises into place, then the wordmark sets under it
      .from(".loader__mark", { opacity: 0, y: 18, scale: .97, duration: 1.5, ease: "power3.out" }, 0)
      .to($$(".loader__word span"), { opacity: 1, y: 0, rotate: 0, duration: 1, stagger: .06, ease: "power3.out" }, .5)
      .to(".loader__sub", { opacity: 1, duration: .8 }, 1.3);
    // the count climbs 0 -> 92 over ~3.3s in three breaths, then completes to 100 once the page has loaded
    const run = gsap.timeline()
      .to(c, { v: 38, duration: 1.1, ease: "power1.inOut", onUpdate: paint })
      .to(c, { v: 64, duration: .9, ease: "power1.inOut", onUpdate: paint }, "+=.18")
      .to(c, { v: 92, duration: 1, ease: "power1.inOut", onUpdate: paint }, "+=.14");
    let done = false;
    const finish = () => { if (done) return; done = true; run.kill(); gsap.to(c, { v: 100, duration: .55, ease: "power2.out", onUpdate: paint, onComplete: () => gsap.delayedCall(.3, bootReveal) }); };
    const MIN_UP = 3.5;                                  // seconds the loader stays up at minimum
    let loaded = document.readyState === "complete", minDone = false;
    const tryGo = () => { if (loaded && minDone) finish(); };
    gsap.delayedCall(MIN_UP, () => { minDone = true; tryGo(); });
    if (!loaded) window.addEventListener("load", () => { loaded = true; gsap.delayedCall(.2, tryGo); }, { once: true });
    gsap.delayedCall(6.5, finish);                       // never hold the page hostage to a slow asset
  }
  if (heroVideo) {
    initHeroClips();
    new IntersectionObserver((en) => en.forEach((x) => {
      if (!booted || reduced) return;
      if (x.isIntersecting) playHero(); else clips.forEach(clipPause);
    })).observe(heroVideo);
  }

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (hasLenis && hasGSAP && !reduced) {
    lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on("scroll", hasST ? ScrollTrigger.update : function () {});
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  function scrollToEl(target, offset) {
    const el = typeof target === "string" ? $(target) : target; if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: offset || -60, duration: 1.3 }); else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }

  /* ---------- top bar, chapter index, mobile nav ---------- */
  const top = $("#topbar"), burger = $("#burger"), mnav = $("#mnav");
  let menuOpen = false;
  const mbar = $("#mbar");
  const cindex = $("#cindex"), cLinks = cindex ? $$("a", cindex) : [];
  const cSecs = cLinks.map((a) => $(a.getAttribute("href")));
  const darkEls = $$("section[data-dark], footer[data-dark]");
  const wide = window.matchMedia("(min-width: 1280px) and (min-height: 640px)");
  function onScroll() {
    const y = window.scrollY, h = ($(".hero") || {}).offsetHeight || 600;
    top.classList.toggle("is-solid", y > 40);            // header never hides: the Book entry stays within reach
    if (mbar) { const on = y > h * .5; mbar.classList.toggle("is-on", on); mbar.setAttribute("aria-hidden", String(!on)); }
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
  function toggleMenu(open) {
    menuOpen = open; burger.setAttribute("aria-expanded", String(open)); mnav.setAttribute("aria-hidden", String(!open)); top.classList.toggle("is-menu", open); setOverlay(open);
    if (hasGSAP) {
      if (open) { gsap.set(mnav, { visibility: "visible" }); gsap.to(mnav, { clipPath: "inset(0% 0 0% 0)", duration: .7, ease: "power4.inOut" }); gsap.fromTo(".mnav nav a", { yPercent: 50, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: .06, duration: .7, delay: .2 }); if (lenis) lenis.stop(); }
      else { gsap.to(mnav, { clipPath: "inset(0 0 100% 0)", duration: .55, ease: "power4.inOut", onComplete: () => gsap.set(mnav, { visibility: "hidden" }) }); if (lenis) lenis.start(); }
    } else { mnav.style.visibility = open ? "visible" : "hidden"; mnav.style.clipPath = open ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)"; }
  }
  if (burger) burger.addEventListener("click", () => toggleMenu(!menuOpen));
  $$('a[href^="#"]:not(.skip)').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) { e.preventDefault(); return; }
    const el = $(id); if (!el) return; e.preventDefault(); if (menuOpen) toggleMenu(false);
    if (id === "#hero") { if (lenis) lenis.scrollTo(0, { duration: 1.3 }); else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); }
    else scrollToEl(el);
    // move focus with the scroll so keyboard and screen-reader users land where they asked to go
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }));
  const toTop = $("#toTop"); if (toTop) toTop.addEventListener("click", () => (lenis ? lenis.scrollTo(0, { duration: 1.5 }) : window.scrollTo({ top: 0, behavior: "smooth" })));

  /* ---------- motion ---------- */
  function setStaticState() {
    // no motion available: show the real numbers, filled bars and finished reveals immediately
    $$("[data-count]").forEach((el) => { el.textContent = el.dataset.count; });
    $$(".bar__fill").forEach((b) => { b.style.width = b.dataset.w + "%"; });
    $$("[data-rv], [data-mr]").forEach((el) => el.classList.add("is-in"));
  }
  function initMotion() {
    if (!hasGSAP || !hasST || reduced) { setStaticState(); return; }
    gsap.to("#progress", { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: .4 } });

    // hero exit: the footage stays full-bleed (no shrink-into-frame, per client); only the copy lifts and fades as you scroll
    gsap.to(".hero__grid, .hero__meta", { opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "42% top", scrub: true } });
    gsap.to(".hero__content", { y: -70, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "60% top", scrub: true } });

    // active menu link
    $$(".menu a").forEach((a) => {
      const sec = $(a.getAttribute("href")); if (!sec) return;
      ScrollTrigger.create({ trigger: sec, start: "top 45%", end: "bottom 45%", onToggle: (s) => a.classList.toggle("is-active", s.isActive) });
    });

    $$(".st-lines").forEach(buildSplit);
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
      const target = parseFloat(el.dataset.count), o = { v: 0 };
      gsap.to(o, { v: target, duration: 1.6, ease: "power2.out", snap: { v: 1 }, onUpdate: () => { el.textContent = String(Math.round(o.v)); }, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
    const hall = $("[data-hall]");
    if (hall) ScrollTrigger.create({ trigger: hall, start: "top 82%", once: true, onEnter: () => $$(".bar__fill", hall).forEach((b, i) => gsap.to(b, { width: b.dataset.w + "%", duration: 1.3, delay: i * .12, ease: "power3.out" })) });
    ScrollTrigger.refresh();
    // web fonts change line heights after first layout; measure again once they are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ---------- accordion + the sticky image stage ---------- */
  function initAccordion() {
    const acc = $("[data-acc]"); if (!acc) return;
    const items = $$(".acc__item", acc);
    function setOpen(item, open) {
      const panel = $(".acc__panel", item), head = $(".acc__head", item);
      head.setAttribute("aria-expanded", String(open));
      if (!hasGSAP || reduced) { item.classList.toggle("is-open", open); panel.style.height = open ? "auto" : "0px"; return; }
      if (open) {
        item.classList.add("is-open");
        gsap.fromTo(panel, { height: 0 }, { height: "auto", duration: .7, ease: "power3.inOut", onComplete: () => { if (hasST) ScrollTrigger.refresh(); } });
        gsap.fromTo($$(".acc__copy > *", panel), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .6, stagger: .07, delay: .2, clearProps: "transform,opacity" });
      } else {
        // freeze the current pixel height before dropping the class so the first close animates too
        gsap.set(panel, { height: panel.offsetHeight });
        item.classList.remove("is-open");
        gsap.to(panel, { height: 0, duration: .55, ease: "power3.inOut", onComplete: () => { if (hasST) ScrollTrigger.refresh(); } });
      }
    }
    // one sticky image column on desktop that crossfades between suites, with a counter for which one is showing
    const stage = $(".stay-stage"), cur = $("#stayImg"), nxt = $("#stayImgNext"), now = $("#stayNow"), name = $("#stayName");
    let shown = items.find((i) => i.classList.contains("is-open")) || items[0];
    function paintStage() { if (!shown) return; if (now) now.textContent = pad2(items.indexOf(shown) + 1); if (name) name.textContent = $(".acc__name", shown).textContent; }
    function showStage(item) {
      shown = item; paintStage();
      if (!stage || !cur || !nxt) return;
      const im = $(".acc__media img", item); const src = im && (im.currentSrc || im.src); if (!src || src === cur.src) return;
      cur.removeAttribute("srcset"); nxt.src = src;
      const swap = () => { stage.classList.add("is-swapping"); setTimeout(() => { cur.src = src; stage.classList.remove("is-swapping"); }, 720); };
      if (nxt.complete) swap(); else nxt.onload = swap;
    }
    items.forEach((item) => {
      const head = $(".acc__head", item);
      head.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");
        if (isOpen) { setOpen(item, false); return; }
        items.forEach((o) => { if (o !== item && o.classList.contains("is-open")) setOpen(o, false); });
        setOpen(item, true); showStage(item);
      });
    });
    paintStage();
    document.addEventListener("pv:lang", paintStage);
  }

  /* ---------- roam: radius slider and kind-of-place chips, working together ---------- */
  function initRadius() {
    const range = $("#radiusRange"), val = $("#radiusVal"), count = $("#radiusCount"); if (!range) return;
    const places = $$("[data-places] .place"), chips = $$("[data-roam-chips] .chip");
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
    }
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
      panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false"); setOverlay(true);
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
      panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); setOverlay(false);
      map.classList.remove("is-zoomed");
      if (stepNow) stepNow.textContent = "00";
      if (lastFocus && stage.contains(lastFocus)) lastFocus.focus();
    }

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
    $$("[data-map-open]").forEach((b) => b.addEventListener("click", () => { const h = hots.find((x) => x.dataset.hot === b.dataset.mapOpen); if (!h) return; scrollToEl(stage, -90); setTimeout(() => open(h), 500); }));
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

  /* ---------- gallery reel: drifts on its own in a seamless loop; drag or fling to browse; tap to open ---------- */
  function initReel() {
    const reel = $("#reel"), track = $("#reelTrack"); if (!reel || !track) return;
    const originals = $$(".reel__item", track);
    const gallery = []; originals.forEach((b) => { if (!gallery.includes(b.dataset.full)) gallery.push(b.dataset.full); });
    const state = { mouse: false, focus: false, pressed: false, open: false, didDrag: false, caught: false };
    if (hasGSAP && !reduced) {
      // a copy of the set on BOTH sides makes the loop seamless everywhere, including the left gutter (no blank strip at the wrap)
      const mk = () => originals.map((b) => { const c = b.cloneNode(true); c.setAttribute("aria-hidden", "true"); c.tabIndex = -1; c.classList.add("is-clone"); return c; });
      const before = mk(), after = mk();
      before.forEach((c) => track.insertBefore(c, originals[0]));
      after.forEach((c) => track.appendChild(c));
      const SPEED = 36;                                  // px per second: a slow drift, not a ticker
      let setW = 0, x = 0;
      const wrapX = (v) => (setW ? gsap.utils.wrap(-2 * setW, -setW, v) : v);   // the originals sit one set in from the left
      const measure = () => { setW = originals[0].offsetLeft - before[0].offsetLeft; x = wrapX(x); };
      measure(); x = -setW;                              // at rest: photo 1 at the gutter, the tail of photo 8 showing to its left
      window.addEventListener("resize", measure);
      $$("img", track).forEach((im) => { if (!im.complete) im.addEventListener("load", measure, { once: true }); });
      const place = (v) => { x = wrapX(v); gsap.set(track, { x: x }); };
      gsap.ticker.add((t, dt) => {
        if (!setW) return;
        if (!state.mouse && !state.focus && !state.pressed && !state.open) x = wrapX(x - SPEED * Math.min(dt, 100) / 1000);
        gsap.set(track, { x: x });
      });
      // a mouse over the reel holds it still (touch taps do not); keyboard focus holds it and brings the focused photo into view
      reel.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") state.mouse = true; });
      reel.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") state.mouse = false; });
      const keyboardFocus = (el) => { try { return el.matches(":focus-visible"); } catch (err) { return true; } };
      reel.addEventListener("focusin", (e) => {
        const kb = keyboardFocus(e.target); state.focus = kb;
        const b = e.target.closest(".reel__item");
        if (kb && b && !b.classList.contains("is-clone")) place(-setW - (b.offsetLeft - originals[0].offsetLeft));
      });
      reel.addEventListener("focusout", () => { state.focus = false; });
      if (hasDrag) {
        // Draggable runs on a proxy; we add its per-frame delta to the wrapped offset so a drag or fling never hits an edge
        const proxy = document.createElement("div");
        Draggable.create(proxy, {
          type: "x", trigger: reel, inertia: hasInertia, dragClickables: true, minimumMovement: 4,
          onPressInit: function () { state.caught = this.isThrowing; },   // a tap that catches a moving reel should stop it, not open a photo
          onPress: function () { state.pressed = true; },
          onDragStart: function () { state.didDrag = true; },
          onDrag: function () { x = wrapX(x + this.deltaX); },
          onThrowUpdate: function () { x = wrapX(x + this.deltaX); },
          onRelease: function () { const d = this; gsap.delayedCall(.06, () => { if (!d.isThrowing) state.pressed = false; state.caught = false; }); },
          onThrowComplete: function () { state.pressed = false; },
          onDragEnd: function () { setTimeout(() => { state.didDrag = false; }, 60); }
        });
      }
    } else { reel.classList.add("is-native"); }

    const box = $("#lightbox"), img = $("#lbImg"), count = $("#lbCount");
    let idx = 0, isOpen = false, lastFocus = null;
    function render() { img.src = gallery[idx]; count.textContent = (idx + 1) + " / " + gallery.length; if (hasGSAP && !reduced) gsap.fromTo(img, { opacity: .2, scale: .97 }, { opacity: 1, scale: 1, duration: .45 }); }
    function open(i) { idx = i; isOpen = true; state.open = true; lastFocus = document.activeElement; box.classList.add("is-open"); box.setAttribute("aria-hidden", "false"); setOverlay(true); render(); if (hasGSAP && !reduced) gsap.to(box, { opacity: 1, duration: .35 }); else box.style.opacity = "1"; if (lenis) lenis.stop(); $("#lbClose").focus(); }
    function close() { isOpen = false; state.open = false; const done = () => { box.classList.remove("is-open"); box.setAttribute("aria-hidden", "true"); }; if (hasGSAP && !reduced) gsap.to(box, { opacity: 0, duration: .3, onComplete: done }); else { box.style.opacity = "0"; done(); } setOverlay(false); if (lenis) lenis.start(); if (lastFocus) lastFocus.focus(); }
    const step = (d) => { idx = (idx + d + gallery.length) % gallery.length; render(); };
    $$(".reel__item", track).forEach((b) => b.addEventListener("click", () => { if (state.didDrag || state.caught) return; open(Math.max(0, gallery.indexOf(b.dataset.full))); }));
    $("#lbClose").addEventListener("click", close); $("#lbPrev").addEventListener("click", () => step(-1)); $("#lbNext").addEventListener("click", () => step(1));
    box.addEventListener("click", (e) => { if (e.target === box || e.target.classList.contains("lightbox__stage")) close(); });
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") { const f = [$("#lbClose"), $("#lbPrev"), $("#lbNext")]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    });
  }

  /* ---------- drawers: what is in every suite, and the suite comparison ---------- */
  // runs before initBooking on purpose: a "Check dates" pill inside a drawer closes the drawer first, then the booking panel opens
  function initDrawers() {
    const drawers = $$(".drawer"); if (!drawers.length) return;
    let cur = null, lastFocus = null;
    drawers.forEach((d) => $$(".drawer__list li, .cmp__t tbody tr", d).forEach((row, i) => row.style.setProperty("--i", i)));
    const close = () => {
      if (!cur) return;
      cur.classList.remove("is-open"); cur.setAttribute("aria-hidden", "true"); cur = null;
      setOverlay(false); if (lenis) lenis.start(); if (lastFocus) lastFocus.focus();
    };
    const open = (d) => {
      if (!d) return; if (cur) close();
      cur = d; lastFocus = document.activeElement;
      d.classList.add("is-open"); d.setAttribute("aria-hidden", "false"); setOverlay(true);
      const c = $("[data-drawer-close]", d); if (c) c.focus();
      if (lenis) lenis.stop();
    };
    $$("[data-amen-open]").forEach((b) => b.addEventListener("click", () => open($("#amen"))));
    $$("[data-compare-open]").forEach((b) => b.addEventListener("click", () => open($("#compare"))));
    drawers.forEach((d) => {
      $$("[data-drawer-close], [data-book-open]", d).forEach((b) => b.addEventListener("click", close));
      d.addEventListener("click", (e) => { if (e.target === d) close(); });
    });
    document.addEventListener("keydown", (e) => {
      if (!cur) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const f = $$("button, a[href], [tabindex='0']", cur).filter((x) => x.offsetParent);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- booking: the dock under the hero and the pre-stage panel, both handing over to the resort's engine ---------- */
  const ENGINE = "https://letsbook.me/booking/patravanaresortkhaoyai";
  let lastCode = "";
  // the engine keeps check-in, check-out and adults. It drops promo codes, so a code is put on the clipboard to paste there
  const engineUrl = (v) => ENGINE + "?" + new URLSearchParams({ checkin: v.checkin, checkout: v.checkout, adults: v.adults }).toString();
  // The hand-over is a real link whose address follows the form. A window opened from script is refused for many
  // viewers (embedded frames, popup blockers); a link the visitor clicks is not. v is null when the dates do not add up.
  function sendToEngine(e, link, v) {
    if (!v) { e.preventDefault(); toast(I18N.t("datesNeeded")); return; }
    link.href = engineUrl(v);
    if (v.promo && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v.promo).then(() => toast(I18N.t("openedEngineCode") + ": " + v.promo), () => toast(I18N.t("openedEngine")));
    else toast(I18N.t("openedEngine"));
  }
  function initBooking() {
    const panel = $("#bookPanel"), scrim = $("#bookScrim"), form = $("#bookForm"); if (!panel || !form) return;
    const inEl = $("#bookIn"), outEl = $("#bookOut"), adults = $("#bookAdults"), promo = $("#bookPromo"), summary = $("#bookSummary");
    const iso = (d) => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());   // local date, not UTC
    const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
    const today = iso(new Date());
    inEl.min = today; inEl.value = inEl.value || addDays(today, 14); outEl.min = addDays(inEl.value, 1); outEl.value = outEl.value || addDays(inEl.value, 2);
    let lastFocus = null, isOpen = false;
    function open(e) {
      if (e) e.preventDefault();
      isOpen = true; lastFocus = document.activeElement;
      if (lastCode && !promo.value) promo.value = lastCode;
      panel.classList.add("is-open"); panel.setAttribute("aria-hidden", "false"); scrim.classList.add("is-on"); setOverlay(true);
      if (lenis) lenis.stop();
      paint(); setTimeout(() => inEl.focus(), 250);
    }
    function close() {
      isOpen = false;
      panel.classList.remove("is-open"); panel.setAttribute("aria-hidden", "true"); scrim.classList.remove("is-on"); setOverlay(false);
      if (lenis) lenis.start();
      if (lastFocus) lastFocus.focus();
    }
    function nights() { const a = new Date(inEl.value + "T00:00:00"), b = new Date(outEl.value + "T00:00:00"); return Math.max(0, Math.round((b - a) / 86400000)); }
    const go = $("#bookGo");
    const values = () => (inEl.value && outEl.value && nights() >= 1 ? { checkin: inEl.value, checkout: outEl.value, adults: adults.value, promo: promo.value.trim() } : null);
    function paint() {
      const n = nights(), v = values();
      if (v && go) go.href = engineUrl(v);
      const fmt = new Intl.DateTimeFormat(I18N.lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
      summary.textContent = inEl.value && outEl.value ? (fmt.format(new Date(inEl.value + "T00:00:00")) + "  " + String.fromCharCode(8594) + "  " + fmt.format(new Date(outEl.value + "T00:00:00")) + "   " + n + " " + I18N.t(n === 1 ? "night" : "nights") + "   " + adults.value + " " + I18N.t("adultsShort") + (promo.value ? "   " + I18N.t("codeShort") + " " + promo.value.trim() : "")) : "";
    }
    inEl.addEventListener("change", () => { if (!inEl.value) return; outEl.min = addDays(inEl.value, 1); if (!outEl.value || outEl.value <= inEl.value) outEl.value = addDays(inEl.value, 1); paint(); });
    [outEl, adults, promo].forEach((el) => el.addEventListener("input", paint));
    if (go) go.addEventListener("click", (e) => sendToEngine(e, go, values()));
    form.addEventListener("submit", (e) => { e.preventDefault(); if (go) go.click(); });   // Enter in a field follows the same link
    $$("[data-book-open]").forEach((b) => b.addEventListener("click", open));
    $("#bookClose").addEventListener("click", close); scrim.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (!isOpen) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") { const f = $$("input, button, a[href]", panel).filter((x) => x.offsetParent); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    document.addEventListener("pv:lang", paint);

    // the dock: the same hand-over without opening anything. Its dates stay in step with the panel's
    const dock = $("#dock"), dIn = $("#dockIn"), dOut = $("#dockOut"), dAdults = $("#dockAdults");
    if (!dock || !dIn || !dOut) return;
    const dGo = $("#dockGo");
    dIn.min = today; dIn.value = inEl.value; dOut.min = outEl.min; dOut.value = outEl.value;
    const dValues = () => (dIn.value && dOut.value && dOut.value > dIn.value ? { checkin: dIn.value, checkout: dOut.value, adults: dAdults ? dAdults.value : "2" } : null);
    const sync = () => {
      if (!dIn.value || !dOut.value) return;
      inEl.value = dIn.value; outEl.min = addDays(dIn.value, 1); outEl.value = dOut.value; if (dAdults) adults.value = dAdults.value;
      const v = dValues(); if (v && dGo) dGo.href = engineUrl(v);
    };
    sync();
    dIn.addEventListener("change", () => { if (!dIn.value) return; dOut.min = addDays(dIn.value, 1); if (!dOut.value || dOut.value <= dIn.value) dOut.value = addDays(dIn.value, 1); sync(); });
    dOut.addEventListener("change", sync); if (dAdults) dAdults.addEventListener("change", sync);
    // the whole field is the target: a click anywhere on it opens the date picker
    $$(".dock__f", dock).forEach((f) => f.addEventListener("click", (e) => {
      const input = $("input", f); if (!input || e.target === input || typeof input.showPicker !== "function") return;
      try { input.showPicker(); } catch (err) { input.focus(); }
    }));
    if (dGo) dGo.addEventListener("click", (e) => { sync(); sendToEngine(e, dGo, dValues()); });
    dock.addEventListener("submit", (e) => { e.preventDefault(); if (dGo) dGo.click(); });
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

  /* ---------- dining: is Phu Yai Lee serving right now, by the hours printed on the card ---------- */
  function initDining() {
    const el = $("#diningStatus"), text = $("#diningStatusText"); if (!el || !text) return;
    const paint = () => {
      const now = bkk(), day = now.getUTCDay(), min = now.getUTCHours() * 60 + now.getUTCMinutes();
      const kitchenDay = day !== 1 && day !== 2;         // the kitchen rests on Monday and Tuesday; breakfast is daily
      let state = "closed", key = "dClosedTomorrow";
      if (min >= 420 && min < 600) { state = "open"; key = "dBreakfast"; }
      else if (kitchenDay && min >= 660 && min < 1260) { state = "open"; key = "dOpen"; }
      else if (kitchenDay && min >= 600 && min < 660) { state = "soon"; key = "dSoon"; }
      else if (min < 420) key = "dClosedToday";
      else if (!kitchenDay) key = "dRest";
      el.dataset.state = state; text.textContent = I18N.t(key);
    };
    paint(); document.addEventListener("pv:lang", paint); setInterval(paint, 60000);
  }

  /* ---------- gather: pick a layout, see the hall set that way ---------- */
  function initHall() {
    const root = $("[data-hall]"), svg = $("#hallSvg"), num = $("#hallNum"); if (!root || !svg) return;
    const rows = $$(".bar", root);
    const f = (n) => (Math.round(n * 10) / 10);
    const seat = (x, y, r) => '<circle class="h-seat" cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '"/>';
    const shell = '<rect class="h-room" x="6" y="6" width="308" height="198" rx="12"/><rect class="h-stage" x="112" y="15" width="96" height="9" rx="3"/>';
    // every sketch draws the real seat count for that layout
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
      svg.innerHTML = shell + draw[key]();
      const n = parseInt(btn.dataset.n, 10);
      if (animate && hasGSAP && !reduced) {
        const o = { v: parseInt(num.textContent, 10) || 0 };
        gsap.to(o, { v: n, duration: .7, ease: "power2.out", overwrite: true, onUpdate: () => { num.textContent = String(Math.round(o.v)); } });
        gsap.fromTo($$(".h-seat", svg), { opacity: 0 }, { opacity: 1, duration: .3, ease: "none", stagger: { amount: .6 } });
        gsap.fromTo($$(".h-tablefill", svg), { opacity: 0 }, { opacity: 1, duration: .5 });
      } else if (num) num.textContent = String(n);
    }
    rows.forEach((b) => b.addEventListener("click", () => { if (b.getAttribute("aria-pressed") !== "true") show(b.dataset.layout, true); }));
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

  /* ---------- offers: an offer that has ended, or is out of its season, says so and steps back ---------- */
  function initOffers() {
    const tickets = $$(".ticket"); if (!tickets.length) return;
    const now = bkk(), today = now.getUTCFullYear() + "-" + pad2(now.getUTCMonth() + 1) + "-" + pad2(now.getUTCDate()), month = now.getUTCMonth() + 1;
    tickets.forEach((t) => {
      let key = "";
      if (t.dataset.ends && today > t.dataset.ends) {
        key = "offerEnded"; t.classList.add("is-ended"); t.classList.remove("ticket--hot");
        $$("button", t).forEach((b) => { b.disabled = true; });
      } else if (t.dataset.season) {
        const span = t.dataset.season.split("-").map(Number);
        if (month < span[0] || month > span[1]) { key = "offerReturns"; t.classList.add("is-off"); }
      }
      if (key) { const s = document.createElement("span"); s.className = "ticket__state"; s.dataset.key = key; t.insertBefore(s, t.firstChild); }
    });
    // the featured ticket is always one that is still running
    if (!$(".ticket--hot")) { const ev = $(".ticket[data-evergreen]"); if (ev) ev.classList.add("ticket--hot"); }
    const wrap = tickets[0].parentElement, weight = (t) => (t.classList.contains("is-ended") ? 3 : t.classList.contains("is-off") ? 2 : t.classList.contains("ticket--hot") ? 0 : 1);
    tickets.slice().sort((a, b) => weight(a) - weight(b)).forEach((t) => wrap.appendChild(t));
    wrap.scrollLeft = 0; requestAnimationFrame(() => { wrap.scrollLeft = 0; });
    const paint = () => $$(".ticket__state").forEach((s) => { s.textContent = I18N.t(s.dataset.key); });
    paint(); document.addEventListener("pv:lang", paint);
  }

  /* ---------- film readout: add #diag to the address to see what is really being played ---------- */
  function initDiag() {
    if (!/^#diag/.test(location.hash)) return;
    const box = document.createElement("pre");
    box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;background:rgba(0,0,0,.84);color:#9f9;font:11px/1.5 monospace;border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(box);
    setInterval(() => {
      box.textContent = allClips.map((v, i) => {
        const on = v === activeClip() ? "> " : "  ";
        if (v._pv && !v._pv.dead) { const d = v._pv.info(); return on + "film " + (i + 1) + ": stream " + d.size + " " + d.mbps + " Mbps, decoded " + d.shown + ", ahead " + d.ahead + "s, net " + d.net + " Mbps, dropped " + d.dropped + ", " + d.via; }
        return on + "film " + (i + 1) + ": file " + (v.currentSrc || "none").split("/").pop().slice(0, 24) + ", decoded " + v.videoWidth + "x" + v.videoHeight + ", ready " + v.readyState;
      }).join("\n") + "\nscreen " + window.innerWidth + "x" + window.innerHeight + " @" + (window.devicePixelRatio || 1);
    }, 1000);
  }

  /* ---------- language switch ---------- */
  function switchLang(lang) {
    if (lang === I18N.lang) return;
    const veil = $("#veil");
    const swap = () => { releaseSplits(); I18N.apply(lang); remakeSplits(); if (hasST) ScrollTrigger.refresh(); };
    if (!hasGSAP || reduced || !veil) { swap(); return; }
    gsap.timeline().set(veil, { transformOrigin: "left", scaleX: 0 }).to(veil, { scaleX: 1, duration: .45, ease: "power3.in" }).add(swap).set(veil, { transformOrigin: "right" }, "+=0.06").to(veil, { scaleX: 0, duration: .55, ease: "power3.out" });
  }
  function initLang() {
    const tg = $("#langToggle"); if (tg) tg.addEventListener("click", () => switchLang(I18N.lang === "en" ? "th" : "en"));
    $$("[data-lang-set]").forEach((b) => b.addEventListener("click", () => switchLang(b.dataset.langSet)));
  }

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    I18N.capture(); I18N.apply(initialLang());
    runLoader(); initOffers(); initHall(); initMotion(); initAccordion(); initRadius(); initMap(); initReel(); initDrawers(); initBooking(); initCopy(); initClock(); initSky(); initDining(); initNight(); initLang(); initDiag(); onScroll();
    // ?goto=<section id> deep link: jump once the layout has settled (images sized), so the landing spot is exact
    try {
      const params = new URLSearchParams(location.search);
      const g = params.get("goto");
      if (g && document.getElementById(g)) window.addEventListener("load", () => setTimeout(() => {
        const el = document.getElementById(g);
        if (lenis) lenis.scrollTo(el, { immediate: true }); else el.scrollIntoView();
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
