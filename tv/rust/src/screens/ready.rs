//! Getting it ready (play first): Play on something that isn't here yet. The server (src/tv-play.js) adds someone
//! else's copy to your library, or finds a copy and fetches the start of the video (a cold start); this screen says
//! how it's going in one line over the title's picture, and the player takes its place by itself. Back leaves it
//! getting ready (others may want it too). Same words as public/tv/tv.js getReady and the web's getting-ready.js.
use super::title::{heading, page_backdrop};
use crate::gfx::{hexa, rect};
use crate::logic;
use crate::text::{body, display};
use crate::ui;
use crate::util::{f, s};
use crate::{key, t, Cx, Key, Nav, Res, Screen};
use alloc::boxed::Box;
use alloc::string::{String, ToString};
use serde_json::Value;

const STARTED: u32 = 1;
const FOLLOWED: u32 = 2;
const LOGO: u32 = 3;
const FOLLOW_T: u32 = 10;
const PAINT_T: u32 = 11;

/// What Play was pressed on: a film, or one episode of a show.
pub struct Target {
    pub tv: bool,
    pub tmdb: i64,
    pub season: i64,
    pub episode: i64,
    pub title: String,
    pub sub: String,
    pub art: String,
    /// They said yes to a cinema recording (CamAsk): the smart download may pick one when nothing proper exists.
    pub allow_cam: bool,
}
impl Target {
    fn query(&self) -> String {
        if self.tv {
            alloc::format!("type=tv&tmdbId={}&season={}&episode={}", self.tmdb, self.season, self.episode)
        } else {
            alloc::format!("type=movie&tmdbId={}", self.tmdb)
        }
    }
}

/// Yours already: straight to the player. Anything else: Getting it ready.
pub fn play_first(cx: &mut Cx, x: Target) {
    if !x.tv {
        let id = x.tmdb.to_string();
        let mine = cx.state.library.iter().find(|f| !crate::util::has(f, "season") && crate::util::id(f, "tmdbId") == id && !crate::util::b(f, "converting")).cloned();
        if let Some(file) = mine {
            super::player::play_asked(cx, &file, false);
            return;
        }
    }
    let r = Ready::new(cx, x);
    cx.push(Box::new(r));
}
/// The same, in place of the screen on top (the player, for the next episode).
pub fn replace_with(cx: &mut Cx, x: Target) {
    let r = Ready::new(cx, x);
    cx.nav.push(Nav::Replace(Box::new(r)));
}

/// Only cinema recordings of this film so far (src/copy-check.js): say so before anything downloads.
pub struct CamAsk {
    sid: u32,
    x: Option<Target>,
    choice: usize,
    lit: ui::Lit,
    shown: ui::Ease,
}
impl CamAsk {
    pub fn new(cx: &mut Cx, x: Target) -> CamAsk {
        CamAsk { sid: cx.sid(), x: Some(x), choice: 0, lit: ui::Lit::default(), shown: ui::Ease::at(0.0) }
    }
}
impl Screen for CamAsk {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn overlay(&self) -> bool {
        true
    }
    fn draw(&mut self, cx: &mut Cx) {
        self.shown.set(1.0);
        let a = self.shown.step01(cx, 12.0);
        cx.g.fill(rect(0.0, 0.0, 1920.0, 1080.0), hexa(0x160B12, 0.9 * a));
        cx.g.push_alpha(a);
        let r = rect(460.0, 270.0 + 20.0 * (1.0 - a), 1000.0, 540.0);
        ui::shadow(cx, r, 30.0, 100.0, 0.6);
        cx.g.round_v(r, 30.0, ui::SEAT, ui::CURTAIN);
        cx.g.ring(r, 30.0, 2.0, ui::HAIR);
        cx.tx.draw_fit(&mut cx.g, display(44.0, 800), t!("Only a cinema recording so far"), r.x + 56.0, r.y + 50.0, r.w - 112.0, ui::PAPER);
        cx.tx.para(&mut cx.g, body(28.0, 400), t!("Someone filmed this in a cinema, so the picture and sound are poor. A proper copy usually turns up once it’s out to stream or buy."),
            r.x + 56.0, r.y + 124.0, r.w - 112.0, 3, 38.0, ui::DUST);
        self.lit.focus(self.choice as u64 + 1);
        self.lit.step(cx);
        let labels = [t!("Play the cinema recording"), t!("Back")];
        let f = body(32.0, 700);
        for (n, l) in labels.iter().enumerate() {
            let b = rect(r.x + 56.0, r.y + 270.0 + n as f32 * 108.0, r.w - 112.0, 92.0);
            let lit = self.lit.get(n as u64 + 1);
            if lit > 0.0 {
                cx.g.glow(b, 46.0, 40.0, ui::BULB.alpha(0.35 * lit));
            }
            cx.g.pill(b, hexa(0xF6EADF, 0.08).mix(ui::BULB, lit));
            cx.tx.draw(&mut cx.g, f, l, b.x + 34.0, b.y + (92.0 - f.line()) / 2.0, ui::PAPER.mix(ui::ON_BULB, lit));
        }
        cx.g.pop_alpha();
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        cx.redraw();
        match k.code {
            key::UP | key::LEFT => self.choice = 0,
            key::DOWN | key::RIGHT => self.choice = 1,
            key::ENTER => {
                if self.choice == 1 {
                    cx.back();
                } else if let Some(mut x) = self.x.take() {
                    x.allow_cam = true;
                    replace_with(cx, x);
                }
            }
            key::BACK => cx.back(),
            _ => return false,
        }
        true
    }
}

