//! Stay for the credits (like the website's public/stinger.js): a film TMDB tags with a scene during or after its
//! closing credits. The title page answer says `stinger: "during" | "after" | "both" | null`; the film page and the
//! pause screen show a quiet line, the credits card says "Stay: …" and gives the picture back full size by itself
//! STAY_CARD_S into the credits, so the scene isn't watched in the corner. No keyword: nothing is said at all.

use crate::t;

pub const NONE: u8 = 0;
pub const DURING: u8 = 1;
pub const AFTER: u8 = 2;
pub const BOTH: u8 = 3;
/// Seconds of credits the card stays up for a film with a scene (nothing up next), then the picture is full size.
pub const STAY_CARD_S: f64 = 20.0;

pub fn kind(v: &str) -> u8 {
    match v {
        "during" => DURING,
        "after" => AFTER,
        "both" => BOTH,
        _ => NONE,
    }
}

/// The film page and pause screen line ("" without a scene).
pub fn scene_note(kind: u8) -> &'static str {
    match kind {
        BOTH => t!("Scenes during and after the credits"),
        DURING => t!("Scene during the credits"),
        AFTER => t!("Scene after the credits"),
        _ => "",
    }
}

/// The credits card's line ("" without a scene).
pub fn stay_line(kind: u8) -> &'static str {
    match kind {
        BOTH => t!("Stay: there are scenes during and after the credits"),
        DURING => t!("Stay: there’s a scene during the credits"),
        AFTER => t!("Stay: there’s a scene after the credits"),
        _ => "",
    }
}

/// Whether the credits card has had its time: a film with a scene, nothing up next, STAY_CARD_S into the credits.
/// Worked out from the time, so seeking back to the credits start shows the card again.
pub fn put_away(kind: u8, has_next: bool, credits_at: f64, time: f64) -> bool {
    kind != NONE && !has_next && credits_at > 0.0 && time >= credits_at + STAY_CARD_S
}
