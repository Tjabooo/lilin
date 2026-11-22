//! A film's or show's page from Discover or Search. Play first: Play is the one gold button; yours plays, anything
//! else gets ready (ready.rs, src/tv-play.js on the server). Downloads are started on the website, not here.
use super::browse::{self, Mine};
use crate::gfx::{hexa, rect};
use crate::logic::Pending;
use crate::text::{body, display};
use crate::ui::{self, Lit};
use crate::util::{arr, b, f, id, s, year};
use crate::{key, t, Cx, Key, Res, Screen};
use alloc::boxed::Box;
use alloc::string::String;
use alloc::vec::Vec;
use serde_json::Value;

const LOGO: u32 = 1;
const SEASONS: u32 = 3;
const FOLLOW_T: u32 = 7;
const FOLLOWED: u32 = 8;
const COPIES: u32 = 9;
const EP_T: u32 = 10;
/// A season's episodes come back tagged EPS + its number.
const EPS: u32 = 1000;
const EP_STEP: f32 = 400.0 + browse::CARD_GAP;

/// Where the remote is on the page: the hero (seasons, buttons) or one of the rows under it.
#[derive(Clone, Copy, PartialEq)]
enum Zone {
    Hero,
    /// A show: the chosen season's episodes, in a row under the season chips.
    Episodes,
    Cast,
    Similar,
}
/// Someone in the cast: name, part, photo.
struct Person {
    name: String,
    part: String,
    photo: String,
}
const PAGE_X: f32 = 128.0;
const FACE: f32 = 156.0;
const FACE_STEP: f32 = 212.0;

#[derive(Clone, Copy, PartialEq)]
enum Do {
    Play,
    Soon,
    Mine,
}

pub struct TitleScreen {
    sid: u32,
    t: Value,
    tv: bool,
    tid: String,
    mine: Option<Mine>,
    logo: String,
    cast: Vec<Person>,
    similar: Vec<browse::Card>,
    facts: Vec<String>,
    tagline: String,
    /// A film's scene during or after the credits (crate::stinger): one quiet line under the facts.
    stinger: u8,
    zone: Zone,
    ci: usize,
    mi: usize,
    scroll: ui::Ease,
    cast_x: ui::Ease,
    sim_x: ui::Ease,
    /// Where the rows start on the page, before scrolling (set while drawing).
    cast_top: f32,
    sim_top: f32,
    seasons: Vec<Value>,
    seasons_note: String,
    seasons_err: bool,
    si: usize,
    at_seasons: bool,
    actions: Vec<Do>,
    ai: usize,
    status: String,
    status_err: bool,
    on_way: Option<Pending>,
    alive: bool,
    follow: u32,
    lit: Lit,
    chip_scroll: ui::Ease,
    /// copy-check (src/copy-check.js): "cam" = only cinema recordings so far, "soon" = not out to stream yet.
    copies: String,
    /// A show's episodes by season number (TMDB, /api/tv/:id/season/:n), fetched once the remote rests on a season.
    eps: Vec<(i64, Vec<Value>)>,
    ei: usize,
    ep_x: ui::Ease,
    ep_top: f32,
    ep_timer: u32,
    /// Episodes you have here (season, episode, file): they play straight away with Resume.
    lib_eps: Vec<(i64, i64, Value)>,
    /// Where you are in the show (your copy), as season and episode numbers.
    start: Option<(i64, i64)>,
}

/// Today as YYYY-MM-DD (UTC), for telling aired episodes from coming ones.
fn today() -> String {
    let days = libm::floor(crate::host::epoch_ms() / 86_400_000.0) as i64;
    // Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    alloc::format!("{:04}-{:02}-{:02}", y, m, d)
}
fn not_out(e: &Value, today: &str) -> bool {
    let d = s(e, "airDate");
    d.is_empty() || d > today
}


