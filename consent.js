/* ============================================================
   PATRAVANA: Google Analytics, only after a visitor's yes (27 November 2026; O2's founder chose "a cookie question
   like Mahakrang's"). Ported from O2's consent code on mahakrangconcrete.com (js/consent.js), itself from O2's own
   site, whose wording and behaviour the owners approved.

   Off until it is given a Measurement ID: facts.js, analytics.ga4 ("G-..."). While that is empty this file does nothing
   at all: no question, nothing loaded from Google, the footer's "Cookie settings" stays hidden (its link to the cookie
   policy is always there).

   With an ID, the order of things, on every page that loads this file (index.html, th.html, the cookie policy pages):
     1. anywhere but the live site (this machine, a preview, the GitHub address) the page neither asks nor loads
        anything, so no test visit reaches the real reports;
     2. a browser that sends Global Privacy Control or Do Not Track is never asked and never measured, and any Google
        Analytics cookie left on this site is deleted;
     3. a choice already made (this version, not expired) is followed; otherwise the question is shown once the loading
        screen has gone, just under the top bar, so the booking controls at the foot of the screen stay clear. Accept
        and Decline sit side by side and look alike. The page is never blocked, and ignoring the question is a no;
     4. only after Accept is anything loaded from Google, with Consent Mode v2: every kind of storage denied first,
        analytics storage alone granted, the advertising signals never. Google is told the page's address with nothing
        after it, and of a referrer only its site. Presses of Book, LINE, phone, email and map are sent as events of
        their own (press_book, press_line, press_call, press_email, press_map) that carry no link: the booking link
        holds the guest's dates and the email link the enquiry text, and neither goes to Google.
   "Cookie settings" in the footer (and on the cookie policy pages) reopens the choice; Decline there stops Google
   Analytics at once and deletes its cookies. What the cookie policy (cookie-policy.html, cookie-policy-th.html, written
   by export-pages.mjs) says must match the numbers here: CONSENT_DAYS (the export reads it from this file), the cookie
   names, and the property's 2-month data retention.
   A local browser test may set window.__pvGaTest = true before the page loads (and block Google's hosts itself).
   ============================================================ */