fn about_time(sec: f64) -> String {
    if sec < 55.0 {
        t!("{0} s", ((libm::ceil(sec / 5.0) * 5.0).max(5.0) as i64).to_string())
    } else {
        t!("{0} min", (libm::round(sec / 60.0).max(1.0) as i64).to_string())
    }
}

/// (line, hint, progress 0-1) for a phase, as the web's readyWords().
fn words(r: &Value, elapsed: f64, phase_elapsed: f64) -> (String, String, f32) {
    let ease = |from: f64, to: f64, secs: f64| from + (to - from) * (1.0 - libm::exp(-phase_elapsed.max(0.0) / secs));
    let slow = elapsed > 150.0;
    let hint = String::from(if slow { t!("This one is taking longer than usual. Lilin keeps trying.") } else { t!("Usually ready in under a minute.") });
    match s(r, "phase") {
        "failed" => {
            let m = s(r, "message");
            let line = if m.is_empty() { String::from(t!("Lilin couldn’t find a copy that plays well.")) } else { String::from(m) };
            (line, String::from(t!("Try again in a little while, or pick something else.")), 0.0)
        }
        "connecting" => (String::from(t!("Connecting to it…")), hint, ease(0.3, 0.5, 15.0) as f32),
        "starting" => {
            let p = f(r, "startProgress").unwrap_or(0.0).clamp(0.0, 1.0);
            let line = match f(r, "startEta") {
                None => String::from(t!("Fetching the start of the video…")),
                Some(e) if e <= 5.0 => String::from(t!("Almost there…")),
                Some(e) => t!("Starting in about {0}", about_time(e)),
            };
            (line, if slow { hint } else { String::new() }, (0.5 + 0.45 * p).max(ease(0.5, 0.7, 40.0)) as f32)
        }
        "opening" => (String::from(t!("Starting…")), String::new(), 0.97),
        _ => (String::from(t!("Finding the best copy…")), hint, ease(0.04, 0.3, 12.0) as f32),
    }
}

pub struct Ready {
    sid: u32,
    x: Target,
    last: Value,
    job: String,
    since: f64,
    phase_since: f64,
    idle_since: f64,
    alive: bool,
    timer: u32,
    paint: u32,
    logo: String,
}
impl Ready {
    fn new(cx: &mut Cx, x: Target) -> Ready {
        let sid = cx.sid();
        let mut b = serde_json::json!({ "type": if x.tv { "tv" } else { "movie" }, "tmdbId": x.tmdb, "title": x.title });
        if x.tv {
            b["season"] = Value::from(x.season);
            b["episode"] = Value::from(x.episode);
        }
        if x.allow_cam {
            b["allowCam"] = Value::from(true);
        }
        cx.post("/api/tv/play", b, sid, STARTED);
        cx.get(&alloc::format!("/api/title/{}/{}/page", if x.tv { "tv" } else { "movie" }, x.tmdb), sid, LOGO);
        let paint = cx.timer(500.0, sid, PAINT_T);
        Ready { sid, x, last: serde_json::json!({ "phase": "finding" }), job: String::new(), since: cx.now, phase_since: cx.now, idle_since: 0.0,
            alive: true, timer: 0, paint, logo: String::new() }
    }
    fn stop(&mut self, cx: &mut Cx) {
        self.alive = false;
        cx.cancel(self.timer);
        cx.cancel(self.paint);
    }
    fn answer(&mut self, cx: &mut Cx, mut r: Value) {
        let j = s(&r, "job");
        if !j.is_empty() {
            self.job = String::from(j);
        }
        if let Some(p) = r.get("play").cloned() {
            let file = if s(&p, "kind") == "part" {
                // Play now: a stream of a video that's still downloading (the player's `part`).
                let mut f = serde_json::json!({ "id": s(&p, "id"), "part": true, "url": s(&p, "url"), "title": if s(&p, "title").is_empty() { self.x.title.as_str() } else { s(&p, "title") },
                    "filmTitle": self.x.title, "still": self.x.art });
                for k in ["mediaKey", "show", "season", "episode"] {
                    if let Some(v) = p.get(k) {
                        f[k] = v.clone();
                    }
                }
                if self.x.tv {
                    f["showTmdb"] = Value::from(self.x.tmdb);
                }
                f
            } else {
                if crate::util::b(&p, "added") {
                    cx.load_library(None);
                }
                p.get("file").cloned().unwrap_or(Value::Null)
            };
            self.stop(cx);
            let pr = cx.state.progress.get(logic::progress_ref(&file)).cloned();
            let at = if logic::resumable(pr.as_ref()) { pr.as_ref().and_then(|p| f(p, "time")).unwrap_or(0.0) } else { 0.0 };
            super::player::play(cx, &file, at, true);
            return;
        }
        if crate::util::b(&r, "idle") {
            if self.idle_since == 0.0 {
                self.idle_since = cx.now;
            }
            if cx.now - self.idle_since > 60000.0 {
                r = serde_json::json!({ "phase": "failed" });
            }
        } else {
            self.idle_since = 0.0;
        }
        if s(&r, "phase") != s(&self.last, "phase") {
            self.phase_since = cx.now;
        }
        let failed = s(&r, "phase") == "failed";
        self.last = r;
        if !failed {
            self.timer = cx.timer(1500.0, self.sid, FOLLOW_T);
        }
        cx.redraw();
    }
}

