/* ============================================================
   PATRAVANA v2: hero film streaming
   One video file per film cannot carry a 4K drone shot at a bitrate that does it justice (and a page host may cap files
   at 20 MB, which had the whole 33 s film squeezed to a fifth of its master). So each film is kept as a run of short
   fragmented-MP4 parts at several sizes (film-manifest.js), and this feeds them to the <video> through Media Source
   Extensions. The screen gets the size it can actually show, at full bitrate, with no seams; the size follows the
   connection down and back up; and parts are fetched whole, so the host need not answer range requests.
   If a browser cannot do this, or anything fails, PVStream says so and the page moves on to its next way of playing.
   ============================================================ */
(function () {
  "use strict";
  const AHEAD = 14;                                    // seconds of film kept buffered ahead of the playhead

  // onFail(error): the stream cannot go on. onBlocked(): the browser refused to start playback without a touch.
  window.PVStream = function (video, man, onFail, onBlocked) {
    // the classic MediaSource where there is one (desktop, iPad); the managed form is all an iPhone has
    const MSImpl = window.MediaSource || window.ManagedMediaSource;
    const managed = !window.MediaSource && !!window.ManagedMediaSource;
    if (!MSImpl || !window.fetch || !window.ReadableStream || !man || !man.tiers || !man.tiers.length) return null;
    const tiers = man.tiers.filter((t) => { try { return MSImpl.isTypeSupported(t.mime); } catch (e) { return false; } });
    if (!tiers.length) return null;

    // which size to ask for: the film is cover-fitted, so what counts is how many device pixels its full width must fill
    const conn = navigator.connection || {};
    const ua = navigator.userAgent;
    const touch = window.matchMedia("(pointer: coarse)").matches || /iP(hone|ad|od)|Android/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const needW = Math.max(window.innerWidth, window.innerHeight * 16 / 9) * (window.devicePixelRatio || 1);
    let want = tiers.findIndex((t) => t.w >= needW * .85); if (want < 0) want = tiers.length - 1;
    // phones and tablets stop at 1440p: their slice of the frame shows no more, and it keeps two films inside what they decode at once
    if (touch) { const cap = tiers.findIndex((t) => t.h >= 1440); if (cap >= 0) want = Math.min(want, cap); }
    if (conn.saveData || /(^|-)2g$|^3g$/.test(conn.effectiveType || "")) want = 0;

    // ti: the size the next part is fetched in. cap: the largest size this screen and this device should get.
    const S = { ti: want, cap: want, started: false, attached: false, dead: false, hold: false, loading: null, ctl: null, ms: null, sb: null, url: "",
      wantPlay: false, proved: false, fed: false, rate: 0, stalls: 0, stallsEver: 0, lowered: false, mixed: false, shownTi: -1, lastTi: -1,
      lastKey: "", lastEnd: -1, f0: 0, d0: 0, bad: 0, timer: 0, placed: false, kept: [], shift: 0 };

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
    // Where does this browser put the film's first picture? The files carry a two-frame lead-in (B-frames) and an edit
    // list that cancels it. Some browsers apply the edit list when streaming and some do not, and a film whose first
    // picture is not at zero never starts in Safari. So nothing is assumed: the first pictures are appended, the start
    // of the buffer is read back, and if it is not zero the film is pulled back by exactly that much and appended again.
    async function place() {
      let start = 0;
      try { if (!S.sb.buffered.length) return false; start = S.sb.buffered.start(0); } catch (e) { return false; }
      S.placed = true;
      const kept = S.kept; S.kept = null;
      if (start < .004) return true;
      if (start > .5) throw new Error("the film's first pictures were not accepted (buffer starts at " + start.toFixed(2) + " s)");
      S.sb.abort();
      await clear(0, man.dur + 1);
      S.shift = -start; S.sb.timestampOffset = S.shift;
      for (const k of kept) await appendChunk(k);
      return true;
    }
    async function loadPart(ti, pi) {
      const tier = tiers[ti], part = tier.parts[pi], ctl = new AbortController(); S.ctl = ctl;
      if (ti !== S.lastTi) { if (S.lastTi >= 0 && S.sb.changeType) S.sb.changeType(tier.mime); S.lastTi = ti; }
      const res = await fetch(part.u, { signal: ctl.signal });
      if (!res.ok || !res.body) throw new Error("film part " + res.status);
      const rd = res.body.getReader();
      let got = 0, first = 0, tFirst = 0;                // speed is timed from the first bytes, so the wait to connect is not counted
      if (!S.placed) S.kept = [];
      for (;;) {
        const r = await rd.read(); if (r.done) break;
        if (!tFirst) { tFirst = performance.now(); first = r.value.byteLength; }
        got += r.value.byteLength;
        if (!S.placed) S.kept.push(r.value);
        await appendChunk(r.value);
        if (!S.placed) await place();
        if (!S.placed && got > 12000000) throw new Error("12 MB of film went in and none of it was buffered");
        S.fed = true;
        if (S.shownTi < 0) S.shownTi = ti; else if (S.shownTi !== ti) S.mixed = true;
        const secs = (performance.now() - tFirst) / 1000;
        // the opening part doubles as a speed test: if the line cannot carry this size, step down before anyone sees a stall
        if (!S.proved && S.placed && got > 2500000 && secs > .5) {
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
      else if (ti < S.cap && !S.stallsEver && S.rate > tiers[ti + 1].bps * 1.25) S.ti = ti + 1;          // room to spare: next part a size up
    }
    function pump() {
      if (S.dead || S.loading || S.hold || !S.sb) return;
      const t = video.currentTime, end = aheadEnd(t);
      if (end >= man.dur - .08) { if (S.ms.readyState === "open" && !S.sb.updating) { try { S.ms.endOfStream(); } catch (e) { /* already closing */ } } return; }
      if (end - t > AHEAD) return;
      const parts = tiers[S.ti].parts, at = end + .02;
      let pi = parts.findIndex((p) => at >= p.t0 && at < p.t1); if (pi < 0) pi = parts.length - 1;
      const key = S.ti + ":" + pi;
      if (key === S.lastKey && end <= S.lastEnd + .01) { fail(new Error("film buffer is not advancing (buffered to " + end.toFixed(2) + " s)")); return; }
      S.lastKey = key; S.lastEnd = end;
      S.loading = loadPart(S.ti, pi).catch((e) => { if (!S.dead && (!e || e.name !== "AbortError")) fail(e); }).then(() => { S.loading = null; pump(); });
    }
    // empties the buffer from a point on and lets the pump fill it again in the current size; nothing is fetched meanwhile
    async function refill(from) {
      if (S.dead || !S.sb) return;
      S.hold = true; S.lastKey = "";
      if (S.ctl) S.ctl.abort();
      try { if (S.loading) await S.loading; if (S.sb.updating) await updated(); S.sb.abort(); S.sb.timestampOffset = S.shift; await clear(from, man.dur + 1); } catch (e) { /* keep what is there */ }
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
    function tryPlay() { const p = video.play(); if (p) p.catch((e) => { if (e && e.name === "NotAllowedError" && onBlocked) onBlocked(); }); }
    function open() {
      if (S.dead) return;
      const ms = new MSImpl(); S.ms = ms;
      if (managed) video.disableRemotePlayback = true;   // the managed form stays shut unless AirPlay is ruled out first
      ms.addEventListener("sourceopen", () => {
        try {
          S.sb = ms.addSourceBuffer(tiers[S.ti].mime);
          ms.duration = man.dur;
        } catch (e) { fail(e); return; }
        setTimeout(() => { if (!S.fed) fail(new Error("no film data arrived")); }, 20000);
        pump();
      }, { once: true });
      S.url = URL.createObjectURL(ms);
      video.src = S.url; S.attached = true;
      setTimeout(() => { if (!S.sb) fail(new Error("the media source did not open")); }, 6000);
      if (S.wantPlay) tryPlay();
    }
    function start() { if (S.started || S.dead) return; S.started = true; S.timer = setInterval(watch, 4000); fit().then(open, open); }
    function fail(e) {
      if (S.dead) return; S.dead = true;
      if (S.ctl) S.ctl.abort(); clearInterval(S.timer);
      try { URL.revokeObjectURL(S.url); } catch (x) { /* ignore */ }
      video.removeAttribute("src");
      if (onFail) onFail(e);
    }
    video.addEventListener("timeupdate", pump);
    video.addEventListener("seeking", pump);
    video.addEventListener("waiting", () => { if (S.loading && !S.dead && video.currentTime > .5) { S.stallsEver++; if (++S.stalls >= 2 && S.ti > 0) { S.ti--; S.stalls = 0; } } });

    return {
      start: start,
      play() { S.wantPlay = true; start(); if (S.attached) tryPlay(); },
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
          net: +(S.rate / 1e6).toFixed(0), dropped: q ? q.droppedVideoFrames + "/" + q.totalVideoFrames : "n/a", via: managed ? "ManagedMediaSource" : "MediaSource",
          shift: S.placed ? (S.shift ? S.shift.toFixed(3) : "0") : "?", open: !!S.sb };
      }
    };
  };
})();
