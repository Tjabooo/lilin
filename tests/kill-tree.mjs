// Stops a Lilin server a test started. On Windows child.kill() ends only that process: the ffprobe,
// ffmpeg and other helpers it started keep running and hold the test's temp folder open (EBUSY).
import { spawnSync } from 'node:child_process';

export function killTree(child) {
  if (process.platform === 'win32' && child.pid && child.exitCode === null) {
    const r = spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    if (r.status === 0) return;
  }
  child.kill();
}
