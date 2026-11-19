// Live TV channel switch: the picture drops to analogue static for a moment (at least a quarter second, longer if
// the next channel's picture isn't there yet), like an old set changing channel. The grain is a small canvas of
// random grey pixels redrawn every frame and stretched over the picture; a brighter band rolls down through it.
// Reduced motion: one still frame of grain, no roll.
export const STATIC_MIN_MS = 250;

const W = 200, H = 112; // stretched over the stage: coarse enough to read as grain, cheap to fill per frame

// One frame of grey noise into `data` (a Uint32Array view of RGBA pixels), with an optional brighter band.
// `rand` is injectable for the tests.
export function fillGrain(data, w, h, { band = -1, rand = Math.random } = {}) {
  const half = h * 0.09;
  for (let y = 0; y < h; y++) {
    const lift = band >= 0 && Math.abs(y - band) < half ? 1.35 : 1;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = Math.min(255, (rand() * 200 + 28) * lift) | 0;
      data[row + x] = 0xff000000 | (v << 16) | (v << 8) | v; // little-endian ABGR: grey either way
    }
  }
  return data;
}

export function createChannelStatic({ h, reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches }) {
  const canvas = h('canvas', { class: 'channel-static', width: String(W), height: String(H), 'aria-hidden': 'true' });
  const ctx = canvas.getContext('2d', { alpha: false });
  const image = ctx?.createImageData(W, H);
  const pixels = image && new Uint32Array(image.data.buffer);
  let raf = 0, started = 0, last = 0;

  function frame(now) {
    raf = 0;
    if (!canvas.classList.contains('is-on')) return;
    if (now - last > 30) { // ~30 fps is plenty for grain and keeps the CPU out of it
      last = now;
      const band = ((now - started) / 700 % 1.3) * H - H * 0.15;
      fillGrain(pixels, W, H, { band });
      ctx.putImageData(image, 0, 0);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!ctx) return;
    canvas.classList.add('is-on');
    started = performance.now();
    if (reducedMotion()) { fillGrain(pixels, W, H); ctx.putImageData(image, 0, 0); return; }
    last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    canvas.classList.remove('is-on');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  return { el: canvas, start, stop, on: () => canvas.classList.contains('is-on') };
}
