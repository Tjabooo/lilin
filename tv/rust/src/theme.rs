//! Colours: the person's theme from Settings → Appearance (saved on the server, read from /api/status),
//! mapped onto the TV's names. Same presets and custom mixing as the web (public/app.js THEMES) and the
//! JavaScript TV app (public/tv/logic.js themeVars): keep the three tables in step when a preset is added.
//! Over a video a light theme would put dark text on a dark picture, so the player draws with dark panels
//! (the theme's accent stays): App::frame switches to `dark()` for see-through screens.
use crate::gfx::{hex, Rgba};
use crate::host;
use crate::util::s;
use alloc::string::String;
use serde_json::Value;

/// bg, surface, raised, line, text, muted, accent, alert (the web's names).
type Preset = (&'static str, [u32; 8]);
const PRESETS: &[Preset] = &[
    ("lilin", [0x140A14, 0x1D121C, 0x2A1C28, 0x3A2A36, 0xEFE8E1, 0xB8AAB2, 0xFB2C16, 0xFF9B85]),
    ("dusk", [0x17111F, 0x211A2C, 0x2D2440, 0x3C3152, 0xEFE8E1, 0xB3A8C4, 0xA58BC9, 0xFF9B85]),
    ("bone", [0xEFE8E1, 0xF8F4EF, 0xE4DBD2, 0xD3C7BC, 0x140A14, 0x6B5A66, 0xD42A14, 0xB42318]),
    ("midnight", [0x0E1320, 0x161D2E, 0x1F2840, 0x2A3552, 0xE8EEF8, 0x96A3BD, 0x5CC8FF, 0xFF8A8A]),
    ("forest", [0x0F1A14, 0x16241C, 0x1E3127, 0x2A4134, 0xE9F2EA, 0x9DB5A4, 0x9BE07A, 0xFF9B85]),
    ("ember", [0x161312, 0x221D1B, 0x2E2724, 0x3D3430, 0xF5EDE8, 0xB3A49C, 0xFF7A3D, 0xFF8A8A]),
    ("lagoon", [0x0B1A1C, 0x112629, 0x183337, 0x22444A, 0xE3F4F4, 0x93B8BA, 0x3DDBC4, 0xFF9B85]),
    ("synth", [0x140F24, 0x1D1633, 0x281E45, 0x352858, 0xF0EAFF, 0xA99BC9, 0xFF5FA2, 0xFFB36B]),
    ("noir", [0x111111, 0x1B1B1B, 0x262626, 0x333333, 0xF2F2F2, 0xA0A0A0, 0xE8E8E8, 0xFF8A8A]),
    ("paper", [0xF7F2EA, 0xFFFDF9, 0xEFE7DB, 0xDDD2C2, 0x241A14, 0x6E6157, 0xC2410C, 0xB42318]),
    ("daylight", [0xF2F5FA, 0xFFFFFF, 0xE5EBF4, 0xD2DAE7, 0x141B2B, 0x5A6478, 0x2563EB, 0xC0262D]),
];
const CACHE_KEY: &str = "lilin:tv-theme-rs";

#[derive(Clone, Copy)]
pub struct Pal {
    pub velvet: Rgba,
    pub deep: Rgba,
    pub curtain: Rgba,
    pub seat: Rgba,
    pub line: Rgba,
    pub paper: Rgba,
    pub dust: Rgba,
    pub bulb: Rgba,
    pub on_bulb: Rgba,
    pub alert: Rgba,
    pub light: bool,
}

const fn rgb(h: u32) -> [f32; 3] {
    [((h >> 16) & 255) as f32 / 255.0, ((h >> 8) & 255) as f32 / 255.0, (h & 255) as f32 / 255.0]
}
fn lum(h: u32) -> f32 {
    let c = rgb(h);
    let f = |v: f32| if v <= 0.03928 { v / 12.92 } else { libm::powf((v + 0.055) / 1.055, 2.4) };
    0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
fn contrast(a: u32, b: u32) -> f32 {
    let (x, y) = (lum(a), lum(b));
    (x.max(y) + 0.05) / (x.min(y) + 0.05)
}
fn mix(a: u32, b: u32, t: f32) -> u32 {
    let (x, y) = (rgb(a), rgb(b));
    let mut out = 0u32;
    for i in 0..3 {
        let v = libm::roundf((x[i] + (y[i] - x[i]) * t) * 255.0).clamp(0.0, 255.0) as u32;
        out = (out << 8) | v;
    }
    out
}
fn parse_hex(v: &str) -> Option<u32> {
    let h = v.strip_prefix('#')?;
    if h.len() != 6 {
        return None;
    }
    u32::from_str_radix(h, 16).ok()
}

fn build(c: [u32; 8]) -> Pal {
    let [bg, surface, raised, line, text, muted, accent, alert] = c;
    let light = lum(bg) > 0.5;
    let dark_ink = if lum(bg) < 0.15 { bg } else { 0x141414 };
    let light_ink = if lum(bg) > 0.8 { bg } else { 0xFFFFFF };
    let deep = if light { mix(bg, 0xFFFFFF, 0.4) } else { mix(bg, 0x000000, 0.3) };
    let on = if contrast(dark_ink, accent) >= contrast(light_ink, accent) { dark_ink } else { light_ink };
    Pal {
        velvet: hex(bg),
        deep: hex(deep),
        curtain: hex(surface),
        seat: hex(raised),
        line: hex(line),
        paper: hex(text),
        dust: hex(muted),
        bulb: hex(accent),
        on_bulb: hex(on),
        alert: hex(alert),
        light,
    }
}
fn preset(key: &str) -> Option<[u32; 8]> {
    PRESETS.iter().find(|p| p.0 == key).map(|p| p.1)
}
/// The colours for a saved theme ({ preset, colors? }), falling back to the server's default, then Lilin.
pub fn colors(theme: &Value, default_key: &str) -> [u32; 8] {
    let base = preset(s(theme, "preset")).or_else(|| preset(default_key)).unwrap_or(PRESETS[0].1);
    if s(theme, "preset") != "custom" {
        return base;
    }
    let c = theme.get("colors").cloned().unwrap_or(Value::Null);
    let (Some(bg), Some(surface), Some(text), Some(accent)) =
        (parse_hex(s(&c, "bg")), parse_hex(s(&c, "surface")), parse_hex(s(&c, "text")), parse_hex(s(&c, "accent")))
    else {
        return base;
    };
    let alert = if lum(bg) > 0.5 { 0xB42318 } else { 0xFF9B85 };
    [bg, surface, mix(surface, text, 0.08), mix(surface, text, 0.16), text, mix(text, bg, 0.38), accent, alert]
}

static mut PAL: Pal = build_const();
static mut SAVED: Option<Pal> = None;
const fn build_const() -> Pal {
    // Lilin's own, before /api/status (or the cached theme) says otherwise. const-friendly copy of build().
    Pal {
        velvet: hex(0x140A14),
        deep: hex(0x0E070E),
        curtain: hex(0x1D121C),
        seat: hex(0x2A1C28),
        line: hex(0x3A2A36),
        paper: hex(0xEFE8E1),
        dust: hex(0xB8AAB2),
        bulb: hex(0xFB2C16),
        on_bulb: hex(0x140A14),
        alert: hex(0xFF9B85),
        light: false,
    }
}

#[inline]
pub fn pal() -> &'static Pal {
    unsafe { &*core::ptr::addr_of!(PAL) }
}
fn set(p: Pal) {
    unsafe { *core::ptr::addr_of_mut!(PAL) = p }
}

/// The theme from /api/status (me.settings.theme, rules.defaultTheme); remembered for the next start.
/// True when the colours changed.
pub fn apply(status: &Value) -> bool {
    let theme = status.get("me").and_then(|m| m.get("settings")).and_then(|st| st.get("theme")).cloned().unwrap_or(Value::Null);
    let default_key = status.get("rules").map(|r| s(r, "defaultTheme")).unwrap_or("");
    let c = colors(&theme, default_key);
    let mut line = String::new();
    for v in c.iter() {
        line.push_str(&alloc::format!("{:06x},", v));
    }
    let changed = host::load(CACHE_KEY).as_deref() != Some(line.as_str());
    if changed {
        host::save(CACHE_KEY, &line);
    }
    set(build(c));
    changed
}
/// The theme saved at the last start, so the first frame already has the person's colours.
pub fn restore() {
    let Some(line) = host::load(CACHE_KEY) else { return };
    let mut c = [0u32; 8];
    let mut n = 0;
    for part in line.split(',').filter(|p| !p.is_empty()) {
        let Ok(v) = u32::from_str_radix(part, 16) else { return };
        if n < 8 {
            c[n] = v;
        }
        n += 1;
    }
    if n == 8 {
        set(build(c));
    }
}

/// Over a video: a light theme's surfaces and text swap for dark ones (accent kept). Undo with `undark`.
pub fn dark() {
    let p = *pal();
    if !p.light {
        return;
    }
    unsafe { *core::ptr::addr_of_mut!(SAVED) = Some(p) }
    let mut d = build(PRESETS[0].1);
    d.bulb = p.bulb;
    d.on_bulb = p.on_bulb;
    set(d);
}
pub fn undark() {
    if let Some(p) = unsafe { (*core::ptr::addr_of_mut!(SAVED)).take() } {
        set(p);
    }
}

pub fn velvet() -> Rgba {
    pal().velvet
}
pub fn deep() -> Rgba {
    pal().deep
}
pub fn curtain() -> Rgba {
    pal().curtain
}
pub fn seat() -> Rgba {
    pal().seat
}
pub fn line() -> Rgba {
    pal().line
}
pub fn paper() -> Rgba {
    pal().paper
}
pub fn dust() -> Rgba {
    pal().dust
}
pub fn bulb() -> Rgba {
    pal().bulb
}
/// The accent, darker: a quieter mark (an unfocused progress tick).
pub fn bulb_dim() -> Rgba {
    pal().bulb.mix(pal().velvet, 0.42)
}
pub fn on_bulb() -> Rgba {
    pal().on_bulb
}
pub fn alert() -> Rgba {
    pal().alert
}
pub fn hair() -> Rgba {
    pal().paper.alpha(0.1)
}
pub fn panel() -> Rgba {
    pal().curtain.alpha(0.92)
}
/// The room's light from above: the raised surface, warmed a little by the accent.
pub fn glow_light() -> Rgba {
    pal().seat.mix(pal().bulb, 0.1)
}
/// Is the theme a light one (dark text on a pale room)?
pub fn is_light() -> bool {
    pal().light
}
