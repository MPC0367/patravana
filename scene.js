/* ============================================================
   PATRAVANA v2 — three.js atmosphere (carried over from v1)
   hero: floating pollen motes over the drone video
   visit: fireflies over the moonrise photograph
   No textures beyond a soft dot sprite; nothing can streak.
   ============================================================ */
(function () {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.PV_SCENES = { ok: false };
  if (reduced || typeof THREE === "undefined") return;
  try { const c = document.createElement("canvas"); if (!(c.getContext("webgl2") || c.getContext("webgl"))) return; } catch (e) { return; }
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function softDot(inner, outer) {
    const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
    const ctx = c.getContext("2d"), g = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner); g.addColorStop(.45, outer); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function makeRenderer(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
    r.setPixelRatio(DPR); r.setClearColor(0x000000, 0); return r;
  }
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => { pointer.tx = (e.clientX / window.innerWidth) * 2 - 1; pointer.ty = (e.clientY / window.innerHeight) * 2 - 1; }, { passive: true });

  /* pollen */
  function pollenScene(canvas) {
    const renderer = makeRenderer(canvas), scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, .1, 60); camera.position.z = 10;
    const group = new THREE.Group(); scene.add(group);
    const N = 120, pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - .5) * 24; pos[i * 3 + 1] = (Math.random() - .5) * 13; pos[i * 3 + 2] = -1 - Math.random() * 6;
      seed[i * 3] = Math.random() * Math.PI * 2; seed[i * 3 + 1] = .35 + Math.random() * .9; seed[i * 3 + 2] = .12 + Math.random() * .5;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: .09, sizeAttenuation: true, map: softDot("rgba(244,240,231,.95)", "rgba(181,165,141,.35)"),
      transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending
    })));
    let raf = null, t = 0;
    function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    resize();
    function tick() {
      t += .016;
      pointer.x += (pointer.tx - pointer.x) * .04; pointer.y += (pointer.ty - pointer.y) * .04;
      group.position.x = pointer.x * .55; group.position.y = -pointer.y * .3;
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const ph = seed[i * 3], sp = seed[i * 3 + 1];
        p[i * 3] += Math.sin(t * .22 * sp + ph) * .0035;
        p[i * 3 + 1] += Math.cos(t * .3 * sp + ph * 1.7) * .0028 + .0011;
        if (p[i * 3 + 1] > 7) p[i * 3 + 1] = -7;
      }
      geo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera); raf = requestAnimationFrame(tick);
    }
    return { el: canvas, start() { if (!raf) { resize(); raf = requestAnimationFrame(tick); } }, stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }, resize };
  }

  /* fireflies */
  function firefliesScene(canvas) {
    const renderer = makeRenderer(canvas), scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, .1, 60); camera.position.z = 10;
    const N = 56, pos = new Float32Array(N * 3), phase = new Float32Array(N), speed = new Float32Array(N), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - .5) * 22; pos[i * 3 + 1] = (Math.random() - .62) * 9; pos[i * 3 + 2] = -1 - Math.random() * 5;
      phase[i] = Math.random() * Math.PI * 2; speed[i] = .5 + Math.random() * 1.4; size[i] = 24 + Math.random() * 32;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uDPR: { value: DPR } },
      vertexShader: "attribute float aPhase; attribute float aSpeed; attribute float aSize; uniform float uTime; uniform float uDPR; varying float vA;\nvoid main(){ vec3 p = position; p.x += sin(uTime * .18 * aSpeed + aPhase) * .9; p.y += sin(uTime * .24 * aSpeed + aPhase * 2.1) * .5; float blink = smoothstep(.15, .95, .5 + .5 * sin(uTime * aSpeed + aPhase * 3.0)); vA = blink; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = aSize * uDPR * (.55 + .45 * blink) / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "varying float vA;\nvoid main(){ vec2 uv = gl_PointCoord - .5; float d = length(uv); float glow = smoothstep(.5, .0, d); vec3 col = mix(vec3(0.71, 0.65, 0.55), vec3(0.96, 0.94, 0.90), glow); gl_FragColor = vec4(col, glow * glow * vA * .9); }"
    });
    const flies = new THREE.Points(geo, mat); scene.add(flies);
    let raf = null, t = 0;
    function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    resize();
    function tick() { t += .016; mat.uniforms.uTime.value = t; flies.position.x = pointer.x * .35; renderer.render(scene, camera); raf = requestAnimationFrame(tick); }
    return { el: canvas, start() { if (!raf) { resize(); raf = requestAnimationFrame(tick); } }, stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }, resize };
  }

  const scenes = [];
  const hc = document.getElementById("heroCanvas"), nc = document.getElementById("nightCanvas");
  try { if (hc) scenes.push(pollenScene(hc)); if (nc) scenes.push(firefliesScene(nc)); } catch (e) { console.warn("PV scenes disabled:", e); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { const s = scenes.find((x) => x.el === en.target); if (!s) return; if (en.isIntersecting && !document.hidden) s.start(); else s.stop(); }), { rootMargin: "12% 0px" });
  scenes.forEach((s) => io.observe(s.el));
  document.addEventListener("visibilitychange", () => { if (document.hidden) scenes.forEach((s) => s.stop()); else scenes.forEach((s) => { const r = s.el.getBoundingClientRect(); if (r.bottom > 0 && r.top < window.innerHeight) s.start(); }); });
  let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => scenes.forEach((s) => s.resize()), 160); }, { passive: true });
  window.PV_SCENES.ok = true;
})();
