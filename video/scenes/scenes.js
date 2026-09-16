/* NestWell walkthrough - scene timeline (owner: SCENES).
 *
 * Loads after art.js. Fetches ../build/timings.json, builds the DOM once, then renderAt(t) writes
 * every changing style for time t. Nothing depends on wall-clock time, timers, CSS transitions or
 * randomness, so any frame can be rendered in any order and always looks the same.
 *
 * Layout (1920 x 1080): text and key UI stay inside x 80..1840 and y 80..940 (the bottom 140 px is
 * left for captions). Scene titles sit in a left column at x 120 (top 190) with chips, labels and figures
 * stacked under them (rows at y 410, 490, 570, 650); devices sit right of centre. The phone is drawn
 * 500 px wide and pans to keep the highlighted part readable; the laptop base ends at x <= 1830.
 *
 * Timing: scene and sentence times come from timings.json. A few word-level moments ("scheduled",
 * "kept", "happened", the comma pauses) are offsets from a sentence start; they were found from pauses
 * in build/voice.wav (energy below -38 dBFS for 50 ms or more).
 *
 * Highlight rectangles are in app CSS pixels of the captures (phone 390 x 844, desktop 1440 x 900).
 * They were measured with getBoundingClientRect() in the live app in the same states that
 * tools/capture.mjs captures, and those measuring screenshots were pixel-identical to
 * assets/app/*.png. If the captures change, measure the rectangles again.
 */
