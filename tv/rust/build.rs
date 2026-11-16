// The TV app speaks Swedish: the same lines as the JavaScript app (public/tv/sv.js), compiled in as a table.
use std::{env, fs, path::Path};

fn main() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../public/tv/sv.js");
    println!("cargo:rerun-if-changed={}", src.display());
    let text = fs::read_to_string(&src).expect("public/tv/sv.js");
    let mut pairs: Vec<(String, String)> = Vec::new();
    // Lines are 'English': 'Svenska', or the same in double quotes.
    for line in text.lines() {
        let l = line.trim();
        for q in ['\'', '"'] {
            let end = format!("{}{}", q, ',');
            if !l.starts_with(q) || !l.ends_with(&end) {
                continue;
            }
            let body = &l[1..l.len() - 2];
            let sep = format!("{q}: {q}");
            if let Some(i) = body.find(&sep) {
                let esc = format!("\\{}", q);
                let unq = |s: &str| s.replace(&esc, &q.to_string());
                pairs.push((unq(&body[..i]), unq(&body[i + 4..])));
            }
        }
    }
    pairs.sort();
    pairs.dedup_by(|a, b| a.0 == b.0);
    let mut out = String::from("pub static SV: &[(&str, &str)] = &[\n");
    for (en, sv) in &pairs {
        out.push_str(&format!("    ({:?}, {:?}),\n", en, sv));
    }
    out.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("sv.rs"), out).unwrap();
}
