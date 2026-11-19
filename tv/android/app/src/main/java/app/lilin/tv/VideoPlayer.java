package app.lilin.tv;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Timeline;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/**
 * The TV app's video player: ExoPlayer drawing into a SurfaceView under the (transparent) web page,
 * so the page's own player screen (OSD, Skip intro, Up next, subtitles) sits on top of the picture.
 * The page talks to it through the AVPlay-shaped object in shell.html; events go back as small JSON
 * messages. Runs on the main thread only.
 */
final class VideoPlayer implements Player.Listener {
  interface Events { void send(JSONObject event); }

  private static final int TICK_MS = 500;
  private static final int NET_MS = 2000;
  /** A dropped connection or a proxy hiccup (Cloudflare 502/524) is retried this often before the page hears of it. */
  private static final int LOAD_RETRIES = 8;

  private final Activity activity;
  private final FrameLayout box;      // black, full screen: the letterbox bars
  private final SurfaceView surface;  // sized to the video's shape inside the box
  private final Events events;
  private final String userAgent;
  private final Handler main = new Handler(Looper.getMainLooper());
  private ExoPlayer exo;
  private boolean preparedSent;
  private boolean buffering;
  private int audioIndex = -1;
  private VideoSize videoSize = VideoSize.UNKNOWN;

  private DefaultBandwidthMeter meter;

  /** Every 2 s while open: the connection's measured speed, how much is buffered and the video's bitrate (all
   * 0 when unknown), so the page can move to the adaptive stream before the picture stops. */
  private final Runnable netTick = new Runnable() {
    @Override public void run() {
      if (exo == null) return;
      long br = 0;
      Format v = exo.getVideoFormat(), a = exo.getAudioFormat();
      if (v != null) br += Math.max(0, v.averageBitrate > 0 ? v.averageBitrate : v.bitrate);
      if (a != null && br > 0) br += Math.max(0, a.averageBitrate > 0 ? a.averageBitrate : a.bitrate);
      send(event("net").putOpt("bw", meter == null ? 0 : meter.getBitrateEstimate())
          .putOpt("buf", exo.getTotalBufferedDuration()).putOpt("br", br));
      main.postDelayed(this, NET_MS);
    }
  };

  private final Runnable tick = new Runnable() {
    @Override public void run() {
      if (exo == null) return;
      sendTime("time");
      if (exo.isPlaying()) main.postDelayed(this, TICK_MS);
    }
  };