(function () {
  'use strict';

  var A = window.ART;
  var TK = A.tokens;
  var ease = A.ease.inOutCubic;
  var sine = A.ease.inOutSine;
  var W = 1920, H = 1080;
  var stage = document.getElementById('stage');

  /* ------------------------------------------------------------------ math */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function seg(t, a, b) { if (b <= a) return t >= a ? 1 : 0; return clamp01((t - a) / (b - a)); }
  /* eased fade in that starts at a and lasts d; fade out likewise */
  function fin(t, a, d) { return ease(seg(t, a, a + (d == null ? 0.6 : d))); }
  function fout(t, a, d) { return 1 - ease(seg(t, a, a + (d == null ? 0.6 : d))); }
  function sfin(t, a, d) { return sine(seg(t, a, a + d)); }
  function wave(t, period) { return 0.5 - 0.5 * Math.cos(2 * Math.PI * t / period); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r5(v) { return Math.round(v * 100000) / 100000; }

  /* ------------------------------------------------------------------ dom */
  function el(tag, cls, parent, htmlStr) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (htmlStr != null) n.innerHTML = htmlStr;
    if (parent) parent.appendChild(n);
    return n;
  }
  /* write a style only when it changed */
  function setc(n, prop, v) {
    var key = '_s_' + prop;
    if (n[key] !== v) { n.style[prop] = v; n[key] = v; }
  }
  function op(n, v) {
    v = v <= 0.002 ? 0 : v >= 0.998 ? 1 : r3(v);
    setc(n, 'opacity', String(v));
    setc(n, 'visibility', v === 0 ? 'hidden' : 'inherit');
  }
  function tf(n, x, y, s) {
    var v = 'translate(' + r2(x) + 'px,' + r2(y) + 'px)';
    if (s != null && Math.abs(s - 1) > 1e-5) v += ' scale(' + r5(s) + ')';
    setc(n, 'transform', v);
  }
  function setHTML(n, s) { if (n._html !== s) { n.innerHTML = s; n._html = s; } }
  function box(n, x, y, w, h) {
    n.style.left = x + 'px'; n.style.top = y + 'px';
    if (w != null) n.style.width = w + 'px';
    if (h != null) n.style.height = h + 'px';
    return n;
  }
  function full(n) { n.style.width = W + 'px'; n.style.height = H + 'px'; return n; }

  /* ------------------------------------------------------------------ timings */
  var TIM = null;
  var SC = {};
  function ss(id, i) { return SC[id].sentences[i].start; }
  function se(id, i) { return SC[id].sentences[i].end; }

  /* ------------------------------------------------------------------ devices */
  var DEV = {
    phone: { kind: 'phone', ref: 384, app: [390, 844] },
    laptop: { kind: 'laptop', ref: 1080, app: [1440, 900] }
  };

  /* read the frame geometry from the svg ART draws, so it can never drift from art.js */
  function geom(d) {
    var svgStr = d.kind === 'phone' ? A.phoneFrame({ width: d.ref }) : A.laptopFrame({ width: d.ref });
    var holder = document.createElement('div');
    holder.innerHTML = svgStr;
    var svg = holder.firstChild;
    var vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    var u = parseFloat(svg.getAttribute('width')) / vb[2];
    d.svg = svgStr;
    d.svgW = parseFloat(svg.getAttribute('width'));
    d.svgH = parseFloat(svg.getAttribute('height'));
    d.pad = parseFloat(svg.getAttribute('data-pad')) * u;
    d.scrX = parseFloat(svg.getAttribute('data-screen-x')) * u;
    d.scrY = parseFloat(svg.getAttribute('data-screen-y')) * u;
    d.scrW = parseFloat(svg.getAttribute('data-screen-w')) * u;
    d.scrH = parseFloat(svg.getAttribute('data-screen-h')) * u;
    d.appScale = d.scrW / d.app[0];
    if (d.kind === 'phone') {
      d.bodyX = d.pad; d.bodyY = d.pad; d.scrR = 34 * u;            // phone body starts at the pad
    } else {
      d.bodyX = d.pad + 60 * u; d.bodyY = d.pad; d.scrR = 6 * u;     // lid is inset (1120 - 1000) / 2 in the base
    }
  }

  /* a device state is { cx, top, w, o, fx, fy, d }: body centre x, body top, body width, opacity,
   * and a gentle drift (scale d about canvas point fx, fy) */
  function devXform(kind, st) {
    var d = DEV[kind];
    var s = st.w / d.ref;
    var tx = st.cx - (d.ref / 2) * s - d.bodyX * s;
    var ty = st.top - d.bodyY * s;
    var k = st.d == null ? 1 : st.d;
    var fx = st.fx == null ? 960 : st.fx, fy = st.fy == null ? 540 : st.fy;
    return { x: fx * (1 - k) + k * tx, y: fy * (1 - k) + k * ty, s: k * s };
  }
  function appToCanvas(kind, st, ax, ay) {
    var d = DEV[kind], m = devXform(kind, st);
    return { x: m.x + m.s * (d.scrX + ax * d.appScale), y: m.y + m.s * (d.scrY + ay * d.appScale), k: m.s * d.appScale };
  }

  function phoneSkeleton() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" preserveAspectRatio="none">';
    s += '<rect width="390" height="844" fill="' + TK.ground + '"/>';
    s += '<g transform="translate(18 42)">' + A.nestMark({ size: 42 }) + '</g>';
    s += '<rect x="68" y="58" width="112" height="14" rx="7" fill="' + TK.ink + '" opacity="0.16"/>';
    s += '<rect x="16" y="112" width="358" height="50" rx="12" fill="' + TK.spruceSoft + '"/>';
    s += '<rect x="16" y="198" width="196" height="24" rx="12" fill="' + TK.ink + '" opacity="0.10"/>';
    [[252, 146, 150, 240], [420, 176, 184, 270], [618, 196, 130, 220]].forEach(function (c) {
      s += '<rect x="17" y="' + c[0] + '" width="356" height="' + c[1] + '" rx="18" fill="#FFFFFF" stroke="' + TK.line + '" stroke-width="2"/>';
      s += '<rect x="40" y="' + (c[0] + 28) + '" width="' + c[2] + '" height="16" rx="8" fill="' + TK.ink + '" opacity="0.13"/>';
      s += '<rect x="40" y="' + (c[0] + 64) + '" width="290" height="12" rx="6" fill="' + TK.lineSoft + '"/>';
      s += '<rect x="40" y="' + (c[0] + 88) + '" width="' + c[3] + '" height="12" rx="6" fill="' + TK.lineSoft + '"/>';
      if (c[1] > 160) s += '<rect x="40" y="' + (c[0] + 112) + '" width="200" height="12" rx="6" fill="' + TK.lineSoft + '"/>';
    });
    return s + '</svg>';
  }

  function laptopSkeleton() {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="none">';
    s += '<rect width="1440" height="900" fill="' + TK.ground + '"/>';
    s += '<rect width="1440" height="50" fill="' + TK.dawnSoft + '" opacity="0.7"/>';
    s += '<rect x="0" y="50" width="232" height="850" fill="#FFFFFF"/>';
    s += '<rect x="231" y="50" width="2" height="850" fill="' + TK.line + '"/>';
    s += '<g transform="translate(24 70)">' + A.nestMark({ size: 38 }) + '</g>';
    s += '<rect x="72" y="84" width="104" height="14" rx="7" fill="' + TK.ink + '" opacity="0.16"/>';
    s += '<rect x="14" y="132" width="204" height="40" rx="10" fill="' + TK.spruceSoft + '"/>';
    [[192, 120], [236, 96], [280, 136], [324, 84], [368, 150]].forEach(function (b) {
      s += '<rect x="28" y="' + b[0] + '" width="' + b[1] + '" height="14" rx="7" fill="' + TK.lineSoft + '"/>';
    });
    s += '<rect x="272" y="92" width="360" height="26" rx="13" fill="' + TK.ink + '" opacity="0.12"/>';
    function card(x, y, w, h, rows) {
      var c = '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="14" fill="#FFFFFF" stroke="' + TK.line + '" stroke-width="2"/>';
      c += '<rect x="' + (x + 26) + '" y="' + (y + 26) + '" width="' + Math.round(Math.min(220, w * 0.4)) + '" height="16" rx="8" fill="' + TK.ink + '" opacity="0.13"/>';
      for (var i = 0; i < rows; i++) {
        c += '<rect x="' + (x + 26) + '" y="' + (y + 64 + i * 30) + '" width="' + (w - 52 - (i % 3) * 90) + '" height="12" rx="6" fill="' + TK.lineSoft + '"/>';
      }
      return c;
    }
    s += card(272, 146, 1128, 240, 5);
    s += card(272, 414, 556, 440, 12);
    s += card(844, 414, 556, 440, 12);
    return s + '</svg>';
  }

  function buildDevice(d, parent, shots) {
    geom(d);
    d.root = el('div', 'device ' + d.kind, parent);
    d.root.style.width = r2(d.svgW) + 'px';
    d.root.style.height = r2(d.svgH) + 'px';
    d.frame = el('div', 'frame', d.root, d.svg);
    d.screen = box(el('div', 'screen', d.root), r2(d.scrX), r2(d.scrY), r2(d.scrW), r2(d.scrH));
    d.screen.style.borderRadius = r2(d.scrR) + 'px';
    d.imgs = el('div', 'imgs', d.screen);
    d.veil = el('div', 'veil', d.screen);
    op(d.veil, 0);
    d.layers = {};
    d.images = [];
    shots.forEach(function (key) {
      var n;
      if (key === 'skel') {
        n = el('div', 'skel', d.imgs, d.kind === 'phone' ? phoneSkeleton() : laptopSkeleton());
      } else {
        n = el('img', null, d.imgs);
        n.decoding = 'sync';
        n.alt = '';
        n.src = '../assets/app/' + key + '.png';
        d.images.push(n);
      }
      d.layers[key] = n;
      op(n, 0);
    });
    d.overlay = el('div', 'overlay', d.screen);
    d.overlay.style.width = d.app[0] + 'px';
    d.overlay.style.height = d.app[1] + 'px';
    d.overlay.style.transform = 'scale(' + r5(d.appScale) + ')';
    d.items = [];
    op(d.root, 0);
  }

  function renderScreens(d, t) {
    var sch = d.schedule, n = sch.length, a = [], top = 0, i;
    for (i = 0; i < n; i++) {
      a.push(ease(seg(t, sch[i][1] - 0.3, sch[i][1] + 0.3)));
      if (a[i] >= 1) top = i;
    }
    for (i = 0; i < n; i++) op(d.layers[sch[i][0]], i < top ? 0 : a[i]);
  }

  /* A highlight ring on a device screen. rect: [x, y, w, h, radius] in app px, or a function of t.
   * alpha(t) gives its opacity. Rings settle from 3.5 % larger as they fade in. */
  function ring(kind, spec) {
    var d = DEV[kind];
    var n = el('div', 'hl' + (spec.tone === 'dawn' ? ' dawn' : ''), d.overlay);
    var k = d.appScale;
    var c = spec.tone === 'dawn' ? '233,162,75' : '31,95,91';
    var g = spec.glow == null ? 1 : spec.glow;
    n.style.borderWidth = r2((spec.bw || 3) / k) + 'px';
    if (spec.edge != null) n.style.borderColor = 'rgba(' + c + ',' + spec.edge + ')';
    if (spec.fill != null) n.style.background = 'rgba(' + c + ',' + spec.fill + ')';
    n.style.boxShadow = spec.shadow ? spec.shadow : '0 0 0 ' + r2(5 / k) + 'px rgba(' + c + ',' + r3(0.13 * g) + '), 0 0 ' + r2(26 / k) + 'px ' + r2(5 / k) + 'px rgba(' + c + ',' + r3(0.3 * g) + ')';
    op(n, 0);
    d.items.push({
      update: function (t) {
        var a = spec.alpha(t);
        op(n, a);
        if (a <= 0.002) return;
        var R = typeof spec.rect === 'function' ? spec.rect(t) : spec.rect;
        setc(n, 'left', r2(R[0]) + 'px');
        setc(n, 'top', r2(R[1]) + 'px');
        setc(n, 'width', r2(R[2]) + 'px');
        setc(n, 'height', r2(R[3]) + 'px');
        setc(n, 'borderRadius', r2(R[4]) + 'px');
        var s = spec.scale ? spec.scale(t) : 1 + 0.035 * (1 - a);
        setc(n, 'transform', Math.abs(s - 1) < 1e-4 ? 'none' : 'scale(' + r5(s) + ')');
      }
    });
  }
  function lerpRect(a, b, p) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p), lerp(a[4], b[4], p)]; }

  /* a soft tap ripple at app point (x, y), starting at t0 */
  function ripple(kind, x, y, t0) {
    var d = DEV[kind], r = 40;
    var n = box(el('div', 'ripple', d.overlay), x - r, y - r, 2 * r, 2 * r);
    op(n, 0);
    d.items.push({
      update: function (t) {
        var p = seg(t, t0, t0 + 0.85);
        var a = p <= 0 || p >= 1 ? 0 : fin(t, t0, 0.14) * (1 - sine(seg(t, t0 + 0.14, t0 + 0.85)));
        op(n, a * 0.95);
        setc(n, 'transform', 'scale(' + r5(0.35 + 0.85 * sine(p)) + ')');
      }
    });
  }

  /* ------------------------------------------------------------------ device tracks */
  /* The big phone (finishing edit): 500 px wide, so its screen is about 470 px and app body text is about
   * 21 px on a 1080p frame. It is taller than the frame, so it pans (eased) to keep the highlighted part
   * near y 500, cropping at the top or bottom edge. Laptop base stays at x <= 1830 in every frame. */
  var PH_W = 500, PH_CX = 1250, PH_TOP_MAX = 40, PH_TOP_MIN = -110;
  var PH_PROMISE = { cx: 520, top: 392, w: 224 };
  var PH_DEMO = { cx: 560, top: 290, w: 272 };
  var LT_DEMO = { cx: 1090, top: 300, w: 860 };
  var LT_STD = { cx: 1235, top: 190, w: 1040 };
  var LT_DRIFT = 0.01;

  function stateOf(base, extra) {
    var o = { cx: base.cx, top: base.top, w: base.w, o: 1, fx: 960, fy: 540, d: 1 };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function shown(base) { return function () { return stateOf(base); }; }
  function hidden(base, dx, dy) { return function () { return stateOf(base, { cx: base.cx + (dx || 0), top: base.top + (dy || 0), o: 0 }); }; }
  function hiddenFrom(fn, dx, dy) { return function (t) { var s = fn(t); s.cx += dx || 0; s.top += dy || 0; s.o = 0; return s; }; }
  /* laptop: drift toward app point focus(t) = [x, y] by amount(t) (0.01 = 1 %) */
  function drifting(kind, base, focus, amount) {
    return function (t) {
      var f = focus(t);
      var p = appToCanvas(kind, stateOf(base), f[0], f[1]);
      return stateOf(base, { fx: p.x, fy: p.y, d: 1 + amount(t) });
    };
  }
  /* big phone at centre x cx: pans so app y focusY(t) sits near canvas y 500, drifts by amount(t) */
  function bigPhone(cx, focusY, amount) {
    return function (t) {
      var fc = focusY(t);
      var base = { cx: cx, top: 0, w: PH_W };
      var y0 = appToCanvas('phone', stateOf(base), 195, fc).y;
      base.top = Math.max(PH_TOP_MIN, Math.min(PH_TOP_MAX, 500 - y0));
      var p = appToCanvas('phone', stateOf(base), 195, fc);
      return stateOf(base, { fx: p.x, fy: p.y, d: 1 + (amount ? amount(t) : 0) });
    };
  }
  function between(a, b, p) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p)]; }

  /* A track is a list of { t, pre, post, ow, s }: state s(t) applies from boundary t, and the change from
   * the previous state blends (eased) over [t - pre, t + post]. Opacity blends over [t + ow[0], t + ow[1]]
   * (default: the same window). Windows never overlap. */
  function winStart(e) { return e.t - Math.max(e.pre || 0, e.ow ? -e.ow[0] : 0); }
  function evalTrack(track, t) {
    var i = 0;
    for (var j = 1; j < track.length; j++) {
      if (t >= winStart(track[j])) i = j; else break;
    }
    var cur = track[i].s(t);
    if (i > 0) {
      var e = track[i], b = e.t, pre = e.pre || 0, post = e.post || 0;
      var ow = e.ow || [-pre, post];
      if (t < b + Math.max(post, ow[1])) {
        var p = pre + post > 0 ? ease(seg(t, b - pre, b + post)) : (t >= b ? 1 : 0);
        var po = ease(seg(t, b + ow[0], b + ow[1]));
        var prev = track[i - 1].s(t);
        var out = {};
        for (var k in cur) out[k] = lerp(prev[k], cur[k], k === 'o' ? po : p);
        return out;
      }
    }
    return cur;
  }
  /* Device swaps: the outgoing device is fully gone (0.35 s fade) before the incoming one starts, so two
   * see-through devices are never on screen together. */
  function OUT(t, s) { return { t: t, pre: 0.5, post: 0, ow: [-0.5, -0.17], s: s }; }
  function IN(t, s) { return { t: t, pre: 0.17, post: 0.7, ow: [-0.17, 0.33], s: s }; }

  var PHONE_TRACK, LAPTOP_TRACK, Q_ESC;
  function buildTracks() {
    var P = SC.promise, D = SC.demo, Hm = SC.home, Ck = SC.checkin, Hp = SC.help, Md = SC.mood;
    var Q = SC.queue, F = SC.followthrough, L = SC.loss, Su = SC.summary, C = SC.close;
    var q3 = ss('queue', 2);
    Q_ESC = ss('queue', 1) + 1.38; /* "in time", just before "escalates" */

    var homePhone = bigPhone(PH_CX,
      function (t) { return lerp(199, 700, ease(seg(t, ss('home', 1) - 0.3, ss('home', 1) + 1.1))); },
      function (t) { return 0.015 * ease(seg(t, Hm.start + 0.6, ss('home', 0) + 2.6)); });
    var checkinPhone = bigPhone(PH_CX,
      function (t) {
        var y = lerp(380, 770, ease(seg(t, ss('checkin', 1) - 0.2, ss('checkin', 1) + 1.0)));
        y = lerp(y, 520, ease(seg(t, ss('checkin', 2) - 0.2, ss('checkin', 2) + 1.2)));
        return lerp(y, 320, ease(seg(t, ss('checkin', 3) + 0.4, ss('checkin', 3) + 1.5)));
      },
      function (t) { return 0.012 * ease(seg(t, Ck.start + 0.3, ss('checkin', 0) + 2.4)); });
    var helpPhone = bigPhone(PH_CX, function () { return 560; },
      function (t) { return 0.016 * sine(seg(t, Hp.start + 0.3, Hp.end)); });
    var moodPhone = bigPhone(PH_CX,
      function (t) {
        var y = lerp(756, 500, ease(seg(t, ss('mood', 1) - 0.2, ss('mood', 1) + 1.2)));
        return lerp(y, 354, ease(seg(t, ss('mood', 2) - 0.3, ss('mood', 2) + 0.9)));
      },
      function (t) { return 0.014 * ease(seg(t, Md.start + 0.3, ss('mood', 0) + 2.8)); });
    var queuePhone = bigPhone(1500, function () { return 466; },
      function (t) { return 0.012 * sine(seg(t, q3 - 0.5, Q.end + 0.5)); });
    var lossPhone = bigPhone(PH_CX, function () { return 440; },
      function (t) { return 0.01 * sine(seg(t, L.start + 1.0, L.end)); });
    /* phone and laptop drift together in the demo scene, about one shared point */
    var demoDrift = function (base) {
      return function (t) { return stateOf(base, { fx: 1000, fy: 590, d: 1 + 0.024 * sine(seg(t, D.start - 0.4, D.end + 0.4)) }); };
    };

    PHONE_TRACK = [
      { t: -1e9, s: hidden(PH_PROMISE, 0, 36) },
      { t: P.start + 0.175, pre: 0.425, post: 0.425, s: shown(PH_PROMISE) },
      { t: D.start, pre: 0.45, post: 0.45, s: demoDrift(PH_DEMO) },
      { t: Hm.start, pre: 0.45, post: 0.6, s: homePhone },
      { t: Ck.start, pre: 0.45, post: 0.45, s: checkinPhone },
      { t: Hp.start, pre: 0.45, post: 0.45, s: helpPhone },
      { t: Md.start, pre: 0.45, post: 0.45, s: moodPhone },
      OUT(Q.start, hiddenFrom(moodPhone, 60, 0)),
      /* her phone slides in from the right at full opacity (it only turns visible while off-frame) */
      { t: q3 - 1.2, s: hiddenFrom(queuePhone, 700, 0) },
      { t: q3, pre: 0.55, post: 0.45, ow: [-0.55, -0.45], s: queuePhone },
      { t: F.start, pre: 0.5, post: 0.2, ow: [0.1, 0.2], s: hiddenFrom(queuePhone, 700, 0) },
      { t: F.start + 1.5, s: hiddenFrom(lossPhone, 60, 0) },
      IN(L.start, lossPhone),
      OUT(Su.start, hiddenFrom(lossPhone, 60, 0))
    ];

    var queueLaptop = drifting('laptop', LT_STD,
      function (t) { return between([830, 780], [830, 500], ease(seg(t, Q_ESC - 0.3, Q_ESC + 1.1))); },
      function (t) { return LT_DRIFT * ease(seg(t, Q.start + 0.4, ss('queue', 0) + 3.6)); });
    var queueReceded = function (t) { var s = queueLaptop(t); s.cx -= 40; s.o = 0.35; return s; };
    var followLaptop = drifting('laptop', LT_STD,
      function (t) { return between([700, 460], [560, 560], ease(seg(t, ss('followthrough', 1) - 0.3, ss('followthrough', 1) + 1.2))); },
      function (t) { return LT_DRIFT * ease(seg(t, F.start + 0.4, ss('followthrough', 0) + 3.2)); });
    var summaryLaptop = drifting('laptop', LT_STD,
      function (t) { return between([540, 430], [700, 640], ease(seg(t, ss('summary', 2) - 0.4, ss('summary', 2) + 1.0))); },
      function (t) { return LT_DRIFT * ease(seg(t, Su.start + 0.4, ss('summary', 0) + 3.4)); });

    LAPTOP_TRACK = [
      { t: -1e9, s: hidden(LT_DEMO, 90, 0) },
      { t: D.start + 0.175, pre: 0.425, post: 0.425, s: demoDrift(LT_DEMO) },
      OUT(Hm.start, hidden(LT_DEMO, 110, 0)),
      { t: Hm.start + 1.5, s: hidden(LT_STD, -50, 0) },
      IN(Q.start, queueLaptop),
      { t: q3, pre: 0.55, post: 0.45, s: queueReceded },
      { t: F.start, pre: 0.2, post: 0.4, s: followLaptop },
      OUT(L.start, hiddenFrom(followLaptop, -50, 0)),
      { t: L.start + 1.5, s: hiddenFrom(summaryLaptop, -50, 0) },
      IN(Su.start, summaryLaptop),
      OUT(C.start, hiddenFrom(summaryLaptop, -50, 0))
    ];

    DEV.phone.schedule = [
      ['skel', -1e9],
      ['phone-home', D.start],
      ['phone-checkin-intro', Ck.start],
      ['phone-checkin-question', ss('checkin', 1) - 0.25],
      ['phone-checkin-answer', ss('checkin', 2) - 0.25],
      ['phone-checkin-saved', ss('checkin', 3) + 0.55],
      ['phone-help', Hp.start],
      ['phone-epds', Md.start],
      ['phone-preferences', ss('mood', 1) - 0.25],
      ['phone-epds-notice', ss('mood', 2)],
      ['phone-nobody-reached', q3 - 1.5],
      ['phone-elena-home', F.start + 2.0]
    ];
    DEV.laptop.schedule = [
      ['desk-queues-urgent', -1e9],
      ['desk-queues-unowned', Q_ESC],
      ['desk-referral', F.start],
      ['desk-summaries', L.start + 2.0],
      ['desk-metrics', ss('summary', 2) - 0.1]
    ];
  }

  /* demo: real screens sit blurred and low-contrast in the frames; the phone sharpens as home begins */
  function renderSoften(d, t) {
    var k;
    if (d.kind === 'phone') k = t < SC.demo.start - 0.3 ? 0 : 1 - ease(seg(t, SC.home.start - 0.2, SC.home.start + 0.9));
    else k = t < SC.home.start + 1.0 ? 1 : 0;
    var b = r2(6 * k);
    setc(d.imgs, 'filter', b > 0.01 ? 'blur(' + b + 'px)' : 'none');
    op(d.veil, 0.42 * k);
  }

  /* ------------------------------------------------------------------ shared scene parts */
  var COL = 120;
  var ROWS = [410, 490, 570, 650];
  function title(layer, text) {
    var n = el('h1', 'title', layer);
    n.textContent = text;
    return n;
  }
  /* A title rises in as its scene starts and fades out across the boundary, overlapping the next title a
   * little, so the left column never goes empty. swapAt/nB: an optional second title later in the scene. */
  function renderTitle(n, t, id, slow, nB, swapAt) {
    var s = SC[id];
    var a = fin(t, s.start - 0.12 + (slow ? 0.1 : 0), slow ? 0.8 : 0.55);
    var endOut = 1 - sine(seg(t, s.end - 0.34, s.end + 0.02));
    if (!nB) {
      op(n, a * endOut);
      tf(n, 0, 16 * (1 - a), 1);
      return;
    }
    var outA = 1 - sine(seg(t, swapAt - 0.25, swapAt + 0.15));
    var inB = fin(t, swapAt - 0.05, 0.6);
    op(n, a * outA);
    tf(n, 0, 16 * (1 - a), 1);
    op(nB, inB * endOut);
    tf(nB, 0, 16 * (1 - inB), 1);
  }
  function chip(parent, text, tone, opts) {
    opts = opts || {};
    var n = el('div', 'chip ' + tone + (opts.big ? ' big' : ''), parent);
    if (opts.dot !== false) el('span', 'dot', n);
    var tx = el('span', null, n);
    if (opts.html) tx.innerHTML = opts.html; else tx.textContent = text;
    if (opts.check) {
      n.insertAdjacentHTML('beforeend', '<svg width="26" height="26" viewBox="0 0 22 22" aria-hidden="true"><path d="M4.5 11.5 L9 16 L17.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    }
    n.style.left = '0px';
    n.style.top = '0px';
    op(n, 0);
    return n;
  }
  /* a left-column chip: rises in at a, fades out from b; dim(0..1) lowers it to 55 % */
  function colChip(n, t, a, b, y, dim, x) {
    var i = fin(t, a, 0.55);
    var o = i * fout(t, b, 0.42) * (1 - 0.45 * (dim || 0));
    op(n, o);
    tf(n, (x == null ? COL : x) + 12 * (1 - i), y, 1);
  }
  function figure(parent, svgStr, x, y) {
    var n = box(el('div', 'svgwrap', parent, svgStr), x, y);
    op(n, 0);
    return n;
  }
  function colFigure(n, t, a, b) {
    var i = fin(t, a, 0.8);
    op(n, i * fout(t, b, 0.45));
    setc(n, 'transform', 'translateY(' + r2(14 * (1 - i)) + 'px)');
  }
  /* a straight dotted connector drawn from (x1, y1) toward (x2, y2) with progress p */
  function dots(x1, y1, x2, y2, p, color, gap, size) {
    gap = gap || 11; size = size || 4;
    var minX = Math.min(x1, x2) - 10, minY = Math.min(y1, y2) - 10;
    var w = Math.abs(x2 - x1) + 20, h = Math.abs(y2 - y1) + 20;
    var ex = lerp(x1, x2, p), ey = lerp(y1, y2, p);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(w) + '" height="' + r2(h) + '" viewBox="0 0 ' + r2(w) + ' ' + r2(h) + '" style="position:absolute;left:0;top:0;display:block;overflow:visible;transform:translate(' + r2(minX) + 'px,' + r2(minY) + 'px)">' +
      (p > 0.001 ? '<path d="M' + r2(x1 - minX) + ' ' + r2(y1 - minY) + ' L' + r2(ex - minX) + ' ' + r2(ey - minY) + '" stroke="' + color + '" stroke-width="' + size + '" stroke-linecap="round" stroke-dasharray="0 ' + gap + '" fill="none"/>' : '') +
      '</svg>';
  }
  /* type a line of text in with a soft front edge (about 3.5 characters wide) */
  function typedLine(parent, text, top, size) {
    var n = el('div', 'statement', parent);
    n.style.top = top + 'px';
    n.style.fontSize = size + 'px';
    var spans = [];
    for (var i = 0; i < text.length; i++) {
      var s = el('span', 'ch', n);
      s.textContent = text[i];
      spans.push(s);
    }
    return { n: n, spans: spans };
  }
  function renderTyped(tp, t, a, b) {
    var n = tp.spans.length, soft = 3.5;
    var pos = seg(t, a, b) * (n + soft);
    for (var i = 0; i < n; i++) setc(tp.spans[i], 'opacity', String(r2(clamp01((pos - i) / soft))));
  }
  /* a soft dawn glow ring for small targets (tel links): wide blur, 20 % fill */
  var GLOW_DAWN = { tone: 'dawn', bw: 2, fill: 0.2, edge: 0.85, shadow: '0 0 14px 9px rgba(233,162,75,0.40)' };
  function withSpec(base, extra) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; return o; }
  function padRect(r, p) { return [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p, r[4] + p]; }

  /* ------------------------------------------------------------------ rectangles (app px) */
  var RECT = {
    home: {
      help: [11, 169.7, 368, 58, 15],
      /* "Call 555-010-0100. Hours: Monday to Friday, 8 a.m. to 5 p.m. (placeholder). After hours, call 555-010-0199." */
      hours: [40, 660, 312, 80, 12]
    },
    checkin: {
      skipItem: [11, 727, 185, 58, 15],
      notNow: [11, 783, 185, 58, 15],
      savedHead: [7, 235, 285, 48, 13]
    },
    help: {
      box: [11, 298.6, 368, 623.7, 15],
      /* 911, 988, 988, the hotline: pills inside each tel link's touch box, around the underlined number */
      tel: [[268.4, 376.1, 42.6, 32, 16], [70.5, 557.2, 42.6, 32, 16], [291.6, 605.2, 42.6, 32, 16], [102.9, 706.4, 145.6, 32, 16]]
    },
    mood: {
      buttons: [11, 727, 368, 58, 15], opt2: [28, 495.9, 334, 174, 15], opt1: [28, 348.6, 334, 149.3, 15],
      /* phone-epds-notice.png: the "One answer is always shared" box */
      notice: [15, 269, 360, 170, 14]
    },
    queue: {
      rowA: [238, 702.6, 1184, 261.1, 16],
      rowB: [238, 706.5, 1184, 281, 16],
      banner: [238, 107.1, 1184, 310.5, 16],
      nobody: [11, 382.6, 368, 167.9, 15]
    },
    follow: { card: [238, 349.1, 1184, 577.2, 16], history: [482, 520, 234.8, 259.5, 12], kept: [255, 362.1, 136.3, 37.7, 19] },
    loss: { stopped: [11, 343.7, 272.4, 38.3, 19], touch: [11, 384, 368, 266.9, 21] },
    summary: {
      /* the State cells of both summaries (week12 and week9), each "reviewed" and "AI draft, reviewed" */
      state: [459, 376, 128.1, 127.6, 14],
      /* desk-metrics.png: the value columns of the core measures table (veiled), and the rows
       * "No contact by day 21 (count)", "Unreached items by trigger", "Referral completion" */
      values: [742, 411, 655, 442],
      stalls: [263, 669, 1136, 112, 10]
    }
  };

  /* ------------------------------------------------------------------ scenes */
  var SCENES = [];

  /* 1 open: the nest mark draws in, the wordmark rises, a soft ground line appears */
  SCENES.push({
    id: 'open',
    build: function (L) {
      this.g = full(el('div', 'abs', L));
      this.mark = box(el('div', 'svgwrap', this.g), 960 - 120, 262);
      this.shadow = box(el('div', 'abs', this.g), 960 - 170, 496, 340, 26);
      this.shadow.style.borderRadius = '50%';
      this.shadow.style.background = 'radial-gradient(closest-side, rgba(22,34,31,0.10), rgba(22,34,31,0))';
      this.ground = box(el('div', 'abs', this.g), 960 - 260, 507, 520, 4);
      this.ground.style.borderRadius = '2px';
      this.ground.style.background = 'linear-gradient(90deg, rgba(220,216,206,0) 0%, #D5D0C4 28%, #D5D0C4 72%, rgba(220,216,206,0) 100%)';
      this.ground.style.transformOrigin = '50% 50%';
      this.word = el('div', 'wordmark abs', this.g, 'NestWell');
      this.word.style.width = W + 'px';
      this.word.style.textAlign = 'center';
      this.word.style.top = '566px';
      this.word.style.fontSize = '138px';
    },
    render: function (t) {
      var s = SC.open;
      var k = 1 + 0.028 * sine(seg(t, 0, s.end + 0.4));
      tf(this.g, 960 * (1 - k), 480 * (1 - k), k);
      op(this.g, fout(t, s.end - 0.45, 0.7));
      setHTML(this.mark, A.nestMark({ size: 240, progress: r3(0.1 + 0.9 * seg(t, 0, 2.8)) }));
      op(this.mark, fin(t, 0, 0.4));
      var wa = fin(t, ss('open', 0) - 0.1, 1.0);
      op(this.word, wa);
      tf(this.word, 0, 22 * (1 - wa), 1);
      var ga = fin(t, ss('open', 1) + 0.05, 1.2);
      op(this.ground, ga);
      setc(this.ground, 'transform', 'scaleX(' + r5(0.15 + 0.85 * ga) + ')');
      op(this.shadow, ga);
    }
  });

  /* 2 weeks: mother at home; the twelve-week band draws; later points soften */
  var BAND = { x0: 200, x1: 1720, y: 806, labels: ['birth', 'day 3', 'day 7', 'day 14', 'day 21', 'week 6', 'week 9', 'week 12'] };
  SCENES.push({
    id: 'weeks',
    build: function (L) {
      this.title = title(L, 'The twelve weeks after birth');
      this.art = full(el('div', 'abs', L));
      this.home = box(el('div', 'svgwrap', this.art), 968, 408);
      this.mom = box(el('div', 'svgwrap', this.art), 1236, 312);
      this.band = full(el('div', 'abs', L));
      var y = BAND.y, x0 = BAND.x0, x1 = BAND.x1, n = BAND.labels.length;
      this.xs = BAND.labels.map(function (_, i) { return x0 + i * (x1 - x0) / (n - 1); });
      this.track = box(el('div', 'abs', this.band), x0, y - 3, x1 - x0, 6);
      this.track.style.borderRadius = '3px';
      this.track.style.background = TK.lineSoft;
      this.fillA = box(el('div', 'abs', this.band), x0, y - 3, 0, 6);
      this.fillA.style.borderRadius = '3px';
      this.fillA.style.background = TK.spruce;
      this.fillB = box(el('div', 'abs', this.band), this.xs[4], y - 3, 0, 6);
      this.fillB.style.borderRadius = '3px';
      this.fillB.style.background = TK.spruce;
      var self = this;
      this.ticks = this.xs.map(function (x, i) {
        var g = full(el('div', 'abs', self.band));
        var base = box(el('div', 'abs', g), x - 11, y - 11, 22, 22);
        base.style.borderRadius = '50%';
        base.style.background = TK.surface;
        base.style.boxShadow = 'inset 0 0 0 3px ' + TK.line;
        var dot = box(el('div', 'abs', g), x - 11, y - 11, 22, 22);
        dot.style.borderRadius = '50%';
        dot.style.background = i === 0 ? TK.dawn : TK.spruce;
        dot.style.boxShadow = 'inset 0 0 0 5px ' + (i === 0 ? '#F2C88C' : '#3E7A75');
        var lab = box(el('div', 'label', g), x - 100, y + 30, 200);
        lab.style.textAlign = 'center';
        lab.style.fontSize = '26px';
        lab.style.color = TK.ink;
        lab.textContent = BAND.labels[i];
        return { g: g, base: base, dot: dot, lab: lab };
      });
    },
    render: function (t) {
      var s = SC.weeks;
      renderTitle(this.title, t, 'weeks');
      var out = fout(t, s.end - 0.45, 0.7);
      var ia = fin(t, s.start - 0.25, 0.85) * out;
      op(this.art, ia);
      var k = 1 + 0.025 * sine(seg(t, s.start, s.end + 0.5));
      tf(this.art, 1250 * (1 - k), 690 * (1 - k), k);
      var sway = Math.sin(2 * Math.PI * (t - s.start) / 5.6) * 0.6;
      setHTML(this.mom, A.mother({ size: 330, sway: r2(sway) }));
      var lit = 0.45 + 0.55 * sfin(t, ss('weeks', 1) + 0.6, 1.6);
      setHTML(this.home, A.home({ size: 340, lit: r2(lit) }));

      op(this.band, fin(t, s.start - 0.1, 0.8) * out);
      var bp = ease(seg(t, ss('weeks', 0) + 0.15, se('weeks', 0) - 0.05));
      var slip = sfin(t, ss('weeks', 2) + 0.45, 1.5);
      var total = BAND.x1 - BAND.x0, len = bp * total, splitLen = this.xs[4] - BAND.x0;
      setc(this.fillA, 'width', r2(Math.min(len, splitLen)) + 'px');
      setc(this.fillB, 'width', r2(Math.max(0, len - splitLen)) + 'px');
      op(this.fillB, 1 - 0.72 * slip);
      var n = this.ticks.length;
      for (var i = 0; i < n; i++) {
        var reach = clamp01((bp * (n - 1) - i) / 0.6 + 1);
        var tk = this.ticks[i];
        var late = i >= 5 ? slip : 0;
        op(tk.base, clamp01(reach * 3));
        op(tk.dot, ease(reach) * (1 - 0.8 * late));
        op(tk.lab, ease(reach) * (1 - 0.6 * late));
        tf(tk.lab, 0, 10 * (1 - ease(reach)) + 7 * late, 1);
      }
    }
  });

  /* 3 promise: phone and clinic joined by a dotted line that ends on the clinic's cross badge; the aim
   * types in, one line per sentence; on "happened" the badge glows and a small check settles on it */
  var CLINIC = { x: 1160, y: 582, size: 460 };
  var BADGE = { x: CLINIC.x + 160 * CLINIC.size / 320, y: CLINIC.y + 64 * CLINIC.size / 320, top: CLINIC.y + 46 * CLINIC.size / 320 };
  var LINK = { x1: 662, y1: 578, x2: BADGE.x, y2: BADGE.top - 4 };
  SCENES.push({
    id: 'promise',
    build: function (L) {
      this.eyebrow = el('div', 'label', L);
      this.eyebrow.style.left = '0px';
      this.eyebrow.style.width = W + 'px';
      this.eyebrow.style.textAlign = 'center';
      this.eyebrow.style.top = '118px';
      this.eyebrow.style.color = TK.spruce;
      this.eyebrow.style.letterSpacing = '0.08em';
      this.eyebrow.style.fontSize = '26px';
      this.eyebrow.textContent = 'the aim';
      this.line1 = typedLine(L, 'Help her complete the next step in her care.', 168, 68);
      this.line2 = typedLine(L, 'Let her practice confirm it happened.', 262, 68);
      this.glow = box(el('div', 'abs', L), BADGE.x - 110, BADGE.y - 110, 220, 220);
      this.glow.style.borderRadius = '50%';
      this.glow.style.background = 'radial-gradient(closest-side, rgba(233,162,75,0.40), rgba(233,162,75,0.16) 55%, rgba(233,162,75,0))';
      this.clinic = box(el('div', 'svgwrap', L, A.clinic({ size: CLINIC.size })), CLINIC.x, CLINIC.y);
      this.link = full(el('div', 'svgwrap', L));
      this.labPhone = box(el('div', 'label', L), PH_PROMISE.cx - 150, 902, 300);
      this.labPhone.style.textAlign = 'center';
      this.labPhone.style.fontSize = '26px';
      this.labPhone.textContent = 'her phone';
      this.labClinic = box(el('div', 'label', L), 1390 - 150, 902, 300);
      this.labClinic.style.textAlign = 'center';
      this.labClinic.style.fontSize = '26px';
      this.labClinic.textContent = 'her practice';
      /* the check sits on the top edge of the cross badge, touching the building */
      this.check = box(el('div', 'abs', L), LINK.x2 - 60, LINK.y2 - 60, 120, 120);
      this.check.innerHTML = '<svg width="120" height="120" viewBox="0 0 120 120" style="position:absolute;left:0;top:0"><circle cx="60" cy="60" r="25" fill="' + TK.dawn + '" stroke="#FFFFFF" stroke-width="4"/>' +
        '<path d="M48 61 L56.5 69.5 L73 52" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      /* the "next step" card on the simple phone lives in the phone overlay so it moves with the phone */
      var ph = DEV.phone;
      this.card = box(el('div', 'abs', ph.overlay), 24, 404, 342, 156);
      this.card.innerHTML = '<svg width="342" height="156" viewBox="0 0 342 156" style="display:block;overflow:visible">' +
        '<rect x="2" y="2" width="338" height="152" rx="22" fill="#FFFFFF" stroke="' + TK.spruce + '" stroke-width="4"/>' +
        '<rect x="112" y="46" width="150" height="18" rx="9" fill="' + TK.ink + '" opacity="0.16"/>' +
        '<rect x="112" y="80" width="190" height="13" rx="6.5" fill="' + TK.lineSoft + '"/>' +
        '<rect x="112" y="104" width="140" height="13" rx="6.5" fill="' + TK.lineSoft + '"/>' +
        '<circle cx="62" cy="78" r="28" fill="#FFFFFF" stroke="' + TK.spruceMid + '" stroke-width="4"/>' +
        '<circle class="fillc" cx="62" cy="78" r="30" fill="' + TK.spruce + '" opacity="0"/>' +
        '<path class="tick" d="M48 79 L58 89 L77 68" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>' +
        '</svg>';
      this.cardFill = this.card.querySelector('.fillc');
      this.cardTick = this.card.querySelector('.tick');
      op(this.card, 0);
      var self = this;
      ph.items.push({
        update: function (t) {
          var s = SC.promise;
          var a = fin(t, s.start - 0.25, 0.85) * fout(t, s.end - 0.5, 0.6);
          op(self.card, a);
          var c = fin(t, ss('promise', 1) + 0.7, 0.55);
          if (self.cardFill._op !== r3(c)) { self.cardFill.setAttribute('opacity', r3(c)); self.cardFill._op = r3(c); }
          var dash = r3(1 - ease(seg(t, ss('promise', 1) + 0.95, ss('promise', 1) + 1.5)));
          if (self.cardTick._dash !== dash) { self.cardTick.setAttribute('stroke-dashoffset', dash); self.cardTick._dash = dash; }
        }
      });
    },
    render: function (t) {
      var s = SC.promise;
      var out = fout(t, s.end - 0.5, 0.6);
      op(this.eyebrow, fin(t, s.start + 0.15, 0.6) * out);
      tf(this.eyebrow, 0, 10 * (1 - fin(t, s.start + 0.15, 0.6)), 1);
      op(this.line1.n, out);
      op(this.line2.n, out);
      renderTyped(this.line1, t, ss('promise', 1) - 0.05, se('promise', 1) - 0.2);
      renderTyped(this.line2, t, ss('promise', 2) + 0.22, se('promise', 2) - 0.22);
      var ca = fin(t, s.start - 0.25, 0.85);
      op(this.clinic, ca * out);
      tf(this.clinic, 0, 18 * (1 - ca), 1);
      var lp = ease(seg(t, ss('promise', 0) - 0.15, se('promise', 0) + 0.35));
      setHTML(this.link, A.dottedLink({ x1: LINK.x1, y1: LINK.y1, x2: LINK.x2, y2: LINK.y2 + 18 * (1 - ca), progress: r3(lp), bend: 0.2, canvas: { w: W, h: H }, width: W }));
      op(this.link, out);
      op(this.labPhone, fin(t, ss('promise', 0) - 0.1, 0.6) * out);
      op(this.labClinic, fin(t, se('promise', 0) + 0.1, 0.6) * out);
      var happened = ss('promise', 2) + 1.6;
      var ga = fin(t, happened - 0.1, 0.7) * out;
      op(this.glow, ga * (0.8 + 0.2 * wave(Math.max(0, t - happened), 2.4)));
      var ka = fin(t, happened, 0.55) * out;
      op(this.check, ka);
      setc(this.check, 'transform', 'scale(' + r5(0.82 + 0.18 * fin(t, happened, 0.55)) + ')');
    }
  });

  /* 4 demo: phone and laptop settle with blurred real screens; the demonstration label */
  SCENES.push({
    id: 'demo',
    build: function (L) {
      this.row = full(el('div', 'abs', L));
      this.row.style.height = '70px';
      this.row.style.top = '172px';
      this.row.style.display = 'flex';
      this.row.style.justifyContent = 'center';
      this.pill = chip(this.row, 'working demonstration · made-up patients', 'spruce', { big: true });
      this.pill.style.position = 'relative';
      op(this.pill, 1);
    },
    render: function (t) {
      var s = SC.demo;
      var a = fin(t, s.start + 0.3, 0.75);
      op(this.row, a * fout(t, s.end - 0.45, 0.45));
      tf(this.row, 0, -16 * (1 - a), 1);
    }
  });

  /* 5 home: help one tap away, then her practice contact and hours */
  SCENES.push({
    id: 'home',
    build: function (L) {
      this.title = title(L, 'Her phone');
      this.c1 = chip(L, 'on every screen', 'dawn');
      this.c2 = chip(L, 'a set role, and when to call', 'spruce');
      var s0 = function () { return ss('home', 0); }, s1 = function () { return ss('home', 1); };
      ring('phone', { rect: RECT.home.help, tone: 'dawn', alpha: function (t) { return fin(t, s0() + 1.2, 0.5) * fout(t, s1() - 0.4, 0.55); } });
      ring('phone', { rect: RECT.home.hours, alpha: function (t) { return fin(t, s1() + 0.9, 0.6) * fout(t, SC.home.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var s0 = ss('home', 0), s1 = ss('home', 1), end = SC.home.end;
      renderTitle(this.title, t, 'home');
      colChip(this.c1, t, s0 + 1.35, end - 0.3, ROWS[0], fin(t, s1 - 0.4, 0.5));
      colChip(this.c2, t, s1 + 0.9, end - 0.3, ROWS[1]);
    }
  });

  /* 6 checkin: intro, a question (skip, not now), a calm answer, saved */
  SCENES.push({
    id: 'checkin',
    build: function (L) {
      this.title = title(L, 'Short check-ins');
      this.p1 = chip(L, '', 'spruce', { html: 'day 3 · 7 · 14 · <b class="em">21</b>' });
      this.p2 = chip(L, 'week 6 · 9 · 12', 'spruce');
      this.c3 = chip(L, 'skip a question · not now', 'soft');
      this.c4 = chip(L, 'no streaks, badges, or scores', 'soft');
      var C = RECT.checkin;
      ring('phone', {
        rect: function (t) { return lerpRect(C.skipItem, C.notNow, ease(seg(t, ss('checkin', 1) + 1.15, ss('checkin', 1) + 1.7))); },
        alpha: function (t) { return fin(t, ss('checkin', 1) + 0.35, 0.45) * fout(t, se('checkin', 1) + 0.02, 0.4); }
      });
      ripple('phone', 330, 608.3, ss('checkin', 3) - 0.1);
      ring('phone', { rect: C.savedHead, alpha: function (t) { return fin(t, ss('checkin', 3) + 0.95, 0.5) * fout(t, SC.checkin.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var end = SC.checkin.end;
      renderTitle(this.title, t, 'checkin');
      colChip(this.p1, t, ss('checkin', 0) + 0.3, end - 0.3, ROWS[0]);
      colChip(this.p2, t, ss('checkin', 0) + 0.55, end - 0.3, ROWS[1]);
      colChip(this.c3, t, ss('checkin', 1) + 0.4, end - 0.3, ROWS[2]);
      colChip(this.c4, t, ss('checkin', 2) + 0.35, end - 0.3, ROWS[3]);
    }
  });

  /* 7 help: calm emergency steps; each call link glows in turn */
  SCENES.push({
    id: 'help',
    build: function (L) {
      this.title = title(L, 'When something is urgent');
      this.tap = chip(L, 'tap a number to call', 'dawn');
      var base = function () { return ss('help', 0) + 3.0; };
      RECT.help.tel.forEach(function (rect, i) {
        ring('phone', withSpec(GLOW_DAWN, {
          rect: padRect(rect, 5),
          alpha: function (t) { var t0 = base() + i * 0.6; return fin(t, t0, 0.35) * (1 - 0.6 * ease(seg(t, t0 + 0.9, t0 + 1.5))) * fout(t, SC.help.end - 0.45, 0.45); },
          scale: function (t) { var t0 = base() + i * 0.6; return 1 + 0.08 * Math.sin(Math.PI * seg(t, t0, t0 + 1.2)); }
        }));
      });
      ring('phone', {
        rect: RECT.help.box, glow: 0.5, edge: 0.45, fill: 0,
        alpha: function (t) { return 0.8 * fin(t, ss('help', 1) + 0.35, 0.9) * fout(t, SC.help.end - 0.45, 0.45); },
        scale: function () { return 1; }
      });
    },
    render: function (t) {
      renderTitle(this.title, t, 'help');
      colChip(this.tap, t, ss('help', 0) + 2.8, SC.help.end - 0.3, ROWS[0]);
    }
  });

  /* 8 mood: optional and not a diagnosis; she decides who sees the answers; one answer is always shared */
  SCENES.push({
    id: 'mood',
    build: function (L) {
      this.title = title(L, 'Mood questions, her choice');
      this.c1 = chip(L, 'optional · not a diagnosis', 'spruce');
      this.c2 = chip(L, 'she chooses who sees this', 'spruce');
      this.c3 = chip(L, 'one answer is always shared', 'dawn');
      var M = RECT.mood;
      ring('phone', { rect: M.buttons, alpha: function (t) { return fin(t, ss('mood', 0) + 0.95, 0.5) * fout(t, se('mood', 0) - 0.15, 0.45); } });
      ring('phone', {
        rect: function (t) { return lerpRect(M.opt2, M.opt1, ease(seg(t, ss('mood', 1) + 2.2, ss('mood', 1) + 3.0))); },
        alpha: function (t) { return fin(t, ss('mood', 1) + 0.3, 0.5) * fout(t, ss('mood', 2) - 0.5, 0.4); }
      });
      ring('phone', { rect: M.notice, tone: 'dawn', alpha: function (t) { return fin(t, ss('mood', 2) + 0.3, 0.5) * fout(t, SC.mood.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var end = SC.mood.end;
      renderTitle(this.title, t, 'mood');
      colChip(this.c1, t, ss('mood', 0) + 0.6, end - 0.3, ROWS[0], fin(t, ss('mood', 1), 0.5));
      colChip(this.c2, t, ss('mood', 1) + 0.4, end - 0.3, ROWS[1], fin(t, ss('mood', 2), 0.5));
      colChip(this.c3, t, ss('mood', 2) + 0.45, end - 0.3, ROWS[2]);
    }
  });

  /* 9 queue: a role and a clock; escalation to UNOWNED; her phone says call, do not wait */
  SCENES.push({
    id: 'queue',
    build: function (L) {
      this.title = title(L, 'The practice side');
      this.title2 = title(L, 'Her phone');
      this.owner = chip(L, 'owner · coordinator', 'spruce');
      this.clockA = box(el('div', 'svgwrap', L), 0, 0);
      this.clockB = box(el('div', 'svgwrap', L), 0, 0);
      this.ack = chip(L, 'acknowledge by 7:30 pm', 'soft', { dot: false });
      this.unowned = chip(L, 'unowned since 8:00 pm', 'dawn', { dot: false });
      this.coord = figure(L, A.coordinator({ size: 256 }), 104, 560);
      this.phoneChip = chip(L, 'her phone · 8:10 pm', 'spruce');
      this.mom = figure(L, A.mother({ size: 256 }), 104, 560);
      var Q = RECT.queue;
      var q = function (i) { return ss('queue', i); };
      ring('laptop', {
        rect: function (t) { return lerpRect(Q.rowA, Q.rowB, ease(seg(t, Q_ESC - 0.3, Q_ESC + 0.3))); },
        alpha: function (t) { return fin(t, q(0) + 1.9, 0.6) * fout(t, q(2) - 0.55, 0.45); }
      });
      ring('laptop', { rect: Q.banner, alpha: function (t) { return fin(t, Q_ESC + 0.2, 0.55) * fout(t, q(2) - 0.55, 0.45); } });
      ring('phone', { rect: Q.nobody, tone: 'dawn', alpha: function (t) { return fin(t, q(2) + 0.5, 0.55) * fout(t, SC.queue.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var q0 = ss('queue', 0), q2 = ss('queue', 2), end = SC.queue.end;
      renderTitle(this.title, t, 'queue', false, this.title2, q2 - 0.3);
      var leave = q2 - 0.6;
      colChip(this.owner, t, q0 + 1.9, leave, ROWS[0]);
      colFigure(this.coord, t, q0 + 1.7, leave);

      var ka = fin(t, q0 + 3.5, 0.55);
      var esc = fin(t, Q_ESC, 0.5);
      var cp = 0.02 + 0.12 * Math.max(0, t - (q0 + 3.5)) * ease(seg(t, q0 + 3.5, q0 + 4.5));
      setHTML(this.clockA, A.clock({ size: 64, progress: r3(Math.min(0.62, cp)) }));
      setHTML(this.clockB, A.clock({ size: 64, progress: r3(Math.min(0.62, cp)), tone: 'dawn' }));
      var lv = fout(t, leave, 0.42);
      op(this.clockA, ka * (1 - esc) * lv);
      op(this.clockB, ka * esc * lv);
      tf(this.clockA, COL, ROWS[1] - 2 + 10 * (1 - ka), 1);
      tf(this.clockB, COL, ROWS[1] - 2 + 10 * (1 - ka), 1);
      op(this.ack, ka * (1 - esc) * lv);
      tf(this.ack, COL + 78 + 12 * (1 - ka), ROWS[1], 1);
      op(this.unowned, esc * lv);
      tf(this.unowned, COL + 78 + 12 * (1 - esc), ROWS[1], 1);

      colChip(this.phoneChip, t, q2 + 0.3, end - 0.3, ROWS[0]);
      colFigure(this.mom, t, q2 + 0.4, end - 0.3);
    }
  });

  /* 10 followthrough: sent, then scheduled, then kept */
  SCENES.push({
    id: 'followthrough',
    build: function (L) {
      this.title = title(L, 'Follow-through');
      this.steps = [['sent', false], ['scheduled', false], ['kept', true]].map(function (d, i) {
        return { y: ROWS[0] + i * 90, off: chip(L, d[0], 'soft'), on: chip(L, d[0], d[1] ? 'solid' : 'spruce', { check: d[1] }) };
      });
      this.glow = box(el('div', 'abs', L), 0, 0, 180, 84);
      this.glow.style.borderRadius = '42px';
      this.glow.style.boxShadow = '0 0 0 6px rgba(31,95,91,0.14), 0 0 30px 8px rgba(31,95,91,0.30)';
      this.conn = el('div', 'svgwrap', L);
      var f = function (i) { return ss('followthrough', i); };
      this.litAt = function () { return [f(1) - 0.05, f(1) + 0.66, f(1) + 1.45]; };
      ring('laptop', { rect: RECT.follow.card, alpha: function (t) { return fin(t, f(0) + 1.1, 0.6) * fout(t, f(1) - 0.2, 0.5); } });
      ring('laptop', { rect: RECT.follow.history, alpha: function (t) { return fin(t, f(1) - 0.05, 0.5) * fout(t, f(1) + 1.25, 0.4); } });
      ring('laptop', { rect: RECT.follow.kept, alpha: function (t) { return fin(t, f(1) + 1.45, 0.45) * fout(t, SC.followthrough.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var s = SC.followthrough, end = s.end;
      renderTitle(this.title, t, 'followthrough');
      var leave = fout(t, end - 0.3, 0.42);
      var appear = fin(t, ss('followthrough', 0) + 0.25, 0.6);
      var lit = this.litAt();
      var dim = fin(t, ss('followthrough', 2) + 0.2, 0.9);
      for (var i = 0; i < 3; i++) {
        var st = this.steps[i];
        var on = fin(t, lit[i], 0.3);
        var rise = 10 * (1 - appear);
        op(st.off, appear * (1 - on) * leave);
        tf(st.off, COL, st.y + rise, 1);
        var fade = i === 0 ? 1 - 0.45 * dim : 1;
        op(st.on, on * leave * fade);
        tf(st.on, COL, st.y + rise, 1);
      }
      var kept = this.steps[2];
      var ga = fin(t, lit[2] + 0.15, 0.6) * leave;
      op(this.glow, ga * (0.55 + 0.45 * wave(Math.max(0, t - lit[2]), 2.4)));
      tf(this.glow, COL - 12, kept.y - 12, 1);
      var w = kept.on.offsetWidth || 150;
      setc(this.glow, 'width', (w + 24) + 'px');
      var c1 = ease(seg(t, lit[0] + 0.1, lit[1] + 0.1)), c2 = ease(seg(t, lit[1] + 0.1, lit[2] + 0.1));
      var x = COL + 30;
      setHTML(this.conn, dots(x, this.steps[0].y + 66, x, this.steps[0].y + 66 + 20 * c1, 1, TK.spruceMid, 8, 3.5) +
        dots(x, this.steps[1].y + 66, x, this.steps[1].y + 66 + 20 * c2, 1, TK.spruceMid, 8, 3.5));
      op(this.conn, appear * leave);
    }
  });

  /* 11 loss: baby content stops (the card shows it stopping, then goes); her contact choices; nothing
   * restarts on its own. Quieter, slower. */
  SCENES.push({
    id: 'loss',
    build: function (L) {
      this.title = title(L, 'After a loss');
      this.card = box(el('div', 'card', L), 0, 0, 440, 220);
      var lab = box(el('div', 'label', this.card), 32, 36);
      lab.style.fontSize = '30px';
      lab.textContent = 'baby content';
      this.tag = box(el('div', 'tag', this.card), 290, 28);
      this.tag.textContent = 'stopped';
      op(this.tag, 0);
      this.bars = [[100, 330], [136, 290], [172, 220]].map(function (b) { return box(el('div', 'bar', this.card), 32, b[0], b[1]); }, this);
      this.bars.forEach(function (b, i) { b._w = [330, 290, 220][i]; });
      this.cA = chip(L, 'her choice · how we stay in touch', 'spruce');
      this.cB = chip(L, 'stays off until she chooses', 'spruce');
      var l = function (i) { return ss('loss', i); };
      ring('phone', { rect: RECT.loss.stopped, glow: 0.8, alpha: function (t) { return fin(t, l(0) + 2.5, 0.5) * fout(t, se('loss', 0) + 0.2, 0.6); } });
      ring('phone', { rect: RECT.loss.touch, alpha: function (t) { return fin(t, l(1) + 0.3, 0.8) * fout(t, se('loss', 1) + 0.1, 0.6); } });
      ring('phone', { rect: RECT.loss.stopped, glow: 0.8, alpha: function (t) { return fin(t, l(2) + 0.1, 0.6) * fout(t, SC.loss.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var s = SC.loss, l0 = ss('loss', 0), l1 = ss('loss', 1), l2 = ss('loss', 2);
      renderTitle(this.title, t, 'loss', true);
      var tg = fin(t, l0 + 2.0, 0.4);
      op(this.tag, tg);
      var col = ease(seg(t, l0 + 2.2, l0 + 2.9));
      for (var i = 0; i < this.bars.length; i++) {
        setc(this.bars[i], 'width', r2(this.bars[i]._w * (1 - 0.85 * col)) + 'px');
        op(this.bars[i], 1 - 0.5 * col);
      }
      var gone = sine(seg(t, l0 + 2.9, l0 + 3.9));
      var a = fin(t, s.start + 0.5, 1.1) * (1 - gone);
      op(this.card, a);
      tf(this.card, COL, ROWS[0] + 12 * gone, 1);
      colChip(this.cA, t, l1 + 0.3, l2 - 0.4, ROWS[0]);
      colChip(this.cB, t, l2 + 0.2, s.end - 0.3, ROWS[0]);
    }
  });

  /* 12 summary: an AI draft a clinician reviews; then the practice view of where follow-up stalls */
  SCENES.push({
    id: 'summary',
    build: function (L) {
      this.title = title(L, 'A summary for her clinician');
      this.title2 = title(L, 'Where follow‑up stalls');
      this.c1 = chip(L, 'AI draft', 'spruce');
      this.c2 = chip(L, 'example text in this demo', 'soft');
      this.c3 = chip(L, 'a clinician reviews', 'spruce');
      this.doc = figure(L, A.clinician({ size: 184 }), 112, 650);
      this.made = chip(L, 'made-up patients', 'soft');
      var u = function (i) { return ss('summary', i); };
      ring('laptop', { rect: RECT.summary.state, alpha: function (t) { return fin(t, u(0) + 3.0, 0.6) * fout(t, u(2) - 0.55, 0.45); } });
      /* numbers in the metrics table are made up; a soft veil keeps them from reading as outcome claims */
      var d = DEV.laptop, V = RECT.summary.values;
      var veil = box(el('div', 'abs', d.overlay), V[0], V[1], V[2], V[3]);
      veil.style.background = TK.ground;
      veil.style.borderRadius = '6px';
      op(veil, 0);
      d.items.push({ update: function (t) { op(veil, 0.86 * fin(t, u(2) - 0.4, 0.6)); } });
      ring('laptop', { rect: RECT.summary.stalls, alpha: function (t) { return fin(t, u(2) + 1.0, 0.6) * fout(t, SC.summary.end - 0.45, 0.45); } });
    },
    render: function (t) {
      var u0 = ss('summary', 0), u2 = ss('summary', 2), end = SC.summary.end;
      renderTitle(this.title, t, 'summary', false, this.title2, u2 - 0.1);
      var leave = u2 - 0.55;
      colChip(this.c1, t, u0 + 2.9, leave, ROWS[0]);
      colChip(this.c2, t, u0 + 3.2, leave, ROWS[1]);
      colChip(this.c3, t, u0 + 3.5, leave, ROWS[2]);
      colFigure(this.doc, t, u0 + 3.4, leave);
      colChip(this.made, t, u2 + 0.5, end - 0.3, ROWS[0]);
    }
  });

  /* 13 close: the mark and the wordmark return; in development; the address */
  SCENES.push({
    id: 'close',
    build: function (L) {
      this.g = full(el('div', 'abs', L));
      this.mark = box(el('div', 'svgwrap', this.g), 960 - 100, 140);
      this.word = el('div', 'wordmark abs', this.g, 'NestWell');
      this.word.style.width = W + 'px';
      this.word.style.textAlign = 'center';
      this.word.style.top = '366px';
      this.word.style.fontSize = '112px';
      this.line1 = el('div', 'statement tagline', this.g, 'In development · looking for pilot practices in Ohio');
      this.line1.style.top = '524px';
      this.line2 = el('div', 'statement', this.g, 'hellonestwell.com');
      this.line2.style.top = '612px';
      this.line2.style.fontSize = '64px';
      this.line2.style.fontWeight = '700';
      this.line2.style.color = TK.spruce;
      this.line2.style.letterSpacing = '-0.02em';
    },
    render: function (t) {
      var s = SC.close;
      var k = 1 + 0.02 * sine(seg(t, s.start, s.end));
      tf(this.g, 960 * (1 - k), 480 * (1 - k), k);
      op(this.g, fin(t, s.start - 0.25, 0.85));
      setHTML(this.mark, A.nestMark({ size: 200, progress: r3(0.1 + 0.9 * seg(t, s.start - 0.25, s.start + 1.9)) }));
      var wa = fin(t, s.start + 0.5, 0.9);
      op(this.word, wa);
      tf(this.word, 0, 18 * (1 - wa), 1);
      var a1 = fin(t, ss('close', 0) + 0.2, 0.9);
      op(this.line1, a1);
      tf(this.line1, 0, 14 * (1 - a1), 1);
      var a2 = fin(t, ss('close', 1) + 0.95, 0.9);
      op(this.line2, a2);
      tf(this.line2, 0, 14 * (1 - a2), 1);
    }
  });

  /* ------------------------------------------------------------------ render */
  var STATE = { phone: null, laptop: null };
  var READY = false;

  function renderDevice(kind, t) {
    var d = DEV[kind], st = STATE[kind];
    op(d.root, st.o);
    if (st.o <= 0.002) return;
    var m = devXform(kind, st);
    tf(d.root, m.x, m.y, m.s);
    renderScreens(d, t);
    renderSoften(d, t);
    for (var i = 0; i < d.items.length; i++) d.items[i].update(t);
  }

  function renderAt(t) {
    if (!READY) return;
    t = Math.max(0, Math.min(TIM.total, Number(t) || 0));
    STATE.phone = evalTrack(PHONE_TRACK, t);
    STATE.laptop = evalTrack(LAPTOP_TRACK, t);
    renderDevice('laptop', t);
    renderDevice('phone', t);
    for (var i = 0; i < SCENES.length; i++) {
      var s = SCENES[i], sc = SC[s.id];
      var on = t >= sc.start - 1.0 && t <= sc.end + 1.0;
      setc(s.layer, 'display', on ? 'block' : 'none');
      if (on) s.render(t);
    }
  }

  /* ------------------------------------------------------------------ loading */
  function stylesheetLoaded(link) {
    return new Promise(function (resolve) {
      if (!link) return resolve();
      if (link.sheet) return resolve();
      link.addEventListener('load', function () { resolve(); });
      link.addEventListener('error', function () { resolve(); });
      setTimeout(resolve, 20000);
    });
  }

  async function loadFonts() {
    await stylesheetLoaded(document.getElementById('gfonts'));
    var faces = [
      '500 60px "Bricolage Grotesque"', '600 60px "Bricolage Grotesque"', '700 60px "Bricolage Grotesque"',
      '400 20px "JetBrains Mono"', '500 20px "JetBrains Mono"',
      '400 20px "Source Sans 3"', '600 20px "Source Sans 3"'
    ];
    await Promise.all(faces.map(function (f) { return document.fonts.load(f, 'NestWell hellonestwell.com 0123 ·').catch(function () { return []; }); }));
    await document.fonts.ready;
    var loaded = {};
    document.fonts.forEach(function (f) { if (f.status === 'loaded') loaded[f.family.replace(/["']/g, '')] = true; });
    var missing = ['Bricolage Grotesque', 'JetBrains Mono', 'Source Sans 3'].filter(function (f) { return !loaded[f]; });
    window.videoFontsMissing = missing;
    if (missing.length) console.warn('NestWell video: fonts not loaded:', missing.join(', '));
  }

  async function init() {
    var res = await fetch('../build/timings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('timings.json: HTTP ' + res.status);
    TIM = await res.json();
    TIM.scenes.forEach(function (s) { SC[s.id] = s; });
    SCENES.forEach(function (s) { if (!SC[s.id]) throw new Error('timings.json has no scene "' + s.id + '"'); });
    window.videoDuration = TIM.total;

    await loadFonts();

    var bg = el('div', null, stage);
    bg.id = 'bg';
    var devLayer = full(el('div', 'layer', stage));
    devLayer.id = 'devices';
    buildDevice(DEV.laptop, devLayer, ['skel', 'desk-queues-urgent', 'desk-queues-unowned', 'desk-referral', 'desk-summaries', 'desk-metrics']);
    buildDevice(DEV.phone, devLayer, ['skel', 'phone-home', 'phone-checkin-intro', 'phone-checkin-question', 'phone-checkin-answer',
      'phone-checkin-saved', 'phone-help', 'phone-epds', 'phone-preferences', 'phone-epds-notice', 'phone-nobody-reached', 'phone-elena-home']);
    buildTracks();
    SCENES.forEach(function (s) {
      s.layer = full(el('div', 'layer scene-' + s.id, stage));
      s.build(s.layer);
      setc(s.layer, 'display', 'none');
    });

    var imgs = DEV.phone.images.concat(DEV.laptop.images);
    await Promise.all(imgs.map(function (img) {
      return img.decode().catch(function () { throw new Error('image failed to load: ' + img.src); });
    }));
    READY = true;
    renderAt(0);
  }

  window.renderAt = renderAt;
  window.videoReady = init();
  window.videoReady.catch(function (e) { console.error('NestWell video init failed:', e); window.videoError = String(e && e.message || e); });

  /* people-only viewing helpers: ?t=12.5 shows one moment, ?play plays from ?t (or 0) in real time */
  window.videoReady.then(function () {
    var q = new URLSearchParams(location.search);
    var t0 = parseFloat(q.get('t') || '0') || 0;
    if (q.has('play')) {
      var startWall = null;
      var tick = function (now) {
        if (startWall == null) startWall = now;
        var tt = t0 + (now - startWall) / 1000;
        renderAt(tt % TIM.total);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else if (q.has('t')) {
      renderAt(t0);
    }
  });
})();
