//! Starting up and signing the TV in: a QR code to scan with a signed-in phone, or a code typed on the phone
//! (You › Devices and notifications), or the shared Home network account.
use crate::gfx::{hexa, rect};
use crate::host;
use crate::text::{body, display, Font};
use crate::ui::{self, Ease};
use crate::util::{f, s};
use super::profiles;
use crate::{key, t, Cx, Key, Nav, Res, Screen, TOKEN_KEY};
use alloc::boxed::Box;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use serde_json::Value;

const STATUS: u32 = 1;
const READY: u32 = 2;
const RETRY: u32 = 3;
const INBOX: u32 = 4;

pub struct Boot {
    sid: u32,
    note: String,
    waiting: u32,
    shown: Ease,
    /// Someone just picked (or signed in) the profile: don't ask Who's watching again.
    picked: bool,
    has_me: bool,
    me: Value,
}
impl Boot {
    pub fn new(cx: &mut Cx, note: Option<String>) -> Boot {
        let sid = cx.sid();
        cx.get("/api/status", sid, STATUS);
        Boot { sid, note: note.unwrap_or_default(), waiting: 0, shown: Ease::at(0.0), picked: false, has_me: false, me: Value::Null }
    }
    pub fn picked(cx: &mut Cx) -> Boot {
        let mut b = Boot::new(cx, None);
        b.picked = true;
        b
    }
    /// This profile's session ended: forget it, then the other profiles or a new sign-in.
    fn signed_out(&mut self, cx: &mut Cx, note: Option<String>) {
        let token = cx.token().unwrap_or_default();
        host::forget(TOKEN_KEY);
        let rest = profiles::drop_token(&token);
        if rest.is_empty() {
            let p = Pair::new(cx, self.has_me, note);
            cx.nav.push(Nav::Reset(Box::new(p)));
        } else {
            if let Some(n) = note {
                cx.toast(&n);
            }
            let p = profiles::Picker::new(cx, rest, self.has_me);
            cx.nav.push(Nav::Reset(Box::new(p)));
        }
    }
}
fn splash(cx: &mut Cx, note: &str, a: f32) {
    ui::room(cx);
    cx.g.push_alpha(a);
    let size = 150.0;
    let w = size * 0.82 * 2098.0 / 1016.0;
    ui::wordmark(cx, 960.0 - w / 2.0, 380.0, size);
    ui::signal_line(cx, 960.0, 560.0, w + 80.0, 1.0);
    if !note.is_empty() {
        let lines = cx.tx.wrap(body(32.0, 400), note, 1100.0, 3);
        for (n, l) in lines.iter().enumerate() {
            cx.tx.draw_center(&mut cx.g, body(32.0, 400), l, 960.0, 640.0 + n as f32 * 42.0, ui::dust());
        }
    }
    cx.g.pop_alpha();
}
impl Screen for Boot {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn draw(&mut self, cx: &mut Cx) {
        self.shown.set(1.0);
        let a = self.shown.step01(cx, 6.0);
        splash(cx, &self.note, a);
    }
    fn key(&mut self, _cx: &mut Cx, _k: Key) -> bool {
        false
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        match tag {
            STATUS => {
                if res.status == 401 {
                    self.has_me = false;
                    self.signed_out(cx, None);
                    return;
                }
                if !res.ok() {
                    self.note = t!("Can’t reach Lilin right now ({0}). Trying again…", res.error());
                    cx.timer(5000.0, self.sid, RETRY);
                    cx.redraw();
                    return;
                }
                if crate::theme::apply(&res.json) {
                    cx.redraw();
                }
                let me = res.json.get("me").cloned().unwrap_or(Value::Null);
                cx.state.live_name = String::from(s(&res.json, "liveName"));
                self.has_me = me.get("id").map(|x| !x.is_null()).unwrap_or(false);
                if let Some(tk) = cx.token() {
                    if tk != "home" && s(&me, "via") != "session" {
                        // This profile's session ended (signed out elsewhere, password changed, or a year passed).
                        self.signed_out(cx, Some(String::from(t!("This TV was signed out. Sign it in again."))));
                        return;
                    }
                }
                self.me = me;
                // Profiles someone added for this TV, then Who's watching (or straight in).
                cx.get("/api/tv/profiles/inbox", self.sid, INBOX);
            }
            INBOX => {
                let device = String::from(s(&res.json, "device"));
                if res.ok() && !device.is_empty() {
                    host::save(profiles::DEVICE_KEY, &device);
                }
                let incoming: Vec<Value> = if res.ok() { crate::util::arr(&res.json, "profiles").to_vec() } else { Vec::new() };
                let token = cx.token().unwrap_or_default();
                let list = profiles::note_current(&token, &self.me, &incoming);
                if !incoming.is_empty() {
                    let names: Vec<&str> = incoming.iter().map(|v| s(v, "name")).collect();
                    cx.toast(&t!("New profiles on this TV: {0}", names.join(", ")));
                }
                if token.is_empty() || (!self.picked && list.len() > 1) {
                    if list.is_empty() {
                        let p = Pair::new(cx, self.has_me, None);
                        cx.nav.push(Nav::Reset(Box::new(p)));
                    } else {
                        let p = profiles::Picker::new(cx, list, self.has_me);
                        cx.nav.push(Nav::Reset(Box::new(p)));
                    }
                    return;
                }
                cx.state.me = core::mem::take(&mut self.me);
                self.waiting = 2;
                cx.load_library(Some((self.sid, READY)));
                cx.load_genres(Some((self.sid, READY)));
            }
            READY => {
                self.waiting = self.waiting.saturating_sub(1);
                if self.waiting == 0 {
                    // Play first: no library screen; the app opens on Discover (Continue watching on top).
                    let h = super::discover::Discover::root(cx);
                    cx.nav.push(Nav::Reset(Box::new(h)));
                }
            }
            _ => {}
        }
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        if tag == RETRY {
            cx.get("/api/status", self.sid, STATUS);
        }
    }
}

