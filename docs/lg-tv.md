# LG TV app (webOS)

Lilin's LG app (`tv/webos`, app id `app.lilin.tv`) is a small webOS shell, like the Samsung one: it loads the TV
app (`public/tv-rs`, the Rust app drawn with WebGL) from the server at every start, so a Lilin update reaches the
TV without reinstalling. The TV app was written for Samsung's AVPlay player; the shell gives it the same methods
backed by an HTML5 video under the app's canvas, and maps LG's Back key to Samsung's. It asks for the HEVC copy
when the TV plays HEVC Main 10, otherwise the H.264 copy.

## Installing

LG only takes apps from outside its store in Developer Mode:

1. Make a free account at <https://webostv.developer.lge.com> (Sign In, then Create Account).
2. On the TV, install **Developer Mode** from the LG Content Store and sign in with that account
   (the User ID is the account's email).
3. Turn **Dev Mode Status** on (the TV restarts), open the app again and turn **Key Server** on.
4. On a computer on the same network, with the webOS CLI (`npm install -g @webos-tools/cli`):

```bash
LILIN_URL=http://192.168.1.10:8080 TV=192.168.1.40 bash tv/webos/build.sh --install
```

It asks for the passphrase the Developer Mode app shows, installs `tv/webos/dist/Lilin.ipk` and starts it.
For a TV away from the server's network use the public address plus `/c/tv`
(`LILIN_URL=https://lilin.example.com/c/tv`), as with the Android app ([android-tv.md](android-tv.md)).

## Developer Mode runs out

LG ends a Developer Mode session after about 50 hours unless it is extended (the **Extend** button in the
Developer Mode app), and apps installed through it are removed when it ends. For a TV you don't want to look
after, an Android TV / Google TV stick in its HDMI port runs the Android app with nothing to renew.