impl Screen for Ready {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn draw(&mut self, cx: &mut Cx) {
        let art = self.x.art.clone();
        page_backdrop(cx, &art, 0.45);
        let x = ui::EDGE;
        let (line, hint, progress) = words(&self.last, (cx.now - self.since) / 1000.0, (cx.now - self.phase_since) / 1000.0);
        let mut y = 1080.0 - 150.0 - 420.0;
        let logo = self.logo.clone();
        let name = self.x.title.clone();
        y += heading(cx, &logo, &name, x, y, 84.0, 1100.0);
        if !self.x.sub.is_empty() {
            let sub = self.x.sub.clone();
            cx.tx.draw(&mut cx.g, body(32.0, 400), &sub, x, y, ui::DUST);
            y += 50.0;
        }
        y += 24.0;
        let r = rect(x, y, 760.0, 8.0);
        cx.g.glow(r, 4.0, 14.0, ui::BULB.alpha(0.2));
        ui::bar(cx, r, Some(progress), hexa(0xF6EADF, 0.14));
        y += 34.0;
        let failed = s(&self.last, "phase") == "failed";
        cx.tx.para(&mut cx.g, display(38.0, 700), &line, x, y, 1100.0, 2, 46.0, if failed { ui::ALERT } else { ui::PAPER });
        y += 58.0;
        if !hint.is_empty() {
            cx.tx.draw_fit(&mut cx.g, body(28.0, 400), &hint, x, y, 1100.0, ui::DUST);
        }
        y += 72.0;
        let pf = body(30.0, 700);
        let label = t!("Back");
        let w = ui::pill_w(cx, label, pf, 34.0, 270.0);
        ui::pill(cx, rect(x, y, w, 78.0), label, pf, ui::Pill::Plain, 1.0);
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        match k.code {
            key::ENTER | key::BACK => {
                if s(&self.last, "phase") != "failed" {
                    cx.toast(t!("It keeps getting ready. Press Play again any time."));
                }
                cx.back();
                true
            }
            _ => true,
        }
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        if !self.alive {
            return;
        }
        match tag {
            STARTED | FOLLOWED => {
                if res.ok() {
                    self.answer(cx, res.json);
                } else if tag == STARTED {
                    self.answer(cx, serde_json::json!({ "phase": "failed", "message": res.error() }));
                } else {
                    self.timer = cx.timer(3000.0, self.sid, FOLLOW_T);
                }
            }
            LOGO => {
                if let Some(u) = res.json.get("page").and_then(|p| p.get("logo")).map(|l| s(l, "url")) {
                    self.logo = String::from(u);
                    cx.redraw();
                }
            }
            _ => {}
        }
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        if !self.alive {
            return;
        }
        match tag {
            FOLLOW_T => {
                let mut q = self.x.query();
                if !self.job.is_empty() {
                    q.push_str("&job=");
                    q.push_str(&self.job);
                }
                cx.get(&alloc::format!("/api/tv/play?{}", q), self.sid, FOLLOWED);
            }
            PAINT_T => {
                cx.redraw();
                self.paint = cx.timer(500.0, self.sid, PAINT_T);
            }
            _ => {}
        }
    }
    fn on_hidden(&mut self, _cx: &mut Cx) {}
    fn leave(&mut self, cx: &mut Cx) {
        self.stop(cx);
    }
}
