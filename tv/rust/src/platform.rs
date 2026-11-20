//! Which TV this runs on, from host.js's `platform` import: the Samsung app (Tizen, AVPlay) or the Android TV
//! app (tv/android: an AVPlay-shaped ExoPlayer). Read once at start.
//!   lang     "sv" or "en" (Samsung: always Swedish; Android: the TV's language)
//!   play     the play-link variant for this TV's decoder ("browser-hevc", or "browser&quality=auto" without HEVC)
//!   android  ExoPlayer: a stalled stream moves to the adaptive copy instead of reopening (player.rs)
use crate::host;
use crate::util::s;
use alloc::string::String;
use serde_json::Value;

struct Info {
    swedish: bool,
    play: String,
    android: bool,
}
static mut INFO: Option<Info> = None;

fn info() -> &'static Option<Info> {
    unsafe { &*core::ptr::addr_of!(INFO) }
}

pub fn read() {
    let raw = host::platform_info();
    let v: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let lang = s(&v, "lang");
    let play = s(&v, "play");
    let i = Info {
        swedish: lang.is_empty() || lang == "sv",
        play: String::from(if play.is_empty() { "browser-hevc" } else { play }),
        android: v.get("android").and_then(|b| b.as_bool()) == Some(true),
    };
    unsafe { *core::ptr::addr_of_mut!(INFO) = Some(i) }
}
pub fn swedish() -> bool {
    info().as_ref().map(|i| i.swedish).unwrap_or(true)
}
/// The `variant=` value for /api/play-link (may carry `&quality=…`: goes into a query string as is).
pub fn play_variant() -> &'static str {
    info().as_ref().map(|i| i.play.as_str()).unwrap_or("browser-hevc")
}
pub fn android() -> bool {
    info().as_ref().map(|i| i.android).unwrap_or(false)
}
