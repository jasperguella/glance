(function () {
  // Ported from "ASCII image reveal.html". Bright pixels -> dots, dark pixels -> dense glyphs.
  var RAMP = ['.', '.', ':', ':', '+', '=', 'x', 'X', '9', '6', '3', '0', '#'];
  var NOISE = ':+=xX#0369';
  var T = { scatterEnd: 1.0, lockStart: 0.55, lockSpan: 1.7, photoIn: 3.3, photoSpan: 0.9 };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v) { return Math.min(1, Math.max(0, v)); };
  var fract = function (v) { return v - Math.floor(v); };
  var ease = function (v) { return v * v * (3 - 2 * v); };

  function Reveal(canvas, o) {
    var self = this;
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.o = o || {};
    this.hold = !!this.o.hold; this.revealAt = null; this.start = null; this.raf = 0;
    this.ro = new ResizeObserver(function () { self.layout(); }); this.ro.observe(canvas);
  }
  Reveal.prototype.setSource = function (img) { this.source = img; this.layout(); };
  Reveal.prototype.layout = function () {
    if (!this.source) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.cw = Math.max(this.o.minCell || 6, w / (this.o.cols || 110));
    this.ch = this.cw * 1.45;
    this.cols = Math.ceil(w / this.cw); this.rows = Math.ceil(h / this.ch);
    var full = document.createElement('canvas');
    full.width = Math.round(w * dpr); full.height = Math.round(h * dpr);
    var fg = full.getContext('2d');
    var sw = this.source.width, sh = this.source.height;
    var s = Math.max(full.width / sw, full.height / sh) * (this.o.zoom || 1);
    fg.drawImage(this.source, (full.width - sw * s) / 2, (full.height - sh * s) / 2, sw * s, sh * s);
    this.photo = full;
    var small = document.createElement('canvas'); small.width = this.cols; small.height = this.rows;
    var sg = small.getContext('2d', { willReadFrequently: true });
    sg.drawImage(full, 0, 0, this.cols, this.rows);
    var px = sg.getImageData(0, 0, this.cols, this.rows).data;
    var n = this.cols * this.rows, i, lums = new Float32Array(n);
    for (i = 0; i < n; i++) lums[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    var sorted = Float32Array.from(lums).sort();
    var lo = sorted[Math.floor(n * 0.02)], hi = sorted[Math.floor(n * 0.98)], span = Math.max(0.05, hi - lo);
    this.target = new Array(n); this.lockAt = new Float32Array(n); this.seed = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var dark = 1 - clamp((lums[i] - lo) / span);
      var k = Math.min(RAMP.length - 1, Math.max(0, Math.round(dark * (RAMP.length - 1) + (Math.random() - 0.5) * 2)));
      this.target[i] = RAMP[k];
      var y = Math.floor(i / this.cols) / this.rows;
      this.lockAt[i] = T.lockStart + T.lockSpan * (0.6 * Math.random() + 0.4 * y);
      this.seed[i] = Math.random();
    }
    this.fontPx = this.ch * 0.78;
    this.draw(this.start == null ? 0 : this.elapsed || 0);
  };
  Reveal.prototype.photoAlpha = function (t, now) {
    if (reduce) return 1;
    if (this.hold) return this.revealAt == null ? 0 : clamp((now - this.revealAt) / 1000 / T.photoSpan);
    return clamp((t - T.photoIn) / T.photoSpan);
  };
  Reveal.prototype.play = function () {
    var self = this;
    cancelAnimationFrame(this.raf);
    this.revealAt = null; this.start = performance.now();
    var tick = function (now) {
      var t = Math.max(0, (now - self.start) / 1000);
      self.elapsed = t; self.now = now;
      self.draw(t);
      var pa = self.photoAlpha(t, now);
      var settling = t < T.lockStart + T.lockSpan + 0.3;
      if (pa < 1 && (settling || self.revealAt != null || !self.hold)) self.raf = requestAnimationFrame(tick);
      if (self.o.onSettled && !settling && !self._settled) { self._settled = true; self.o.onSettled(); }
    };
    this._settled = false;
    this.raf = requestAnimationFrame(tick);
  };
  Reveal.prototype.reveal = function () {
    if (this.revealAt != null) return;
    this.revealAt = performance.now();
    var self = this;
    var settling = (this.elapsed || 0) < T.lockStart + T.lockSpan + 0.3;
    if (!settling) {
      cancelAnimationFrame(this.raf);
      var tick = function (now) {
        self.now = now; self.draw(self.elapsed);
        if (self.photoAlpha(self.elapsed, now) < 1) self.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
  };
  Reveal.prototype.draw = function (t) {
    if (!this.photo) return;
    var g = this.ctx, now = this.now || performance.now();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    var photoA = this.start == null && !reduce ? 0 : this.photoAlpha(t, now), asciiA = 1 - photoA;
    if (photoA > 0) { g.globalAlpha = ease(photoA); g.drawImage(this.photo, 0, 0, this.w, this.h); g.globalAlpha = 1; }
    if (asciiA <= 0 || this.start == null) return;
    g.font = this.fontPx + 'px "JetBrains Mono", ui-monospace, Menlo, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    var glyph = this.o.glyph || '200,200,200', flicker = Math.floor(t * 14);
    for (var r = 0; r < this.rows; r++) for (var c = 0; c < this.cols; c++) {
      var i = r * this.cols + c, seed = this.seed[i], ch = null, a = 0, lock = this.lockAt[i];
      if (t >= lock + 0.18) { ch = this.target[i]; a = ch === '.' ? 0.45 : 0.9; }
      else if (t >= lock) { ch = NOISE[(Math.floor(seed * 97) + flicker) % NOISE.length]; a = 0.8; }
      else {
        var density = 0.06 * clamp(t / 0.4) * (t < T.scatterEnd ? 1 : 0.5);
        if (fract(seed * 13.7 + flicker * 0.618) < density) { ch = NOISE[(Math.floor(seed * 31) + flicker) % NOISE.length]; a = 0.75; }
        else if (fract(seed * 7.1) < 0.04) { ch = '.'; a = 0.25; }
      }
      if (!ch) continue;
      g.fillStyle = 'rgba(' + glyph + ',' + a * asciiA + ')';
      g.fillText(ch, c * this.cw + this.cw / 2, r * this.ch + this.ch / 2);
    }
  };
  Reveal.prototype.destroy = function () { cancelAnimationFrame(this.raf); this.ro.disconnect(); };

  function load(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  window.GlanceAscii = { Reveal: Reveal, load: load, reduce: reduce };
})();
