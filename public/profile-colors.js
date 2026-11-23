// Profile colours (profiles.js): someone picks a page colour (and a second one for a gradient) and the page is that
// colour, whatever theme the viewer uses: the page's text turns light or dark to read on it (profilePaint). The accent
// (the @username, the face ring) keeps its hue and only its lightness moves until it reads on the page at 3:1.
// No DOM here, so tests can run it.

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;

// "#abc", "#aabbcc", "rgb(1 2 3)" or "rgb(1, 2, 3)" → [r, g, b] (0-255), else null.
export function parseColor(s) {
  const t = String(s || '').trim();
  let m = HEX6.exec(t);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = HEX3.exec(t);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(t);
  if (m) return [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))));
  return null;
}
export const toHex = ([r, g, b]) => `#${[r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`;

// WCAG relative luminance and contrast ratio.
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
export function fromHsl([h, s, l]) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// The colour with its lightness moved (darker when the text is light, lighter when it's dark) just far enough that
// every [textColour, ratio] in `needs` is met. Already fine = unchanged.
export function readable(color, needs, { darken } = {}) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  // judged on the colour as it will be written (rounded to #rrggbb), so rounding can't tip it under
  const ok = (c) => { const r = parseColor(toHex(c)); return needs.every(([text, ratio]) => contrast(r, text) >= ratio); };
  if (ok(rgb)) return toHex(rgb);
  const [h, s, l] = toHsl(rgb);
  const down = darken ?? (luminance(needs[0][0]) > 0.5);
  // binary search on lightness between the picked one and black (or white)
  let lo = 0, hi = 1; // fraction of the way from l to the end
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const c = fromHsl([h, s, down ? l * (1 - mid) : l + (1 - l) * mid]);
    if (ok(c)) hi = mid; else lo = mid;
  }
  return toHex(fromHsl([h, s, down ? l * (1 - hi) : l + (1 - l) * hi]));
}

// The two text colours a painted page can have: light on dark colours, dark on light ones.
export const LIGHT_TEXT = '#f7f3ef';
export const DARK_TEXT = '#17131c';
const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

// What a profile page is painted with: { page, page2, text, text2, accent, onAccent, light } or null when the look
// doesn't use colours. The picked colours stay exactly as picked; the text follows them instead (light or dark,
// whichever reads better on both ends). Only a gradient whose two ends are too far apart for one text colour gets its
// weaker end moved, just far enough for body text (4.5:1). accent: the profile's accent as hex; it's moved to read on
// the page at 3:1, and onAccent is the text that goes on it.
export function profilePaint(look, accent) {
  if (!look || look.background !== 'color' || !parseColor(look.pageColor)) return null;
  const c1 = parseColor(toHex(parseColor(look.pageColor)));
  const c2 = look.pageGradient !== false && parseColor(look.pageColor2) ? parseColor(toHex(parseColor(look.pageColor2))) : null;
  const ends = c2 ? [c1, c2] : [c1];
  const worst = (t) => Math.min(...ends.map((e) => contrast(e, t)));
  const L = parseColor(LIGHT_TEXT), D = parseColor(DARK_TEXT);
  const light = worst(L) >= worst(D);
  const text = light ? L : D;
  const page = readable(toHex(c1), [[text, 4.5]], { darken: light });
  const page2 = c2 ? readable(toHex(c2), [[text, 4.5]], { darken: light }) : null;
  const pe = [parseColor(page), parseColor(page2 || page)];
  // secondary text: the main text blended toward the page as far as it can go and still read at 4.5:1 on both ends
  let text2 = text;
  for (let f = 0.42; f > 0; f -= 0.03) {
    const t2 = parseColor(toHex(mix(text, pe[0], f)));
    if (pe.every((e) => contrast(e, t2) >= 4.5)) { text2 = t2; break; }
  }
  const acc = parseColor(accent);
  const fixed = acc ? readable(accent, pe.map((c) => [c, 3]), { darken: !light }) : null;
  const fa = parseColor(fixed);
  const onAccent = fa ? (contrast(fa, L) >= contrast(fa, D) ? LIGHT_TEXT : DARK_TEXT) : null;
  return { page, page2, text: toHex(text), text2: toHex(text2), accent: fixed, onAccent, light };
}

// A second colour that goes with the first, for when someone switches the gradient on before picking one: the same
// colour turned 40° round the wheel.
export function partnerOf(color) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [h, s, l] = toHsl(rgb);
  return toHex(fromHsl([(h + 40 / 360) % 1, s, l]));
}