(function () {
  "use strict";
  var FX = window.PV_FACTS || {}, A = FX.analytics || {};
  var ID = String(A.ga4 || "").trim();
  if (!/^G-[A-Z0-9]{4,20}$/.test(ID)) return;                      // empty (or not an ID): off, nothing happens

  var HOSTS = ["www.patravana.com", "patravana.com"];
  var KEY = "pv.cookies.v1", VERSION = 1, CONSENT_DAYS = 180, LAYER = "pvgtag";
  var HERE = HOSTS.indexOf(location.hostname) >= 0 || window.__pvGaTest === true;
  if (!HERE) return;

  var H = document.documentElement;
  var th = function () { return (H.getAttribute("lang") || "en").slice(0, 2) === "th"; };
  var W = {
    askH: { en: "Cookies for Google Analytics?", th: "ขออนุญาตใช้คุกกี้ของ Google Analytics" },
    askP: { en: "With your yes, Google Analytics sets cookies so the resort can count visits and see which parts of the site are read. Never for advertising, and nothing you choose or type is sent.",
      th: "หากคุณอนุญาต Google Analytics จะตั้งคุกกี้เพื่อให้รีสอร์ทนับจำนวนผู้เข้าชม และรู้ว่าส่วนไหนของเว็บไซต์มีคนอ่าน ไม่ใช้เพื่อการโฆษณา และไม่ส่งสิ่งที่คุณเลือกหรือพิมพ์ไว้" },
    more: { en: "Read the cookie policy", th: "อ่านนโยบายคุกกี้" },
    accept: { en: "Accept", th: "ยอมรับ" }, decline: { en: "Decline", th: "ปฏิเสธ" }, close: { en: "Close", th: "ปิด" },
    settingsH: { en: "Cookie settings", th: "ตั้งค่าคุกกี้" },
    isOn: { en: "Google Analytics is on in this browser.", th: "ตอนนี้ Google Analytics เปิดอยู่ในเบราว์เซอร์นี้" },
    isOff: { en: "Google Analytics is off in this browser.", th: "ตอนนี้ Google Analytics ปิดอยู่ในเบราว์เซอร์นี้" },
    savedOn: { en: "Saved. Google Analytics is on.", th: "บันทึกแล้ว Google Analytics เปิดอยู่" },
    savedOff: { en: "Saved. Google Analytics is off, and its cookies on this site have been deleted.", th: "บันทึกแล้ว Google Analytics ปิดอยู่ และลบคุกกี้ของ Google Analytics บนเว็บไซต์นี้แล้ว" },
    signal: { en: "Your browser asks sites not to track you (Global Privacy Control or Do Not Track), so Google Analytics stays off here and nothing is loaded from Google.",
      th: "เบราว์เซอร์ของคุณขอให้เว็บไซต์ไม่ติดตามการใช้งาน (Global Privacy Control หรือ Do Not Track) Google Analytics จึงปิดอยู่ และไม่มีการโหลดสิ่งใดจาก Google" }
  };
  var w = function (k) { return W[k][th() ? "th" : "en"]; };
  /* the policy pages sit next to the language pages, so a relative address works under any base path */
  var policy = function () { return th() ? "cookie-policy-th" : "cookie-policy"; };

  var signal = function () { return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1"; };

  /* the choice, kept in this browser only: version, answer, when it was given and until when it holds */
  function readChoice() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (c && c.version === VERSION && typeof c.analytics === "boolean" && Date.parse(c.expires) > Date.now()) return c;
    } catch (e) { /* storage refused: asked again on the next page, never assumed */ }
    return null;
  }
  function writeChoice(analytics) {
    var now = new Date();
    var c = { version: VERSION, analytics: analytics, at: now.toISOString(), expires: new Date(+now + CONSENT_DAYS * 864e5).toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* the choice holds for this page */ }
    return c;
  }

  /* what Google is told about the page: its address with nothing after it, and of a referrer only its site */
  function pageFacts() {
    var referrer = "";
    try {
      if (document.referrer) {
        var r = new URL(document.referrer);
        if (r.origin === location.origin) referrer = r.origin + r.pathname;
        else if (/^https?:$/.test(r.protocol)) referrer = r.origin + "/";
      }
    } catch (e) { /* an unreadable referrer is left out */ }
    return { location: location.origin + location.pathname, referrer: referrer };
  }

  /* ---- Google Analytics ---- */
  var started = false, on = false, gtag = null;
  function startGA(facts) {
    window["ga-disable-" + ID] = false; on = true;
    if (started) { gtag("consent", "update", { analytics_storage: "granted" }); return; }
    started = true;
    var layer = (window[LAYER] = window[LAYER] || []);
    gtag = function () { layer.push(arguments); };
    gtag("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied",
      functionality_storage: "denied", personalization_storage: "denied", security_storage: "denied"
    });
    gtag("consent", "update", { analytics_storage: "granted" });
    gtag("set", "ads_data_redaction", true);
    /* the cookies' lifetime for the whole tag, set before config (given in the config call alone, Google's tag kept its
       own two-year default on O2's site, found live 16 Nov 2026) */
    gtag("set", { cookie_expires: CONSENT_DAYS * 86400, cookie_flags: "SameSite=Lax;Secure", cookie_update: true });
    gtag("js", new Date());
    var cfg = { page_location: facts.location, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_expires: CONSENT_DAYS * 86400, cookie_flags: "SameSite=Lax;Secure" };
    if (facts.referrer) cfg.page_referrer = facts.referrer;
    gtag("config", ID, cfg);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ID) + "&l=" + LAYER;
    document.head.appendChild(s);
  }
  function stopGA() {
    window["ga-disable-" + ID] = true; on = false;
    if (gtag) gtag("consent", "update", { analytics_storage: "denied" });
    deleteCookies();
  }
  /* _ga, _ga_<stream> and the older _gid/_gat, set on the widest domain the browser allows: cleared on every one */
  function deleteCookies() {
    var names = document.cookie.split(";").map(function (c) { return c.trim().split("=")[0]; }).filter(function (n) { return /^_g(a|id|at)(_|$)/.test(n); });
    if (!names.length) return;
    var parts = location.hostname.split("."), domains = [""];
    for (var i = 0; i < parts.length - 1; i++) { var d = parts.slice(i).join("."); domains.push(d, "." + d); }
    names.forEach(function (n) { domains.forEach(function (d) { document.cookie = n + "=; Max-Age=0; Path=/" + (d ? "; Domain=" + d : "") + "; SameSite=Lax"; }); });
  }
  /* the presses the resort's own visit counter also counts (main.js, initCounter), with the same reading of a link;
     only the kind of press goes to Google, never the link itself */
  function presses() {
    document.addEventListener("click", function (e) {
      if (!on || !gtag) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var h = a.getAttribute("href") || "";
      var k = a.hasAttribute("data-book-open") || /letsbook\.me|ipms247/.test(h) ? "book" : /^tel:/.test(h) ? "call" : /line\.me|lin\.ee|line-qr-code/.test(h) ? "line"
        : /^mailto:/.test(h) ? "email" : /google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\./.test(h) ? "map" : "";
      if (k) gtag("event", "press_" + k);
    }, { capture: true, passive: true });
  }

  /* ---- the question ---- */
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); };
  var card = null, opener = null, mode = "", facts = null, said = "";
  function show(m) {
    hide(false);
    mode = m;
    var settings = m === "settings", blocked = signal(), c = readChoice();
    var t = document.createElement("template");
    t.innerHTML = '<section class="pv-cookie" role="region" aria-labelledby="pv-cookie-h" tabindex="-1" data-mode="' + m + '">' +
      '<h2 class="pv-cookie__h" id="pv-cookie-h">' + esc(w(settings ? "settingsH" : "askH")) + '</h2>' +
      (blocked ? '<p class="pv-cookie__p">' + esc(w("signal")) + ' <a href="' + policy() + '">' + esc(w("more")) + '</a></p>' :
        '<p class="pv-cookie__p">' + esc(w("askP")) + ' <a href="' + policy() + '">' + esc(w("more")) + '</a></p>' +
        (settings ? '<p class="pv-cookie__status" role="status" aria-live="polite">' + esc(said ? w(said) : w(c && c.analytics ? "isOn" : "isOff")) + '</p>' : '') +
        '<div class="pv-cookie__acts">' +
          '<button type="button" class="pv-cookie__btn" data-cookie="accept">' + esc(w("accept")) + '</button>' +
          '<button type="button" class="pv-cookie__btn" data-cookie="decline">' + esc(w("decline")) + '</button>' +
        '</div>') +
      (settings ? '<button type="button" class="pv-cookie__x" data-cookie="close" aria-label="' + esc(w("close")) + '"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg></button>' : '') +
      '</section>';
    card = t.content.firstElementChild;
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cookie]");
      if (!b) return;
      var what = b.getAttribute("data-cookie");
      if (what === "close") { hide(true); return; }
      var yes = what === "accept";
      writeChoice(yes);
      if (yes) startGA(facts); else stopGA();
      if (settings) { said = yes ? "savedOn" : "savedOff"; var st = card.querySelector(".pv-cookie__status"); if (st) st.textContent = w(said); }
      else hide(true);
    });
    if (settings) card.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); hide(true); } });
    /* early in the reading and Tab order, straight after the skip link, though it is drawn under the top bar */
    var skip = document.querySelector("body > .skip");
    if (skip) skip.after(card); else document.body.prepend(card);
    if (settings) card.focus({ preventScroll: true });
  }
  function hide(returnFocus) {
    if (!card) return;
    var had = card.contains(document.activeElement);
    card.remove(); card = null; mode = ""; said = "";
    if (returnFocus && had && opener && opener.isConnected) opener.focus();
    opener = null;
  }
  /* a switch of language in the page (main.js sends pv:lang) redraws an open card in the new language */
  document.addEventListener("pv:lang", function () {
    if (!card) return;
    var m = mode, had = card.contains(document.activeElement), keep = said, o = opener;
    show(m); said = keep; opener = o;
    if (keep) { var st = card.querySelector(".pv-cookie__status"); if (st) st.textContent = w(keep); }
    if (had) card.focus({ preventScroll: true });
  });

  /* the question waits for the loading screen (#loader: .is-up as the curtain rises, .is-done once it has gone) */
  function afterLoader(fn) {
    var l = document.getElementById("loader");
    var gone = function () { return !l || !H.classList.contains("js") || l.classList.contains("is-done") || getComputedStyle(l).display === "none"; };
    if (gone()) return fn();
    var done = false;
    var go = function () { if (!done) { done = true; mo.disconnect(); fn(); } };
    var mo = new MutationObserver(function () { if (gone()) go(); });
    mo.observe(l, { attributes: true, attributeFilter: ["class"] });
    setTimeout(go, 9000);                                           // the screen lifts by itself within 6 seconds
  }

  function boot() {
    facts = pageFacts();
    document.querySelectorAll("[data-cookie-settings]").forEach(function (b) {
      var wrap = b.closest("[data-cookie-wrap]") || b;
      wrap.hidden = false;
      b.addEventListener("click", function () { show("settings"); opener = b; });
    });
    presses();
    if (signal()) { deleteCookies(); return; }
    var c = readChoice();
    if (c && !c.analytics) { deleteCookies(); return; }
    if (c && c.analytics) startGA(facts);
    else afterLoader(function () { if (!readChoice() && !card) show("ask"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
