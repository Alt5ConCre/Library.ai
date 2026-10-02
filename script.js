/* ============================================================
   SMASH & STACK — interaction engine
   1) scroll-scrubbed burger (real video frames, motion-mapped)
   2) header state, reveals, footer parallax
   ============================================================ */
(function () {
  "use strict";

  const doc = document;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // easeInOutQuad

  /* ---------------- loader ---------------- */
  const loader = doc.getElementById("loader");
  const loadCount = doc.getElementById("loadCount");
  const barFill = loader.querySelector(".loader-bar i");
  let firstFrameReady = false;
  let prevLoaded = false;
  let pageLoaded = false;

  function maybeFinish() {
    const ready = firstFrameReady && prevLoaded;
    if (!ready) return;
    barFill.style.width = "100%";
    loadCount.textContent = "READY";
    setTimeout(() => {
      loader.classList.add("done");
      draw(currentT); // paint hero frame behind loader fade
    }, 250);
  }
  setTimeout(() => { // never trap the visitor on the loader
    loader.classList.add("done");
    draw(currentT);
  }, 4000);

  /* ---------------- scroll-scrub burger ---------------- */
  const canvas = doc.getElementById("burgerCanvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const poster = doc.querySelector(".hero-poster img");
  const hero = doc.getElementById("scrollBurger");
  const copyA = doc.getElementById("copyA");
  const copyB = doc.getElementById("copyB");
  const scrollHint = doc.getElementById("scrollHint");
  const layerTag = doc.getElementById("layerTag");

  const CDF = (window.FRAME_CDF && window.FRAME_CDF.length > 10) ? window.FRAME_CDF : null;
  const N = CDF ? CDF.length : 0;
  const SRC = "assets/frames/f_%03d.jpg";

  const LAYER_NAMES = [
    "TOP BUN · SESAME BRIOCHE",
    "MOLTEN AGED CHEDDAR",
    "SMASH PATTY №2",
    "CHARRED ONIONS",
    "BEEF-TOMATO · LETTUCE",
    "SMASH PATTY №1",
    "TOASTED BOTTOM BUN",
  ];

  const imgs = [];            // decoded frames
  const wanted = new Set();   // frames we have requested
  let drawnIndex = -1;        // index currently on canvas
  let currentT = 0;           // last known scrub progress
  let heroLen = 1;            // px of scroll runway
  let heroTop = 0;
  let vh = innerHeight;

  /* -------- motion-mapped progress -> frame index -------- */
  function frameForProgress(t) {
    if (!CDF) return 0;
    const tt = clamp(t, 0, 1);
    let lo = 0, hi = N - 1;
    while (lo < hi) {                       // first frame whose cdf >= tt
      const mid = (lo + hi) >> 1;
      if (CDF[mid] < tt) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function requestFrame(i) {
    if (i < 0 || i >= N || imgs[i] || wanted.has(i)) return;
    wanted.add(i);
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      imgs[i] = im;
      if (i === 0 && !firstFrameReady) { firstFrameReady = true; maybeFinish(); }
      if (i === drawnIndex) paint(im);
      primeNeighbours(i);
    };
    im.onerror = () => wanted.delete(i);
    im.src = SRC.replace("%03d", String(i + 1).padStart(3, "0"));
  }

  function primeNeighbours(i) {
    requestFrame(i + 1); requestFrame(i + 2); requestFrame(i + 3);
    requestFrame(i - 1); requestFrame(i - 2); requestFrame(i - 3);
    // running start: queue a wide band once the first frame lands
    if (i === 0) for (let k = 1; k <= 24; k++) requestFrame(k);
  }

  /* -------- painting -------- */
  let paintQueued = false;
  function paint(im) {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      fitCanvas();
      const cw = canvas.width, ch = canvas.height;
      const iw = im.naturalWidth, ih = im.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih);           // cover
      const w = iw * scale, h = ih * scale;
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
    });
  }

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = clamp(devicePixelRatio || 1, 1, 1.5); // keep fill-rate sane
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      drawnIndex = -1; // force repaint at new size
    }
  }

  /* -------- segment clocks: hold -> explode -> hold -> restack -------- */
  function segmentT(t, a, b) {
    return clamp((t - a) / (b - a), 0, 1);
  }

  function applyCopyPositions(t) {
    const vw = innerWidth;
    if (vw < 860) { // narrow: crossfade instead of slide
      const a = 1 - segmentT(t, 0.02, 0.16);
      copyA.style.opacity = a.toFixed(3);
      copyA.style.transform = "translateY(-50%)";
      copyB.style.opacity = segmentT(t, 0.2, 0.34).toFixed(3);
      copyB.style.transform = "translateY(-50%)";
      copyB.style.pointerEvents = "auto";
      copyA.style.pointerEvents = a > 0.5 ? "auto" : "none";
      return;
    }
    // copy A: exits left with blur
    const eA = smooth(segmentT(t, 0.02, 0.2));
    copyA.style.opacity = (1 - eA).toFixed(3);
    copyA.style.transform = `translate(${(-eA * vw * 0.56).toFixed(1)}px, -50%)`;
    copyA.style.filter = `blur(${(eA * 9).toFixed(1)}px)`;
    copyA.style.pointerEvents = eA > 0.5 ? "none" : "auto";
    // copy B: enters from right, settles at left
    const eB = smooth(segmentT(t, 0.2, 0.4));
    copyB.style.opacity = eB.toFixed(3);
    copyB.style.transform = `translate(${((1 - eB) * vw * 0.56).toFixed(1)}px, -50%)`;
    copyB.style.filter = `blur(${((1 - eB) * 7).toFixed(1)}px)`;
  }

  function draw(t) {
    currentT = t;
    const canvasOn = t > 0.005 && t < 0.995 && !reduceMotion;
    canvas.classList.toggle("on", canvasOn);
    if (!canvasOn) { // native video look: 0 (poster) or 1 (last frame)
      poster.style.opacity = t >= 0.5 ? 0 : 1;
      if (t >= 0.5 && drawnIndex !== N - 1 && imgs[N - 1]) paint(imgs[N - 1]);
      return;
    }
    poster.style.opacity = 0;

    const fi = CDF ? frameForProgress(t) : 0;
    if (fi !== drawnIndex) {
      if (imgs[fi]) { paint(imgs[fi]); drawnIndex = fi; }
      else { requestFrame(fi); requestFrame(fi + 1); }
    }
    applyCopyPositions(t);

    // layer tag: visible during the explode half
    const hold2 = segmentT(t, 0.32, 0.62);
    layerTag.classList.toggle("show", hold2 > 0.02 && hold2 < 1);
    if (hold2 > 0.02 && hold2 < 1) {
      const idx = clamp(Math.floor(hold2 * LAYER_NAMES.length), 0, LAYER_NAMES.length - 1);
      const label = LAYER_NAMES[idx];
      if (layerTag.textContent !== label) layerTag.textContent = label;
    }
    // scroll hint fades after first movement
    scrollHint.style.opacity = t > 0.02 ? 0 : 1;
  }

  function measure() {
    vh = innerHeight;
    heroTop = hero.offsetTop;
    const rect = hero.getBoundingClientRect();
    heroLen = Math.max(vh * 2.2, rect.height - vh);
  }

  function onScroll() {
    const y = -hero.getBoundingClientRect().top;
    const t = clamp(y / heroLen, 0, 1);
    draw(t);
    head.classList.toggle("solid", y > vh * 0.82);
    footerParallax();
  }

  /* ---------------- reveals ---------------- */
  const revealEls = doc.querySelectorAll(".menu, .craft, .how, .findus, .foot");
  revealEls.forEach(el => el.classList.add("rv"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) en.target.classList.add("in"); });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));

  /* ---------------- footer parallax ---------------- */
  const craftImg = doc.querySelector(".craft-media img");
  const footHead = doc.querySelector(".foot-head");
  function footerParallax() {
    if (reduceMotion) return;
    const cr = craftImg.getBoundingClientRect();
    if (cr.bottom > 0 && cr.top < vh) {
      const p = (cr.top + cr.height / 2 - vh / 2) / vh; // -0.5..0.5
      craftImg.style.transform = `translateY(${(p * -38 - 4).toFixed(1)}%) scale(1.02)`;
    }
    const fr = footHead.getBoundingClientRect();
    if (fr.top < vh && fr.bottom > 0) {
      const p = 1 - clamp((fr.top + fr.height / 2) / vh, 0, 1.4);
      footHead.style.transform = `translateY(${(p * 26).toFixed(1)}px)`;
    }
  }

  /* ---------------- boot ---------------- */
  const head = doc.getElementById("siteHead");
  let ticking = false;
  function rafScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  }
  addEventListener("scroll", rafScroll, { passive: true });

  let rT;
  addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(() => { measure(); onScroll(); }, 120);
  });

  doc.addEventListener("DOMContentLoaded", () => { pageLoaded = true; });
  addEventListener("load", () => { pageLoaded = true; prevLoaded = true; maybeFinish(); });
  if (doc.readyState === "complete") { prevLoaded = true; maybeFinish(); }

  measure();
  requestFrame(0);
  draw(0);
  onScroll();
})();
