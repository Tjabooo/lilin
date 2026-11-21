//! Profiles on this TV (Netflix-style "Who's watching?"): several people stay signed in, each with their own
//! TV session, and the app asks who's watching when it starts. The list lives in localStorage (PROFILES_KEY);
//! the server can hand over profiles someone added for this TV (/api/tv/profiles/inbox, src/tv-profiles.js).
//! The profile in use is the one whose token is in TOKEN_KEY ("home" = the shared Home network account).
use crate::gfx::{hexa, rect, Rect};
use crate::host;
use crate::text::{body, display};
use crate::ui::{self, Ease, Lit};
use crate::util::{i, s};
use crate::{key, t, Cx, Key, Nav, Screen, TOKEN_KEY};
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec::Vec;
use serde_json::{json, Value};

pub const PROFILES_KEY: &str = "lilin:tv-profiles";
pub const DEVICE_KEY: &str = "lilin:tv-device";

#[derive(Clone)]
pub struct Profile {
    pub token: String,
    pub id: i64,
    pub name: String,
    pub avatar: String,
}
impl Profile {
    fn from(v: &Value) -> Option<Profile> {
        let token = String::from(s(v, "token"));
        if token.is_empty() {
            return None;
        }
        Some(Profile { token, id: i(v, "id").unwrap_or(0), name: String::from(s(v, "name")), avatar: String::from(s(v, "avatar")) })
    }
    fn json(&self) -> Value {
        json!({ "token": self.token, "id": self.id, "name": self.name, "avatar": self.avatar })
    }
    pub fn is_home(&self) -> bool {
        self.token == "home"
    }
    fn label(&self) -> String {
        if self.is_home() {
            String::from(t!("Home network"))
        } else if self.name.is_empty() {
            String::from(t!("Profile"))
        } else {
            self.name.clone()
        }
    }
}

pub fn load() -> Vec<Profile> {
    let raw = host::load(PROFILES_KEY).unwrap_or_default();
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Array(a)) => a.iter().filter_map(Profile::from).collect(),
        _ => Vec::new(),
    }
}
pub fn save(list: &[Profile]) {
    let v = Value::Array(list.iter().map(|p| p.json()).collect());
    host::save(PROFILES_KEY, &serde_json::to_string(&v).unwrap_or_default());
}
/// Adds a profile, or refreshes the one for the same person (a new sign-in replaces their old token).
pub fn upsert(list: &mut Vec<Profile>, p: Profile) {
    let same = |o: &Profile| o.token == p.token || (p.id > 0 && o.id == p.id && o.is_home() == p.is_home());
    match list.iter().position(same) {
        Some(n) => {
            let mut k = 0;
            list.retain(|o| {
                k += 1;
                k - 1 == n || !same(o)
            });
            list[n] = p;
        }
        None => list.push(p),
    }
}
/// Forgets the profile with this token (its session ended or someone removed it).
pub fn drop_token(token: &str) -> Vec<Profile> {
    let mut list = load();
    list.retain(|p| p.token != token);
    save(&list);
    list
}
/// After the server said who this token is: keep its name and picture fresh, and add it if it's new.
pub fn note_current(token: &str, me: &Value, incoming: &[Value]) -> Vec<Profile> {
    let mut list = load();
    for v in incoming {
        if let Some(p) = Profile::from(v) {
            upsert(&mut list, p);
        }
    }
    if !token.is_empty() {
        let home = token == "home";
        let p = Profile {
            token: String::from(token),
            id: if home { 0 } else { i(me, "id").unwrap_or(0) },
            name: if home { String::new() } else { String::from(s(me, "name")) },
            avatar: if home { String::new() } else { String::from(s(me, "avatar")) },
        };
        upsert(&mut list, p);
    }
    save(&list);
    list
}