  VideoPlayer(Activity activity, FrameLayout box, SurfaceView surface, String userAgent, Events events) {
    this.activity = activity;
    this.box = box;
    this.surface = surface;
    this.userAgent = userAgent;
    this.events = events;
    box.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
      if (r - l != or - ol || b - t != ob - ot) fitSurface();
    });
  }

  boolean active() { return exo != null; }

  void open(String url) {
    release();
    preparedSent = false;
    buffering = false;
    audioIndex = -1;
    videoSize = VideoSize.UNKNOWN;

    DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
        .setUserAgent(userAgent)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(10_000)
        .setReadTimeoutMs(20_000);
    // Start as soon as 1.5 s is buffered (3 s after a stall); keep up to 2 minutes ahead.
    DefaultLoadControl load = new DefaultLoadControl.Builder()
        .setBufferDurationsMs(30_000, 120_000, 1_500, 3_000)
        .build();
    DefaultRenderersFactory renderers = new DefaultRenderersFactory(activity)
        .setEnableDecoderFallback(true);
    meter = DefaultBandwidthMeter.getSingletonInstance(activity);
    exo = new ExoPlayer.Builder(activity, renderers)
        .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(activity, http))
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(LOAD_RETRIES)))
        .setBandwidthMeter(meter)
        .setLoadControl(load)
        .setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build(), true)
        .setHandleAudioBecomingNoisy(true)
        .build();
    // Subtitles are drawn by the page (it fetches them from Lilin), never by the player.
    exo.setTrackSelectionParameters(exo.getTrackSelectionParameters().buildUpon()
        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        .build());
    exo.addListener(this);
    exo.setVideoSurfaceView(surface);
    exo.setMediaItem(MediaItem.fromUri(url));
    box.setVisibility(View.VISIBLE);
    main.postDelayed(netTick, NET_MS);
    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  void prepare() { if (exo != null) exo.prepare(); }
  void play() { if (exo != null) exo.play(); }
  void pause() { if (exo != null) exo.pause(); }

  void seek(long ms, int id) {
    if (exo == null) return;
    exo.seekTo(Math.max(0, ms));
    send(event("seeked").putOpt("id", id));
    sendTime("time");
  }

  void stop() { if (exo != null) exo.stop(); }

  void release() {
    main.removeCallbacks(tick);
    main.removeCallbacks(netTick);
    if (exo != null) {
      exo.removeListener(this);
      exo.release();
      exo = null;
    }
    box.setVisibility(View.GONE);
    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  /** index counts audio tracks across the whole file, in the order getTotalTrackInfo lists them. */
  void selectAudio(int index) {
    if (exo == null) return;
    int n = 0;
    for (Tracks.Group group : exo.getCurrentTracks().getGroups()) {
      if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
      for (int i = 0; i < group.length; i++, n++) {
        if (n != index) continue;
        exo.setTrackSelectionParameters(exo.getTrackSelectionParameters().buildUpon()
            .setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), i))
            .build());
        audioIndex = index;
        return;
      }
    }
  }

  // ---------- Player.Listener ----------
  @Override public void onTimelineChanged(Timeline timeline, int reason) { maybePrepared(false); }

  @Override public void onPlaybackStateChanged(int state) {
    if (state == Player.STATE_READY) maybePrepared(true);
    boolean nowBuffering = state == Player.STATE_BUFFERING && preparedSent;
    if (nowBuffering != buffering) {
      buffering = nowBuffering;
      send(event("buffering").putOpt("v", nowBuffering));
    }
    if (state == Player.STATE_ENDED) {
      main.removeCallbacks(tick);
      send(event("ended"));
    }
  }

  @Override public void onIsPlayingChanged(boolean playing) {
    sendTime("playing");
    main.removeCallbacks(tick);
    if (playing) main.postDelayed(tick, TICK_MS);
  }

  @Override public void onPlayerError(PlaybackException error) {
    main.removeCallbacks(tick);
    String msg = error.getErrorCodeName();
    // Which HTTP status, when the server or a proxy on the way answered with one (ebi saw only BAD_HTTP_STATUS).
    for (Throwable c = error.getCause(); c != null; c = c.getCause()) {
      if (c instanceof HttpDataSource.InvalidResponseCodeException) {
        msg += " " + ((HttpDataSource.InvalidResponseCodeException) c).responseCode;
        break;
      }
    }
    send(event("error").putOpt("msg", msg));
  }

  @Override public void onTracksChanged(Tracks tracks) {
    JSONArray audio = new JSONArray();
    int n = 0, current = -1;
    for (Tracks.Group group : tracks.getGroups()) {
      if (group.getType() != C.TRACK_TYPE_AUDIO) continue;
      for (int i = 0; i < group.length; i++, n++) {
        Format f = group.getTrackFormat(i);
        if (group.isTrackSelected(i)) current = n;
        JSONObject t = new JSONObject();
        try {
          t.put("index", n);
          if (f.language != null && !"und".equals(f.language)) t.put("language", f.language);
          if (f.channelCount > 0) t.put("channels", f.channelCount);
          String codec = codecName(f.sampleMimeType);
          if (codec != null) t.put("codec", codec);
          if (f.label != null) t.put("label", f.label);
        } catch (JSONException ignored) { /* never for these values */ }
        audio.put(t);
      }
    }
    audioIndex = current >= 0 ? current : audioIndex;
    send(event("tracks").putOpt("audio", audio).putOpt("cur", audioIndex));
  }

  @Override public void onVideoSizeChanged(VideoSize size) {
    videoSize = size;
    fitSurface();
  }

  // ---------- helpers ----------
  /** Duration is known once the file's index is read, before any picture is buffered: say so then,
   * so a resume position is sought before the player has loaded much from the start. */
  private void maybePrepared(boolean ready) {
    if (preparedSent || exo == null) return;
    long duration = exo.getDuration();
    if (duration == C.TIME_UNSET && !ready) return;
    preparedSent = true;
    send(event("prepared").putOpt("dur", duration == C.TIME_UNSET ? 0 : duration));
  }

  private void sendTime(String type) {
    if (exo == null) return;
    send(event(type).putOpt("ms", exo.getCurrentPosition()).putOpt("v", exo.isPlaying()));
  }

  /** Letterbox: the surface keeps the video's shape, centred in the black box. */
  private void fitSurface() {
    int bw = box.getWidth(), bh = box.getHeight();
    if (bw == 0 || bh == 0 || videoSize.width == 0 || videoSize.height == 0) return;
    float aspect = videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height;
    int w = bw, h = Math.round(bw / aspect);
    if (h > bh) { h = bh; w = Math.round(bh * aspect); }
    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) surface.getLayoutParams();
    if (lp.width == w && lp.height == h) return;
    lp.width = w;
    lp.height = h;
    lp.gravity = Gravity.CENTER;
    surface.setLayoutParams(lp);
  }

  private static String codecName(String mime) {
    if (mime == null) return null;
    switch (mime) {
      case "audio/ac3": return "AC3";
      case "audio/eac3": return "EAC3";
      case "audio/eac3-joc": return "Atmos";
      case "audio/mp4a-latm": return "AAC";
      case "audio/opus": return "Opus";
      case "audio/vnd.dts": return "DTS";
      case "audio/vnd.dts.hd": return "DTS-HD";
      case "audio/true-hd": return "TrueHD";
      case "audio/flac": return "FLAC";
      case "audio/mpeg": return "MP3";
      default: return mime.replace("audio/", "").toUpperCase(Locale.ROOT);
    }
  }

  private static Ev event(String type) { return new Ev(type); }
  private void send(Ev e) { events.send(e.json); }

  /** A JSONObject without checked exceptions. */
  private static final class Ev {
    final JSONObject json = new JSONObject();
    Ev(String type) { putOpt("t", type); }
    Ev putOpt(String key, Object value) {
      try { json.put(key, value); } catch (JSONException ignored) { /* never for these values */ }
      return this;
    }
  }
}
