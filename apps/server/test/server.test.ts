import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { isNumberCard, legalActions } from '@caravan/engine';
import type { Action, ClientToServerEvents, GameUpdate, ServerToClientEvents } from '@caravan/engine';
import { GameServer } from '../src/gameServer';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let url = '';
let server: GameServer;
const http = createServer();

beforeAll(async () => {
  server = new GameServer(http, { disconnectGraceMs: 400, turnMsOverride: 0 });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  http.close();
});

interface TestClient {
  socket: Client;
  updates: GameUpdate[];
  last(): GameUpdate;
  next(pred?: (u: GameUpdate) => boolean): Promise<GameUpdate>;
}

async function connect(playerId: string, name: string): Promise<TestClient> {
  const socket: Client = ioClient(url, { transports: ['websocket'], forceNew: true });
  const updates: GameUpdate[] = [];
  const waiters: { pred: (u: GameUpdate) => boolean; resolve: (u: GameUpdate) => void }[] = [];
  socket.on('game:state', (u) => {
    updates.push(u);
    for (const w of [...waiters]) {
      if (w.pred(u)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(u);
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => socket.emit('hello', { playerId, name }, (r) => (r.ok ? resolve() : reject(new Error(r.error)))));
  });
  return {
    socket,
    updates,
    last: () => updates[updates.length - 1],
    next: (pred = () => true) =>
      new Promise<GameUpdate>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for game:state')), 4000);
        waiters.push({
          pred,
          resolve: (u) => {
            clearTimeout(t);
            resolve(u);
          },
        });
      }),
  };
}

function act(c: TestClient, action: Action): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => c.socket.emit('game:action', { action }, (r) => resolve(r as { ok: boolean; error?: string })));
}

const deck = { backSet: 'atomic' as const };

