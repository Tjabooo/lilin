//! Lilin's look on the TV (docs/design/revamp.md): a velvet room lit from above, Bricolage Grotesque for
//! titles, the gold bulb for focus and progress only. Shared pieces every screen draws with.
use crate::gfx::{hex, hexa, rect, Rect, Rgba, SCREEN};
use crate::img;
use crate::text::{body, display, Font};
use crate::Cx;
use alloc::collections::BTreeMap;

// The palette: Lilin's own (ink, bone and signal red) unless the person picked another theme in
// Settings → Appearance (theme.rs maps the web's themes onto these names). Read through the functions below.
pub use crate::theme::{alert, bulb, bulb_dim, curtain, deep, dust, glow_light, hair, line, on_bulb, paper, seat, velvet};
pub const WHITE: Rgba = hex(0xFFFFFF);
pub const EDGE: f32 = 96.0;

pub const F_BODY: Font = body(30.0, 400);

/// Eases toward a target; frames keep coming until it gets there.
#[derive(Clone, Copy, Default)]
pub struct Ease {
    pub v: f32,
    pub to: f32,
}
impl Ease {
    pub fn at(v: f32) -> Ease {
        Ease { v, to: v }
    }
    pub fn set(&mut self, to: f32) {
        self.to = to;
    }
    pub fn jump(&mut self, to: f32) {
        self.v = to;
        self.to = to;
    }
    /// Steps and returns the value. `speed`: higher is snappier (14 ≈ 0.25 s).
    pub fn step(&mut self, cx: &mut Cx, speed: f32) -> f32 {
        let d = self.to - self.v;
        if libm::fabsf(d) < 0.35 && libm::fabsf(d) < libm::fabsf(self.to) * 0.002 + 0.35 {
            self.v = self.to;
        } else {
            self.v += d * (1.0 - libm::expf(-cx.dt * speed));
            cx.moving = true;
        }
        self.v
    }
    /// Same for values between 0 and 1 (opacity, scale amounts).
    pub fn step01(&mut self, cx: &mut Cx, speed: f32) -> f32 {
        let d = self.to - self.v;
        if libm::fabsf(d) < 0.004 {
            self.v = self.to;
        } else {
            self.v += d * (1.0 - libm::expf(-cx.dt * speed));
            cx.moving = true;
        }
        self.v
    }
}

/// How lit each recently focused thing is (0..1), so focus grows in and fades out instead of jumping.
#[derive(Default)]
pub struct Lit {
    vals: BTreeMap<u64, f32>,
    on: u64,
}
pub fn hash(s: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h | 1
}
impl Lit {
    pub fn focus(&mut self, k: u64) {
        self.on = k;
    }
    pub fn none(&mut self) {
        self.on = 0;
    }
    /// Steps every value once per frame (call before drawing).
    pub fn step(&mut self, cx: &mut Cx) {
        let a = 1.0 - libm::expf(-cx.dt * 16.0);
        let on = self.on;
        if on != 0 {
            self.vals.entry(on).or_insert(0.0);
        }
        let mut moving = false;
        self.vals.retain(|k, v| {
            let to = if *k == on { 1.0 } else { 0.0 };
            *v += (to - *v) * a;
            if libm::fabsf(to - *v) < 0.01 {
                *v = to;
            } else {
                moving = true;
            }
            *v > 0.0 || *k == on
        });
        if moving {
            cx.moving = true;
        }
    }
    pub fn get(&self, k: u64) -> f32 {
        self.vals.get(&k).copied().unwrap_or(0.0)
    }
}

/// The room: deep velvet with warm light from above. Full screen, drawn under everything.
pub fn room(cx: &mut Cx) {
    let g = &mut cx.g;
    g.vgrad(SCREEN, &[(0.0, velvet()), (1.0, deep())]);
    g.light(rect(960.0 - 1500.0, -160.0 - 700.0, 3000.0, 1400.0), glow_light());
}