impl TitleScreen {
    pub fn new(cx: &mut Cx, t: Value) -> TitleScreen {
        let sid = cx.sid();
        let ty = String::from(s(&t, "type"));
        let tv = ty == "tv";
        let tid = id(&t, "id");
        let mine = browse::library_entry(cx, &ty, &tid);
        let on_way = browse::pending_for(cx, &ty, &tid);
        if !tid.is_empty() && (ty == "movie" || ty == "tv") {
            cx.get(&alloc::format!("/api/title/{}/{}/page", ty, tid), sid, LOGO);
        }
        if tv {
            cx.get(&alloc::format!("/api/tv/{}/seasons", crate::util::enc(&tid)), sid, SEASONS);
        }
        let soon = !tv && t.get("soon").map(|x| !s(x, "date").is_empty()).unwrap_or(false);
        let mut actions = Vec::new();
        match mine {
            Some(Mine::Film(_)) => actions.push(Do::Mine),
            _ if !soon => actions.push(Do::Play),
            _ => {}
        }
        if tv {
            // A show has no buttons: hover a season, its episodes show underneath, Down and Enter plays one.
            actions.clear();
        }
        let mut lib_eps = Vec::new();
        let mut start = None;
        if let Some(Mine::Show(show_id)) = &mine {
            let watched: Value = crate::host::load(crate::WATCHED_KEY).and_then(|w| serde_json::from_str(&w).ok()).unwrap_or(Value::Null);
            let ls = crate::logic::show_seasons(&cx.state.library, show_id);
            for se in &ls {
                for e in &se.episodes {
                    if let Some(n) = f(e, "episode") {
                        lib_eps.push((se.number, n as i64, (*e).clone()));
                    }
                }
            }
            if !ls.is_empty() {
                let (si, ei) = crate::logic::start_episode(&ls, &cx.state.progress, &watched);
                if let Some(e) = ls.get(si).and_then(|se| se.episodes.get(ei)) {
                    start = Some((ls[si].number, f(e, "episode").unwrap_or(1.0) as i64));
                }
            }
        }
        if soon && actions.is_empty() {
            actions.push(Do::Soon);
        }
        let mut me = TitleScreen {
            sid,
            t,
            tv,
            tid,
            at_seasons: tv,
            mine,
            logo: String::new(),
            cast: Vec::new(),
            similar: Vec::new(),
            facts: Vec::new(),
            tagline: String::new(),
            stinger: crate::stinger::NONE,
            zone: Zone::Hero,
            ci: 0,
            mi: 0,
            scroll: ui::Ease::at(0.0),
            cast_x: ui::Ease::at(0.0),
            sim_x: ui::Ease::at(0.0),
            cast_top: 0.0,
            sim_top: 0.0,
            seasons: Vec::new(),
            seasons_note: String::from(t!("Loading seasons…")),
            seasons_err: false,
            si: 0,
            actions,
            ai: 0,
            status: String::new(),
            status_err: false,
            on_way,
            alive: true,
            follow: 0,
            lit: Lit::default(),
            chip_scroll: ui::Ease::at(0.0),
            copies: String::new(),
            eps: Vec::new(),
            ei: 0,
            ep_x: ui::Ease::at(0.0),
            ep_top: 0.0,
            ep_timer: 0,
            lib_eps,
            start,
        };
        if !me.tv && me.mine.is_none() && me.actions.contains(&Do::Play) {
            cx.get(&alloc::format!("/api/title/movie/{}/copies", crate::util::enc(&me.tid)), sid, COPIES);
        }
        me.follow = cx.timer(5000.0, sid, FOLLOW_T);
        me
    }
    fn label(&self, a: Do) -> String {
        match a {
            Do::Play => String::from(t!("Play")),
            Do::Soon => match self.t.get("soon") {
                Some(x) => browse::soon_sub(x),
                None => String::from(t!("Coming soon")),
            },
            Do::Mine => String::from(t!("Play")),
        }
    }
    fn act(&mut self, cx: &mut Cx) {
        let Some(a) = self.actions.get(self.ai).copied() else { return };
        match a {
            Do::Play => self.play(cx),
            Do::Soon => cx.toast(t!("This film isn’t out yet.")),
            Do::Mine => {
                if let Some(Mine::Film(fid)) = &self.mine {
                    if let Some(file) = cx.state.file(fid).cloned() {
                        super::player::play_asked(cx, &file, false);
                    }
                }
            }
        }
    }
    fn play(&mut self, cx: &mut Cx) {
        let title = String::from(s(&self.t, "title"));
        let art = String::from(if !s(&self.t, "backdrop").is_empty() { s(&self.t, "backdrop") } else { s(&self.t, "poster") });
        let tmdb = f(&self.t, "id").unwrap_or(0.0) as i64;
        {
            let x = super::ready::Target { tv: false, tmdb, season: 0, episode: 0, title, sub: String::new(), art, allow_cam: false };
            match self.copies.as_str() {
                "soon" => cx.toast(t!("Not out to stream or buy yet.")),
                "cam" => {
                    let a = super::ready::CamAsk::new(cx, x);
                    cx.push(Box::new(a));
                }
                _ => super::ready::play_first(cx, x),
            }
        }
    }
    fn season_no(&self) -> Option<i64> {
        self.seasons.get(self.si).map(|se| f(se, "number").unwrap_or(1.0) as i64)
    }
    /// The chosen season's episodes, once fetched.
    fn episodes(&self) -> Option<&Vec<Value>> {
        let n = self.season_no()?;
        self.eps.iter().find(|(k, _)| *k == n).map(|(_, v)| v)
    }
    /// A new season under the remote: back to its first episode (or where you are in it), fetch it if new.
    fn season_moved(&mut self, cx: &mut Cx, now: bool) {
        self.ei = 0;
        self.ep_x.jump(0.0);
        self.pick_start();
        cx.cancel(self.ep_timer);
        if self.season_no().is_some() && self.episodes().is_none() {
            self.ep_timer = cx.timer(if now { 0.0 } else { 250.0 }, self.sid, EP_T);
        }
    }
    fn pick_start(&mut self) {
        let (Some(n), Some((sn, en))) = (self.season_no(), self.start) else { return };
        if n != sn {
            return;
        }
        if let Some(i) = self.episodes().and_then(|list| list.iter().position(|e| f(e, "number").map(|v| v as i64) == Some(en))) {
            self.ei = i;
        }
    }
    fn play_episode(&mut self, cx: &mut Cx) {
        let Some(n) = self.season_no() else { return };
        let Some(e) = self.episodes().and_then(|l| l.get(self.ei)).cloned() else { return };
        if not_out(&e, &today()) {
            cx.toast(t!("This episode isn’t out yet."));
            return;
        }
        let en = f(&e, "number").unwrap_or(1.0) as i64;
        if let Some((_, _, file)) = self.lib_eps.iter().find(|(a, b2, _)| *a == n && *b2 == en) {
            if !b(file, "converting") {
                let file = file.clone();
                super::player::play_asked(cx, &file, false);
                return;
            }
        }
        let title = String::from(s(&self.t, "title"));
        let back = if !s(&self.t, "backdrop").is_empty() { s(&self.t, "backdrop") } else { s(&self.t, "poster") };
        let art = String::from(if s(&e, "still").is_empty() { back } else { s(&e, "still") });
        let tmdb = f(&self.t, "id").unwrap_or(0.0) as i64;
        let sub = alloc::format!("{} · {}", t!("Season {0}", alloc::format!("{}", n)), t!("Episode {0}", alloc::format!("{}", en)));
        super::ready::play_first(cx, super::ready::Target { tv: true, tmdb, season: n, episode: en, title, sub, art, allow_cam: false });
    }
}