const START: u32 = 10;
const POLL: u32 = 11;
const POLL_T: u32 = 12;
const NEW_T: u32 = 13;

pub struct Pair {
    sid: u32,
    /// Adding a profile from Who's watching (Back goes back there).
    adding: bool,
    home: bool,
    home_on: bool,
    code: String,
    poll: String,
    /// The QR code (rows of dark modules) that opens Lilin on a phone to approve this TV.
    qr: Vec<Vec<bool>>,
    note: String,
    fixed_note: Option<String>,
    timer: u32,
    alive: bool,
    lit: Ease,
    shown: Ease,
}
impl Pair {
    pub fn new(cx: &mut Cx, home: bool, note: Option<String>) -> Pair {
        let sid = cx.sid();
        let mut p = Pair {
            sid,
            adding: false,
            home,
            home_on: false,
            code: String::new(),
            poll: String::new(),
            qr: Vec::new(),
            note: note.clone().unwrap_or_default(),
            fixed_note: note,
            timer: 0,
            alive: true,
            lit: Ease::at(0.0),
            shown: Ease::at(0.0),
        };
        p.new_code(cx);
        p
    }
    /// Adding another profile to this TV.
    pub fn adding(cx: &mut Cx, home: bool) -> Pair {
        let mut p = Pair::new(cx, home, None);
        p.adding = true;
        p
    }
    /// The QR code on a white card on the right, lit like the code boxes.
    fn draw_qr(&mut self, cx: &mut Cx) {
        let size = 440.0;
        let card = rect(1920.0 - ui::EDGE - size, 300.0, size, size);
        ui::shadow(cx, card, 32.0, 50.0, 0.45);
        cx.g.glow(card, 32.0, 46.0, ui::bulb().alpha(0.28));
        cx.g.round(card, 32.0, hexa(0xFFFFFF, 1.0));
        cx.g.ring(card, 32.0, 2.0, ui::bulb().alpha(0.4));
        let n = self.qr.len();
        if n == 0 {
            return;
        }
        // Whole pixels per module (crisp edges), quiet zone inside the card's padding.
        let m = libm::floor(((size - 56.0) / n as f32) as f64) as f32;
        let x0 = libm::round((card.x + (size - m * n as f32) / 2.0) as f64) as f32;
        let y0 = libm::round((card.y + (size - m * n as f32) / 2.0) as f64) as f32;
        let ink = hexa(0x000000, 1.0);
        for (y, row) in self.qr.iter().enumerate() {
            let mut x = 0;
            while x < row.len() {
                if !row[x] {
                    x += 1;
                    continue;
                }
                let start = x;
                while x < row.len() && row[x] {
                    x += 1;
                }
                cx.g.fill(rect(x0 + start as f32 * m, y0 + y as f32 * m, (x - start) as f32 * m, m), ink);
            }
        }
        let cap = body(28.0, 700);
        cx.tx.draw_center(&mut cx.g, cap, t!("Scan with your phone"), card.x + size / 2.0, card.b() + 30.0, ui::paper());
    }
    fn new_code(&mut self, cx: &mut Cx) {
        if self.alive {
            cx.post("/api/tv/pair/start", Value::Object(Default::default()), self.sid, START);
        }
    }
    fn check(&mut self, cx: &mut Cx) {
        if self.alive {
            self.timer = cx.timer(2000.0, self.sid, POLL_T);
        }
    }
    fn signed_in(&mut self, cx: &mut Cx, token: Option<&str>, name: &str) {
        self.alive = false;
        let token = token.filter(|t| !t.is_empty()).unwrap_or("home");
        host::save(TOKEN_KEY, token);
        // Every sign-in becomes a profile on this TV (Boot fills in the picture once the server says who it is).
        let mut list = profiles::load();
        let name_kept = if token == "home" { String::new() } else { String::from(name) };
        profiles::upsert(&mut list, profiles::Profile { token: String::from(token), id: 0, name: name_kept, avatar: String::new() });
        profiles::save(&list);
        cx.toast(&t!("Signed in as {0}", if name.is_empty() { String::from(t!("you")) } else { String::from(name) }));
        let b = Boot::picked(cx);
        cx.nav.push(Nav::Reset(Box::new(b)));
    }
}

