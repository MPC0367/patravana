/* ============================================================
   PATRAVANA v2: fireflies over the evening photograph
   A few dozen soft dots on a plain 2D canvas. They run only while the evening section is on screen and the tab is in
   front, and not at all when the visitor has asked for less motion. (This replaced a three.js scene: the same look
   for a fraction of the download. The pollen over the hero films is gone, since the films already move.)
   ============================================================ */
(function () {
  "use strict";
  window.PV_SCENES = { ok: false };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.getElementById("nightCanvas");
  const ctx = canvas && canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  // one soft dot, drawn once and stamped for every firefly
  const dot = document.createElement("canvas"); dot.width = dot.height = 64;
  (function () {
    const d = dot.getContext("2d"), g = d.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, "rgba(246,240,229,1)"); g.addColorStop(.3, "rgba(214,200,170,.55)"); g.addColorStop(1, "rgba(181,165,141,0)");
    d.fillStyle = g; d.fillRect(0, 0, 64, 64);
  })();

  const N = 46, flies = [];
  for (let i = 0; i < N; i++) flies.push({ x: Math.random(), y: .28 + Math.random() * .62, phase: Math.random() * Math.PI * 2, speed: .5 + Math.random() * 1.4, size: 9 + Math.random() * 15, depth: .4 + Math.random() * .6 });

  let w = 0, h = 0, raf = 0, t = 0, last = 0, seen = false;
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;
    w = cw; h = ch; canvas.width = Math.round(cw * DPR); canvas.height = Math.round(ch * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function tick(now) {
    raf = 0;
    t += Math.min(64, last ? now - last : 16) / 1000; last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N; i++) {
      const f = flies[i];
      const x = f.x * w + Math.sin(t * .18 * f.speed + f.phase) * 36 * f.depth;
      const y = f.y * h + Math.sin(t * .24 * f.speed + f.phase * 2.1) * 20 * f.depth;
      const blink = .5 + .5 * Math.sin(t * f.speed + f.phase * 3), a = Math.max(0, Math.min(1, (blink - .15) / .8));
      if (a < .02) continue;
      const s = f.size * f.depth;
      ctx.globalAlpha = a * a * (3 - 2 * a) * .85;
      ctx.drawImage(dot, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    if (seen && !document.hidden) raf = requestAnimationFrame(tick); else last = 0;
  }
  const kick = () => { if (!raf && seen && !document.hidden) { if (!w) resize(); raf = requestAnimationFrame(tick); } };
  new IntersectionObserver((en) => en.forEach((e) => { seen = e.isIntersecting; kick(); }), { rootMargin: "12% 0px" }).observe(canvas);
  document.addEventListener("visibilitychange", kick);
  let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 160); }, { passive: true });
  window.PV_SCENES.ok = true;
})();
