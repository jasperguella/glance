(function () {
  var RAMP = ['.', '.', ':', ':', '+', '=', 'x', 'X', '9', '6', '3', '0', '#'];
  var NOISE = ':+=xX#0369';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
  var fract = function (v) { return v - Math.floor(v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var inOut = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var out = function (t) { return 1 - Math.pow(1 - t, 3); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };

  // Boot timeline (s): sparse glyphs, then cells lock top-first.
  var B = { lockStart: 0.55, lockSpan: 1.7 };
  // Intro timeline (s after trigger)
  var I = { flyEnd: 1.5, enterA: 1.7, enterB: 2.7, seekB: 4.6, zoomA: 4.9, zoomB: 6.2, text: 6.3 };

  function HeroIntro(canvas, o) {
    var self = this;
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.o = o;
    this.mode = 'boot'; this.raf = 0; this.bootStart = null; this.runStart = null; this.typed = -1;
    this.ro = new ResizeObserver(function () { self.layout(); if (self.mode === 'done') self.frame(performance.now()); });
    this.ro.observe(canvas);
  }
  HeroIntro.prototype.Z = 2.4;
  HeroIntro.prototype.QUOTE = 'Hey Glance, where\u2019s my red backpack?';

  HeroIntro.prototype.layout = function () {
    var photo = this.o.photo; if (!photo) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    var iw = photo.width, ih = photo.height;
    this.s0 = Math.max(w / iw, h / ih);
    this.ox0 = (w - iw * this.s0) / 2; this.oy0 = (h - ih * this.s0) / 2;
    var tx = iw * this.o.target[0], ty = ih * this.o.target[1];
    this.tx = tx; this.ty = ty;
    this.P0 = [this.ox0 + tx * this.s0, this.oy0 + ty * this.s0];
    var narrow = w < 760;
    this.s1 = this.s0 * this.Z;
    var X = narrow ? w * 0.5 : w * 0.7, Y = narrow ? h * 0.32 : h * 0.5;
    var ox1 = Math.min(0, Math.max(w - iw * this.s1, X - tx * this.s1));
    var oy1 = Math.min(0, Math.max(h - ih * this.s1, Y - ty * this.s1));
    this.P1 = [ox1 + tx * this.s1, oy1 + ty * this.s1];
    this.sz = Math.max(110, Math.min(220, Math.min(w, h) * 0.26));

    this.cw = Math.max(6, w / (w < 760 ? 70 : 140)); this.ch = this.cw * 1.45;
    this.cols = Math.ceil(w / this.cw); this.rows = Math.ceil(h / this.ch);
    var sm = document.createElement('canvas'); sm.width = this.cols; sm.height = this.rows;
    var sg = sm.getContext('2d', { willReadFrequently: true });
    var k = this.cols / w;
    sg.drawImage(photo, this.ox0 * k, this.oy0 * k, iw * this.s0 * k, ih * this.s0 * k);
    var px = sg.getImageData(0, 0, this.cols, this.rows).data;
    var n = this.cols * this.rows, i, lums = new Float32Array(n);
    for (i = 0; i < n; i++) lums[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    var sorted = Float32Array.from(lums).sort();
    var lo = sorted[Math.floor(n * 0.02)], hi = sorted[Math.floor(n * 0.98)], span = Math.max(0.05, hi - lo);
    this.target = new Array(n); this.lockAt = new Float32Array(n); this.seed = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var dark = 1 - clamp((lums[i] - lo) / span);
      var q = Math.min(RAMP.length - 1, Math.max(0, Math.round(dark * (RAMP.length - 1) + (Math.random() - 0.5) * 2)));
      this.target[i] = RAMP[q];
      this.lockAt[i] = B.lockStart + B.lockSpan * (0.6 * Math.random() + 0.4 * Math.floor(i / this.cols) / this.rows);
      this.seed[i] = Math.random();
    }
    this.fontPx = this.ch * 0.78;
  };

  HeroIntro.prototype.start = function () {
    if (reduce) { this.finish(); return; }
    this.bootStart = performance.now(); this.loop();
  };
  HeroIntro.prototype.loop = function () {
    var self = this; cancelAnimationFrame(this.raf);
    var tick = function (now) { self.frame(now); if (self.mode !== 'done') self.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  };
  HeroIntro.prototype.trigger = function () {
    if (this.mode !== 'boot') return;
    this.mode = 'run'; this.runStart = performance.now();
    this.o.onRun && this.o.onRun();
  };
  HeroIntro.prototype.finish = function () {
    cancelAnimationFrame(this.raf);
    this.mode = 'done'; this.runStart = performance.now() - I.text * 1000 - 5000;
    this.o.onQuote && this.o.onQuote('', false);
    this.o.onText && this.o.onText();
    this.frame(performance.now());
  };

  HeroIntro.prototype.frame = function (now) {
    if (!this.cols) return;
    var g = this.ctx, w = this.w, h = this.h, o = this.o;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#14171C'; g.fillRect(0, 0, w, h);
    var tb = this.bootStart == null ? 9 : (now - this.bootStart) / 1000;
    var tr = this.runStart == null ? -1 : (now - this.runStart) / 1000;
    if (this.mode === 'boot' && !this.settled && tb > B.lockStart + B.lockSpan + 0.3) { this.settled = true; o.onSettled && o.onSettled(); }

    // Fly-over wipe
    var flyT = tr < 0 ? 0 : inOut(seg(tr, 0, I.flyEnd));
    var big = h * 1.25;
    var bigW = big * this.o.crest.width / this.o.crest.height;
    var flyX = lerp(-bigW / 2, w + bigW / 2, flyT);
    var wipe = tr < 0 ? -1 : (tr >= I.flyEnd ? w + 1 : flyX);

    // Camera
    var zt = tr < 0 ? 0 : inOut(seg(tr, I.zoomA, I.zoomB));
    var s = lerp(this.s0, this.s1, zt);
    var Px = lerp(this.P0[0], this.P1[0], zt), Py = lerp(this.P0[1], this.P1[1], zt);
    var ox = Px - this.tx * s, oy = Py - this.ty * s;

    if (wipe > 0) {
      g.save(); g.beginPath(); g.rect(0, 0, Math.max(0, wipe), h); g.clip();
      g.drawImage(o.photo, ox, oy, o.photo.width * s, o.photo.height * s);
      var tint = 0.7 * seg(tr, I.zoomB - 0.2, I.text + 0.4);
      if (tint > 0) { g.fillStyle = 'rgba(20,23,28,' + tint + ')'; g.fillRect(0, 0, w, h); }
      g.restore();
    }
    if (wipe < w) this.drawAscii(g, tb, Math.max(0, wipe));

    // Crest
    var cr = o.crest;
    if (tr >= 0 && tr < I.flyEnd) this.drawCrest(g, flyX, h / 2, big, 0, 1);
    if (tr >= I.enterA) {
      var et = out(seg(tr, I.enterA, I.enterB));
      var x = lerp(w + this.sz, w / 2, et), y = lerp(-this.sz, h / 2, et);
      var rot = lerp(0, Math.PI / 2, et);
      var st = inOut(seg(tr, I.enterB, I.seekB));
      if (st > 0) {
        var mx = (w / 2 + this.P0[0]) / 2, my = Math.min(h / 2, this.P0[1]) - h * 0.12; // arc control
        var u = 1 - st;
        x = u * u * (w / 2) + 2 * u * st * mx + st * st * this.P0[0];
        y = u * u * (h / 2) + 2 * u * st * my + st * st * this.P0[1];
      }
      if (zt > 0) { x = Px; y = Py; }
      var size = this.sz * (0.8 + 0.2 * et) * lerp(1, 1.25, zt);
      var a = tr > I.zoomB ? 1 - 0.35 * seg(tr, I.zoomB, I.zoomB + 0.8) : 1;
      this.drawCrest(g, x, y, size, rot + 0.15 * Math.sin(Math.max(0, tr - I.seekB) * 1.6) * (1 - zt), a);
    }

    // Typed quote
    if (tr >= I.enterB) {
      var n = Math.floor(seg(tr, I.enterB, I.seekB - 0.2) * this.QUOTE.length);
      var vis = tr < I.zoomB + 0.1;
      var key = n + (vis ? 'v' : 'h');
      if (key !== this.typed) { this.typed = key; o.onQuote && o.onQuote(this.QUOTE.slice(0, n), vis); }
    }
    if (this.mode === 'run' && tr >= I.text) { this.mode = 'done'; o.onText && o.onText(); }
  };

  HeroIntro.prototype.drawCrest = function (g, x, y, size, rot, a) {
    g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot);
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = size * 0.08; g.shadowOffsetY = size * 0.03;
    var cw = size * this.o.crest.width / this.o.crest.height;
    g.drawImage(this.o.crest, -cw / 2, -size / 2, cw, size);
    g.restore();
  };

  HeroIntro.prototype.drawAscii = function (g, t, fromX) {
    g.font = this.fontPx + 'px "JetBrains Mono", ui-monospace, Menlo, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var flicker = Math.floor(t * 14), c0 = Math.floor(fromX / this.cw);
    for (var r = 0; r < this.rows; r++) for (var c = c0; c < this.cols; c++) {
      var i = r * this.cols + c, seed = this.seed[i], ch = null, a = 0, lock = this.lockAt[i];
      if (t >= lock + 0.18) { ch = this.target[i]; a = ch === '.' ? 0.45 : 0.9; }
      else if (t >= lock) { ch = NOISE[(Math.floor(seed * 97) + flicker) % NOISE.length]; a = 0.8; }
      else {
        var density = 0.06 * clamp(t / 0.4) * (t < 1 ? 1 : 0.5);
        if (fract(seed * 13.7 + flicker * 0.618) < density) { ch = NOISE[(Math.floor(seed * 31) + flicker) % NOISE.length]; a = 0.75; }
        else if (fract(seed * 7.1) < 0.04) { ch = '.'; a = 0.25; }
      }
      if (!ch) continue;
      g.fillStyle = 'rgba(200,200,200,' + a + ')';
      g.fillText(ch, c * this.cw + this.cw / 2, r * this.ch + this.ch / 2);
    }
  };
  HeroIntro.prototype.destroy = function () { cancelAnimationFrame(this.raf); this.ro.disconnect(); };

  window.GlanceIntro = { HeroIntro: HeroIntro, reduce: reduce };
})();
