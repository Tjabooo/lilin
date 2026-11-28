// Short device labels from a user agent: "iPhone · Safari", "Samsung TV · Samsung Internet", ...
// TVs come first: a Samsung or LG TV's own browser says "Linux" and "Chrome", which reads like a bot.

export function osOf(ua = '') {
  ua = String(ua);
  if (/^(Lilin|Marquee) TV app/.test(ua)) return 'Lilin TV app';
  if (/Tizen/.test(ua)) return 'Samsung TV';
  if (/Web0S|webOS|NetCast/.test(ua)) return 'LG TV';
  if (/\bAFT[A-Z]/.test(ua)) return 'Fire TV';
  if (/Android TV|GoogleTV|BRAVIA|SMART-TV|SmartTV|HbbTV|CrKey/.test(ua)) return 'Smart TV';
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
}

export function browserOf(ua = '') {
  ua = String(ua);
  if (/^(Lilin|Marquee) TV app/.test(ua)) return null;
  return /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
}
