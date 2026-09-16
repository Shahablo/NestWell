/* NestWell walkthrough - ART library.
 * Plain browser script, no modules, no dependencies. Defines window.ART.
 * Every function returns a complete <svg> string with a viewBox, width and height
 * attributes, so it can be dropped into the DOM and resized with CSS width.
 * Pure: output depends only on the arguments (unique ids come from a counter, so
 * call order matters only for id names, never for appearance).
 */
(function () {
  'use strict';

  var T = {
    ground: '#FBF9F4',
    surface: '#FFFFFF',
    ink: '#16221F',
    muted: '#5A6763',
    line: '#DCD8CE',
    spruce: '#1F5F5B',
    spruceDeep: '#0F2E2C',
    spruceSoft: '#E1EEEB',
    dawn: '#E9A24B',
    night: '#0E1B1A',
    // Derived tints used by the figures and buildings (mixes of the tokens above).
    dawnSoft: '#F6E3C8',
    dawnDeep: '#9A6420',
    spruceMid: '#6F9A95',
    spruceArm: '#1A5350',
    skin: '#D9B08C',
    skinShade: '#C69B77',
    bezel: '#16221F',
    lineSoft: '#ECE8DF'
  };

  var FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
  var FONT_DISPLAY = "'Bricolage Grotesque', 'Source Sans 3', sans-serif";

  var uid = 0;
  function id(prefix) { uid += 1; return 'nw-' + prefix + '-' + uid; }

  function clamp01(v) { v = Number(v); if (!isFinite(v)) return 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function easeInOutCubic(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInOutSine(t) { t = clamp01(t); return -(Math.cos(Math.PI * t) - 1) / 2; }
  /* local progress of p inside [a, b] */
  function seg(p, a, b) { return clamp01((p - a) / (b - a)); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function svg(vbW, vbH, width, inner, extra) {
    var w = r2(width);
    var h = r2(width * vbH / vbW);
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'viewBox="0 0 ' + r2(vbW) + ' ' + r2(vbH) + '" width="' + w + '" height="' + h + '" ' +
      'style="display:block;overflow:visible" aria-hidden="true" focusable="false"' + (extra || '') + '>' +
      inner + '</svg>';
  }

  /* ------------------------------------------------------------------ nest mark */
  /* Geometry matches the website header mark (viewBox 32), scaled x4 into 128. */
  function nestMark(o) {
    o = o || {};
    var size = num(o.size, 160);
    var p = o.progress == null ? 1 : clamp01(o.progress);
    var onDark = o.tone === 'light';
    var arcColor = onDark ? '#EAF1EF' : T.spruce;
    var arcs = [
      'M12 60 A52 52 0 0 0 116 60',
      'M28 60 A36 36 0 0 0 100 60',
      'M44 60 A20 20 0 0 0 84 60'
    ];
    var inner = '<g fill="none" stroke="' + arcColor + '" stroke-width="8.8" stroke-linecap="round">';
    for (var i = 0; i < 3; i++) {
      var a = 0.04 + i * 0.16;
      var lp = easeInOutCubic(seg(p, a, a + 0.42));
      if (lp <= 0) continue;
      inner += '<path d="' + arcs[i] + '" pathLength="1" stroke-dasharray="1 1.001" stroke-dashoffset="' + r2(1 - lp) + '"/>';
    }
    inner += '</g>';
    var ep = easeInOutSine(seg(p, 0.66, 1));
    if (ep > 0) {
      var s = 0.72 + 0.28 * ep;
      inner += '<g transform="translate(64 66) scale(' + r2(s) + ')" opacity="' + r2(ep) + '">' +
        '<ellipse cx="0" cy="-4.4" rx="12.4" ry="16.4" fill="' + T.dawn + '"/>' +
        '<ellipse cx="-4" cy="-11" rx="3.2" ry="4.6" fill="#FFFFFF" opacity="0.28"/>' +
        '</g>';
    }
    return svg(128, 128, size, inner);
  }

  /* ------------------------------------------------------------------ figures */
  /* All figures share one 240 x 300 viewBox, feet/base at y = 286. */
  var FIG_W = 240, FIG_H = 300;

  function groundShadow() {
    return '<ellipse cx="120" cy="288" rx="84" ry="9" fill="' + T.ink + '" opacity="0.07"/>';
  }
  function closedEyes(cx, cy, gap, w, color, sw) {
    var d = '';
    [-1, 1].forEach(function (sgn) {
      var x = cx + sgn * gap;
      d += 'M' + r2(x - w) + ' ' + cy + ' Q' + r2(x) + ' ' + r2(cy + w * 0.8) + ' ' + r2(x + w) + ' ' + cy + ' ';
    });
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + (sw || 2.4) + '" stroke-linecap="round" opacity="0.7"/>';
  }

  function mother(o) {
    o = o || {};
    var size = num(o.size, 240);
    var sway = Math.max(-1, Math.min(1, num(o.sway, 0)));
    var eyes = o.eyes !== false;
    var deg = r2(sway * 3.5);
    var g = '';
    g += groundShadow();
    g += '<g transform="rotate(' + deg + ' 120 286)">';
    // hair, back layer: shoulder-length, with a small low bun
    g += '<circle cx="150" cy="62" r="14" fill="' + T.spruceDeep + '"/>';
    g += '<path d="M84 90 C80 58 98 44 120 44 C144 44 162 58 158 90 C157 104 160 116 156 124 C148 128 92 128 86 124 C80 116 85 104 84 90 Z" fill="' + T.spruceDeep + '"/>';
    // body: soft dress, a rounded bell
    g += '<path d="M120 126 C84 126 64 152 60 198 C56 240 56 266 62 280 C64 285 68 286 74 286 L166 286 C172 286 176 285 178 280 C184 266 184 240 180 198 C176 152 156 126 120 126 Z" fill="' + T.spruce + '"/>';
    // neck
    g += '<path d="M111 108 L129 108 L131 130 C126 134 114 134 109 130 Z" fill="' + T.skinShade + '"/>';
    // head
    g += '<circle cx="120" cy="84" r="30" fill="' + T.skin + '"/>';
    // hair front: soft side part
    g += '<path d="M90 86 C86 62 102 50 122 50 C142 50 156 64 151 88 C146 74 134 64 116 64 C104 66 94 74 90 86 Z" fill="' + T.spruceDeep + '"/>';
    if (eyes) g += closedEyes(120, 92, 11, 5, T.spruceDeep, 2.4);
    // back arm (behind the bundle) supporting the baby's head end
    g += '<path d="M76 168 C68 188 70 204 84 210" fill="none" stroke="' + T.spruceArm + '" stroke-width="18" stroke-linecap="round"/>';
    // bundle (baby) held across the chest, head end raised on her left (viewer's left)
    g += '<g transform="translate(118 196) rotate(-14)">';
    g +=   '<rect x="-60" y="-27" width="120" height="54" rx="27" fill="' + T.surface + '"/>';
    // blanket fold across the lower body of the bundle
    g +=   '<path d="M-14 -27 L33 -27 C48 -27 60 -15 60 0 C60 15 48 27 33 27 L-30 27 C-8 14 -2 -10 -14 -27 Z" fill="' + T.dawnSoft + '"/>';
    // hood + baby head
    g +=   '<circle cx="-34" cy="0" r="22" fill="' + T.dawnSoft + '"/>';
    g +=   '<circle cx="-31" cy="1" r="15" fill="' + T.skin + '"/>';
    if (eyes) g += closedEyes(-31, 3, 5.5, 2.6, T.spruceDeep, 1.8);
    g += '</g>';
    // front arm cradling under the bundle, hand resting on the blanket
    g += '<path d="M164 176 C172 200 166 222 146 230 C130 236 116 234 106 230" fill="none" stroke="' + T.spruceArm + '" stroke-width="18" stroke-linecap="round"/>';
    g += '<path d="M160 146 C170 160 166 178 150 188" fill="none" stroke="' + T.spruceArm + '" stroke-width="16" stroke-linecap="round"/>';
    g += '<ellipse cx="144" cy="188" rx="10" ry="8" fill="' + T.skin + '" transform="rotate(-20 144 188)"/>';
    g += '</g>';
    return svg(FIG_W, FIG_H, size, g);
  }

  function coordinator(o) {
    o = o || {};
    var size = num(o.size, 240);
    var eyes = o.eyes !== false;
    var g = '';
    g += groundShadow();
    // body
    g += '<path d="M120 128 C88 128 70 150 66 190 L62 250 L178 250 L174 190 C170 150 152 128 120 128 Z" fill="' + T.muted + '"/>';
    // collar
    g += '<path d="M104 130 L120 150 L136 130 C130 127 110 127 104 130 Z" fill="' + T.spruceSoft + '"/>';
    g += '<path d="M110 112 L130 112 L132 132 C126 136 114 136 108 132 Z" fill="' + T.skinShade + '"/>';
    // head + short hair
    g += '<circle cx="120" cy="88" r="30" fill="' + T.skin + '"/>';
    g += '<path d="M90 86 C88 60 104 50 122 50 C142 50 154 62 151 86 C146 74 134 66 118 67 C104 68 94 76 90 86 Z" fill="' + T.ink + '"/>';
    if (eyes) g += closedEyes(120, 94, 11, 5, T.ink, 2.4);
    // headset: band over the head, ear pad, mic boom
    g += '<path d="M86 90 C84 52 156 52 154 90" fill="none" stroke="' + T.spruceDeep + '" stroke-width="6" stroke-linecap="round"/>';
    g += '<rect x="78" y="80" width="15" height="24" rx="7.5" fill="' + T.spruceDeep + '"/>';
    g += '<rect x="147" y="80" width="15" height="24" rx="7.5" fill="' + T.spruceDeep + '"/>';
    g += '<path d="M84 102 C86 116 96 122 108 122" fill="none" stroke="' + T.spruceDeep + '" stroke-width="4" stroke-linecap="round"/>';
    g += '<circle cx="110" cy="122" r="5" fill="' + T.dawn + '"/>';
    // desk
    g += '<rect x="26" y="246" width="188" height="12" rx="6" fill="' + T.line + '"/>';
    g += '<rect x="50" y="258" width="10" height="28" rx="4" fill="' + T.line + '"/>';
    g += '<rect x="180" y="258" width="10" height="28" rx="4" fill="' + T.line + '"/>';
    // laptop in front of the person (back of lid facing viewer, turned slightly)
    g += '<path d="M126 176 L200 170 C204 170 206 172 206 176 L208 236 C208 240 206 242 202 242 L132 244 C128 244 126 242 126 238 Z" fill="' + T.spruceDeep + '"/>';
    g += '<circle cx="167" cy="206" r="7" fill="' + T.spruceMid + '" opacity="0.7"/>';
    g += '<path d="M112 244 L214 240 C218 240 218 246 214 246 L110 250 C106 250 106 244 112 244 Z" fill="' + T.ink + '"/>';
    // hands on the desk
    g += '<path d="M76 196 C70 222 78 240 100 242" fill="none" stroke="' + T.muted + '" stroke-width="16" stroke-linecap="round"/>';
    g += '<circle cx="104" cy="241" r="9" fill="' + T.skin + '"/>';
    return svg(FIG_W, FIG_H, size, g);
  }

  function clinician(o) {
    o = o || {};
    var size = num(o.size, 240);
    var eyes = o.eyes !== false;
    var g = '';
    g += groundShadow();
    // coat body (white coat) with spruce shirt showing in a V
    g += '<path d="M120 124 C84 124 66 150 62 196 C58 240 58 266 62 280 C64 285 68 286 74 286 L166 286 C172 286 176 285 178 280 C182 266 182 240 178 196 C174 150 156 124 120 124 Z" fill="' + T.surface + '"/>';
    g += '<path d="M120 124 C84 124 66 150 62 196 C58 240 58 266 62 280 C64 285 68 286 74 286 L166 286 C172 286 176 285 178 280 C182 266 182 240 178 196 C174 150 156 124 120 124 Z" fill="none" stroke="' + T.line + '" stroke-width="3"/>';
    g += '<path d="M102 128 L120 176 L138 128 C132 125 108 125 102 128 Z" fill="' + T.spruce + '"/>';
    // lapels
    g += '<path d="M100 128 L120 176 L108 184 L92 140 Z" fill="' + T.lineSoft + '"/>';
    g += '<path d="M140 128 L120 176 L132 184 L148 140 Z" fill="' + T.lineSoft + '"/>';
    g += '<path d="M120 176 L120 284" stroke="' + T.line + '" stroke-width="2.5"/>';
    // pocket with pen
    g += '<rect x="136" y="198" width="26" height="6" rx="3" fill="' + T.line + '"/>';
    g += '<rect x="146" y="186" width="5" height="16" rx="2.5" fill="' + T.spruce + '"/>';
    // neck + head + hair (pulled back)
    g += '<path d="M110 110 L130 110 L132 130 C126 134 114 134 108 130 Z" fill="' + T.skinShade + '"/>';
    g += '<circle cx="120" cy="84" r="30" fill="' + T.skin + '"/>';
    g += '<circle cx="120" cy="50" r="13" fill="' + T.muted + '"/>';
    g += '<path d="M90 82 C88 58 104 48 122 48 C140 48 154 58 151 82 C144 70 132 64 118 64 C104 65 94 72 90 82 Z" fill="' + T.muted + '"/>';
    if (eyes) g += closedEyes(120, 90, 11, 5, T.ink, 2.4);
    // stethoscope, a soft loop around the neck
    g += '<path d="M104 130 C98 160 108 176 120 178 C132 176 142 160 136 130" fill="none" stroke="' + T.spruceDeep + '" stroke-width="3" stroke-linecap="round" opacity="0.85"/>';
    g += '<circle cx="120" cy="182" r="5" fill="' + T.spruceDeep + '"/>';
    // clipboard held on the left side, arm around it
    g += '<g transform="translate(74 214) rotate(-8)">';
    g +=   '<rect x="-30" y="-40" width="60" height="80" rx="8" fill="' + T.dawnSoft + '"/>';
    g +=   '<rect x="-23" y="-30" width="46" height="62" rx="4" fill="' + T.surface + '"/>';
    g +=   '<rect x="-12" y="-46" width="24" height="12" rx="5" fill="' + T.spruce + '"/>';
    g +=   '<rect x="-15" y="-16" width="30" height="4" rx="2" fill="' + T.line + '"/>';
    g +=   '<rect x="-15" y="-6" width="24" height="4" rx="2" fill="' + T.line + '"/>';
    g +=   '<rect x="-15" y="4" width="28" height="4" rx="2" fill="' + T.line + '"/>';
    g +=   '<circle cx="-12" cy="18" r="3" fill="' + T.spruce + '"/>';
    g +=   '<rect x="-5" y="16" width="18" height="4" rx="2" fill="' + T.line + '"/>';
    g += '</g>';
    g += '<path d="M150 158 C140 196 116 224 96 232" fill="none" stroke="' + T.lineSoft + '" stroke-width="17" stroke-linecap="round"/>';
    g += '<circle cx="94" cy="232" r="9" fill="' + T.skin + '"/>';
    return svg(FIG_W, FIG_H, size, g);
  }

  /* ------------------------------------------------------------------ places */
  function home(o) {
    o = o || {};
    var size = num(o.size, 240);
    var lit = o.lit == null ? 1 : clamp01(o.lit);
    var gid = id('win');
    var g = '<defs><radialGradient id="' + gid + '" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="' + T.dawn + '" stop-opacity="0.45"/>' +
      '<stop offset="1" stop-color="' + T.dawn + '" stop-opacity="0"/></radialGradient></defs>';
    g += '<ellipse cx="120" cy="208" rx="100" ry="8" fill="' + T.ink + '" opacity="0.07"/>';
    // chimney
    g += '<rect x="152" y="46" width="20" height="44" rx="4" fill="' + T.spruceDeep + '"/>';
    // walls
    g += '<rect x="48" y="96" width="144" height="110" rx="10" fill="' + T.surface + '"/>';
    g += '<rect x="48" y="96" width="144" height="110" rx="10" fill="none" stroke="' + T.line + '" stroke-width="2.5"/>';
    // roof
    g += '<path d="M120 34 C124 34 127 36 130 38 L208 96 C214 101 211 110 203 110 L37 110 C29 110 26 101 32 96 L110 38 C113 36 116 34 120 34 Z" fill="' + T.spruce + '"/>';
    // window glow + window
    if (lit > 0) g += '<circle cx="90" cy="150" r="46" fill="url(#' + gid + ')" opacity="' + r2(lit) + '"/>';
    g += '<rect x="70" y="130" width="40" height="40" rx="7" fill="' + T.spruceSoft + '"/>';
    if (lit > 0) g += '<rect x="70" y="130" width="40" height="40" rx="7" fill="' + T.dawn + '" opacity="' + r2(0.9 * lit) + '"/>';
    g += '<path d="M90 132 L90 168 M72 150 L108 150" stroke="' + T.surface + '" stroke-width="3" stroke-linecap="round"/>';
    // door
    g += '<path d="M136 206 L136 150 C136 140 144 134 152 134 C160 134 168 140 168 150 L168 206 Z" fill="' + T.spruceSoft + '"/>';
    g += '<circle cx="160" cy="174" r="3" fill="' + T.spruce + '"/>';
    return svg(240, 220, size, g);
  }

  function clinic(o) {
    o = o || {};
    var size = num(o.size, 300);
    var g = '';
    g += '<ellipse cx="160" cy="208" rx="146" ry="8" fill="' + T.ink + '" opacity="0.07"/>';
    // main low building
    g += '<rect x="24" y="94" width="272" height="112" rx="12" fill="' + T.surface + '"/>';
    g += '<rect x="24" y="94" width="272" height="112" rx="12" fill="none" stroke="' + T.line + '" stroke-width="2.5"/>';
    // roof band
    g += '<rect x="16" y="80" width="288" height="22" rx="11" fill="' + T.spruce + '"/>';
    // raised centre with plus sign
    g += '<rect x="112" y="40" width="96" height="48" rx="12" fill="' + T.spruceSoft + '"/>';
    g += '<rect x="140" y="46" width="40" height="36" rx="9" fill="' + T.surface + '"/>';
    g += '<rect x="155" y="52" width="10" height="24" rx="4" fill="' + T.spruce + '"/>';
    g += '<rect x="148" y="59" width="24" height="10" rx="4" fill="' + T.spruce + '"/>';
    // windows
    [44, 84, 216, 256].forEach(function (x) {
      g += '<rect x="' + x + '" y="124" width="24" height="30" rx="5" fill="' + T.spruceSoft + '"/>';
    });
    // doors (glass double door)
    g += '<rect x="132" y="130" width="56" height="76" rx="6" fill="' + T.spruceSoft + '"/>';
    g += '<path d="M160 134 L160 204" stroke="' + T.surface + '" stroke-width="3"/>';
    g += '<rect x="126" y="118" width="68" height="8" rx="4" fill="' + T.spruceDeep + '" opacity="0.85"/>';
    // path to the door
    g += '<path d="M140 206 L180 206 L190 214 L130 214 Z" fill="' + T.line + '" opacity="0.7"/>';
    return svg(320, 220, size, g);
  }

  /* ------------------------------------------------------------------ devices */
  /* Reference width 420. Side bezel 12, top/bottom bezel 30, outer radius 44. */
  function phoneFrame(o) {
    o = o || {};
    var width = num(o.width, 420);
    var ratio = num(o.imageHeightRatio, 844 / 390);
    var W = 420, side = 12, top = 30, bottom = 30;
    var sw = W - side * 2;
    var sh = sw * ratio;
    var H = top + sh + bottom;
    var R = 44, sr = 34;
    var cid = id('phone-screen');
    var fid = id('phone-shadow');
    var pad = 40; // room for the soft shadow inside the viewBox
    var g = '<defs>' +
      '<clipPath id="' + cid + '"><rect x="' + side + '" y="' + top + '" width="' + r2(sw) + '" height="' + r2(sh) + '" rx="' + sr + '"/></clipPath>' +
      '<filter id="' + fid + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>' +
      '</defs>';
    g += '<g transform="translate(' + pad + ' ' + pad + ')">';
    g += '<rect x="6" y="22" width="' + W + '" height="' + r2(H) + '" rx="' + R + '" fill="' + T.spruceDeep + '" opacity="0.16" filter="url(#' + fid + ')"/>';
    g += '<rect x="0" y="0" width="' + W + '" height="' + r2(H) + '" rx="' + R + '" fill="' + T.bezel + '"/>';
    g += '<rect x="1.5" y="1.5" width="' + (W - 3) + '" height="' + r2(H - 3) + '" rx="' + (R - 1.5) + '" fill="none" stroke="#3A4A46" stroke-width="1.5" opacity="0.8"/>';
    g += '<rect x="' + side + '" y="' + top + '" width="' + r2(sw) + '" height="' + r2(sh) + '" rx="' + sr + '" fill="' + T.ground + '"/>';
    if (o.imageHref) {
      g += '<image href="' + esc(o.imageHref) + '" xlink:href="' + esc(o.imageHref) + '" x="' + side + '" y="' + top + '" width="' + r2(sw) + '" height="' + r2(sh) + '" preserveAspectRatio="xMidYMin slice" clip-path="url(#' + cid + ')"/>';
    }
    // speaker slot in the top bezel
    g += '<rect x="' + (W / 2 - 34) + '" y="12" width="68" height="7" rx="3.5" fill="#34423F"/>';
    g += '<circle cx="' + (W / 2 + 50) + '" cy="15.5" r="3.5" fill="#34423F"/>';
    // side buttons
    g += '<rect x="-3" y="130" width="3" height="46" rx="1.5" fill="' + T.bezel + '"/>';
    g += '<rect x="' + W + '" y="160" width="3" height="70" rx="1.5" fill="' + T.bezel + '"/>';
    g += '</g>';
    var vbW = W + pad * 2, vbH = H + pad * 2;
    return svg(vbW, vbH, width * vbW / W, g,
      ' data-screen-x="' + (pad + side) + '" data-screen-y="' + (pad + top) + '" data-screen-w="' + r2(sw) + '" data-screen-h="' + r2(sh) + '" data-pad="' + pad + '"');
  }

  /* Reference width 1000 (the lid). Screen aspect defaults to 1440:900. */
  function laptopFrame(o) {
    o = o || {};
    var width = num(o.width, 1000);
    var ratio = num(o.imageHeightRatio, 900 / 1440);
    var W = 1000, bz = 16, topBz = 22;
    var sw = W - bz * 2, sh = sw * ratio;
    var lidH = topBz + sh + bz;
    var baseW = 1120, baseH = 22;
    var pad = 60;
    var cid = id('laptop-screen');
    var fid = id('laptop-shadow');
    var ox = (baseW - W) / 2; // lid x offset inside the base width
    var g = '<defs>' +
      '<clipPath id="' + cid + '"><rect x="' + (ox + bz) + '" y="' + topBz + '" width="' + r2(sw) + '" height="' + r2(sh) + '" rx="6"/></clipPath>' +
      '<filter id="' + fid + '" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="20"/></filter>' +
      '</defs>';
    g += '<g transform="translate(' + pad + ' ' + pad + ')">';
    g += '<rect x="' + (ox + 10) + '" y="30" width="' + W + '" height="' + r2(lidH) + '" rx="26" fill="' + T.spruceDeep + '" opacity="0.14" filter="url(#' + fid + ')"/>';
    g += '<rect x="' + ox + '" y="0" width="' + W + '" height="' + r2(lidH + 10) + '" rx="26" fill="' + T.bezel + '"/>';
    g += '<rect x="' + (ox + bz) + '" y="' + topBz + '" width="' + r2(sw) + '" height="' + r2(sh) + '" rx="6" fill="' + T.ground + '"/>';
    if (o.imageHref) {
      g += '<image href="' + esc(o.imageHref) + '" xlink:href="' + esc(o.imageHref) + '" x="' + (ox + bz) + '" y="' + topBz + '" width="' + r2(sw) + '" height="' + r2(sh) + '" preserveAspectRatio="xMidYMin slice" clip-path="url(#' + cid + ')"/>';
    }
    g += '<circle cx="' + (baseW / 2) + '" cy="11" r="3.5" fill="#34423F"/>';
    // base
    var by = lidH + 6;
    g += '<path d="M0 ' + r2(by) + ' L' + baseW + ' ' + r2(by) + ' L' + baseW + ' ' + r2(by + 8) + ' C' + baseW + ' ' + r2(by + baseH) + ' ' + (baseW - 20) + ' ' + r2(by + baseH) + ' ' + (baseW - 40) + ' ' + r2(by + baseH) +
      ' L40 ' + r2(by + baseH) + ' C20 ' + r2(by + baseH) + ' 0 ' + r2(by + baseH) + ' 0 ' + r2(by + 8) + ' Z" fill="#C9C4B8"/>';
    g += '<rect x="0" y="' + r2(by) + '" width="' + baseW + '" height="6" rx="3" fill="#DCD8CE"/>';
    g += '<rect x="' + (baseW / 2 - 70) + '" y="' + r2(by) + '" width="140" height="8" rx="4" fill="#B3AEA2"/>';
    g += '</g>';
    var vbW = baseW + pad * 2, vbH = by + baseH + pad * 2;
    return svg(vbW, vbH, width * vbW / W, g,
      ' data-screen-x="' + (pad + ox + bz) + '" data-screen-y="' + (pad + topBz) + '" data-screen-w="' + r2(sw) + '" data-screen-h="' + r2(sh) + '" data-pad="' + pad + '"');
  }

  /* ------------------------------------------------------------------ labels */
  var CHIP_TONES = {
    spruce: { bg: T.spruceSoft, fg: T.spruce, dot: T.spruce, border: null },
    dawn: { bg: T.dawnSoft, fg: T.dawnDeep, dot: T.dawn, border: null },
    soft: { bg: T.surface, fg: T.muted, dot: T.line, border: T.line },
    night: { bg: T.night, fg: '#EAF1EF', dot: T.dawn, border: null }
  };
  function chip(o) {
    o = o || {};
    var text = String(o.text == null ? '' : o.text);
    var tone = CHIP_TONES[o.tone] || CHIP_TONES.spruce;
    var fs = num(o.fontSize, 22);
    var dot = o.dot !== false;
    var h = Math.round(fs * 2.1);
    var padX = Math.round(fs * 0.9);
    var dotR = fs * 0.24;
    var dotSpace = dot ? dotR * 2 + fs * 0.55 : 0;
    var textW = text.length * fs * 0.6; // JetBrains Mono advance is 0.6 em
    var W = Math.ceil(padX * 2 + dotSpace + textW);
    var width = o.width == null ? W : num(o.width, W);
    var g = '<rect x="1.5" y="1.5" width="' + (W - 3) + '" height="' + (h - 3) + '" rx="' + r2((h - 3) / 2) + '" fill="' + tone.bg + '"' +
      (tone.border ? ' stroke="' + tone.border + '" stroke-width="2"' : '') + '/>';
    var x = padX;
    if (dot) { g += '<circle cx="' + r2(x + dotR) + '" cy="' + r2(h / 2) + '" r="' + r2(dotR) + '" fill="' + tone.dot + '"/>'; x += dotSpace; }
    g += '<text x="' + r2(x) + '" y="' + r2(h / 2) + '" dominant-baseline="central" font-family="' + FONT_MONO.replace(/"/g, '&quot;') + '" font-size="' + fs + '" font-weight="500" fill="' + tone.fg + '">' + esc(text) + '</text>';
    return svg(W, h, width, g);
  }

  /* ------------------------------------------------------------------ connector */
  /* Coordinates are in the caller's space. The returned svg's viewBox is the padded
   * bounding box of the curve, and data-x / data-y give its top-left corner, so place it
   * with position:absolute; left:data-x; top:data-y; width:data-w (in the same units).
   * Pass canvas:{w,h} to get a full-canvas svg (viewBox 0 0 w h) instead. */
  function dottedLink(o) {
    o = o || {};
    var x1 = num(o.x1, 0), y1 = num(o.y1, 0), x2 = num(o.x2, 400), y2 = num(o.y2, 0);
    var p = o.progress == null ? 1 : clamp01(o.progress);
    var color = o.color || T.spruce;
    var bend = num(o.bend, 0.22);
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    // control point lifted "upward" (to the left of the direction of travel)
    var cx = (x1 + x2) / 2 + (dy / len) * len * bend;
    var cy = (y1 + y2) / 2 - (dx / len) * len * bend;
    if (dx < 0) { cx = (x1 + x2) / 2 - (dy / len) * len * bend; cy = (y1 + y2) / 2 + (dx / len) * len * bend; }
    function pt(t) {
      var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      return [a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2];
    }
    // arc-length sampling so the travelling head matches the mask
    var N = 64, lens = [0], prev = pt(0), total = 0;
    for (var i = 1; i <= N; i++) { var q = pt(i / N); total += Math.hypot(q[0] - prev[0], q[1] - prev[1]); lens.push(total); prev = q; }
    function atLen(L) {
      for (var k = 1; k <= N; k++) {
        if (lens[k] >= L) { var f = (L - lens[k - 1]) / ((lens[k] - lens[k - 1]) || 1); return pt((k - 1 + f) / N); }
      }
      return pt(1);
    }
    var pad = 24;
    var minX = Math.min(x1, x2, cx) - pad, minY = Math.min(y1, y2, cy) - pad;
    var maxX = Math.max(x1, x2, cx) + pad, maxY = Math.max(y1, y2, cy) + pad;
    var ox = -minX, oy = -minY, vbW = maxX - minX, vbH = maxY - minY;
    if (o.canvas) { ox = 0; oy = 0; vbW = num(o.canvas.w, 1920); vbH = num(o.canvas.h, 1080); }
    var d = 'M' + r2(x1 + ox) + ' ' + r2(y1 + oy) + ' Q' + r2(cx + ox) + ' ' + r2(cy + oy) + ' ' + r2(x2 + ox) + ' ' + r2(y2 + oy);
    var mid = id('link-mask');
    var dotGap = num(o.gap, 16);
    var sw = num(o.dotSize, 6);
    var g = '<defs><mask id="' + mid + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + r2(vbW) + '" height="' + r2(vbH) + '">' +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + (sw * 3) + '" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1.001" stroke-dashoffset="' + r2(1 - p) + '"/>' +
      '</mask></defs>';
    g += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="0 ' + dotGap + '" opacity="0.55" mask="url(#' + mid + ')"/>';
    if (p > 0) {
      g += '<circle cx="' + r2(x1 + ox) + '" cy="' + r2(y1 + oy) + '" r="' + r2(sw * 1.3) + '" fill="' + color + '" opacity="' + r2(0.85 * seg(p, 0, 0.1)) + '"/>';
      var head = atLen(total * p);
      if (p < 1) g += '<circle cx="' + r2(head[0] + ox) + '" cy="' + r2(head[1] + oy) + '" r="' + r2(sw * 1.1) + '" fill="' + T.dawn + '" opacity="0.9"/>';
      else g += '<circle cx="' + r2(x2 + ox) + '" cy="' + r2(y2 + oy) + '" r="' + r2(sw * 1.3) + '" fill="' + T.dawn + '"/>';
    }
    var width = o.canvas ? num(o.width, vbW) : num(o.width, vbW);
    return svg(vbW, vbH, width, g,
      ' data-x="' + r2(-ox) + '" data-y="' + r2(-oy) + '" data-w="' + r2(vbW) + '" data-h="' + r2(vbH) + '"');
  }

  /* ------------------------------------------------------------------ clock + ring */
  function clock(o) {
    o = o || {};
    var size = num(o.size, 96);
    var p = o.progress == null ? 0 : clamp01(o.progress);
    var accent = o.tone === 'dawn' ? T.dawn : T.spruce;
    var c = 50, r = 42;
    var g = '<circle cx="50" cy="50" r="46" fill="' + T.surface + '"/>';
    g += '<circle cx="50" cy="50" r="46" fill="none" stroke="' + T.line + '" stroke-width="3"/>';
    if (p > 0) {
      if (p >= 0.999) {
        g += '<circle cx="50" cy="50" r="' + r + '" fill="' + (o.tone === 'dawn' ? T.dawnSoft : T.spruceSoft) + '"/>';
      } else {
        var ang = p * Math.PI * 2 - Math.PI / 2;
        var ex = c + r * Math.cos(ang), ey = c + r * Math.sin(ang);
        g += '<path d="M50 50 L50 ' + (50 - r) + ' A' + r + ' ' + r + ' 0 ' + (p > 0.5 ? 1 : 0) + ' 1 ' + r2(ex) + ' ' + r2(ey) + ' Z" fill="' + (o.tone === 'dawn' ? T.dawnSoft : T.spruceSoft) + '"/>';
      }
    }
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2;
      var big = i % 3 === 0;
      var r1 = big ? 33 : 36, rr = 40;
      g += '<line x1="' + r2(50 + r1 * Math.sin(a)) + '" y1="' + r2(50 - r1 * Math.cos(a)) + '" x2="' + r2(50 + rr * Math.sin(a)) + '" y2="' + r2(50 - rr * Math.cos(a)) + '" stroke="' + (big ? T.muted : T.line) + '" stroke-width="' + (big ? 3 : 2) + '" stroke-linecap="round"/>';
    }
    // short fixed hand + sweeping long hand
    g += '<line x1="50" y1="50" x2="50" y2="30" stroke="' + T.ink + '" stroke-width="3" stroke-linecap="round" opacity="0.55"/>';
    g += '<g transform="rotate(' + r2(p * 360) + ' 50 50)"><line x1="50" y1="54" x2="50" y2="16" stroke="' + accent + '" stroke-width="3" stroke-linecap="round"/></g>';
    g += '<circle cx="50" cy="50" r="4.5" fill="' + accent + '"/>';
    return svg(100, 100, size, g);
  }

  function ring(o) {
    o = o || {};
    var r = num(o.r, 60);
    var op = o.opacity == null ? 1 : clamp01(o.opacity);
    var color = o.tone === 'dawn' ? T.dawn : T.spruce;
    var pad = Math.max(24, r * 0.35);
    var S = (r + pad) * 2, c = S / 2;
    var fid = id('ring-blur');
    var gid = id('ring-fill');
    var g = '<defs>' +
      '<filter id="' + fid + '" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="' + r2(Math.max(4, r * 0.08)) + '"/></filter>' +
      '<radialGradient id="' + gid + '" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0.55" stop-color="' + color + '" stop-opacity="0"/>' +
      '<stop offset="0.9" stop-color="' + color + '" stop-opacity="0.10"/>' +
      '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></radialGradient>' +
      '</defs>';
    g += '<g opacity="' + r2(op) + '">';
    g += '<circle cx="' + r2(c) + '" cy="' + r2(c) + '" r="' + r2(r + pad * 0.6) + '" fill="url(#' + gid + ')"/>';
    g += '<circle cx="' + r2(c) + '" cy="' + r2(c) + '" r="' + r2(r) + '" fill="none" stroke="' + color + '" stroke-width="' + r2(Math.max(8, r * 0.12)) + '" opacity="0.35" filter="url(#' + fid + ')"/>';
    g += '<circle cx="' + r2(c) + '" cy="' + r2(c) + '" r="' + r2(r) + '" fill="none" stroke="' + color + '" stroke-width="3" opacity="0.75"/>';
    g += '</g>';
    return svg(S, S, S, g, ' data-pad="' + r2(pad) + '"');
  }

  window.ART = {
    tokens: T,
    ease: { inOutCubic: easeInOutCubic, inOutSine: easeInOutSine, seg: seg, clamp01: clamp01 },
    nestMark: nestMark,
    mother: mother,
    coordinator: coordinator,
    clinician: clinician,
    home: home,
    clinic: clinic,
    phoneFrame: phoneFrame,
    laptopFrame: laptopFrame,
    chip: chip,
    dottedLink: dottedLink,
    clock: clock,
    ring: ring
  };
})();