/// A long bar with its words above (a download on its way).
pub fn strip(cx: &mut Cx, p: &Pending, x: f32, y: f32, w: f32) -> f32 {
    let f = body(28.0, 700);
    cx.tx.draw_fit(&mut cx.g, f, &browse::pending_text(p), x, y, w, ui::paper());
    let r = rect(x, y + f.line() + 10.0, w, 12.0);
    cx.g.glow(r, 6.0, 14.0, ui::bulb().alpha(0.18));
    ui::bar(cx, r, p.progress.map(|v| v as f32), hexa(0xFFFFFF, 0.14));
    f.line() + 22.0
}

/// The big backdrop of a title page, with the room's shadows over its left side and bottom.
pub fn page_backdrop(cx: &mut Cx, url: &str, alpha: f32) {
    ui::room(cx);
    let full = rect(0.0, 0.0, 1920.0, 1080.0);
    let big = ui::tmdb_size(url, "w1280");
    if !ui::backdrop(cx, &big, full, alpha) && big != url {
        ui::backdrop(cx, url, full, alpha);
    }
    cx.g.hgrad(full, &[(0.0, ui::velvet()), (0.32, ui::velvet().alpha(0.9)), (0.66, ui::velvet().alpha(0.25)), (1.0, ui::velvet().alpha(0.1))]);
    cx.g.vgrad(full, &[(0.0, ui::velvet().alpha(0.0)), (0.45, ui::velvet().alpha(0.0)), (0.94, ui::velvet()), (1.0, ui::velvet())]);
}

/// A title as its logo art when TMDB has one, else in big letters. Returns the height used.
pub fn heading(cx: &mut Cx, logo: &str, name: &str, x: f32, y: f32, size: f32, max_w: f32) -> f32 {
    if !logo.is_empty() {
        if let Some(b) = ui::contain(cx, logo, rect(x, y, 820.0f32.min(max_w), 210.0), 1.0) {
            return b.h + 18.0;
        }
        if !cx.im.failed(logo) {
            // Waiting for the logo: keep the space, show the name faintly.
        }
    }
    let f = display(size, 800);
    let lines = cx.tx.wrap(f, name, max_w, 2);
    let lh = size * 1.02;
    for (n, l) in lines.iter().enumerate() {
        cx.tx.draw(&mut cx.g, f, l, x - 3.0, y + n as f32 * lh, ui::paper());
    }
    lines.len() as f32 * lh + 16.0
}

