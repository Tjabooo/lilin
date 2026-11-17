import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveToken } from '../src/channels.js';
import { createLiveTv } from '../src/live-tv.js';
import { WatchRooms } from '../src/watch.js';
import { LiveChat, KEEP, MAX_AGE } from '../src/live-chat.js';
import { topicFor } from '../src/live.js';

const ep = (show, season, episode) => ({ key: `${show}-${season}-${episode}`, id: `${show}${season}${episode}`, file: `/m/${show}/${season}/${episode}.mkv`,
  kind: 'episode', show, showTitle: show, title: show, season, episode, genres: [35], anime: false });
const timesOf = async () => ({ duration: 1320, intro: null, creditsAt: 1260 });
const C = { oliver: 'oliver-client-1234567', ebi: 'ebi-client-123456789', ebi2: 'ebi-phone-123456789', mamma: 'mamma-client-12345678' };

// Oliver (owner), Ebi, and Mamma (restricted); a sitcoms channel; the real WatchRooms and LiveChat.
function rig({ file = null } = {}) {
  let now = Date.UTC(2026, 10, 17, 20, 0, 0);
  const users = [{ id: 1, name: 'Oliver', isOwner: true }, { id: 2, name: 'Ebi' }, { id: 3, name: 'Mamma', restricted: true }];
  const library = [ep('Office', 1, 1), ep('Office', 1, 2), ep('Office', 1, 3), ep('Parks', 1, 1)];
  const rooms = new WatchRooms({ now: () => now });
  const chat = new LiveChat({ file, now: () => now, userById: (id) => users.find((u) => u.id === id) || null, rooms, tokenOf: liveToken });
  const tv = createLiveTv({
    now: () => now, watchRooms: rooms, name: () => 'SEELE TV', genres: () => [], timesOf, chat,
    library: () => library,
    mediaFor: (key) => ({ kind: 'lib', id: key, mediaKey: key, title: key }),
    accounts: { listUsers: () => users, libraryOf: () => new Map(), sameLibrary: () => true, serverSettings: () => ({}) },
    social: { likedKeys: () => new Set(), dislikedKeys: () => new Set() },
  });
  // Tune in and open the event stream, like the player does; heard = everything the stream sent.
  const watch = async (user, client) => {
    const room = await tv.tune(user, 'sitcoms', client);
    const heard = [];
    rooms.subscribe(room.token, user, client, (m) => heard.push(m));
    return { token: room.token, heard, said: () => heard.filter((m) => m.chat || m.chatLog || m.reaction) };
  };
  return { tv, rooms, chat, users, watch, clock: (ms) => { now += ms; return now; } };
}

test('a channel chat reaches everyone tuned in and keeps its history after the room closes', async () => {
  const r = rig();
  const [oliver, ebi] = r.users;
  const o = await r.watch(oliver, C.oliver);
  const e = await r.watch(ebi, C.ebi);
  assert.deepEqual(e.said(), [], 'nothing said yet');
  const msg = r.rooms.chat(o.token, oliver, C.oliver, '  hej   alla <b>  ');
  assert.equal(msg.text, 'hej alla <b>', 'plain text, the page escapes it');
  assert.equal(msg.uid, 1, 'a channel message knows its author across devices');
  assert.deepEqual(e.said().map((m) => m.chat?.text), ['hej alla <b>']);
  r.rooms.react(o.token, oliver, C.oliver, '😂');
  assert.equal(e.said().at(-1).reaction.emoji, '😂');

  // Everyone leaves; the room closes a minute later; the channel's chat stays.
  r.rooms.leave(o.token, oliver, C.oliver); r.rooms.leave(e.token, ebi, C.ebi);
  r.clock(2 * 60000); r.rooms.cleanup();
  assert.equal(r.rooms.rooms.has(liveToken('sitcoms')), false, 'the room is gone');
  const back = await r.watch(ebi, C.ebi);
  assert.deepEqual(back.said()[0].chatLog.map((m) => m.text), ['hej alla <b>'], 'history on tuning back in');
  const next = r.rooms.chat(back.token, ebi, C.ebi, 'tillbaka');
  assert.ok(next.id > msg.id, 'numbering carries on, so players never mix two messages up');
});

