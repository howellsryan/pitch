/**
 * Club accent theming.
 *
 * One token — `--color-club` — carries club identity across the whole app
 * (docs/plan/02-design-system.md). Ground, type and spacing never move; only
 * the accent does.
 *
 * The problem this module exists to solve: a club's real primary_color is
 * chosen for a shirt, not for a dark UI. Newcastle's #241F20 on a #0A0E14
 * ground is invisible, and white text on Norwich's #FFF200 is unreadable.
 * So the raw colour is treated as an intent, not as a final value: we walk it
 * in oklch until text on it clears WCAG AA, while clamping chroma and hue so
 * it stays recognisably the club's colour.
 */

/* ── sRGB ⇄ oklch ─────────────────────────────────────────────────────────
   Standard Björn Ottosson conversions. Kept inline rather than pulled from a
   colour library: this runs once per save load and the dependency isn't worth
   it. */

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function rgbToHex({ r, g, b }) {
  const c = (n) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma  = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToRgb({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), bb = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * bb;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: clamp01(toGamma(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)),
  };
}

/* ── contrast ─────────────────────────────────────────────────────────── */

export function relativeLuminance({ r, g, b }) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2.1 contrast ratio between two sRGB colours. */
export function contrastRatio(c1, c2) {
  const a = relativeLuminance(c1), b = relativeLuminance(c2);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── the theming rules ────────────────────────────────────────────────── */

export const GROUND = '#0A0E14';   // --color-ground
export const ON_LIGHT = '#0A0E14';  // text used on a light accent
export const ON_DARK  = '#FFFFFF';  // text used on a dark accent
const AA = 4.5;
const MIN_SURFACE_CONTRAST = 3;     // accent must be visible against the ground

/**
 * Pick the text colour that sits on an accent.
 *
 * Forcing white would drag every bright kit dark to earn contrast — Norwich's
 * yellow lands on olive. Choosing per club keeps the accent the club's actual
 * colour and moves the text instead.
 */
export function textOn(rgb) {
  const light = contrastRatio(rgb, hexToRgb(ON_LIGHT));
  const dark = contrastRatio(rgb, hexToRgb(ON_DARK));
  return light >= dark ? ON_LIGHT : ON_DARK;
}

/**
 * Adjust a club's raw colour into a usable accent.
 *
 * Two independent constraints, both resolved by moving lightness only:
 *   1. white text on the accent clears 4.5:1  (caps how light it can go)
 *   2. the accent clears 3:1 against the ground (sets how light it must be)
 *
 * Where the two conflict — a mid-tone that can't satisfy both — legibility of
 * text wins and we take the best available separation from the ground, since
 * unreadable button labels are the worse failure.
 *
 * Chroma is nudged down only as far as needed to keep the colour in gamut
 * after a lightness change; hue is never touched, so the result still reads
 * as the club's colour.
 */
export function resolveAccent(rawHex, { ground = GROUND } = {}) {
  const rgb = hexToRgb(rawHex);
  if (!rgb) return { hex: '#EF0107', on: ON_DARK, adjusted: true, reason: 'invalid' };

  const groundRgb = hexToRgb(ground);
  const base = rgbToOklch(rgb);

  // Evaluate the colour that will actually ship: rgbToHex quantises to 8-bit,
  // and a candidate that clears the floor as floats can fall under it once
  // rounded. Snap first, then test.
  const snap = (c) => hexToRgb(rgbToHex(c));

  const at = (L) => {
    // Re-clamp chroma at the new lightness so we stay in sRGB gamut.
    let C = base.C;
    let out = oklchToRgb({ L, C, H: base.H });
    let guard = 0;
    while (C > 0.001 && guard++ < 24) {
      const back = rgbToOklch(out);
      if (Math.abs(back.L - L) < 0.02 && Math.abs(back.H - base.H) < 2) break;
      C *= 0.9;
      out = oklchToRgb({ L, C, H: base.H });
    }
    return snap(out);
  };

  const ok = (c) =>
    contrastRatio(c, hexToRgb(textOn(c))) >= AA &&
    contrastRatio(c, groundRgb) >= MIN_SURFACE_CONTRAST;

  const snapped = snap(rgb);
  if (ok(snapped)) return { hex: rgbToHex(snapped), on: textOn(snapped), adjusted: false, reason: 'unchanged' };

  // Search lightness for the candidate that satisfies both constraints and
  // sits closest to the club's own lightness.
  let best = null;
  for (let i = 0; i <= 200; i++) {
    const L = i / 200;
    const cand = at(L);
    if (!ok(cand)) continue;
    const dist = Math.abs(L - base.L);
    if (!best || dist < best.dist) best = { dist, rgb: cand, L };
  }
  if (best) {
    return { hex: rgbToHex(best.rgb), on: textOn(best.rgb), adjusted: true, reason: 'lightness' };
  }

  // No lightness satisfies both. Keep white text readable, maximise separation
  // from the ground within that.
  let fallback = null;
  for (let i = 0; i <= 200; i++) {
    const L = i / 200;
    const cand = at(L);
    if (contrastRatio(cand, hexToRgb(textOn(cand))) < AA) continue;
    const sep = contrastRatio(cand, groundRgb);
    if (!fallback || sep > fallback.sep) fallback = { sep, rgb: cand };
  }
  return fallback
    ? { hex: rgbToHex(fallback.rgb), on: textOn(fallback.rgb), adjusted: true, reason: 'text-priority' }
    : { hex: '#EF0107', on: ON_DARK, adjusted: true, reason: 'unresolvable' };
}

/**
 * Paint the club accent onto the document.
 *
 * Sets both the target token (`--color-club`) and the legacy `--acc` family
 * that src/shell.html still styles against, so the accent follows the club
 * on today's screens as well as the Phase 3 ones.
 */
export function applyClubTheme(team, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !team) return null;
  const raw = team.primaryColor || team.primary_color;
  if (!raw) return null;

  const { hex, on } = resolveAccent(raw);
  const root = doc.documentElement;
  root.style.setProperty('--color-club', hex);
  root.style.setProperty('--color-on-club', on);
  root.style.setProperty('--acc', hex);

  // The legacy shell derives two translucent washes from the accent.
  const { r, g, b } = hexToRgb(hex);
  const rgb255 = [r, g, b].map((c) => Math.round(c * 255)).join(',');
  root.style.setProperty('--glow', `rgba(${rgb255},0.14)`);
  root.style.setProperty('--bdr-a', `rgba(${rgb255},0.45)`);

  return hex;
}