/// A row of lilin bulbs, centred on cx.
pub fn bulbs(cx: &mut Cx, mid: f32, y: f32, n: usize, lit: f32) {
    let step = 33.0;
    let x0 = mid - step * (n as f32 - 1.0) / 2.0;
    for i in 0..n {
        let x = x0 + i as f32 * step;
        let r = rect(x - 5.0, y - 5.0, 10.0, 10.0);
        cx.g.glow(r, 5.0, 16.0, bulb().alpha(0.35 * lit));
        cx.g.round(r, 5.0, bulb().alpha(lit));
    }
}

/// Lilin's wordmark (the drawn LiLiN capitals, public/tv-rs/wordmark.png: white, tinted here), in the text's
/// colour. Placed like a line of display text `size` px big starting at (x, y); returns its width.
pub fn wordmark(cx: &mut Cx, x: f32, y: f32, size: f32) -> f32 {
    let h = size * 0.82;
    let w = h * 2098.0 / 1016.0;
    let url = alloc::format!("{}/tv-rs/wordmark.png", cx.server);
    match cx.picture(&url) {
        Some(p) => {
            let c = paper().alpha(p.fade);
            cx.g.image(p.id, rect(x, y + size * 0.24, w, h), [0.0, 0.0, 1.0, 1.0], 0.0, c);
        }
        None => {
            let f = display(size, 800);
            cx.tx.draw(&mut cx.g, f, "LILIN", x, y, paper());
        }
    }
    w
}
/// A tick in a round badge (an episode you've watched), size px wide, top-left at (x, y).
pub fn tick_badge(cx: &mut Cx, x: f32, y: f32, size: f32) {
    let r = rect(x, y, size, size);
    cx.g.glow(r, size / 2.0, 14.0, hexa(0x000000, 0.35));
    cx.g.round(r, size / 2.0, bulb());
    // The tick as a stroke of small round dots (the renderer draws boxes, not lines).
    let k = size / 44.0;
    let (ax, ay) = (x + 13.0 * k, y + 23.0 * k);
    let (bx, by) = (x + 19.5 * k, y + 29.5 * k);
    let (cx2, cy2) = (x + 31.5 * k, y + 15.5 * k);
    let dot = 4.6 * k;
    let mut seg = |x0: f32, y0: f32, x1: f32, y1: f32| {
        let len = libm::sqrtf((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
        let n = (len / (0.9 * k)).max(1.0) as usize;
        for i in 0..=n {
            let t = i as f32 / n as f32;
            let px = x0 + (x1 - x0) * t;
            let py = y0 + (y1 - y0) * t;
            cx.g.round(rect(px - dot / 2.0, py - dot / 2.0, dot, dot), dot / 2.0, on_bulb());
        }
    };
    seg(ax, ay, bx, by);
    seg(bx, by, cx2, cy2);
}
/// A screen's heading: the wordmark, a short red rule and the section's name (Discover, Search…).
pub fn brand(cx: &mut Cx, name: &str, y: f32) {
    let w = wordmark(cx, EDGE, y, 46.0);
    let x = EDGE + w + 26.0;
    cx.g.round(rect(x, y + 17.0, 3.0, 32.0), 1.5, bulb());
    cx.tx.draw(&mut cx.g, display(40.0, 700), name, x + 26.0, y + 4.0, paper());
}
/// The screen's light: a thin line in the accent, glowing (the icon's horizon, under the wordmark).
pub fn signal_line(cx: &mut Cx, mid: f32, y: f32, w: f32, lit: f32) {
    let r = rect(mid - w / 2.0, y - 1.5, w, 3.0);
    cx.g.glow(r, 1.5, 22.0, bulb().alpha(0.45 * lit));
    cx.g.round(r, 1.5, bulb().alpha(lit));
}

/// The gold focus: a ring just outside `r` and a warm glow.
pub fn focus_ring(cx: &mut Cx, r: Rect, radius: f32, lit: f32) {
    if lit <= 0.0 {
        return;
    }
    cx.g.glow(r, radius, 46.0, bulb().alpha(0.40 * lit));
    cx.g.ring(r.grow(5.0), radius + 5.0, 5.0, bulb().alpha(lit));
}

pub fn shadow(cx: &mut Cx, r: Rect, radius: f32, blur: f32, a: f32) {
    cx.g.glow(r.shift(0.0, blur * 0.4), radius, blur, hexa(0x000000, a));
}

#[derive(Clone, Copy, PartialEq)]
pub enum Pill {
    Plain,
    Primary,
    Quiet,
    /// Play: the one gold button (outlined in gold until it has focus).
    Gold,
}
/// A rounded button: gold when focused (lit 0..1), paper when it's the main action.
pub fn pill(cx: &mut Cx, r: Rect, label: &str, f: Font, kind: Pill, lit: f32) {
    let r = r.scale(1.0 + 0.04 * lit);
    let (bg, fg, border) = match kind {
        Pill::Primary => (paper(), on_bulb(), paper()),
        Pill::Plain => (paper().alpha(0.12), paper(), paper().alpha(0.16)),
        Pill::Quiet => (curtain().alpha(0.9), paper(), hair()),
        Pill::Gold => (bulb().alpha(0.16), bulb(), bulb()),
    };
    if lit > 0.0 {
        cx.g.glow(r, r.h / 2.0, 44.0, bulb().alpha(0.45 * lit));
    }
    let bg = bg.mix(bulb(), lit);
    let fg = fg.mix(on_bulb(), lit);
    let border = border.mix(bulb(), lit);
    cx.g.pill(r, bg);
    cx.g.ring(r, r.h / 2.0, 2.0, border);
    let w = cx.tx.width(f, label);
    let lh = f.line();
    let max = r.w - 24.0;
    if w > max {
        cx.tx.draw_fit(&mut cx.g, f, label, r.x + 12.0, r.y + (r.h - lh) / 2.0, max, fg);
    } else {
        cx.tx.draw(&mut cx.g, f, label, r.x + (r.w - w) / 2.0, r.y + (r.h - lh) / 2.0, fg);
    }
}
/// The width a pill needs for its label.
pub fn pill_w(cx: &mut Cx, label: &str, f: Font, pad: f32, min: f32) -> f32 {
    (cx.tx.width(f, label) + pad * 2.0).max(min)
}

/// A thin progress bar; `None` = nobody knows yet (a stripe moves back and forth).
pub fn bar(cx: &mut Cx, r: Rect, p: Option<f32>, track: Rgba) {
    cx.g.round(r, r.h / 2.0, track);
    match p {
        Some(p) => {
            let w = r.w * p.clamp(0.0, 1.0);
            if w > 0.5 {
                cx.g.round(rect(r.x, r.y, w.max(r.h), r.h), r.h / 2.0, bulb());
            }
        }
        None => {
            let phase = (cx.now / 1800.0) % 2.0;
            let t = if phase > 1.0 { 2.0 - phase } else { phase } as f32;
            let t = t * t * (3.0 - 2.0 * t);
            let w = r.w * 0.3;
            cx.g.push_clip(r);
            cx.g.round(rect(r.x + (r.w - w) * t, r.y, w, r.h), r.h / 2.0, bulb());
            cx.g.pop_clip();
            cx.ambient = true;
        }
    }
}

/// A picture covering `r`, rounded, fading in when it arrives. Placeholder: `bg` (None = nothing).
pub fn picture(cx: &mut Cx, url: &str, r: Rect, radius: f32, bg: Option<Rgba>, alpha: f32) -> bool {
    if let Some(bg) = bg {
        cx.g.round(r, radius, bg.alpha(alpha));
    }
    if url.is_empty() || !cx.g.visible(&r) {
        return false;
    }
    match cx.picture(url) {
        Some(p) => {
            let uv = img::cover(p.w, p.h, r.w, r.h);
            cx.g.image(p.id, r, uv, radius, WHITE.alpha(p.fade * alpha));
            true
        }
        None => false,
    }
}
/// A big backdrop anchored to the top (faces stay in).
pub fn backdrop(cx: &mut Cx, url: &str, r: Rect, alpha: f32) -> bool {
    if url.is_empty() {
        return false;
    }
    match cx.picture(url) {
        Some(p) => {
            let uv = img::cover_top(p.w, p.h, r.w, r.h);
            cx.g.image(p.id, r, uv, 0.0, WHITE.alpha(p.fade * alpha));
            true
        }
        None => false,
    }
}
/// A backdrop that melts into the room: `alpha(x, y)` over the box (0..1 each way).
pub fn backdrop_fade(cx: &mut Cx, url: &str, r: Rect, alpha: f32, shape: &dyn Fn(f32, f32) -> f32) -> bool {
    if url.is_empty() {
        return false;
    }
    match cx.picture(url) {
        Some(p) => {
            let uv = img::cover_top(p.w, p.h, r.w, r.h);
            cx.g.image_fade(p.id, r, uv, WHITE.alpha(p.fade * alpha), 8, 6, shape);
            true
        }
        None => false,
    }
}
/// Smooth 0→1 between a and b.
pub fn smooth(a: f32, b: f32, x: f32) -> f32 {
    let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// A picture fitted inside `r` (logo art), top-left aligned. Returns the box it took.
pub fn contain(cx: &mut Cx, url: &str, r: Rect, alpha: f32) -> Option<Rect> {
    let p = cx.picture(url)?;
    let s = (r.w / p.w).min(r.h / p.h);
    let w = p.w * s;
    let h = p.h * s;
    let b = rect(r.x, r.y, w, h);
    cx.g.image(p.id, b, [0.0, 0.0, 1.0, 1.0], 0.0, WHITE.alpha(p.fade * alpha));
    Some(b)
}

/// The TMDB picture in another size (w300 → w780…).
pub fn tmdb_size(url: &str, size: &str) -> alloc::string::String {
    for from in ["/w92/", "/w154/", "/w185/", "/w300/", "/w342/", "/w500/", "/w780/"] {
        if url.contains("image.tmdb.org") && url.contains(from) {
            return url.replacen(from, &alloc::format!("/{}/", size), 1);
        }
    }
    alloc::string::String::from(url)
}

/// The little notice that drops in at the top.
pub fn toast(cx: &mut Cx) {
    let Some((text, at)) = cx.toast.clone() else { return };
    let age = (cx.now - at) as f32;
    let a = if age < 200.0 {
        age / 200.0
    } else if age > 3500.0 {
        1.0 - (age - 3500.0) / 200.0
    } else {
        1.0
    };
    if a <= 0.0 && age > 3500.0 {
        cx.toast = None;
        return;
    }
    if age < 200.0 || age > 3500.0 {
        cx.moving = true;
    }
    let a = a.clamp(0.0, 1.0);
    let f = body(28.0, 700);
    let w = cx.tx.width(f, &text).min(1500.0) + 36.0 + 30.0 + 26.0;
    let y = 64.0 - 20.0 * (1.0 - a);
    let r = rect(960.0 - w / 2.0, y, w, 70.0);
    cx.g.push_alpha(a);
    shadow(cx, r, 35.0, 50.0, 0.5);
    cx.g.pill(r, paper());
    let dot = rect(r.x + 30.0, r.y + 29.0, 12.0, 12.0);
    cx.g.glow(dot, 6.0, 10.0, bulb().alpha(0.8));
    cx.g.round(dot, 6.0, bulb());
    cx.tx.draw_fit(&mut cx.g, f, &text, r.x + 56.0, r.y + (70.0 - f.line()) / 2.0, 1500.0, on_bulb());
    cx.g.pop_alpha();
}

/// A dark panel with a hairline edge and a deep shadow (dialogs, menus, cards over video).
pub fn panel(cx: &mut Cx, r: Rect, radius: f32, bg: Rgba) {
    shadow(cx, r, radius, 80.0, 0.55);
    cx.g.round(r, radius, bg);
    cx.g.ring(r, radius, 2.0, hair());
}

/// "Loading…" with three breathing bulbs.
pub fn loading(cx: &mut Cx, mid: f32, y: f32, label: &str) {
    let f = body(28.0, 400);
    cx.tx.draw_center(&mut cx.g, f, label, mid, y, dust());
    for i in 0..3 {
        let ph = ((cx.now / 420.0) as f32 - i as f32 * 0.6) % 3.0;
        let lit = if ph < 1.0 { 0.35 + 0.65 * libm::sinf(ph * core::f32::consts::PI) } else { 0.35 };
        let r = rect(mid - 40.0 + i as f32 * 34.0 - 6.0, y + 52.0, 12.0, 12.0);
        cx.g.glow(r, 6.0, 14.0, bulb().alpha(0.3 * lit));
        cx.g.round(r, 6.0, bulb().alpha(lit));
    }
    cx.ambient = true;
}

/// The little gold dot that starts a meta line.
pub fn meta_dot(cx: &mut Cx, x: f32, y: f32) {
    let r = rect(x, y, 11.0, 11.0);
    cx.g.glow(r, 5.5, 12.0, bulb().alpha(0.7));
    cx.g.round(r, 5.5, bulb());
}

/// A backdrop that follows the focus: it switches once the focus has rested a moment (pictures are slow
/// on the TV) and crossfades from the last one.
#[derive(Default)]
pub struct Ambient {
    pub cur: alloc::string::String,
    prev: alloc::string::String,
    want: alloc::string::String,
    since: f64,
    t: Ease,
    /// The text that goes with it fades in with it.
    pub text_in: f32,
}
impl Ambient {
    pub fn want(&mut self, cx: &mut Cx, url: &str) {
        if url != self.want {
            self.want = alloc::string::String::from(url);
            self.since = cx.now;
        }
    }
    /// Switches straight away (first draw of a screen).
    pub fn now(&mut self, url: &str) {
        self.want = alloc::string::String::from(url);
        self.cur = self.want.clone();
        self.prev.clear();
        self.t = Ease::at(1.0);
    }
    /// True when it just switched (so the screen can switch its text too).
    pub fn step(&mut self, cx: &mut Cx, delay: f64) -> bool {
        let mut switched = false;
        if self.want != self.cur {
            if cx.now - self.since >= delay {
                self.prev = core::mem::take(&mut self.cur);
                self.cur = self.want.clone();
                self.t = Ease::at(0.0);
                switched = true;
            } else {
                cx.moving = true;
            }
        }
        self.t.set(1.0);
        self.text_in = self.t.step01(cx, 9.0);
        switched
    }
    pub fn draw(&mut self, cx: &mut Cx, r: Rect, alpha: f32) {
        self.draw_with(cx, r, alpha, None);
    }
    pub fn draw_with(&mut self, cx: &mut Cx, r: Rect, alpha: f32, shape: Option<&dyn Fn(f32, f32) -> f32>) {
        let paint = |cx: &mut Cx, url: &str, a: f32| -> bool {
            match shape {
                Some(sh) => backdrop_fade(cx, url, r, a, sh),
                None => backdrop(cx, url, r, a),
            }
        };
        if !self.prev.is_empty() {
            let prev = self.prev.clone();
            paint(cx, &prev, alpha);
        }
        let cur = self.cur.clone();
        let shown = paint(cx, &cur, alpha * self.t.v);
        if shown && self.t.v >= 1.0 && !cx.im.fading {
            self.prev.clear();
        }
        if cur.is_empty() && self.t.v >= 1.0 {
            self.prev.clear();
        }
    }
}
