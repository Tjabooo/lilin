//! Live TV: the guide (channels down the screen, time across) and a channel on the TV's own player, like the
//! JavaScript app's liveScreen / livePlay. A channel plays in a Watch Together room on the server: the TV joins
//! it, follows the room's clock with heartbeats once a second and seeks back into step when it drifts (the TV
//! can't play a little faster), ahead by what a seek takes on this TV.
use crate::gfx::{hexa, rect, Rect};
use crate::host::{self, av};
use crate::logic::{self, Cue};
use crate::text::{body, display};
use crate::ui::{self, Ease};
use crate::util::{arr, b, f, i, id, s};
use crate::{key, t, Cx, Key, Nav, Res, Screen};
use alloc::boxed::Box;
use alloc::string::{String, ToString};
use alloc::vec::Vec;
use serde_json::{json, Value};

pub const CH_UP: i32 = 427;
pub const CH_DOWN: i32 = 428;
pub const PRE_CH: i32 = 10190;
const MIN: f64 = 60000.0;
const CLIENT_KEY: &str = "lilin:tv-client";

/// What Live TV keeps between the guide and the player.
#[derive(Default)]
pub struct LiveState {
    pub channels: Vec<Value>,
    /// The channel watched before this one (PRE-CH / Left goes back to it).
    pub last: String,
    /// The subtitle language on channels (kept across programmes and channels); None = not chosen yet.
    pub sub_lang: Option<String>,
}

// ---------- small helpers ----------
/// "21:05" in the TV's own time zone.
pub fn clock(ms: f64) -> String {
    let local = ms + host::tz_minutes() * MIN;
    let mins = libm::floor(local / MIN) as i64;
    let day = mins.rem_euclid(1440);
    alloc::format!("{}:{}", logic::pad2(day / 60), logic::pad2(day % 60))
}

pub fn channel_name(c: &Value, me: &str) -> String {
    let cid = s(c, "id");
    match s(c, "kind") {
        "auto" => String::from(match cid {
            "anime" => t!("Anime"),
            "sitcoms" => t!("Sitcoms"),
            "films" => t!("Films"),
            "docs" => t!("Documentaries"),
            "fresh" => t!("Fresh"),
            "drama" => t!("Drama"),
            "scifi" => t!("Sci-Fi & Fantasy"),
            "action" => t!("Action & Adventure"),
            other => other,
        }),
        "picks" => {
            if !me.is_empty() && cid == alloc::format!("picks-{}", me) {
                String::from(t!("Your picks"))
            } else {
                t!("{0}’s picks", String::from(s(c, "person")))
            }
        }
        _ => String::from(s(c, "name")),
    }
}

fn programme_line(p: &Value) -> String {
    if s(p, "kind") != "episode" {
        return String::new();
    }
    let ep = logic::episode_label(p);
    crate::util::join(&[&ep, s(p, "name")], " · ")
}

/// The channel `step` away from `cid` in the guide's order (round at the ends).
fn neighbour(channels: &[Value], cid: &str, step: isize) -> Option<String> {
    if channels.is_empty() {
        return None;
    }
    let n = channels.len() as isize;
    let at = channels.iter().position(|c| s(c, "id") == cid).unwrap_or(0) as isize;
    let j = ((at + step) % n + n) % n;
    Some(String::from(s(&channels[j as usize], "id")))
}

fn by_number(channels: &[Value], n: i64) -> Option<String> {
    channels.iter().find(|c| i(c, "number") == Some(n)).map(|c| String::from(s(c, "id")))
}

fn me_id(cx: &Cx) -> String {
    id(&cx.state.me, "id")
}

/// A digit on the remote (or a keyboard), if this key is one.
fn digit(k: &Key) -> Option<u32> {
    match k.raw {
        48..=57 => Some((k.raw - 48) as u32),
        96..=105 => Some((k.raw - 96) as u32),
        _ => k.ch.and_then(|c| c.to_digit(10)),
    }
}

/// This TV's id in a room: kept, so a restart rejoins as the same viewer.
fn tv_client() -> String {
    if let Some(v) = host::load(CLIENT_KEY) {
        let v = String::from(v.trim_matches('"'));
        if (16..=80).contains(&v.len()) && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return v;
        }
    }
    let seed = alloc::format!("{}|{}", host::epoch_ms(), host::time());
    let mut out = String::from("tv-");
    let mut x = ui::hash(&seed) ^ 0x9E37_79B9_7F4A_7C15;
    for _ in 0..20 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        out.push(b"abcdefghijklmnopqrstuvwxyz0123456789"[(x % 36) as usize] as char);
    }
    host::save(CLIENT_KEY, &alloc::format!("\"{}\"", out));
    out
}

fn live_dot(cx: &mut Cx, x: f32, y: f32) {
    let r = rect(x, y, 18.0, 18.0);
    cx.g.glow(r, 9.0, 18.0, hexa(0xFF5A4E, 0.6));
    cx.g.round(r, 9.0, hexa(0xFF5A4E, 1.0));
}

// ---------- the guide ----------
const GUIDE: u32 = 1;
const REFRESH_T: u32 = 10;
const DIGIT_T: u32 = 11;
const ROW_H: f32 = 100.0;
const ROW_GAP: f32 = 12.0;
const CHAN_W: f32 = 300.0;
const ROWS_Y: f32 = 230.0;
const VISIBLE: usize = 7;

pub struct Guide {
    sid: u32,
    focus: usize,
    want: Option<String>,
    from: f64,
    to: f64,
    loaded: bool,
    note: String,
    refresh_timer: u32,
    digits: String,
    digit_timer: u32,
    top: Ease,
}