test('restricted people get no channel chat: no posting, no history, no messages or reactions on the stream', async () => {
  const r = rig();
  const [oliver, , mamma] = r.users;
  const o = await r.watch(oliver, C.oliver);
  r.rooms.chat(o.token, oliver, C.oliver, 'before');
  const m = await r.watch(mamma, C.mamma);
  assert.deepEqual(m.said(), [], 'no history');
  assert.throws(() => r.rooms.chat(m.token, mamma, C.mamma, 'hi'), (e) => e.status === 403);
  assert.throws(() => r.rooms.react(m.token, mamma, C.mamma, '👍'), (e) => e.status === 403);
  r.rooms.chat(o.token, oliver, C.oliver, 'after');
  r.rooms.react(o.token, oliver, C.oliver, '🔥');
  assert.deepEqual(m.said(), [], 'nothing new reaches them either');
  assert.ok(m.heard.some((x) => x.live), 'but the channel itself plays as normal');
  assert.deepEqual(r.chat.log('sitcoms').map((x) => x.text), ['before', 'after']);

  // Restrict takes effect at once for someone already tuned in, and lifting it opens the chat again.
  const ebi = r.users[1];
  const e = await r.watch(ebi, C.ebi);
  const heardBefore = e.said().length;
  ebi.restricted = true;
  r.rooms.chat(o.token, oliver, C.oliver, 'secret');
  assert.equal(e.said().length, heardBefore);
  ebi.restricted = false;
  r.rooms.chat(o.token, oliver, C.oliver, 'open again');
  assert.equal(e.said().at(-1).chat.text, 'open again');
});

test('Restrict on a channel: nobody is sent a restricted viewer, and a restricted viewer is sent nobody', async () => {
  const r = rig();
  const [oliver, ebi, mamma] = r.users;
  const o = await r.watch(oliver, C.oliver);
  const e = await r.watch(ebi, C.ebi);
  const m = await r.watch(mamma, C.mamma);
  const last = (x) => x.heard.filter((s) => s.members).at(-1);
  const names = (state) => state.members.map((v) => v.name).sort();
  const everything = () => JSON.stringify([...o.heard, ...e.heard]);
  assert.deepEqual(names(last(o)), ['Ebi', 'Oliver'], 'the owner never gets Mamma');
  assert.deepEqual(names(last(e)), ['Ebi', 'Oliver']);
  assert.equal(everything().includes('Mamma'), false, 'not her name, anywhere on their streams');
  assert.deepEqual(names(last(m)), ['Mamma'], 'Mamma only gets herself');
  for (const x of [o, e, m]) assert.equal(last(x).watching, 3, 'everyone still gets the head count');
  assert.deepEqual(names(r.rooms.heartbeat(m.token, mamma, C.mamma, { ready: true })), ['Mamma'], 'the heartbeat answer too');
  assert.deepEqual(names(r.rooms.join(o.token, oliver, C.oliver)), ['Ebi', 'Oliver'], 'and the join answer');
  r.rooms.heartbeat(m.token, mamma, C.mamma, { buffering: true });
  assert.deepEqual(last(o).waitingFor, [], 'a channel never names who it waits for');

  // Two devices are one person in the count; Restrict on someone already tuned in hides them at their next heartbeat.
  await r.watch(ebi, C.ebi2);
  assert.equal(last(o).watching, 3);
  ebi.restricted = true;
  r.rooms.heartbeat(e.token, ebi, C.ebi, { ready: true });
  assert.deepEqual(names(last(o)), ['Oliver']);
  assert.deepEqual(names(last(e)), ['Ebi', 'Ebi'], 'Ebi sees her own two devices only');
  ebi.restricted = false;
});