describe('GameServer', () => {
  it('pairs two players through quick match with redacted views', async () => {
    const a = await connect('player-aaaaaaaa', 'Alice');
    const b = await connect('player-bbbbbbbb', 'Bob');
    const pa = a.next();
    const pb = b.next();
    await new Promise<void>((r) => a.socket.emit('queue:join', { deck }, () => r()));
    await new Promise<void>((r) => b.socket.emit('queue:join', { deck: { backSet: 'lucky' } }, () => r()));
    const [ua, ub] = await Promise.all([pa, pb]);
    expect(ua.gameId).toBe(ub.gameId);
    expect(ua.view.you).not.toBe(ub.view.you);
    expect(ua.opponentName).toBe('Bob');
    expect(ua.view.hand).toHaveLength(8);
    expect(ua.view.opponent.hand.every((h) => h.hidden)).toBe(true);
    // Opponent card faces never leave the server.
    const json = JSON.stringify(ua);
    for (const c of ub.view.hand) expect(json).not.toContain(`"rank":"${c.rank}","suit":"${c.suit}","id":"${c.id}"`);
    expect(JSON.stringify(ua.view.opponent.hand)).not.toContain('rank');
    expect(ub.view.hand[0].set).toBe('lucky');

    // Play the opening round through the server.
    for (let i = 0; i < 6; i++) {
      const cur = [a, b].find((c) => c.last().view.turn === c.last().view.you)!;
      const v = cur.last().view;
      const card = v.hand.find(isNumberCard)!;
      const lane = v.caravans[v.you].findIndex((c) => c.cards.length === 0) as 0 | 1 | 2;
      const other = cur === a ? b : a;
      const p = other.next();
      const r = await act(cur, { type: 'play', cardId: card.id, target: { player: v.you, caravan: lane } });
      expect(r.ok).toBe(true);
      await p;
    }
    expect(a.last().view.phase).toBe('main');

    // Illegal actions are rejected.
    const notTurn = a.last().view.turn === a.last().view.you ? b : a;
    const bad = await act(notTurn, { type: 'discard', cardId: notTurn.last().view.hand[0].id });
    expect(bad.ok).toBe(false);
    const cheat = await act(notTurn, { type: 'timeout' } as Action);
    expect(cheat.ok).toBe(false);

    // Forfeit ends the game for both.
    const pEnd = b.next((u) => u.view.phase === 'ended');
    await act(a, { type: 'forfeit' });
    const end = await pEnd;
    expect(end.view.winner).toBe(end.view.you);

    // Rematch requires both players.
    const pr = b.next((u) => u.rematch === 'opponent');
    a.socket.emit('game:rematch');
    await pr;
    const fresh = a.next((u) => u.view.phase === 'opening');
    b.socket.emit('game:rematch');
    const u2 = await fresh;
    expect(u2.view.hand).toHaveLength(8);
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it('private rooms: create, join with code, reconnect, disconnect forfeit', async () => {
    const host = await connect('player-hosthost', 'Host');
    const code = await new Promise<string>((resolve, reject) =>
      host.socket.emit('room:create', { settings: { jokers: 0, turnSeconds: 30 }, deck }, (r) => (r.ok ? resolve(r.code) : reject(new Error(r.error)))),
    );
    expect(code).toMatch(/^[A-Z]{5}$/);
    const guest = await connect('player-guestgst', 'Guest');
    const badJoin = await new Promise<{ ok: boolean }>((r) => guest.socket.emit('room:join', { code: 'ZZZZZ', deck }, r));
    expect(badJoin.ok).toBe(false);
    const ph = host.next();
    const joined = await new Promise<{ ok: boolean }>((r) => guest.socket.emit('room:join', { code: code.toLowerCase(), deck }, r));
    expect(joined.ok).toBe(true);
    const u = await ph;
    expect(u.settings.jokers).toBe(0);
    expect(u.view.me.deckCount + u.view.hand.length).toBe(52);
    expect(u.deadline).toBeGreaterThan(Date.now());

    // Guest reloads the page: same player id, game resumes.
    const pDisc = host.next((x) => !x.opponentConnected);
    guest.socket.disconnect();
    await pDisc;
    const pBack = host.next((x) => x.opponentConnected);
    const guest2 = await connect('player-guestgst', 'Guest');
    await pBack;
    expect(guest2.updates.length).toBeGreaterThan(0);
    expect(guest2.last().gameId).toBe(u.gameId);

    // Guest disappears for good → forfeits after the grace period.
    const pEnd = host.next((x) => x.view.phase === 'ended');
    guest2.socket.disconnect();
    const end = await pEnd;
    expect(end.view.winner).toBe(end.view.you);
    expect(end.view.endReason).toBe('forfeit');
    host.socket.disconnect();
  });

  it('turn timer plays an automatic move, then forfeits after repeated timeouts', async () => {
    const http2 = createServer();
    const s2 = new GameServer(http2, { turnMsOverride: 150, maxTimeouts: 2 });
    await new Promise<void>((r) => http2.listen(0, '127.0.0.1', () => r()));
    const prevUrl = url;
    url = `http://127.0.0.1:${(http2.address() as AddressInfo).port}`;
    try {
      const a = await connect('player-timer-a1', 'A');
      const b = await connect('player-timer-b1', 'B');
      const pEnd = a.next((u) => u.view.phase === 'ended');
      a.socket.emit('queue:join', { deck }, () => {});
      b.socket.emit('queue:join', { deck }, () => {});
      const end = await pEnd;
      expect(end.view.endReason).toBe('timeout');
      // Each player got one automatic opening move before someone hit the limit.
      const total = end.view.caravans[0].concat(end.view.caravans[1]).filter((c) => c.cards.length > 0).length;
      expect(total).toBeGreaterThanOrEqual(2);
      a.socket.disconnect();
      b.socket.disconnect();
    } finally {
      url = prevUrl;
      s2.close();
      http2.close();
    }
  });

  it('legal action helper sanity (server reuses the engine)', () => {
    expect(typeof legalActions).toBe('function');
  });
});