impl Guide {
    pub fn new(cx: &mut Cx, focus_id: Option<String>) -> Guide {
        let sid = cx.sid();
        let mut g = Guide {
            sid,
            focus: 0,
            want: focus_id,
            from: 0.0,
            to: 0.0,
            loaded: false,
            note: String::from(t!("Loading…")),
            refresh_timer: 0,
            digits: String::new(),
            digit_timer: 0,
            top: Ease::at(0.0),
        };
        g.load(cx);
        g.refresh_timer = cx.timer(60000.0, sid, REFRESH_T);
        g
    }
    fn load(&mut self, cx: &mut Cx) {
        let now = host::epoch_ms();
        cx.get(&alloc::format!("/api/live?from={}&to={}", libm::floor(now - 15.0 * MIN) as i64, libm::floor(now + 150.0 * MIN) as i64), self.sid, GUIDE);
    }
    fn watch(&mut self, cx: &mut Cx, cid: String) {
        let p = LivePlayer::new(cx, cid);
        cx.push(Box::new(p));
    }
    fn x(&self, ms: f64, w: f32) -> f32 {
        if self.to <= self.from {
            return 0.0;
        }
        ((ms - self.from) / (self.to - self.from)) as f32 * w
    }
}

impl Screen for Guide {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn draw(&mut self, cx: &mut Cx) {
        ui::room(cx);
        let now = host::epoch_ms();
        // The bar: the live dot, the name and the clock.
        live_dot(cx, ui::EDGE, 82.0);
        let name = cx.state.live_name.clone();
        let name = if name.is_empty() { String::from("Lilin TV") } else { name };
        cx.tx.draw(&mut cx.g, display(46.0, 800).glow(), &name, ui::EDGE + 36.0, 60.0, ui::BULB);
        cx.tx.draw_right(&mut cx.g, display(40.0, 700), &clock(now), 1920.0 - ui::EDGE, 64.0, ui::PAPER);

