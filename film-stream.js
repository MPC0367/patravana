/* ============================================================
   PATRAVANA v2: hero film streaming
   One video file per film cannot carry a 4K drone shot at a bitrate that does it justice (and a page host may cap files
   at 20 MB, which had the whole 33 s film squeezed to a fifth of its master). So each film is kept as a run of short
   fragmented-MP4 parts at several sizes (film-manifest.js), and this feeds them to the <video> through Media Source
   Extensions. The screen gets the size it can actually show, at full bitrate, with no seams; the size follows the
   connection down and back up; and parts are fetched whole, so the host need not answer range requests.
   If a browser cannot do this, or anything fails, PVStream says so and the page falls back to its single-file ladder.
   ============================================================ */
(function () {
  "use strict";
  const AHEAD = 14;                                    // seconds of film kept buffered ahead of the playhead

  window.PVStream = function (video, man, onFail) {
    const MSImpl = window.ManagedMediaSource || window.MediaSource;      // ManagedMediaSource is the iPhone form of it
    if (!MSImpl || !window.fetch || !window.ReadableStream || !man || !man.tiers || !man.tiers.length) return null;
    const tiers = man.tiers.filter((t) => { try { return MSImpl.isTypeSupported(t.mime); } catch (e) { return false; } });
    if (!tiers.length) return null;

    // which size to ask for: the film is cover-fitted, so what counts is how many device pixels its full width must fill
    const conn = navigator.connection || {};
    const phone = window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
    const needW = Math.max(window.innerWidth, window.innerHeight * 16 / 9) * (window.devicePixelRatio || 1);
    let want = tiers.findIndex((t) => t.w >= needW * .85); if (want < 0) want = tiers.length - 1;
    if (phone) { const cap = tiers.findIndex((t) => t.h >= 1440); if (cap >= 0) want = Math.min(want, cap); }   // a phone never shows more of the frame than that
    if (conn.saveData || /(^|-)2g$|^3g$/.test(conn.effectiveType || "")) want = 0;

    // ti: the size the next part is fetched in. cap: the largest size this screen and this device should get.
    const S = { ti: want, cap: want, started: false, attached: false, dead: false, hold: false, loading: null, ctl: null, ms: null, sb: null, url: "",
      wantPlay: false, proved: false, fed: false, rate: 0, stalls: 0, stallsEver: 0, lowered: false, mixed: false, shownTi: -1, lastTi: -1,
      lastKey: "", lastEnd: -1, f0: 0, d0: 0, bad: 0, timer: 0 };

    const updated = () => new Promise((res) => S.sb.addEventListener("updateend", res, { once: true }));
    function aheadEnd(t) { const b = video.buffered; for (let i = 0; i < b.length; i++) if (b.start(i) <= t + .15 && b.end(i) > t) return b.end(i); return t; }
    async function clear(from, to) { if (to - from < .2) return; S.sb.remove(from, to); await updated(); }
    async function appendChunk(buf) {
      for (let tries = 0; ; tries++) {
        try { S.sb.appendBuffer(buf); await updated(); return; }
        catch (e) {
          if (!e || e.name !== "QuotaExceededError" || tries > 1) throw e;
          // the buffer is full: drop what has already played, or failing that what is far ahead, and try again
          const t = video.currentTime;
          if (t > 6) await clear(0, t - 4); else await clear(t + 20, man.dur + 1);
        }
      }
    }
    async function loadPart(ti, pi) {
      const tier = tiers[ti], part = tier.parts[pi], ctl = new AbortController(); S.ctl = ctl;
      if (ti !== S.lastTi) { if (S.lastTi >= 0 && S.sb.changeType) S.sb.changeType(tier.mime); S.lastTi = ti; }
      const res = await fetch(part.u, { signal: ctl.signal });
      if (!res.ok || !res.body) throw new Error("film part " + res.status);
      const rd = res.body.getReader();
      let got = 0, first = 0, tFirst = 0;                // speed is timed from the first bytes, so the wait to connect is not counted
      for (;;) {
        const r = await rd.read(); if (r.done) break;
        if (!tFirst) { tFirst = performance.now(); first = r.value.byteLength; }
        got += r.value.byteLength;
        await appendChunk(r.value);
        S.fed = true;
        if (S.shownTi < 0) S.shownTi = ti; else if (S.shownTi !== ti) S.mixed = true;
        const secs = (performance.now() - tFirst) / 1000;
        // the opening part doubles as a speed test: if the line cannot carry this size, step down before anyone sees a stall
        if (!S.proved && got > 2500000 && secs > .5) {
          S.proved = true; S.rate = (got - first) * 8 / secs;
          if (ti > 0 && S.rate < tier.bps * 1.3) {
            ctl.abort(); S.sb.abort();
            let down = ti - 1; while (down > 0 && S.rate < tiers[down].bps * 1.3) down--;
            S.ti = down; return;
          }
        }
      }
      if (got - first > 500000) S.rate = (got - first) * 8 / Math.max(.05, (performance.now() - tFirst) / 1000);
      if (ti > 0 && S.rate < tier.bps * 1.1) S.ti = ti - 1;                                              // arriving slower than it plays: next part a size down
      else if (ti < S.cap && !S.stallsEver && S.rate > tiers[ti + 1].bps * 1.25) S.ti = ti + 1;           // room to spare: next part a size up
    }
    function pump() {
      if (S.dead || S.loading || S.hold || !S.sb) return;
      const t = video.currentTime, end = aheadEnd(t);
      if (end >= man.dur - .08) { if (S.ms.readyState === "open" && !S.sb.updating) { try { S.ms.endOfStream(); } catch (e) { /* already closing */ } } return; }
      if (end - t > AHEAD) return;
      const parts = tiers[S.ti].parts, at = end + .02;
      let pi = parts.findIndex((p) => at >= p.t0 && at < p.t1); if (pi < 0) pi = parts.length - 1;
      const key = S.ti + ":" + pi;
      if (key === S.lastKey && end <= S.lastEnd + .01) { fail(new Error("film buffer is not advancing")); return; }
      S.lastKey = key; S.lastEnd = end;
      S.loading = loadPart(S.ti, pi).catch((e) => { if (!S.dead && (!e || e.name !== "AbortError")) fail(e); }).then(() => { S.loading = null; pump(); });
    }
    // empties the buffer from a point on and lets the pump fill it again in the current size; nothing is fetched meanwhile
    async function refill(from) {
      if (S.dead || !S.sb) return;
      S.hold = true; S.lastKey = "";
      if (S.ctl) S.ctl.abort();
      try { if (S.loading) await S.loading; if (S.sb.updating) await updated(); S.sb.abort(); await clear(from, man.dur + 1); } catch (e) { /* keep what is there */ }
      if (from < .2) { S.mixed = false; S.lowered = false; S.shownTi = -1; }
      S.hold = false; pump();
    }
    // Quality comes first, so this is slow to act: the film must be dropping a fifth of its frames in two checks running,
    // and the busy first seconds of the page (loader, photographs decoding) do not count. A device that really cannot
    // keep up is capped a size lower for good.
    function watch() {
      const q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality();
      if (!q || video.paused || document.hidden) return;
      const total = q.totalVideoFrames - S.f0, dropped = q.droppedVideoFrames - S.d0;
      S.f0 = q.totalVideoFrames; S.d0 = q.droppedVideoFrames;
      if (total < 60 || q.totalVideoFrames < 240) { S.bad = 0; return; }
      S.bad = dropped / total > .2 ? S.bad + 1 : 0;
      if (S.bad >= 2 && S.cap > 0) { S.bad = 0; S.cap = Math.max(0, Math.min(S.cap, S.ti) - 1); S.ti = Math.min(S.ti, S.cap); S.lowered = true; refill(video.currentTime + 1.5); }
    }
    async function fit() {                              // skip sizes this device says it cannot decode smoothly
      const mc = navigator.mediaCapabilities; if (!mc || !mc.decodingInfo) return;
      while (S.cap > 0) {
        const t = tiers[S.cap];
        try { const r = await mc.decodingInfo({ type: "media-source", video: { contentType: t.mime, width: t.w, height: t.h, bitrate: t.bps, framerate: man.fps || 30 } }); if (r.supported && r.smooth) break; } catch (e) { break; }
        S.cap--;
      }
      S.ti = Math.min(S.ti, S.cap);
    }
    function open() {
      if (S.dead) return;
      const ms = new MSImpl(); S.ms = ms;
      if (window.ManagedMediaSource && MSImpl === window.ManagedMediaSource) video.disableRemotePlayback = true;
      ms.addEventListener("sourceopen", () => {
        try {
          S.sb = ms.addSourceBuffer(tiers[S.ti].mime);
          if (man.pts0) S.sb.timestampOffset = -man.pts0;              // B-frames push the first picture a couple of frames in; pull it back to zero
          ms.duration = man.dur;
        } catch (e) { fail(e); return; }
        setTimeout(() => { if (!S.fed) fail(new Error("no film data arrived")); }, 20000);
        pump();
      }, { once: true });
      S.url = URL.createObjectURL(ms);
      video.src = S.url; S.attached = true;
      setTimeout(() => { if (!S.sb) fail(new Error("the media source did not open")); }, 5000);
      if (S.wantPlay) { const p = video.play(); if (p) p.catch(() => {}); }
    }
    function start() { if (S.started || S.dead) return; S.started = true; S.timer = setInterval(watch, 4000); fit().then(open, open); }
    function fail(e) {
      if (S.dead) return; S.dead = true;
      if (S.ctl) S.ctl.abort(); clearInterval(S.timer);
      try { URL.revokeObjectURL(S.url); } catch (x) { /* ignore */ }
      video.removeAttribute("src");
      if (window.console) console.warn("PV film stream fell back to the single file:", e && e.message ? e.message : e);
      if (onFail) onFail(e);
    }
    video.addEventListener("timeupdate", pump);
    video.addEventListener("seeking", pump);
    video.addEventListener("waiting", () => { if (S.loading && !S.dead && video.currentTime > .5) { S.stallsEver++; if (++S.stalls >= 2 && S.ti > 0) { S.ti--; S.stalls = 0; } } });

    return {
      start: start,
      play() { S.wantPlay = true; start(); if (S.attached) { const p = video.play(); if (p) p.catch(() => {}); } },
      pause() { S.wantPlay = false; video.pause(); },
      // the page calls this when the film has been taken off screen and wound back: if it was shown in mixed sizes, or the
      // connection has since proved good for a different size, it is rebuilt in one size before its next showing
      rewound() { if (S.sb && !S.hold && (S.mixed || S.lowered || (S.shownTi >= 0 && S.shownTi !== S.ti))) refill(0); },
      busy() { return !!S.loading; },
      fail: fail,
      get dead() { return S.dead; },
      info() {
        const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null, t = tiers[S.ti];
        return { size: t.h + "p", mbps: +(t.bps / 1e6).toFixed(1), shown: video.videoWidth + "x" + video.videoHeight, ahead: +(aheadEnd(video.currentTime) - video.currentTime).toFixed(1),
          net: +(S.rate / 1e6).toFixed(0), dropped: q ? q.droppedVideoFrames + "/" + q.totalVideoFrames : "n/a", via: MSImpl === window.MediaSource ? "MediaSource" : "ManagedMediaSource" };
      }
    };
  };
})();