/// Text in several styles on one line.
pub fn rich(cx: &mut Cx, x: f32, y: f32, parts: &[(&str, Font, crate::gfx::Rgba)]) -> f32 {
    let mut x = x;
    for (s, f, c) in parts {
        x += cx.tx.draw(&mut cx.g, *f, s, x, y, *c);
    }
    x
}

impl Screen for Pair {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn draw(&mut self, cx: &mut Cx) {
        ui::room(cx);
        self.shown.set(1.0);
        let a = self.shown.step01(cx, 7.0);
        cx.g.push_alpha(a);
        // A warm pool of light behind the code.
        cx.g.light(rect(-300.0, 380.0, 1700.0, 700.0), ui::seat().alpha(0.55));
        ui::wordmark(cx, ui::EDGE, 112.0, 46.0);
        let h1 = display(84.0, 800);
        cx.tx.draw(&mut cx.g, h1, if self.adding { t!("Add a profile") } else { t!("Sign in this TV") }, ui::EDGE - 4.0, 196.0, ui::paper());
        let step = body(38.0, 400);
        let bold = body(38.0, 700);
        let num = display(38.0, 800);
        rich(cx, ui::EDGE, 330.0, &[("1  ", num, ui::bulb()), (t!("Scan the QR code with your phone’s camera,"), step, ui::dust())]);
        rich(cx, ui::EDGE, 388.0, &[("2  ", num, ui::bulb()), (t!("or enter this code in Lilin under "), step, ui::dust()), (t!("You › Devices"), bold, ui::paper()), (":", step, ui::dust())]);
        self.draw_qr(cx);
        // The code: lit letters in little lilin boxes.
        let mut x = ui::EDGE;
        let y = 480.0;
        let chars: Vec<char> = self.code.chars().collect();
        let n = if chars.is_empty() { 6 } else { chars.len() };
        for i in 0..n {
            if i == 3 {
                x += 40.0;
            }
            let r = rect(x, y, 128.0, 170.0);
            ui::shadow(cx, r, 20.0, 40.0, 0.35);
            cx.g.round_v(r, 20.0, ui::seat(), ui::curtain());
            cx.g.ring(r, 20.0, 2.0, ui::bulb().alpha(0.28));
            cx.g.ring(rect(r.x + 2.0, r.y + 2.0, r.w - 4.0, 2.0), 0.0, 1.0, hexa(0xFFFFFF, 0.06));
            if let Some(c) = chars.get(i) {
                let f = display(104.0, 800).glow();
                let mut b = [0u8; 4];
                let s = c.encode_utf8(&mut b);
                cx.tx.draw_center(&mut cx.g, f, s, r.x + 64.0, r.y + (170.0 - f.line()) / 2.0, ui::bulb());
            } else {
                let ph = ((cx.now / 300.0) as usize + i) % n;
                let lit = if ph == 0 { 1.0 } else { 0.3 };
                cx.g.round(rect(r.x + 58.0, r.y + 79.0, 12.0, 12.0), 6.0, ui::bulb().alpha(lit));
                cx.ambient = true;
            }
            x += 128.0 + 16.0;
        }
        let note = body(30.0, 400);
        cx.tx.draw_fit(&mut cx.g, note, &self.note, ui::EDGE, 690.0, 1180.0, ui::dust());
        if self.home {
            self.lit.set(if self.home_on { 1.0 } else { 0.0 });
            let lit = self.lit.step01(cx, 16.0);
            let hint = body(26.0, 400);
            cx.tx.draw(&mut cx.g, hint, t!("No account? Press Down for"), ui::EDGE, 790.0, ui::dust());
            let f = body(30.0, 700);
            let label = t!("Use the shared Home network account");
            let w = ui::pill_w(cx, label, f, 34.0, 200.0);
            ui::pill(cx, rect(ui::EDGE, 840.0, w, 74.0), label, f, ui::Pill::Quiet, lit);
        }
        cx.g.pop_alpha();
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        if !self.home {
            return false;
        }
        match k.code {
            key::DOWN | key::UP => {
                // Nothing is focused at first, so a stray OK can't sign the TV in as the shared account.
                self.home_on = k.code == key::DOWN;
                cx.redraw();
                true
            }
            key::ENTER if self.home_on => {
                self.signed_in(cx, None, "Home network");
                true
            }
            _ => false,
        }
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        if !self.alive {
            return;
        }
        match tag {
            START => {
                if !res.ok() {
                    self.note = alloc::format!("{} {}", res.error(), t!("Trying again…"));
                    self.timer = cx.timer(5000.0, self.sid, NEW_T);
                    return;
                }
                self.poll = crate::util::id(&res.json, "poll");
                self.code = String::from(s(&res.json, "code"));
                self.qr = match res.json.get("qr") {
                    Some(Value::Array(rows)) => rows.iter().map(|r| r.as_str().unwrap_or("").bytes().map(|b| b == b'1').collect()).collect(),
                    _ => Vec::new(),
                };
                let mins = libm::round(f(&res.json, "expiresIn").unwrap_or(600.0) / 60.0) as i64;
                self.note = match &self.fixed_note {
                    Some(n) => n.clone(),
                    None => t!("The code changes every {0} minutes.", mins.to_string()),
                };
                self.check(cx);
            }
            POLL => {
                if res.ok() {
                    match s(&res.json, "state") {
                        "approved" => {
                            let g = res.json.get("grant").cloned().unwrap_or(Value::Null);
                            let token = String::from(s(&g, "token"));
                            let name = String::from(s(&g, "name"));
                            self.signed_in(cx, Some(&token), &name);
                            return;
                        }
                        "expired" => {
                            self.new_code(cx);
                            return;
                        }
                        _ => {}
                    }
                }
                self.check(cx);
            }
            _ => {}
        }
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        match tag {
            POLL_T => cx.get(&alloc::format!("/api/tv/pair/poll?id={}", crate::util::enc(&self.poll)), self.sid, POLL),
            NEW_T => self.new_code(cx),
            _ => {}
        }
    }
    fn leave(&mut self, cx: &mut Cx) {
        self.alive = false;
        cx.cancel(self.timer);
    }
}