        let channels = cx.state.live.channels.clone();
        let lane_x = ui::EDGE + CHAN_W;
        let lane_w = 1920.0 - ui::EDGE - lane_x;
        if self.loaded && !channels.is_empty() {
            // The time ruler, every half hour.
            let rf = body(24.0, 700);
            let mut t0 = libm::ceil(self.from / (30.0 * MIN)) * 30.0 * MIN;
            cx.g.push_clip(rect(lane_x, 150.0, lane_w, 900.0));
            while t0 < self.to {
                let tx = lane_x + self.x(t0, lane_w);
                cx.g.fill(rect(tx, 192.0, 2.0, 18.0), ui::LINE);
                cx.tx.draw(&mut cx.g, rf, &clock(t0), tx + 8.0, 172.0, ui::DUST);
                t0 += 30.0 * MIN;
            }
            cx.g.pop_clip();
            // Which rows are on screen: the focused one stays in view.
            let first = self.focus.saturating_sub(2).min(channels.len().saturating_sub(VISIBLE));
            self.top.set(first as f32 * (ROW_H + ROW_GAP));
            let top = self.top.step(cx, 14.0);
            let me = me_id(cx);
            cx.g.push_clip(rect(0.0, ROWS_Y - 8.0, 1920.0, 1000.0 - ROWS_Y));
            for (n, c) in channels.iter().enumerate() {
                let y = ROWS_Y + n as f32 * (ROW_H + ROW_GAP) - top;
                if y < ROWS_Y - ROW_H - 20.0 || y > 1000.0 {
                    continue;
                }
                let focused = n == self.focus;
                let cell = rect(ui::EDGE, y, CHAN_W - 16.0, ROW_H);
                cx.g.round(cell, 14.0, if focused { ui::SEAT } else { hexa(0x2B1724, 0.75) });
                if focused {
                    ui::focus_ring(cx, cell, 14.0, 1.0);
                }
                let num = i(c, "number").map(|x| x.to_string()).unwrap_or_default();
                let nf = display(36.0, 800);
                let nw = cx.tx.draw(&mut cx.g, nf, &num, cell.x + 20.0, y + (ROW_H - nf.line()) / 2.0 - 12.0, ui::BULB);
                let cname = channel_name(c, &me);
                cx.tx.draw_fit(&mut cx.g, body(26.0, 700), &cname, cell.x + 32.0 + nw, y + 18.0, cell.w - nw - 48.0, ui::PAPER);
                let others = arr(c, "faces").iter().filter(|x| s(x, "name") != s(&cx.state.me, "name")).count();
                if others > 0 {
                    cx.tx.draw_fit(&mut cx.g, body(21.0, 400), &t!("{0} watching", others.to_string()), cell.x + 32.0 + nw, y + 56.0, cell.w - nw - 48.0, ui::BULB);
                }
                for p in arr(c, "programmes") {
                    let (ps, pe) = (f(p, "s").unwrap_or(0.0), f(p, "e").unwrap_or(0.0));
                    let left = self.x(ps, lane_w).max(0.0);
                    let right = self.x(pe, lane_w).min(lane_w);
                    if right - left < 4.0 {
                        continue;
                    }
                    let r = rect(lane_x + left, y, right - left - 6.0, ROW_H);
                    let airing = ps <= now && now < pe;
                    let bg = if airing { hexa(0x3A2031, 0.95) } else { hexa(0x2B1724, 0.6) };
                    cx.g.round(r, 12.0, bg);
                    if airing && focused {
                        cx.g.ring(r, 12.0, 2.0, ui::BULB.alpha(0.7));
                    }
                    if r.w > 60.0 {
                        cx.g.push_clip(r);
                        cx.tx.draw_fit(&mut cx.g, body(25.0, 700), s(p, "title"), r.x + 16.0, y + 18.0, r.w - 28.0, ui::PAPER);
                        let line = programme_line(p);
                        let line = if line.is_empty() { alloc::format!("{}–{}", clock(ps), clock(pe)) } else { line };
                        cx.tx.draw_fit(&mut cx.g, body(21.0, 400), &line, r.x + 16.0, y + 56.0, r.w - 28.0, ui::DUST);
                        cx.g.pop_clip();
                    }
                }
            }
            cx.g.pop_clip();
            // Now.
            let nx = lane_x + self.x(now, lane_w);
            if nx >= lane_x && nx <= 1920.0 - ui::EDGE {
                cx.g.glow(rect(nx - 1.0, 196.0, 3.0, 790.0), 1.0, 10.0, ui::BULB.alpha(0.5));
                cx.g.fill(rect(nx - 1.0, 196.0, 3.0, 790.0), ui::BULB);
            }
        }
        cx.g.vgrad(rect(0.0, 1000.0, 1920.0, 80.0), &[(0.0, ui::DEEP.alpha(0.0)), (0.4, ui::DEEP)]);
        let note = if !self.digits.is_empty() { t!("Channel {0}…", self.digits.clone()) } else { self.note.clone() };
        cx.tx.draw(&mut cx.g, body(24.0, 400), &note, ui::EDGE, 1022.0, ui::DUST);
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        cx.redraw();
        if let Some(d) = digit(&k) {
            self.digits.push(char::from_digit(d, 10).unwrap_or('0'));
            if self.digits.len() > 3 {
                self.digits.remove(0);
            }
            cx.cancel(self.digit_timer);
            self.digit_timer = cx.timer(1100.0, self.sid, DIGIT_T);
            return true;
        }
        let n = cx.state.live.channels.len();
        match k.code {
            key::UP | CH_UP => self.focus = self.focus.saturating_sub(1),
            key::DOWN | CH_DOWN => {
                if n > 0 {
                    self.focus = (self.focus + 1).min(n - 1);
                }
            }
            key::ENTER => {
                if let Some(cid) = cx.state.live.channels.get(self.focus).map(|c| String::from(s(c, "id"))) {
                    self.watch(cx, cid);
                }
            }
            key::LEFT | key::RIGHT => {}
            _ => return false,
        }
        true
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        if tag != GUIDE {
            return;
        }
        if !res.ok() {
            self.note = res.error();
            cx.redraw();
            return;
        }
        cx.state.live.channels = arr(&res.json, "channels").to_vec();
        let name = s(&res.json, "name");
        if !name.is_empty() {
            cx.state.live_name = String::from(name);
        }
        self.from = f(&res.json, "from").unwrap_or(0.0);
        self.to = f(&res.json, "to").unwrap_or(0.0).min(self.from + 165.0 * MIN);
        if let Some(w) = self.want.take() {
            if let Some(p) = cx.state.live.channels.iter().position(|c| s(c, "id") == w) {
                self.focus = p;
            }
        }
        self.focus = self.focus.min(cx.state.live.channels.len().saturating_sub(1));
        self.loaded = true;
        self.note = String::from(if cx.state.live.channels.is_empty() {
            t!("No channels yet. They fill themselves from the library.")
        } else {
            t!("Up / Down: channel · OK: watch · numbers: go to a channel")
        });
        cx.redraw();
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        match tag {
            REFRESH_T => {
                if cx.top == self.sid {
                    self.load(cx);
                }
                self.refresh_timer = cx.timer(60000.0, self.sid, REFRESH_T);
            }
            DIGIT_T => {
                let want: i64 = self.digits.parse().unwrap_or(-1);
                self.digits.clear();
                match by_number(&cx.state.live.channels, want) {
                    Some(cid) => self.watch(cx, cid),
                    None => cx.toast(t!("There’s no channel with that number.")),
                }
                cx.redraw();
            }
            _ => {}
        }
    }
    fn refresh(&mut self, cx: &mut Cx) {
        // Back from a channel: the guide follows to the channel you were last on.
        if let Some(p) = cx.state.live.channels.iter().position(|c| s(c, "id") == cx.state.live.last) {
            if !cx.state.live.last.is_empty() {
                self.focus = p;
            }
        }
        self.load(cx);
    }
    fn leave(&mut self, cx: &mut Cx) {
        cx.cancel(self.refresh_timer);
        cx.cancel(self.digit_timer);
    }
}

// ---------- a channel on the player ----------
const CLOCK: u32 = 1;
const TUNE: u32 = 2;
const BEAT: u32 = 3;
const LIST: u32 = 4;
const MENU_LANGS: u32 = 5;
// These carry the programme's number above the low byte, so an answer for an earlier programme is dropped.
const LINK: u32 = 16;
const PREF_LANGS: u32 = 17;
const SUB_FETCH: u32 = 18;
const SUB_FILE: u32 = 19;

const BEAT_T: u32 = 30;
const TICK_T: u32 = 31;
const BANNER_T: u32 = 32;
const DIGITS_T: u32 = 33;

struct Item {
    head: bool,
    label: String,
    on: bool,
    code: String,
}

pub struct LivePlayer {
    sid: u32,
    id: String,
    client: String,
    room: Value,
    media_id: String,
    gen: u32,
    closed: bool,
    offset: f64,
    samples: Vec<(f64, f64)>,
    sent_at: f64,
    beat_busy: bool,
    opening: bool,
    seek_t0: f64,
    seeked_at: f64,
    lead: f64,
    pos: f64,
    cues: Vec<Cue>,
    banner: bool,
    banner_stay: bool,
    fade: Ease,
    spinner: Option<String>,
    failed: bool,
    digits: String,
    menu: Option<Vec<Item>>,
    menu_i: usize,
    timers: [u32; 4],
    sig: String,
    /// livechat: the channel's chat, read-only on the TV (name, text, shown at). It rides on the heartbeat
    /// (src/watch.js chatAfter); Down -> Chat turns it off on this TV (public/tv/tv.js does the same).
    chat: Vec<(String, String, f64)>,
    chat_after: f64,
    chat_on: bool,
}

