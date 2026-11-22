// Profile colours (profiles.js): someone picks a page colour (and a second one for a gradient); this keeps the page
// readable whatever they pick and whatever theme the viewer uses. The text stays the theme's own (light text on dark
// themes, dark text on light ones); each picked colour keeps its hue and saturation and only its lightness moves until
// the theme's text reads on it (body text at 7:1, secondary text at 4.5:1). The accent (the @username, the face ring)
// gets the same treatment against the page at 3:1. No DOM here, so tests can run it.

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

// What a profile page is painted with: { page, page2, accent, dark } or null when the look doesn't use colours.
// theme: the viewer's theme colours { text, text2, bg } as CSS strings; accent: the profile's accent as hex.
export function profilePaint(look, theme, accent) {
  if (!look || look.background !== 'color' || !parseColor(look.pageColor)) return null;
  const text = parseColor(theme.text) || [239, 232, 225];
  const text2 = parseColor(theme.text2) || text;
  const darkTheme = luminance(text) > 0.5;
  const needs = [[text, 7], [text2, 4.5]];
  const page = readable(look.pageColor, needs, { darken: darkTheme });
  const page2 = look.pageGradient !== false && parseColor(look.pageColor2) ? readable(look.pageColor2, needs, { darken: darkTheme }) : null;
  // the accent reads on both ends of the page (it's the @username and the face ring)
  const ends = [parseColor(page), parseColor(page2 || page)];
  const acc = parseColor(accent);
  const fixedAccent = acc ? readable(accent, ends.map((c) => [c, 3]), { darken: !darkTheme }) : null;
  return { page, page2, accent: fixedAccent, dark: darkTheme };
}

// A second colour that goes with the first, for when someone switches the gradient on before picking one: the same
// colour turned 40° round the wheel.
export function partnerOf(color) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [h, s, l] = toHsl(rgb);
  return toHex(fromHsl([(h + 40 / 360) % 1, s, l]));
}
