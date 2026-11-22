import test from 'node:test';
import assert from 'node:assert/strict';
import { diskSlot, diskSlotNow, driveOf, diskSlotStatus } from '../src/disk-slots.js';

test('driveOf reads Windows drive letters only', () => {
  assert.equal(driveOf('E:/Media/a.mkv'), 'E');
  assert.equal(driveOf('g:/x.mp4'), 'G');
  assert.equal(driveOf('/mnt/media/a.mkv'), null);
});

test('heavy jobs on a queued drive take turns; other drives are not queued', async () => {
  process.env.BACKGROUND_SERIAL_DRIVES = 'E';
  process.env.BACKGROUND_READS_PER_DRIVE = '1';
  const order = [];
  const first = await diskSlot('E:/a.mkv');
  let secondGot = false;
  const second = diskSlot('E:/b.mkv').then((r) => { secondGot = true; order.push('b'); return r; });
  const other = await diskSlot('G:/c.mkv'); // not queued: immediate
  other();
  await new Promise((r) => setImmediate(r));
  assert.equal(secondGot, false);
  assert.deepEqual(diskSlotStatus().find((l) => l.drive === 'E'), { drive: 'E', running: 1, waiting: 1 });
  first(); first(); // releasing twice counts once
  const release2 = await second;
  assert.deepEqual(order, ['b']);
  assert.deepEqual(diskSlotStatus().find((l) => l.drive === 'E'), { drive: 'E', running: 1, waiting: 0 });
  release2();
  const adopted = diskSlotNow('E:/d.mkv');
  let thirdGot = false;
  const third = diskSlot('E:/e.mkv').then((r) => { thirdGot = true; return r; });
  await new Promise((r) => setImmediate(r));
  assert.equal(thirdGot, false);
  adopted();
  (await third)();
  assert.deepEqual(diskSlotStatus().find((l) => l.drive === 'E'), { drive: 'E', running: 0, waiting: 0 });
  delete process.env.BACKGROUND_SERIAL_DRIVES;
});

test('without BACKGROUND_SERIAL_DRIVES nothing waits', async () => {
  delete process.env.BACKGROUND_SERIAL_DRIVES;
  const a = await diskSlot('E:/a.mkv');
  const b = await diskSlot('E:/b.mkv');
  a(); b();
});