impl LivePlayer {
    pub fn new(cx: &mut Cx, cid: String) -> LivePlayer {
        let sid = cx.sid();
        if cx.state.live.sub_lang.is_none() {
            cx.state.live.sub_lang = Some(String::from(cx.state.setting("subLang")));
        }
        let mut p = LivePlayer {
            sid,
            id: cid,
            client: tv_client(),
            room: Value::Null,
            media_id: String::new(),
            gen: 0,
            closed: false,
            offset: 0.0,
            samples: Vec::new(),
            sent_at: 0.0,
            beat_busy: false,
            opening: false,
            seek_t0: 0.0,
            seeked_at: 0.0,
            lead: 0.25,
            pos: 0.0,
            cues: Vec::new(),
            banner: false,
            banner_stay: false,
            fade: Ease::at(0.0),
            spinner: Some(String::from(t!("Tuning in…"))),
            failed: false,
            digits: String::new(),
            menu: None,
            menu_i: 0,
            timers: [0; 4],
            sig: String::new(),
            chat: Vec::new(),
            chat_after: 0.0,
            chat_on: host::load("lilin:tv-chat").map(|v| v != "false").unwrap_or(true),
        };
        if !av::ok() {
            p.spinner = Some(String::from(t!("This TV can’t play videos from here.")));
            p.failed = true;
            return p;
        }
        if cx.state.live.channels.is_empty() {
            let now = host::epoch_ms();
            cx.get(&alloc::format!("/api/live?from={}&to={}", libm::floor(now - 15.0 * MIN) as i64, libm::floor(now + 150.0 * MIN) as i64), sid, LIST);
        }
        // The server's clock first (three round trips), then tune in.
        p.sent_at = host::epoch_ms();
        cx.get("/api/watch/clock", sid, CLOCK);
        p
    }
    fn server_now(&self) -> f64 {
        host::epoch_ms() + self.offset
    }
    fn add_sample(&mut self, start: f64, server: f64) {
        let end = host::epoch_ms();
        self.samples.push((end - start, server - (start + end) / 2.0));
        if self.samples.len() > 10 {
            self.samples.remove(0);
        }
        // The offset of the quickest round trip.
        if let Some(best) = self.samples.iter().fold(None, |best: Option<(f64, f64)>, x| match best {
            Some(b) if b.0 <= x.0 => Some(b),
            _ => Some(*x),
        }) {
            self.offset = best.1;
        }
    }
    /// Where the channel is now, in its video's seconds.
    fn target(&self) -> f64 {
        let r = &self.room;
        let position = f(r, "position").unwrap_or(0.0);
        if !b(r, "playing") {
            return position;
        }
        position + (self.server_now() - f(r, "at").unwrap_or(0.0)).max(0.0) / 1000.0
    }
    fn token(&self) -> String {
        String::from(s(&self.room, "token"))
    }
    fn tune(&mut self, cx: &mut Cx) {
        let path = alloc::format!("/api/live/{}/tune", crate::util::enc(&self.id));
        cx.post(&path, json!({ "clientId": self.client }), self.sid, TUNE);
    }
    fn show_banner(&mut self, cx: &mut Cx, stay: bool) {
        self.banner = true;
        self.banner_stay = stay;
        cx.cancel(self.timers[2]);
        if !stay {
            self.timers[2] = cx.timer(5000.0, self.sid, BANNER_T);
        }
        cx.redraw();
    }
    fn receive(&mut self, cx: &mut Cx, room: Value) {
        if self.closed {
            return;
        }
        let first = self.room.is_null();
        if !first && i(&room, "revision").unwrap_or(0) < i(&self.room, "revision").unwrap_or(0) {
            return;
        }
        let was_now = self.room.get("live").and_then(|l| l.get("now")).and_then(|n| f(n, "s"));
        self.room = room;
        let media = self.room.get("media").map(|m| id(m, "id")).unwrap_or_default();
        if first || media != self.media_id {
            self.open_media(cx);
            let off_air = media.is_empty();
            self.show_banner(cx, off_air);
        } else if was_now != self.room.get("live").and_then(|l| l.get("now")).and_then(|n| f(n, "s")) {
            self.show_banner(cx, false);
        }
    }
    /// A new programme (or the first): open its video at the live moment.
    fn open_media(&mut self, cx: &mut Cx) {
        self.media_id = self.room.get("media").map(|m| id(m, "id")).unwrap_or_default();
        self.gen = (self.gen + 1) & 0xff_ffff;
        av::close();
        self.cues.clear();
        self.opening = false;
        self.failed = false;
        if self.media_id.is_empty() {
            self.spinner = None;
            return;
        }
        let lang = cx.state.live.sub_lang.clone().unwrap_or_default();
        if !lang.is_empty() {
            cx.get(&alloc::format!("/api/subs/langs?kind=lib&id={}", crate::util::enc(&self.media_id)), self.sid, PREF_LANGS | (self.gen << 8));
        }
        self.spinner = Some(String::from(t!("Tuning in…")));
        self.opening = true;
        cx.get(&alloc::format!("/api/play-link?kind=lib&id={}&variant=browser-hevc", crate::util::enc(&self.media_id)), self.sid, LINK | (self.gen << 8));
    }
    /// Back into step when the picture is too far off.
    fn correct(&mut self) {
        if self.opening || self.media_id.is_empty() || host::time() - self.seeked_at < 5000.0 {
            return;
        }
        let ms = av::time_ms();
        if ms < 0.0 {
            return;
        }
        let target = self.target();
        if libm::fabs(target - ms / 1000.0) > 0.6 {
            self.seeked_at = host::time();
            self.seek_t0 = self.seeked_at;
            av::seek(libm::floor((target + self.lead) * 1000.0));
        }
    }
    fn add_chat(&mut self, cx: &mut Cx, room: &Value) {
        let now = host::epoch_ms();
        let before = self.chat.len();
        for c in arr(room, "chat") {
            let id = f(c, "id").unwrap_or(0.0);
            self.chat_after = self.chat_after.max(id);
            // old news when tuning in
            if !self.chat_on || now + self.offset - f(c, "at").unwrap_or(0.0) > 120_000.0 {
                continue;
            }
            self.chat.push((String::from(s(c, "name")), String::from(s(c, "text")), now));
        }
        self.chat.retain(|m| now - m.2 < 15_600.0);
        while self.chat.len() > 4 {
            self.chat.remove(0);
        }
        if self.chat.len() != before || !self.chat.is_empty() {
            cx.redraw();
        }
    }
    fn draw_chat(&mut self, cx: &mut Cx) {
        if self.chat.is_empty() {
            return;
        }
        let now = host::epoch_ms();
        let fnt = body(26.0, 400);
        let bold = body(26.0, 700);
        let w = 560.0;
        let mut y = 1080.0 - 220.0;
        for (name, text, at) in self.chat.clone().iter().rev() {
            let age = now - at;
            let a = if age > 15_000.0 { (1.0 - (age - 15_000.0) / 600.0).max(0.0) as f32 } else { 1.0 };
            if a <= 0.0 {
                continue;
            }
            let lines = cx.tx.wrap(fnt, &alloc::format!("{} {}", name, text), w - 44.0, 3);
            let h = lines.len() as f32 * 34.0 + 28.0;
            y -= h;
            let r = rect(1920.0 - ui::EDGE - w, y, w, h);
            cx.g.push_alpha(a);
            cx.g.round(r, 20.0, hexa(0x1F1019, 0.82));
            let nw = cx.tx.draw(&mut cx.g, bold, name, r.x + 22.0, r.y + 14.0, ui::BULB);
            for (n, l) in lines.iter().enumerate() {
                // The name is drawn in gold over the first line's start; the rest of that line follows it.
                let l = if n == 0 { l.get(name.len()..).unwrap_or("").trim_start() } else { l.as_str() };
                let x = if n == 0 { r.x + 22.0 + nw + 8.0 } else { r.x + 22.0 };
                cx.tx.draw(&mut cx.g, fnt, l, x, r.y + 14.0 + n as f32 * 34.0, ui::PAPER);
            }
            cx.g.pop_alpha();
            y -= 12.0;
        }
        if self.chat.iter().any(|m| now - m.2 > 15_000.0) {
            cx.moving = true; // one fading out
        }
    }
    fn heartbeat(&mut self, cx: &mut Cx) {
        if self.closed || self.room.is_null() || self.beat_busy {
            return;
        }
        self.beat_busy = true;
        self.sent_at = host::epoch_ms();
        let rtt = self.samples.first().map(|x| x.0).unwrap_or(0.0);
        let body = json!({ "clientId": self.client, "ready": !self.opening, "buffering": false, "blocked": false, "rtt": rtt, "chatAfter": self.chat_after });
        cx.post(&alloc::format!("/api/watch/{}/heartbeat", self.token()), body, self.sid, BEAT);
    }
    fn close(&mut self, cx: &mut Cx) {
        if self.closed {
            return;
        }
        self.closed = true;
        for t in self.timers {
            cx.cancel(t);
        }
        av::close();
        if !self.room.is_null() {
            cx.post_quiet(&alloc::format!("/api/watch/{}/leave", self.token()), json!({ "clientId": self.client }));
        }
    }
    fn surf_to(&mut self, cx: &mut Cx, next: Option<String>) {
        let Some(next) = next else { return };
        if next == self.id {
            return;
        }
        cx.state.live.last = self.id.clone();
        self.close(cx);
        let p = LivePlayer::new(cx, next);
        cx.nav.push(Nav::Replace(Box::new(p)));
    }
    fn set_subs(&mut self, cx: &mut Cx, lang: &str) {
        cx.state.live.sub_lang = Some(String::from(lang));
        self.cues.clear();
        if lang.is_empty() || self.media_id.is_empty() {
            return;
        }
        cx.post("/api/subs/fetch", json!({ "kind": "lib", "id": self.media_id, "lang": lang }), self.sid, SUB_FETCH | (self.gen << 8));
    }
    fn menu_move(&mut self, d: isize) {
        let Some(items) = &self.menu else { return };
        let mut k = self.menu_i as isize;
        loop {
            k += d;
            if k < 0 || k as usize >= items.len() {
                return;
            }
            if !items[k as usize].head {
                break;
            }
        }
        self.menu_i = k as usize;
    }
    fn signature(&self) -> String {
        let sub = if self.cues.is_empty() { String::new() } else { logic::cue_text(&self.cues, self.pos) };
        let minute = libm::floor(host::epoch_ms() / 20000.0) as i64; // the banner's clock and bar move a little
        alloc::format!("{}|{}|{}", sub, if self.banner { minute } else { 0 }, self.spinner.is_some())
    }
    fn draw_banner(&mut self, cx: &mut Cx, o: f32) {
        cx.g.push_alpha(o);
        cx.g.vgrad(rect(0.0, 1080.0 - 400.0, 1920.0, 400.0), &[(0.0, hexa(0x0A0508, 0.0)), (0.45, hexa(0x0A0508, 0.72)), (1.0, hexa(0x0A0508, 0.93))]);
        let info = self.room.get("live").cloned().unwrap_or(Value::Null);
        let chan = info.get("channel").cloned().or_else(|| cx.state.live.channels.iter().find(|c| s(c, "id") == self.id).cloned()).unwrap_or(Value::Null);
        let me = me_id(cx);
        let y = 1080.0 - 300.0;
        // LIVE, the channel and the clock.
        let pf = body(22.0, 800);
        let pw = ui::pill_w(cx, t!("Live"), pf, 16.0, 0.0);
        let pr = rect(ui::EDGE, y + 6.0, pw, 40.0);
        cx.g.pill(pr, hexa(0xFF5A4E, 0.95));
        cx.tx.draw_center(&mut cx.g, pf, &t!("Live").to_uppercase(), pr.x + pw / 2.0, pr.y + (40.0 - pf.line()) / 2.0, ui::WHITE);
        let num = i(&chan, "number").map(|n| alloc::format!("{}  ", n)).unwrap_or_default();
        let cf = display(36.0, 800);
        let cw = cx.tx.draw(&mut cx.g, cf, &alloc::format!("{}{}", num, channel_name(&chan, &me)), pr.r() + 20.0, y, ui::PAPER);
        let others = arr(&self.room, "members").iter().filter(|m| s(m, "id") != self.client).count();
        if others > 0 {
            cx.tx.draw(&mut cx.g, body(24.0, 400), &t!("{0} watching", (others + 1).to_string()), pr.r() + 44.0 + cw, y + 10.0, ui::BULB);
        }
        cx.tx.draw_right(&mut cx.g, display(36.0, 700), &clock(host::epoch_ms()), 1920.0 - ui::EDGE, y, ui::PAPER);
        let ty = y + 70.0;
        let now = info.get("now").filter(|n| !n.is_null());
        let next = info.get("next").filter(|n| !n.is_null());
        match now {
            Some(now) => {
                let tf = display(44.0, 700);
                let w = cx.tx.draw_fit(&mut cx.g, tf, s(now, "title"), ui::EDGE, ty, 1100.0, ui::PAPER);
                let line = programme_line(now);
                if !line.is_empty() {
                    cx.tx.draw_fit(&mut cx.g, tf, &alloc::format!("  · {}", line), ui::EDGE + w, ty, 1728.0 - w - 10.0, ui::DUST);
                }
                let (ns, ne) = (f(now, "s").unwrap_or(0.0), f(now, "e").unwrap_or(1.0));
                let p = ((self.server_now() - ns) / (ne - ns).max(1.0)) as f32;
                let by = ty + tf.line() + 22.0;
                ui::bar(cx, rect(ui::EDGE, by, 1920.0 - 2.0 * ui::EDGE, 10.0), Some(p), hexa(0xF6EADF, 0.22));
                let mut times = alloc::format!("{}–{}", clock(ns), clock(ne));
                if let Some(nx) = next {
                    times.push_str("   ");
                    times.push_str(&t!("Next: {0} at {1}", String::from(s(nx, "title")), clock(f(nx, "s").unwrap_or(0.0))));
                }
                let hf = body(26.0, 400);
                cx.tx.draw_fit(&mut cx.g, hf, &times, ui::EDGE, by + 28.0, 1300.0, ui::DUST);
                cx.tx.draw_right(&mut cx.g, body(22.0, 400), t!("Right: subtitles"), 1920.0 - ui::EDGE, by + 32.0, ui::DUST.alpha(0.8));
            }
            None => {
                let line = match next {
                    Some(nx) => t!("Off air. {0} starts at {1}.", String::from(s(nx, "title")), clock(f(nx, "s").unwrap_or(0.0))),
                    None => String::from(t!("Off air for a moment.")),
                };
                cx.tx.draw_fit(&mut cx.g, display(44.0, 700), &line, ui::EDGE, ty, 1728.0, ui::PAPER);
            }
        }
        cx.g.pop_alpha();
    }
}