/// Someone's picture: their photo, or their initial on a colour of their own.
fn face(cx: &mut Cx, p: Option<&Profile>, r: Rect, radius: f32, alpha: f32) {
    let label = match p {
        Some(p) => p.label(),
        None => String::new(),
    };
    let tones: [(u32, u32); 5] = [(0x8A2B2B, 0x3A1214), (0x2B5A8A, 0x101E33), (0x7A5A1E, 0x2E2008), (0x3E7A4E, 0x10261A), (0x6A3E8A, 0x22123A)];
    let (top, bottom) = match p {
        Some(p) => tones[(ui::hash(&label) as usize + p.id as usize) % tones.len()],
        None => (0x2A2A2E, 0x141416),
    };
    cx.g.round_v(r, radius, hexa(top, alpha), hexa(bottom, alpha));
    match p {
        Some(p) if !p.avatar.is_empty() => {
            let url = if p.avatar.starts_with("http") { p.avatar.clone() } else { alloc::format!("{}{}", cx.server, p.avatar) };
            if !ui::picture(cx, &url, r, radius, None, alpha) {
                initial(cx, &label, r, alpha);
            }
        }
        Some(_) => initial(cx, &label, r, alpha),
        None => {
            // Add profile: a plus.
            let (mx, my) = (r.x + r.w / 2.0, r.y + r.h / 2.0);
            let (l, w) = (r.w * 0.32, r.w * 0.045);
            cx.g.round(rect(mx - l / 2.0, my - w / 2.0, l, w), w / 2.0, ui::paper().alpha(0.85 * alpha));
            cx.g.round(rect(mx - w / 2.0, my - l / 2.0, w, l), w / 2.0, ui::paper().alpha(0.85 * alpha));
        }
    }
    cx.g.ring(r, radius, 2.0, hexa(0xFFFFFF, 0.08 * alpha));
}
fn initial(cx: &mut Cx, label: &str, r: Rect, alpha: f32) {
    let first: String = label.chars().next().map(|c| c.to_uppercase().collect()).unwrap_or_default();
    let f = display(r.h * 0.5, 800);
    cx.tx.draw_center(&mut cx.g, f, &first, r.x + r.w / 2.0, r.y + (r.h - f.line()) / 2.0, ui::paper().alpha(alpha));
}