impl TitleScreen {
    /// What Up from the cast or More like this lands on: a show's episode row, else the hero.
    fn above_rows(&self) -> Zone {
        if self.tv && self.episodes().map(|l| !l.is_empty()).unwrap_or(false) {
            Zone::Episodes
        } else {
            Zone::Hero
        }
    }
    /// The chosen season's episodes as a row of stills; returns the y under it.
    fn draw_episodes(&mut self, cx: &mut Cx, x: f32, y: f32) -> f32 {
        self.ep_top = y + self.scroll.v;
        let Some(list) = self.episodes().cloned() else {
            cx.tx.draw(&mut cx.g, body(25.0, 400), t!("Loading episodes…"), x, y, ui::dust());
            return y + 60.0;
        };
        if list.is_empty() {
            cx.tx.draw(&mut cx.g, body(25.0, 400), t!("No episodes listed yet."), x, y, ui::dust());
            return y + 60.0;
        }
        let n = self.season_no().unwrap_or(0);
        let day = today();
        let row_w = 1920.0 - 2.0 * x;
        let max_x = (list.len() as f32 * EP_STEP - browse::CARD_GAP - row_w).max(0.0);
        self.ep_x.set(((self.ei as f32 - 1.0).max(0.0) * EP_STEP).min(max_x));
        let sx = self.ep_x.step(cx, 13.0);
        let back = String::from(if !s(&self.t, "backdrop").is_empty() { s(&self.t, "backdrop") } else { s(&self.t, "poster") });
        let progress = cx.state.progress.clone();
        let show_id = f(&self.t, "id").unwrap_or(0.0) as i64;
        for (i, e) in list.iter().enumerate() {
            let px = x + i as f32 * EP_STEP - sx;
            if px > 1920.0 || px + EP_STEP < 0.0 {
                continue;
            }
            let en = f(e, "number").unwrap_or(0.0) as i64;
            let mut c = browse::Card::new(alloc::format!("ep{}", en), browse::Kind::Svt, String::new(), browse::Act::Nothing);
            let name = s(e, "name");
            c.title = if name.is_empty() { t!("Episode {0}", alloc::format!("{}", en)) } else { alloc::format!("{}. {}", en, name) };
            let out = !not_out(e, &day);
            c.sub = if !out {
                let d = s(e, "airDate");
                if d.is_empty() { String::from(t!("Coming soon")) } else { browse::soon_sub(&serde_json::json!({ "date": d })) }
            } else if let Some(m) = f(e, "runtime").filter(|m| *m > 0.0) {
                t!("{0} min", alloc::format!("{}", m as i64))
            } else {
                String::new()
            };
            c.img = String::from(if s(e, "still").is_empty() { back.as_str() } else { s(e, "still") });
            if let Some((_, _, file)) = self.lib_eps.iter().find(|(a, b2, _)| *a == n && *b2 == en) {
                let p = progress.get(crate::logic::progress_ref(file));
                if crate::logic::resumable(p) {
                    let p = p.unwrap();
                    c.bar = Some(Some((f(p, "time").unwrap_or(0.0) / f(p, "duration").unwrap_or(1.0)) as f32));
                }
            }
            // Finished before (any device): a tick, unless a rewatch is partway (its bar says more).
            if c.bar.is_none() && cx.state.seen_episode(show_id, n, en) {
                c.watched = true;
                c.sub = if c.sub.is_empty() { String::from(t!("Watched")) } else { alloc::format!("{} · {}", t!("Watched"), c.sub) };
            }
            let lit = self.lit.get(4000 + i as u64);
            cx.g.push_alpha(if out { 1.0 } else { 0.5 });
            browse::draw_card(cx, &c, px, y, lit);
            cx.g.pop_alpha();
        }
        y + browse::Kind::Svt.size().1 + 96.0
    }
}