impl Screen for LivePlayer {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn video(&self) -> bool {
        true
    }
    fn draw(&mut self, cx: &mut Cx) {
        self.fade.set(if self.banner || self.menu.is_some() { 1.0 } else { 0.0 });
        let o = self.fade.step01(cx, 12.0);
        if o > 0.0 && self.menu.is_none() {
            self.draw_banner(cx, o);
        }
        if self.menu.is_none() {
            self.draw_chat(cx);
        }
        // Subtitles
        if !self.cues.is_empty() && !self.opening {
            let text = logic::cue_text(&self.cues, self.pos);
            if !text.is_empty() {
                let fnt = body(52.0, 700).dark();
                let lines = cx.tx.wrap(fnt, &text, 1600.0, 4);
                let lh = 65.0;
                let bottom = 1080.0 - if o > 0.5 && self.menu.is_none() { 330.0 } else { 90.0 };
                let mut y = bottom - lines.len() as f32 * lh;
                for l in &lines {
                    cx.tx.draw_center(&mut cx.g, fnt, l, 960.0, y, ui::WHITE);
                    y += lh;
                }
            }
        }
        // A channel number being typed.
        if !self.digits.is_empty() {
            let df = display(96.0, 800).glow();
            cx.tx.draw_right(&mut cx.g, df, &self.digits.clone(), 1920.0 - ui::EDGE, 70.0, ui::BULB);
        }
        // Subtitles menu
        if let Some(items) = &self.menu {
            let h = (48.0 + items.iter().map(|m| if m.head { 52.0 } else { 62.0 }).sum::<f32>()).min(760.0);
            let r: Rect = rect(1920.0 - ui::EDGE - 580.0, 120.0, 580.0, h);
            let labels: Vec<(bool, String, bool)> = items.iter().map(|m| (m.head, m.label.clone(), m.on)).collect();
            let sel = self.menu_i;
            ui::panel(cx, r, 28.0, hexa(0x1C1018, 0.97));
            cx.g.push_clip(r);
            let mut y = r.y + 24.0;
            let before: f32 = labels.iter().take(sel).map(|it| if it.0 { 52.0 } else { 62.0 }).sum();
            if before > h - 160.0 {
                y -= before - (h - 160.0);
            }
            for (k, (head, label, on)) in labels.iter().enumerate() {
                if *head {
                    cx.tx.draw(&mut cx.g, body(22.0, 700), &label.to_uppercase(), r.x + 32.0, y + 14.0, ui::DUST);
                    y += 52.0;
                    continue;
                }
                let ir = rect(r.x + 24.0, y, r.w - 48.0, 58.0);
                if k == sel {
                    cx.g.round(ir, 12.0, ui::SEAT);
                    cx.g.ring(ir, 12.0, 3.0, ui::BULB);
                }
                let lf = body(30.0, 400);
                cx.tx.draw_fit(&mut cx.g, lf, label, ir.x + 20.0, ir.y + (58.0 - lf.line()) / 2.0, ir.w - 70.0, ui::PAPER);
                if *on {
                    let dot = rect(ir.r() - 34.0, ir.y + 22.0, 14.0, 14.0);
                    cx.g.glow(dot, 7.0, 12.0, ui::BULB.alpha(0.8));
                    cx.g.round(dot, 7.0, ui::BULB);
                }
                y += 62.0;
            }
            cx.g.pop_clip();
        }
        // Tuning in / errors
        if let Some(sp) = self.spinner.clone() {
            let fnt = body(32.0, 400);
            let lines = cx.tx.wrap(fnt, &sp, 1100.0, 3);
            let w = lines.iter().map(|l| cx.tx.width(fnt, l)).fold(0.0f32, f32::max) + 72.0;
            let h = lines.len() as f32 * 42.0 + 40.0 + if self.failed { 0.0 } else { 40.0 };
            let r = rect(960.0 - w / 2.0, 540.0 - h / 2.0, w, h);
            cx.g.round(r, 14.0, hexa(0x140A10, 0.85));
            for (n, l) in lines.iter().enumerate() {
                cx.tx.draw_center(&mut cx.g, fnt, l, 960.0, r.y + 20.0 + n as f32 * 42.0, if self.failed { ui::ALERT } else { ui::PAPER });
            }
            if !self.failed {
                for k in 0..3 {
                    let ph = ((cx.now / 420.0) as f32 - k as f32 * 0.6) % 3.0;
                    let lit = if ph < 1.0 { 0.35 + 0.65 * libm::sinf(ph * core::f32::consts::PI) } else { 0.35 };
                    let d = rect(960.0 - 40.0 + k as f32 * 34.0 - 6.0, r.b() - 34.0, 12.0, 12.0);
                    cx.g.round(d, 6.0, ui::BULB.alpha(lit));
                }
                cx.ambient = true;
            }
        }
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        cx.redraw();
        if self.menu.is_some() {
            match k.code {
                key::UP => self.menu_move(-1),
                key::DOWN => self.menu_move(1),
                key::ENTER => {
                    let pick = self.menu.as_ref().and_then(|m| m.get(self.menu_i)).map(|it| (it.code.clone(), it.label.clone()));
                    self.menu = None;
                    if let Some((code, label)) = pick {
                        if let Some(c) = code.strip_prefix("chat:") {
                            self.chat_on = c == "on";
                            host::save("lilin:tv-chat", if self.chat_on { "true" } else { "false" });
                            if !self.chat_on {
                                self.chat.clear();
                            }
                            return true;
                        }
                        if !code.is_empty() {
                            cx.toast(&t!("Getting {0} subtitles…", label));
                        }
                        self.set_subs(cx, &code);
                    }
                }
                _ => self.menu = None,
            }
            return true;
        }
        if let Some(d) = digit(&k) {
            self.digits.push(char::from_digit(d, 10).unwrap_or('0'));
            if self.digits.len() > 3 {
                self.digits.remove(0);
            }
            cx.cancel(self.timers[3]);
            self.timers[3] = cx.timer(1100.0, self.sid, DIGITS_T);
            return true;
        }
        match k.code {
            key::UP | CH_UP => {
                let n = neighbour(&cx.state.live.channels, &self.id, -1);
                self.surf_to(cx, n);
            }
            key::DOWN | CH_DOWN => {
                let n = neighbour(&cx.state.live.channels, &self.id, 1);
                self.surf_to(cx, n);
            }
            PRE_CH | key::LEFT => {
                let last = cx.state.live.last.clone();
                if !last.is_empty() {
                    self.surf_to(cx, Some(last));
                }
            }
            key::RIGHT => {
                if self.media_id.is_empty() {
                    self.show_banner(cx, false);
                } else {
                    cx.get(&alloc::format!("/api/subs/langs?kind=lib&id={}", crate::util::enc(&self.media_id)), self.sid, MENU_LANGS);
                }
            }
            key::ENTER => self.show_banner(cx, false),
            key::PLAYPAUSE | key::PAUSE | key::PLAY | key::FF | key::RW => cx.toast(t!("This is live TV, so it keeps playing.")),
            key::BACK | key::STOP => {
                self.close(cx);
                cx.back();
            }
            _ => {}
        }
        true
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        if self.closed {
            return;
        }
        let base = tag & 0xff;
        if base >= 16 && tag >> 8 != self.gen {
            return; // for an earlier programme
        }
        match base {
            CLOCK => {
                if res.ok() {
                    if let Some(sn) = f(&res.json, "serverNow") {
                        let start = self.sent_at;
                        self.add_sample(start, sn);
                    }
                }
                if res.ok() && self.samples.len() < 3 {
                    self.sent_at = host::epoch_ms();
                    cx.get("/api/watch/clock", self.sid, CLOCK);
                } else {
                    self.tune(cx);
                }
            }
            TUNE => {
                if !res.ok() {
                    self.spinner = Some(res.error());
                    self.failed = true;
                    cx.redraw();
                    return;
                }
                self.room = Value::Null;
                self.receive(cx, res.json);
                if self.timers[0] == 0 {
                    self.timers[0] = cx.timer(1000.0, self.sid, BEAT_T);
                    self.timers[1] = cx.timer(250.0, self.sid, TICK_T);
                }
            }
            BEAT => {
                self.beat_busy = false;
                if res.ok() {
                    if let Some(sn) = f(&res.json, "serverNow") {
                        let start = self.sent_at;
                        self.add_sample(start, sn);
                    }
                    self.add_chat(cx, &res.json);
                    self.receive(cx, res.json);
                    self.correct();
                } else if res.status == 403 || res.status == 410 {
                    self.tune(cx);
                }
            }
            LIST => {
                if res.ok() {
                    cx.state.live.channels = arr(&res.json, "channels").to_vec();
                }
            }
            MENU_LANGS => {
                let cur = cx.state.live.sub_lang.clone().unwrap_or_default();
                let mut items = alloc::vec![
                    Item { head: true, label: String::from(t!("Subtitles")), on: false, code: String::new() },
                    Item { head: false, label: String::from(t!("Off")), on: cur.is_empty(), code: String::new() },
                ];
                for l in arr(&res.json, "languages") {
                    let code = String::from(s(l, "code"));
                    items.push(Item { head: false, label: String::from(s(l, "name")), on: cur == code, code });
                }
                self.menu_i = items.iter().position(|m| m.on && !m.head).unwrap_or(1);
                items.push(Item { head: true, label: String::from(t!("Chat")), on: false, code: String::new() });
                items.push(Item { head: false, label: String::from(t!("Show messages")), on: self.chat_on, code: String::from("chat:on") });
                items.push(Item { head: false, label: String::from(t!("Off")), on: !self.chat_on, code: String::from("chat:off") });
                self.banner = false;
                self.menu = Some(items);
            }
            LINK => {
                if !res.ok() {
                    self.opening = false;
                    self.spinner = Some(res.error());
                    self.failed = true;
                    cx.redraw();
                    return;
                }
                let url = alloc::format!("{}{}", cx.server, s(&res.json, "url"));
                if !av::open(&url) {
                    self.opening = false;
                    self.failed = true;
                    self.spinner = Some(String::from(t!("This video can’t play on the TV.")));
                }
            }
            PREF_LANGS => {
                // This programme doesn't have that language: stay quiet, the next one may.
                let lang = cx.state.live.sub_lang.clone().unwrap_or_default();
                if !lang.is_empty() && arr(&res.json, "languages").iter().any(|l| s(l, "code") == lang) {
                    self.set_subs(cx, &lang);
                }
            }
            SUB_FETCH => {
                if res.ok() {
                    let url = alloc::format!("{}{}", cx.server, s(&res.json, "url"));
                    cx.get(&url, self.sid, SUB_FILE | (self.gen << 8));
                } else {
                    cx.toast(&t!("Couldn’t get those subtitles: {0}", res.error()));
                }
            }
            SUB_FILE => {
                if res.ok() {
                    self.cues = logic::parse_vtt(&res.body);
                }
            }
            _ => {}
        }
        cx.redraw();
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        if self.closed {
            return;
        }
        match tag {
            BEAT_T => {
                self.heartbeat(cx);
                self.timers[0] = cx.timer(1000.0, self.sid, BEAT_T);
            }
            TICK_T => {
                let ms = av::time_ms();
                if ms >= 0.0 {
                    self.pos = ms / 1000.0;
                }
                let sig = self.signature();
                if sig != self.sig {
                    self.sig = sig;
                    cx.redraw();
                }
                self.timers[1] = cx.timer(250.0, self.sid, TICK_T);
            }
            BANNER_T => {
                if !self.banner_stay {
                    self.banner = false;
                    cx.redraw();
                }
            }
            DIGITS_T => {
                let want: i64 = self.digits.parse().unwrap_or(-1);
                self.digits.clear();
                match by_number(&cx.state.live.channels, want) {
                    Some(cid) => self.surf_to(cx, Some(cid)),
                    None => {
                        cx.toast(t!("There’s no channel with that number."));
                        self.show_banner(cx, false);
                    }
                }
                cx.redraw();
            }
            _ => {}
        }
    }
    fn on_av(&mut self, cx: &mut Cx, kind: i32, value: f64, text: &str) {
        if self.closed {
            return;
        }
        match kind {
            1 => {
                if !self.opening {
                    self.spinner = Some(String::from(t!("Loading…")));
                }
            }
            2 => {
                if !self.opening && !self.failed {
                    self.spinner = None;
                }
            }
            3 => {
                self.pos = value / 1000.0;
                return;
            }
            5 | 7 => {
                self.opening = false;
                self.failed = true;
                self.spinner = Some(alloc::format!("{} {}", t!("This video can’t play on the TV."), text));
            }
            6 => {
                // The video took a moment to open: seek to where the channel is now, ahead by what the last seek took.
                self.seek_t0 = host::time();
                if !av::seek(libm::floor((self.target() + self.lead) * 1000.0)) {
                    av::play();
                    self.opening = false;
                    self.spinner = None;
                }
            }
            8 => {
                self.lead = ((host::time() - self.seek_t0) / 1000.0).min(3.0);
                if self.opening {
                    av::play();
                    self.opening = false;
                    self.seeked_at = host::time();
                    self.spinner = None;
                }
            }
            9 => {
                if self.opening {
                    av::play();
                    self.opening = false;
                    self.spinner = None;
                }
            }
            _ => {}
        }
        cx.redraw();
    }
    fn on_hidden(&mut self, cx: &mut Cx) {
        self.close(cx);
        cx.back();
    }
    fn leave(&mut self, cx: &mut Cx) {
        self.close(cx);
    }
}