pub struct Picker {
    sid: u32,
    list: Vec<Profile>,
    /// The focused tile (the last one is Add profile); None = the Manage button under the row.
    at: Option<usize>,
    managing: bool,
    /// The tile waiting for a second OK to be removed.
    confirm: Option<usize>,
    /// The Home network account works here (we're at home), so it can be added back.
    home_ok: bool,
    lit: Lit,
    shown: Ease,
}
impl Picker {
    pub fn new(cx: &mut Cx, list: Vec<Profile>, home_ok: bool) -> Picker {
        let sid = cx.sid();
        let current = cx.token().unwrap_or_default();
        let at = list.iter().position(|p| p.token == current).unwrap_or(0);
        Picker { sid, list, at: Some(at), managing: false, confirm: None, home_ok, lit: Lit::default(), shown: Ease::at(0.0) }
    }
    fn tiles(&self) -> usize {
        self.list.len() + if self.managing { 0 } else { 1 }
    }
    fn pick(&mut self, cx: &mut Cx, n: usize) {
        if let Some(p) = self.list.get(n) {
            host::save(TOKEN_KEY, &p.token);
            let b = super::pair::Boot::picked(cx);
            cx.nav.push(Nav::Reset(Box::new(b)));
        } else {
            let has_home = self.list.iter().any(|p| p.is_home());
            let p = super::pair::Pair::adding(cx, self.home_ok && !has_home);
            cx.push(Box::new(p));
        }
    }
    fn remove(&mut self, cx: &mut Cx, n: usize) {
        let gone = self.list.remove(n);
        save(&self.list);
        if !gone.is_home() {
            // End that session on the server too (it was only on this TV).
            cx.post_as("/api/auth/logout", &gone.token);
        }
        if cx.token().as_deref() == Some(gone.token.as_str()) {
            host::forget(TOKEN_KEY);
        }
        cx.toast(&t!("Removed {0}", gone.label()));
        self.confirm = None;
        if self.list.is_empty() {
            let p = super::pair::Pair::new(cx, self.home_ok, None);
            cx.nav.push(Nav::Reset(Box::new(p)));
            return;
        }
        self.at = Some(n.min(self.list.len() - 1));
    }
}
impl Screen for Picker {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn refresh(&mut self, _cx: &mut Cx) {
        self.list = load();
    }
    fn draw(&mut self, cx: &mut Cx) {
        ui::room(cx);
        self.shown.set(1.0);
        let a = self.shown.step01(cx, 7.0);
        cx.g.push_alpha(a);
        cx.g.light(rect(160.0, 300.0, 1600.0, 640.0), ui::seat().alpha(0.5));
        ui::wordmark(cx, ui::EDGE, 112.0, 46.0);
        let title = if self.managing { t!("Manage profiles") } else { t!("Who’s watching?") };
        cx.tx.draw_center(&mut cx.g, display(84.0, 800), title, 960.0, 236.0, ui::paper());

        let n = self.tiles();
        let size = if n > 5 { 200.0 } else { 240.0 };
        let gap = if n > 5 { 56.0 } else { 72.0 };
        let total = n as f32 * size + (n as f32 - 1.0) * gap;
        let x0 = 960.0 - total / 2.0;
        let y = 420.0;
        match self.at {
            Some(k) => self.lit.focus(1000 + k as u64),
            None => self.lit.focus(1),
        }
        self.lit.step(cx);
        for k in 0..n {
            let lit = self.lit.get(1000 + k as u64);
            let base = rect(x0 + k as f32 * (size + gap), y, size, size);
            let r = base.scale(1.0 + 0.08 * lit);
            let radius = size * 0.16;
            ui::shadow(cx, r, radius, 50.0, 0.45);
            if lit > 0.0 {
                cx.g.glow(r, radius, 46.0, ui::bulb().alpha(0.40 * lit));
            }
            let p = self.list.get(k).cloned();
            face(cx, p.as_ref(), r, radius, 1.0);
            if lit > 0.0 {
                cx.g.ring(r.grow(5.0), radius + 5.0, 5.0, ui::bulb().alpha(lit));
            }
            if self.managing {
                // Dimmed, with a remove badge on the corner: OK removes.
                cx.g.round(r, radius, hexa(0x000000, 0.35 * (1.0 - lit)));
                let d = size * 0.26;
                let b = rect(r.r() - d * 0.7, r.y - d * 0.3, d, d);
                ui::shadow(cx, b, d / 2.0, 18.0, 0.5);
                cx.g.round(b, d / 2.0, ui::paper().mix(ui::bulb(), lit));
                let f = display(d * 0.62, 800);
                cx.tx.draw_center(&mut cx.g, f, "×", b.x + d / 2.0, b.y + (d - f.line()) / 2.0, ui::on_bulb());
            }
            let label = match &p {
                Some(p) => p.label(),
                None => String::from(t!("Add profile")),
            };
            let f = body(34.0, if lit > 0.5 { 700 } else { 500 });
            let c = ui::dust().mix(ui::paper(), lit);
            let w = cx.tx.width(f, &label).min(size + gap - 12.0);
            cx.tx.draw_fit(&mut cx.g, f, &label, base.x + (size - w) / 2.0, base.b() + 34.0, size + gap - 12.0, c);
            if self.confirm == Some(k) {
                let f = body(26.0, 700);
                cx.tx.draw_center(&mut cx.g, f, t!("OK again removes"), base.x + size / 2.0, base.b() + 84.0, ui::bulb());
            }
        }
        let f = body(30.0, 700);
        let label = if self.managing { t!("Done") } else { t!("Manage profiles") };
        let w = ui::pill_w(cx, label, f, 34.0, 220.0);
        let lit = self.lit.get(1);
        ui::pill(cx, rect(960.0 - w / 2.0, 860.0, w, 74.0), label, f, ui::Pill::Quiet, lit);
        cx.g.pop_alpha();
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        let n = self.tiles();
        match k.code {
            key::LEFT => {
                if let Some(at) = self.at {
                    self.at = Some(at.saturating_sub(1));
                    self.confirm = None;
                }
            }
            key::RIGHT => {
                if let Some(at) = self.at {
                    self.at = Some((at + 1).min(n.saturating_sub(1)));
                    self.confirm = None;
                }
            }
            key::DOWN => {
                self.at = None;
                self.confirm = None;
            }
            key::UP => {
                if self.at.is_none() {
                    self.at = Some(0);
                }
            }
            key::ENTER => match self.at {
                None => {
                    self.managing = !self.managing;
                    self.confirm = None;
                    if !self.managing {
                        self.at = Some(0);
                    }
                }
                Some(at) if self.managing => {
                    if self.confirm == Some(at) {
                        self.remove(cx, at);
                    } else {
                        self.confirm = Some(at);
                    }
                }
                Some(at) => self.pick(cx, at),
            },
            key::BACK if self.managing => {
                self.managing = false;
                self.confirm = None;
                self.at = Some(0);
            }
            _ => return false,
        }
        cx.redraw();
        true
    }
}