impl Screen for TitleScreen {
    fn sid(&self) -> u32 {
        self.sid
    }
    fn draw(&mut self, cx: &mut Cx) {
        let back = String::from(if !s(&self.t, "backdrop").is_empty() { s(&self.t, "backdrop") } else { s(&self.t, "poster") });
        page_backdrop(cx, &back, 0.75);
        let sy = self.scroll.step(cx, 12.0);
        if sy > 0.5 {
            // Further down the page the picture steps back behind the rows.
            cx.g.fill(rect(0.0, 0.0, 1920.0, 1080.0), ui::velvet().alpha((sy / 520.0).min(1.0) * 0.72));
        }
        let x = PAGE_X;
        let mut y = 112.0 - sy;
        let name = String::from(s(&self.t, "title"));
        let logo = self.logo.clone();
        y += heading(cx, &logo, &name, x, y, 84.0, 1080.0);
        // facts: year · Film · 2 h 45 min · 15 · ★ 8 · genres
        let mut parts: Vec<String> = Vec::new();
        let yr = year(&self.t);
        if !yr.is_empty() {
            parts.push(yr);
        }
        parts.push(String::from(browse::type_word(self.tv)));
        parts.extend(self.facts.iter().cloned());
        if let Some(r) = f(&self.t, "rating") {
            if r > 0.0 {
                parts.push(alloc::format!("★ {}", browse::fmt_rating(r)));
            }
        }
        for g in cx.state.genre_names(self.tv, arr(&self.t, "genres")) {
            parts.push(g);
        }
        ui::meta_dot(cx, x + 1.0, y + 14.0);
        cx.tx.draw_fit(&mut cx.g, body(27.0, 700), &parts.join("  ·  "), x + 26.0, y, 1300.0, ui::paper().alpha(0.88));
        y += 58.0;
        let note = crate::stinger::scene_note(self.stinger);
        if !note.is_empty() {
            cx.g.round(rect(x + 1.0, y + 7.0, 4.0, 20.0), 2.0, ui::bulb());
            cx.tx.draw_fit(&mut cx.g, body(26.0, 700), note, x + 26.0, y, 1100.0, ui::dust());
            y += 48.0;
        }
        if !self.tagline.is_empty() {
            let tl = self.tagline.clone();
            cx.tx.draw_fit(&mut cx.g, body(28.0, 700), &tl, x, y, 1100.0, ui::bulb().mix(ui::paper(), 0.35));
            y += 50.0;
        }
        let on_eps = self.zone == Zone::Episodes;
        let ep_text = if on_eps { self.episodes().and_then(|l| l.get(self.ei)).map(|e| String::from(s(e, "overview"))).unwrap_or_default() } else { String::new() };
        let overview = if !ep_text.is_empty() {
            ep_text
        } else if s(&self.t, "overview").is_empty() {
            String::from(t!("No description available."))
        } else {
            String::from(s(&self.t, "overview"))
        };
        // On the episode row the text keeps three lines' room, so the page doesn't jump between episodes.
        let h = cx.tx.para(&mut cx.g, body(28.0, 400), &overview, x, y, 1060.0, if on_eps { 3 } else { 5 }, 40.0, ui::paper().mix(ui::dust(), 0.35));
        y += if on_eps { h.max(120.0) } else { h } + 34.0;
        let focus = match self.zone {
            Zone::Hero if self.at_seasons => 1000 + self.si as u64,
            Zone::Hero => self.ai as u64 + 1,
            Zone::Episodes => 4000 + self.ei as u64,
            Zone::Cast => 2000 + self.ci as u64,
            Zone::Similar => 3000 + self.mi as u64,
        };
        self.lit.focus(focus);
        self.lit.step(cx);
        // seasons
        if self.tv {
            if self.seasons.is_empty() {
                let note = self.seasons_note.clone();
                cx.tx.draw(&mut cx.g, body(25.0, 400), &note, x, y, if self.seasons_err { ui::alert() } else { ui::dust() });
                y += 60.0;
            } else {
                cx.tx.draw(&mut cx.g, body(22.0, 700), &crate::util::lower(t!("Season")).to_uppercase(), x, y, ui::dust());
                y += 40.0;
                self.chip_scroll.set(self.si.saturating_sub(5) as f32 * 86.0);
                let sx = self.chip_scroll.step(cx, 14.0);
                cx.g.push_clip(rect(x - 20.0, y - 20.0, 760.0, 110.0));
                for (n, se) in self.seasons.clone().iter().enumerate() {
                    let r = rect(x + n as f32 * 86.0 - sx, y, 70.0, 60.0);
                    let lit = self.lit.get(1000 + n as u64);
                    let up = b(se, "upcoming");
                    let label = crate::util::id(se, "number");
                    let kind = if n == self.si { ui::Pill::Primary } else { ui::Pill::Quiet };
                    cx.g.push_alpha(if up { 0.45 } else { 1.0 });
                    ui::pill(cx, r, &label, body(26.0, 700), kind, lit);
                    cx.g.pop_alpha();
                }
                cx.g.pop_clip();
                y += 90.0;
                y = self.draw_episodes(cx, x, y);
            }
        }
        // actions (films)
        let pf = body(30.0, 700);
        let mut ax = x;
        for (n, a) in self.actions.clone().iter().enumerate() {
            let label = self.label(*a);
            let w = ui::pill_w(cx, &label, pf, 34.0, 270.0);
            let kind = match a {
                Do::Play => ui::Pill::Gold,
                Do::Mine if matches!(self.mine, Some(Mine::Film(_))) => ui::Pill::Gold,
                _ => ui::Pill::Plain,
            };
            let lit = self.lit.get(n as u64 + 1);
            ui::pill(cx, rect(ax, y, w, 78.0), &label, pf, kind, lit);
            ax += w + 18.0;
        }
        if !self.actions.is_empty() {
            y += 106.0;
        }
        let note = match self.copies.as_str() {
            "cam" => t!("Only cinema recordings so far: filmed in a cinema, poor picture and sound."),
            "soon" => t!("Not out to stream or buy yet."),
            _ => "",
        };
        if !note.is_empty() {
            cx.tx.draw_fit(&mut cx.g, body(26.0, 400), note, x, y - 8.0, 1100.0, ui::alert());
            y += 44.0;
        }
        if let Some(p) = self.on_way.clone() {
            y += strip(cx, &p, x, y, 760.0) + 10.0;
        }
        if !self.status.is_empty() {
            let st = self.status.clone();
            y += cx.tx.para(&mut cx.g, body(24.0, 400), &st, x, y, 1100.0, 2, 32.0, if self.status_err { ui::alert() } else { ui::dust() }) + 10.0;
        }
        // The rows under the hero; the first one peeks in from the bottom.
        y = y.max(700.0 - sy) + 12.0;
        let h2 = display(34.0, 700);
        let row_w = 1920.0 - 2.0 * x;
        if !self.cast.is_empty() {
            self.cast_top = y + sy;
            cx.tx.draw(&mut cx.g, h2, t!("Cast"), x, y, ui::paper());
            y += h2.line() + 22.0;
            let n = self.cast.len();
            let max_x = (n as f32 * FACE_STEP - 56.0 - row_w).max(0.0);
            self.cast_x.set(((self.ci as f32 - 3.0).max(0.0) * FACE_STEP).min(max_x));
            let sx = self.cast_x.step(cx, 13.0);
            let nf = body(24.0, 700);
            let pf2 = body(21.0, 400);
            for i in 0..n {
                let px = x + i as f32 * FACE_STEP - sx;
                if px > 1920.0 || px + FACE_STEP < 0.0 {
                    continue;
                }
                let lit = self.lit.get(2000 + i as u64);
                let r = rect(px + (FACE_STEP - 56.0 - FACE) / 2.0, y, FACE, FACE).scale(1.0 + 0.06 * lit);
                ui::shadow(cx, r, r.w / 2.0, 16.0 + 24.0 * lit, 0.3 + 0.2 * lit);
                ui::focus_ring(cx, r, r.w / 2.0, lit);
                let photo = self.cast[i].photo.clone();
                // Portrait photos: keep the top of the picture so faces stay inside the circle.
                cx.g.round(r, r.w / 2.0, ui::seat());
                let got = if photo.is_empty() || !cx.g.visible(&r) { None } else { cx.picture(&photo) };
                let shown = match got {
                    Some(p) => {
                        let uv = crate::img::cover_top(p.w, p.h, r.w, r.h);
                        cx.g.image(p.id, r, uv, r.w / 2.0, ui::WHITE.alpha(p.fade));
                        true
                    }
                    None => false,
                };
                if !shown {
                    cx.g.round(r, r.w / 2.0, ui::seat());
                    let init: String = self.cast[i].name.chars().next().map(|c| c.to_uppercase().collect()).unwrap_or_default();
                    let f0 = display(56.0, 800);
                    cx.tx.draw_center(&mut cx.g, f0, &init, r.x + r.w / 2.0, r.y + (r.h - f0.line()) / 2.0, ui::dust().alpha(0.6));
                }
                cx.g.ring(r, r.w / 2.0, 1.0, ui::paper().alpha(0.1));
                let mid = px + (FACE_STEP - 56.0) / 2.0;
                let ty = y + FACE + 18.0 + 6.0 * lit;
                let nm = self.cast[i].name.clone();
                let nm = cx.tx.fit(nf, &nm, FACE_STEP - 16.0);
                cx.tx.draw_center(&mut cx.g, nf, &nm, mid, ty, ui::paper().mix(ui::WHITE, lit));
                let part = self.cast[i].part.clone();
                if !part.is_empty() {
                    let pt = cx.tx.fit(pf2, &part, FACE_STEP - 16.0);
                    cx.tx.draw_center(&mut cx.g, pf2, &pt, mid, ty + nf.line(), ui::dust());
                }
            }
            y += FACE + 18.0 + nf.line() + pf2.line() + 56.0;
        }
        if !self.similar.is_empty() {
            self.sim_top = y + sy;
            cx.tx.draw(&mut cx.g, h2, t!("More like this"), x, y, ui::paper());
            y += h2.line() + 26.0;
            let kind = browse::Kind::Poster;
            let step = kind.size().0 + browse::CARD_GAP;
            let n = self.similar.len();
            let max_x = (n as f32 * step - browse::CARD_GAP - row_w).max(0.0);
            self.sim_x.set(((self.mi as f32 - 2.0).max(0.0) * step).min(max_x));
            let sx = self.sim_x.step(cx, 13.0);
            for i in 0..n {
                let px = x + i as f32 * step - sx;
                if px > 1920.0 || px + step < 0.0 {
                    continue;
                }
                let lit = self.lit.get(3000 + i as u64);
                let c = self.similar[i].clone();
                browse::draw_card(cx, &c, px, y, lit);
            }
        }
        // Follow the remote down the page.
        let target = match self.zone {
            Zone::Hero => 0.0,
            Zone::Episodes => (self.ep_top - 600.0).max(0.0),
            Zone::Cast => (self.cast_top - 420.0).max(0.0),
            Zone::Similar => (self.sim_top - if self.cast.is_empty() { 420.0 } else { 300.0 }).max(0.0),
        };
        self.scroll.set(target);
    }
    fn key(&mut self, cx: &mut Cx, k: Key) -> bool {
        cx.redraw();
        match self.zone {
            Zone::Episodes => {
                let n = self.episodes().map(|l| l.len()).unwrap_or(0);
                match k.code {
                    key::LEFT => self.ei = self.ei.saturating_sub(1),
                    key::RIGHT => self.ei = (self.ei + 1).min(n.saturating_sub(1)),
                    key::UP | key::BACK | key::ESC | key::BACKSPACE => self.zone = Zone::Hero,
                    key::DOWN => {
                        if !self.cast.is_empty() {
                            self.zone = Zone::Cast;
                        } else if !self.similar.is_empty() {
                            self.zone = Zone::Similar;
                        }
                    }
                    key::ENTER => self.play_episode(cx),
                    _ => return false,
                }
                return true;
            }
            Zone::Cast => {
                match k.code {
                    key::LEFT => self.ci = self.ci.saturating_sub(1),
                    key::RIGHT => self.ci = (self.ci + 1).min(self.cast.len().saturating_sub(1)),
                    key::UP => self.zone = self.above_rows(),
                    key::DOWN if !self.similar.is_empty() => self.zone = Zone::Similar,
                    key::DOWN | key::ENTER => {}
                    key::BACK | key::ESC | key::BACKSPACE => self.zone = Zone::Hero,
                    _ => return false,
                }
                return true;
            }
            Zone::Similar => {
                match k.code {
                    key::LEFT => self.mi = self.mi.saturating_sub(1),
                    key::RIGHT => self.mi = (self.mi + 1).min(self.similar.len().saturating_sub(1)),
                    key::UP => self.zone = if self.cast.is_empty() { self.above_rows() } else { Zone::Cast },
                    key::DOWN => {}
                    key::ENTER => {
                        if let Some(c) = self.similar.get(self.mi).cloned() {
                            browse::open(cx, &c);
                        }
                    }
                    key::BACK | key::ESC | key::BACKSPACE => self.zone = Zone::Hero,
                    _ => return false,
                }
                return true;
            }
            Zone::Hero => {}
        }
        let down = if !self.cast.is_empty() {
            Some(Zone::Cast)
        } else if !self.similar.is_empty() {
            Some(Zone::Similar)
        } else {
            None
        };
        if self.at_seasons {
            match k.code {
                key::LEFT if self.si > 0 => {
                    self.si -= 1;
                    self.season_moved(cx, false);
                }
                key::RIGHT if self.si + 1 < self.seasons.len() => {
                    self.si += 1;
                    self.season_moved(cx, false);
                }
                key::DOWN | key::ENTER => {
                    if self.episodes().map(|l| !l.is_empty()).unwrap_or(false) {
                        self.zone = Zone::Episodes;
                    } else if !self.actions.is_empty() {
                        self.at_seasons = false;
                        self.ai = 0;
                    } else if let Some(z) = down {
                        self.zone = z;
                    }
                }
                key::UP | key::LEFT | key::RIGHT => {}
                _ => return false,
            }
            return true;
        }
        match k.code {
            key::UP if self.tv && !self.seasons.is_empty() => self.at_seasons = true,
            _ if self.actions.is_empty() => return k.code == key::UP,
            key::LEFT => self.ai = self.ai.saturating_sub(1),
            key::RIGHT => self.ai = (self.ai + 1).min(self.actions.len().saturating_sub(1)),
            key::ENTER => self.act(cx),
            key::DOWN => {
                if let Some(z) = down {
                    self.zone = z;
                }
            }
            key::UP => {}
            _ => return false,
        }
        true
    }
    fn on_http(&mut self, cx: &mut Cx, tag: u32, res: Res) {
        if !self.alive {
            return;
        }
        match tag {
            LOGO => {
                let Some(p) = res.json.get("page") else { return };
                if let Some(u) = p.get("logo").map(|l| s(l, "url")) {
                    self.logo = String::from(u);
                }
                self.tagline = String::from(s(p, "tagline"));
                self.stinger = if self.tv { crate::stinger::NONE } else { crate::stinger::kind(s(p, "stinger")) };
                self.facts.clear();
                if let Some(m) = f(p, "runtime").filter(|m| *m > 0.0) {
                    let m = m as i64;
                    self.facts.push(if m >= 60 && !self.tv {
                        t!("{0} h {1} min", alloc::format!("{}", m / 60), alloc::format!("{}", m % 60))
                    } else {
                        t!("{0} min", alloc::format!("{}", m))
                    });
                }
                if let Some(n) = f(p, "seasons").filter(|n| *n > 0.0) {
                    let n = n as i64;
                    self.facts.push(if n == 1 { String::from(t!("1 season")) } else { t!("{0} seasons", alloc::format!("{}", n)) });
                }
                let cert = s(p, "certification");
                if !cert.is_empty() {
                    self.facts.push(String::from(cert));
                }
                self.cast = arr(p, "cast")
                    .iter()
                    .filter(|c| !s(c, "name").is_empty())
                    .take(50)
                    .map(|c| Person { name: String::from(s(c, "name")), part: String::from(s(c, "character")), photo: String::from(s(c, "photo")) })
                    .collect();
                let list: Vec<Value> = arr(p, "similar").to_vec();
                self.similar = list
                    .iter()
                    .take(20)
                    .map(|t| {
                        let mut c = browse::title_card(cx, t);
                        c.kind = browse::Kind::Poster;
                        c
                    })
                    .collect();
            }
            SEASONS => {
                if !res.ok() {
                    self.seasons_note = t!("Couldn’t load seasons: {0}", res.error());
                    self.seasons_err = true;
                    self.at_seasons = false;
                } else {
                    let all = arr(&res.json, "seasons");
                    let mut list: Vec<Value> = all.iter().filter(|x| !b(x, "upcoming")).cloned().collect();
                    if list.is_empty() {
                        list = all.to_vec();
                    }
                    // Start on the season you're watching (your copy), else the first.
                    let at = self.start.and_then(|(sn, _)| list.iter().position(|x| f(x, "number").map(|v| v as i64) == Some(sn)));
                    self.si = at.unwrap_or(0);
                    self.seasons = list;
                    if self.seasons.is_empty() {
                        self.at_seasons = false;
                    } else {
                        self.season_moved(cx, true);
                    }
                }
            }
            t if t >= EPS => {
                let n = (t - EPS) as i64;
                if !res.ok() {
                    if self.season_no() == Some(n) {
                        cx.toast(t!("Couldn’t load the episodes."));
                    }
                    return;
                }
                if !self.eps.iter().any(|(k, _)| *k == n) {
                    self.eps.push((n, arr(&res.json, "episodes").to_vec()));
                }
                if self.season_no() == Some(n) {
                    self.pick_start();
                }
            }
            COPIES => {
                if res.ok() {
                    self.copies = String::from(s(&res.json, "verdict"));
                }
            }
            FOLLOWED => {
                let was = self.on_way.is_some();
                self.on_way = browse::pending_for(cx, s(&self.t, "type"), &self.tid);
                if self.on_way.is_some() && !was {
                    self.status.clear();
                }
                self.follow = cx.timer(5000.0, self.sid, FOLLOW_T);
            }
            _ => {}
        }
        cx.redraw();
    }
    fn on_timer(&mut self, cx: &mut Cx, tag: u32) {
        if !self.alive {
            return;
        }
        match tag {
            FOLLOW_T => cx.load_pending(Some((self.sid, FOLLOWED))),
            EP_T => {
                if let Some(n) = self.season_no() {
                    if self.episodes().is_none() {
                        cx.get(&alloc::format!("/api/tv/{}/season/{}", crate::util::enc(&self.tid), n), self.sid, EPS + n as u32);
                    }
                }
            }
            _ => {}
        }
    }
    fn leave(&mut self, cx: &mut Cx) {
        self.alive = false;
        cx.cancel(self.follow);
        cx.cancel(self.ep_timer);
    }
    fn refresh(&mut self, cx: &mut Cx) {
        cx.redraw();
    }
}
