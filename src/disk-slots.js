// Heavy background readers take turns on a hard drive. A conversion reads a whole video (tens of GB
// for a 4K remux); on one hard drive several readers at once spend their time seeking between files
// (measured on geofront: 5 jobs together read ~70 MB/s from a disk that streams 200+ MB/s to one
// reader). Drives listed here let only a few conversions read at a time; the rest wait their turn
// before they start. Used by convert.js only: players, timeline previews and credits (which run while
// someone watches) never wait here, and a copy someone is waiting to play skips the queue.
//
//   BACKGROUND_SERIAL_DRIVES     drive letters to queue on, e.g. "E" or "E,F" (Windows; empty = off)
//   BACKGROUND_READS_PER_DRIVE   heavy jobs reading one such drive at once (default 1)
import path from 'node:path';

const lanes = new Map();

const serialDrives = () => new Set(String(process.env.BACKGROUND_SERIAL_DRIVES || '')
  .toUpperCase().split(/[\s,;]+/).map((d) => d.replace(/[:\\/]+$/, '')).filter((d) => /^[A-Z]$/.test(d)));
const perDrive = () => Math.max(1, Math.floor(Number(process.env.BACKGROUND_READS_PER_DRIVE) || 1));

export function driveOf(file) {
  const m = /^([A-Za-z]):[\\/]/.exec(String(file || ''));
  return m ? m[1].toUpperCase() : null;
}

function laneFor(file) {
  const d = driveOf(file);
  if (!d || !serialDrives().has(d)) return null;
  let lane = lanes.get(d);
  if (!lane) lanes.set(d, lane = { running: 0, waiting: [] });
  return lane;
}

function releaser(lane) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    lane.running -= 1;
    while (lane.running < perDrive() && lane.waiting.length) lane.waiting.shift()();
  };
}

// Waits for a turn to read `file`; resolves to release(), to be called once the job is done reading.
export function diskSlot(file) {
  const lane = laneFor(file);
  if (!lane) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    const grant = () => { lane.running += 1; resolve(releaser(lane)); };
    if (lane.running < perDrive()) grant(); else lane.waiting.push(grant);
  });
}

// For a job that is already reading (a conversion picked up again after a restart): counts it at once.
export function diskSlotNow(file) {
  const lane = laneFor(file);
  if (!lane) return () => {};
  lane.running += 1;
  return releaser(lane);
}

export function diskSlotStatus() {
  return [...lanes].map(([drive, l]) => ({ drive, running: l.running, waiting: l.waiting.length }));
}