test('normal Watch Together rooms keep their own chat, restricted people included', () => {
  let now = 1e12;
  const rooms = new WatchRooms({ now: () => now });
  const mamma = { id: 3, name: 'Mamma', restricted: true }, ebi = { id: 2, name: 'Ebi' };
  const room = rooms.create(mamma, { kind: 'lib', id: 'x', mediaKey: 'x', title: 'X' }, C.mamma);
  rooms.join(room.token, ebi, C.ebi);
  const heard = [];
  rooms.subscribe(room.token, mamma, C.mamma, (m) => heard.push(m));
  rooms.chat(room.token, ebi, C.ebi, 'hej mamma');
  assert.equal(heard.at(-1).chat.text, 'hej mamma');
  assert.equal(rooms.chat(room.token, mamma, C.mamma, 'hej!').text, 'hej!');
  assert.equal(heard.at(-1).chat.uid, undefined, 'room messages are as they were');
});

test('flood limits count a person across devices, and the same line twice is refused', async () => {
  const r = rig();
  const ebi = r.users[1];
  const a = await r.watch(ebi, C.ebi), b = await r.watch(ebi, C.ebi2);
  assert.throws(() => { r.rooms.chat(a.token, ebi, C.ebi, 'samma'); r.rooms.chat(b.token, ebi, C.ebi2, 'SAMMA'); }, /just said that/);
  for (let i = 0; i < 5; i++) r.rooms.chat(a.token, ebi, C.ebi, `a${i}`); // 6 on this device incl. 'samma'
  r.rooms.chat(b.token, ebi, C.ebi2, 'b0'); r.rooms.chat(b.token, ebi, C.ebi2, 'b1'); // 8 in total
  assert.throws(() => r.rooms.chat(b.token, ebi, C.ebi2, 'b2'), (e) => e.status === 429);
  r.clock(16000);
  assert.equal(r.rooms.chat(b.token, ebi, C.ebi2, 'b2').text, 'b2');
});

test('the owner removes a message: gone from the history and from the screens tuned in', async () => {
  const r = rig();
  const [oliver, ebi] = r.users;
  const o = await r.watch(oliver, C.oliver), e = await r.watch(ebi, C.ebi);
  const bad = r.rooms.chat(e.token, ebi, C.ebi, 'oops');
  r.rooms.chat(e.token, ebi, C.ebi, 'fine');
  r.chat.remove('sitcoms', bad.id);
  assert.deepEqual(o.said().at(-1).chatLog.map((m) => m.text), ['fine']);
  assert.deepEqual(e.said().at(-1).chatLog.map((m) => m.text), ['fine']);
  assert.throws(() => r.chat.remove('sitcoms', bad.id), (x) => x.status === 404);
  assert.deepEqual(topicFor('/api/live/sitcoms/chat/delete'), { topic: 'livechat', audience: 'admin' });
});

test('the history is saved, capped, ages out, and goes with a removed channel', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lilin-live-chat-'));
  const file = path.join(dir, '.lilin-live-chat.json');
  let now = Date.UTC(2026, 10, 17, 20, 0, 0);
  const a = new LiveChat({ file, now: () => now });
  const ch = a.forChannel('films');
  for (let i = 0; i < KEEP + 5; i++) ch.add({ id: ch.nextId(), text: `m${i}`, at: now, from: 'x', name: 'Ebi' });
  a.flush();
  const b = new LiveChat({ file, now: () => now });
  assert.equal(b.log('films').length, KEEP);
  assert.equal(b.log('films')[0].text, 'm5');
  assert.equal(b.forChannel('films').nextId(), KEEP + 6, 'numbering survives a restart');
  now += MAX_AGE + 1;
  assert.equal(b.log('films').length, 0, 'two weeks later it has aged out');
  b.forChannel('docs').add({ id: 1, text: 'x', at: now });
  b.forget('docs');
  b.flush();
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).channels), ['films']);
  fs.rmSync(dir, { recursive: true, force: true });
});
