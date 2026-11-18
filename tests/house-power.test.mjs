import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initHouse, bootPoll, powerAction, houseReport } from '../src/house.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-house-'));
initHouse({ dataDir: dir });
const req = { socket: { remoteAddress: '192.168.1.26' } };
const ARCH = 'Arch Linux';
const WIN = 'Windows Boot Manager (on /dev/nvme0n1p1)';
const linuxPoll = (uptime = 600) => bootPoll(req, {
  host: 'desk', mac: 'aa:bb:cc:dd:ee:ff', iface: 'enp5s0', wired: true, wol: 'g', default: ARCH, uptime,
  entries: [{ title: ARCH, os: 'linux', current: true }, { title: WIN, os: 'windows' }],
});
const windowsPoll = (uptime = 600) => bootPoll(req, { host: 'desk', running: 'windows', mac: 'AA:BB:CC:DD:EE:FF', uptime });
const view = async () => (await houseReport()).power.find((p) => p.host === 'desk');

test('a dual-boot machine in Windows shows as on in Windows, keeping what Linux reported', async () => {
  linuxPoll();
  assert.deepEqual(windowsPoll(), { ok: true });
  const pw = await view();
  assert.equal(pw.on, true);
  assert.equal(pw.os, 'Windows');
  assert.deepEqual(pw.entries.map((e) => [e.title, e.current]), [[ARCH, false], [WIN, true]]);
  assert.deepEqual(pw.notes, []);   // Wake-on-LAN and GRUB's default are still Linux's
});

test('restart into Linux from Windows: the Windows agent just reboots (GRUB starts Linux)', async () => {
  windowsPoll();
  await powerAction('desk', 'restart', ARCH);
  assert.deepEqual(windowsPoll(), { ok: true, reboot: true, entry: ARCH });
  assert.deepEqual(linuxPoll(20), { ok: true });   // Linux comes up and stays
});

test('restart from Windows comes back to Windows: Linux hands over after the reboot', async () => {
  windowsPoll();
  await powerAction('desk', 'restart', null);
  assert.deepEqual(windowsPoll(), { ok: true, reboot: true, entry: null });
  assert.equal((await view()).pending.action, 'wake');
  assert.deepEqual(linuxPoll(15), { ok: true, reboot: true, entry: WIN });
  assert.deepEqual(windowsPoll(10), { ok: true });
});

test('Windows polling before Linux ever did gets a stand-in entry', async () => {
  bootPoll(req, { host: 'fresh', running: 'windows', uptime: 50 });
  const pw = (await houseReport()).power.find((p) => p.host === 'fresh');
  assert.equal(pw.on, true);
  assert.equal(pw.os, 'Windows');
});
