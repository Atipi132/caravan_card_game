import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import {
  DEFAULT_ROOM_SETTINGS,
  applyAction,
  createGame,
  legalActions,
  randomSeed,
  standardDeck,
  validateDeck,
  viewFor,
  CARD_SETS,
} from '@caravan/engine';
import type {
  Action,
  CardSpec,
  ClientToServerEvents,
  DeckChoice,
  GameState,
  GameUpdate,
  PlayerIndex,
  RoomSettings,
  ServerToClientEvents,
} from '@caravan/engine';

type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export interface ServerOptions {
  /** Grace period before a disconnected player forfeits (ms). */
  disconnectGraceMs?: number;
  /** Override the turn length of every game (ms), mostly for tests. */
  turnMsOverride?: number;
  /** Consecutive timeouts before a player forfeits. */
  maxTimeouts?: number;
  roomTtlMs?: number;
  log?: (msg: string) => void;
}

interface PlayerRec {
  id: string;
  name: string;
  socket: IoSocket | null;
  gameId: string | null;
  roomCode: string | null;
  queued: DeckChoice | null;
}

interface GameRec {
  id: string;
  state: GameState;
  players: [string, string];
  decks: [CardSpec[], CardSpec[]];
  settings: RoomSettings;
  deadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  timeouts: [number, number];
  rematch: Set<PlayerIndex>;
  /** Players who left after the end; rematch impossible. */
  left: Set<PlayerIndex>;
  disconnectTimers: [NodeJS.Timeout | null, NodeJS.Timeout | null];
  notice?: string;
  round: number;
}

interface RoomRec {
  code: string;
  host: string;
  settings: RoomSettings;
  deck: DeckChoice;
  created: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function sanitizeName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20) : '';
  return s || 'Courier';
}

function sanitizeSettings(p: Partial<RoomSettings> | undefined): RoomSettings {
  const s = { ...DEFAULT_ROOM_SETTINGS };
  if (p && typeof p === 'object') {
    if (p.jokers === 0 || p.jokers === 1 || p.jokers === 2) s.jokers = p.jokers;
    if (typeof p.allowCustomDecks === 'boolean') s.allowCustomDecks = p.allowCustomDecks;
    if (typeof p.turnSeconds === 'number' && p.turnSeconds >= 15 && p.turnSeconds <= 300) s.turnSeconds = Math.round(p.turnSeconds);
  }
  return s;
}

function sanitizeDeckChoice(d: unknown): DeckChoice {
  const c = (d && typeof d === 'object' ? d : {}) as Partial<DeckChoice>;
  const backSet = CARD_SETS.includes(c.backSet as never) ? (c.backSet as DeckChoice['backSet']) : 'atomic';
  return { backSet, custom: Array.isArray(c.custom) ? c.custom.slice(0, 216) : undefined };
}

function isAction(a: unknown): a is Action {
  if (!a || typeof a !== 'object') return false;
  const t = (a as { type?: unknown }).type;
  return t === 'play' || t === 'discard' || t === 'disband' || t === 'forfeit';
}

export class GameServer {
  readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private players = new Map<string, PlayerRec>();
  private games = new Map<string, GameRec>();
  private rooms = new Map<string, RoomRec>();
  private queue: string[] = [];
  private opts: Required<ServerOptions>;
  private sweeper: NodeJS.Timeout;

  constructor(http: HttpServer, opts: ServerOptions = {}) {
    this.opts = {
      disconnectGraceMs: opts.disconnectGraceMs ?? 90_000,
      turnMsOverride: opts.turnMsOverride ?? 0,
      maxTimeouts: opts.maxTimeouts ?? 3,
      roomTtlMs: opts.roomTtlMs ?? 30 * 60_000,
      log: opts.log ?? (() => {}),
    };
    this.io = new Server(http, { cors: { origin: true }, pingInterval: 10_000, pingTimeout: 8_000 });
    this.io.on('connection', (socket) => this.onConnection(socket));
    this.sweeper = setInterval(() => this.sweep(), 60_000);
  }

  /** Warns every connected client that the server is going away (deployments). */
  announceShutdown(): void {
    this.io.emit('game:closed', { reason: 'The server is restarting for an update. Games in progress are lost – sorry! Reload in a few seconds.' });
  }

  close(): void {
    clearInterval(this.sweeper);
    for (const g of this.games.values()) this.clearTimers(g);
    this.io.close();
  }

  stats() {
    let online = 0;
    for (const p of this.players.values()) if (p.socket) online++;
    return { online, games: [...this.games.values()].filter((g) => g.state.phase !== 'ended').length, queue: this.queue.length, rooms: this.rooms.size };
  }

  // ----------------------------------------------------------------------------------------------
  private onConnection(socket: IoSocket): void {
    let player: PlayerRec | null = null;

    socket.on('hello', (p, ack) => {
      if (typeof ack !== 'function') return;
      const id = typeof p?.playerId === 'string' && p.playerId.length >= 8 && p.playerId.length <= 64 ? p.playerId : null;
      if (!id) return ack({ ok: false, error: 'Invalid player id' });
      let rec = this.players.get(id);
      if (!rec) {
        rec = { id, name: sanitizeName(p.name), socket: null, gameId: null, roomCode: null, queued: null };
        this.players.set(id, rec);
      }
      rec.name = sanitizeName(p.name);
      if (rec.socket && rec.socket.id !== socket.id) {
        rec.socket.emit('game:closed', { reason: 'Connected from another tab.' });
        rec.socket.disconnect(true);
      }
      rec.socket = socket;
      player = rec;
      const game = rec.gameId ? this.games.get(rec.gameId) : undefined;
      const resumed = !!game;
      ack({ ok: true, resumed });
      if (game) {
        const idx = game.players.indexOf(rec.id) as PlayerIndex;
        const t = game.disconnectTimers[idx];
        if (t) clearTimeout(t);
        game.disconnectTimers[idx] = null;
        this.broadcast(game);
      } else if (rec.roomCode && this.rooms.has(rec.roomCode)) {
        const room = this.rooms.get(rec.roomCode)!;
        socket.emit('room:waiting', { code: room.code, settings: room.settings });
      }
      socket.emit('server:stats', this.stats());
    });

    const need = (): PlayerRec | null => player;

    socket.on('queue:join', (p, ack) => {
      const me = need();
      if (!me || typeof ack !== 'function') return;
      if (me.gameId && this.isLive(me.gameId)) return ack({ ok: false, error: 'You are already in a game' });
      this.detachFromGame(me);
      this.leaveRoom(me);
      me.queued = sanitizeDeckChoice(p?.deck);
      if (!this.queue.includes(me.id)) this.queue.push(me.id);
      ack({ ok: true });
      this.matchQueue();
      this.emitQueue();
    });

    socket.on('queue:leave', () => {
      const me = need();
      if (!me) return;
      this.leaveQueue(me);
    });

    socket.on('room:create', (p, ack) => {
      const me = need();
      if (!me || typeof ack !== 'function') return;
      if (me.gameId && this.isLive(me.gameId)) return ack({ ok: false, error: 'You are already in a game' });
      this.detachFromGame(me);
      this.leaveQueue(me);
      this.leaveRoom(me);
      const code = this.newCode();
      const room: RoomRec = { code, host: me.id, settings: sanitizeSettings(p?.settings), deck: sanitizeDeckChoice(p?.deck), created: Date.now() };
      if (room.settings.allowCustomDecks && room.deck.custom && !validateDeck(room.deck.custom).ok) {
        return ack({ ok: false, error: 'Your custom deck is not valid' });
      }
      this.rooms.set(code, room);
      me.roomCode = code;
      ack({ ok: true, code });
      socket.emit('room:waiting', { code, settings: room.settings });
      this.opts.log(`room ${code} created by ${me.name}`);
    });

    socket.on('room:join', (p, ack) => {
      const me = need();
      if (!me || typeof ack !== 'function') return;
      const code = typeof p?.code === 'string' ? p.code.trim().toUpperCase() : '';
      const room = this.rooms.get(code);
      if (!room) return ack({ ok: false, error: 'Room not found. Check the code.' });
      if (room.host === me.id) return ack({ ok: false, error: 'You created this room. Share the code with a friend.' });
      if (me.gameId && this.isLive(me.gameId)) return ack({ ok: false, error: 'You are already in a game' });
      const deck = sanitizeDeckChoice(p?.deck);
      if (room.settings.allowCustomDecks && deck.custom && !validateDeck(deck.custom).ok) {
        return ack({ ok: false, error: 'Your custom deck is not valid' });
      }
      const host = this.players.get(room.host);
      if (!host || !host.socket) {
        this.rooms.delete(code);
        return ack({ ok: false, error: 'The host is no longer connected.' });
      }
      this.detachFromGame(me);
      this.leaveQueue(me);
      this.leaveRoom(me);
      this.rooms.delete(code);
      host.roomCode = null;
      ack({ ok: true });
      this.startGame([host, me], [room.deck, deck], room.settings);
    });

    socket.on('room:leave', () => {
      const me = need();
      if (me) this.leaveRoom(me);
    });

    socket.on('game:action', (p, ack) => {
      const me = need();
      if (!me || typeof ack !== 'function') return;
      const game = me.gameId ? this.games.get(me.gameId) : undefined;
      if (!game) return ack({ ok: false, error: 'You are not in a game' });
      if (!isAction(p?.action)) return ack({ ok: false, error: 'Invalid action' });
      const idx = game.players.indexOf(me.id) as PlayerIndex;
      const r = applyAction(game.state, idx, p.action);
      if (!r.ok) return ack({ ok: false, error: r.error });
      game.timeouts[idx] = 0;
      ack({ ok: true });
      this.setState(game, r.state);
    });

    socket.on('game:rematch', () => {
      const me = need();
      const game = me?.gameId ? this.games.get(me.gameId) : undefined;
      if (!me || !game || game.state.phase !== 'ended') return;
      const idx = game.players.indexOf(me.id) as PlayerIndex;
      if (game.left.size > 0) return;
      game.rematch.add(idx);
      if (game.rematch.size === 2) this.restart(game);
      else this.broadcast(game);
    });

    socket.on('game:leave', () => {
      const me = need();
      if (me) this.detachFromGame(me);
    });

    socket.on('disconnect', () => {
      const me = player;
      if (!me || me.socket?.id !== socket.id) return;
      me.socket = null;
      this.leaveQueue(me);
      if (me.roomCode) {
        // Keep the room for a short while: the host may just be reloading the page.
        const code = me.roomCode;
        setTimeout(() => {
          if (!me.socket && me.roomCode === code) this.leaveRoom(me);
        }, 30_000);
      }
      const game = me.gameId ? this.games.get(me.gameId) : undefined;
      if (game) {
        const idx = game.players.indexOf(me.id) as PlayerIndex;
        if (game.state.phase !== 'ended') {
          game.disconnectTimers[idx] = setTimeout(() => {
            if (me.socket) return;
            const r = applyAction(game.state, idx, { type: 'forfeit' });
            if (r.ok) {
              game.notice = `${me.name} disconnected and forfeited.`;
              this.setState(game, r.state);
            }
          }, this.opts.disconnectGraceMs);
        }
        this.broadcast(game);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------
  private isLive(gameId: string): boolean {
    const g = this.games.get(gameId);
    return !!g && g.state.phase !== 'ended';
  }

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private leaveQueue(p: PlayerRec): void {
    const i = this.queue.indexOf(p.id);
    if (i >= 0) {
      this.queue.splice(i, 1);
      this.emitQueue();
    }
    p.queued = null;
  }

  private leaveRoom(p: PlayerRec): void {
    if (p.roomCode) {
      const room = this.rooms.get(p.roomCode);
      if (room && room.host === p.id) this.rooms.delete(p.roomCode);
      p.roomCode = null;
    }
  }

  private emitQueue(): void {
    for (const id of this.queue) {
      this.players.get(id)?.socket?.emit('queue:status', { searching: true, waiting: this.queue.length });
    }
  }

  private matchQueue(): void {
    while (this.queue.length >= 2) {
      const a = this.players.get(this.queue.shift()!);
      const b = this.players.get(this.queue.shift()!);
      if (!a?.socket || !a.queued) {
        if (b) this.queue.unshift(b.id);
        continue;
      }
      if (!b?.socket || !b.queued) {
        this.queue.unshift(a.id);
        continue;
      }
      const decks: [DeckChoice, DeckChoice] = [a.queued, b.queued];
      a.queued = null;
      b.queued = null;
      this.startGame([a, b], decks, { ...DEFAULT_ROOM_SETTINGS, allowCustomDecks: false });
    }
  }

  private resolveDeck(choice: DeckChoice, settings: RoomSettings): CardSpec[] {
    if (settings.allowCustomDecks && choice.custom && validateDeck(choice.custom).ok) return choice.custom;
    return standardDeck(choice.backSet, settings.jokers);
  }

  private startGame(players: [PlayerRec, PlayerRec], choices: [DeckChoice, DeckChoice], settings: RoomSettings): void {
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const decks: [CardSpec[], CardSpec[]] = [this.resolveDeck(choices[0], settings), this.resolveDeck(choices[1], settings)];
    const seed = randomSeed();
    const game: GameRec = {
      id,
      state: createGame({ decks, firstPlayer: (seed % 2) as PlayerIndex }, seed),
      players: [players[0].id, players[1].id],
      decks,
      settings,
      deadline: null,
      turnTimer: null,
      timeouts: [0, 0],
      rematch: new Set(),
      left: new Set(),
      disconnectTimers: [null, null],
      round: 1,
    };
    this.games.set(id, game);
    for (const p of players) {
      // Leaving a finished previous game.
      if (p.gameId && p.gameId !== id) this.detachFromGame(p);
      p.gameId = id;
    }
    this.opts.log(`game ${id}: ${players[0].name} vs ${players[1].name}`);
    this.setState(game, game.state);
  }

  private restart(game: GameRec): void {
    const seed = randomSeed();
    const first: PlayerIndex = game.state.firstPlayer === 0 ? 1 : 0;
    game.round++;
    game.rematch.clear();
    game.timeouts = [0, 0];
    game.notice = undefined;
    this.setState(game, createGame({ decks: game.decks, firstPlayer: first }, seed));
  }

  private setState(game: GameRec, state: GameState): void {
    game.state = state;
    this.clearTurnTimer(game);
    if (state.phase !== 'ended') {
      const ms = this.opts.turnMsOverride || game.settings.turnSeconds * 1000;
      game.deadline = Date.now() + ms;
      game.turnTimer = setTimeout(() => this.onTimeout(game), ms);
    } else {
      game.deadline = null;
      for (const t of game.disconnectTimers) if (t) clearTimeout(t);
      game.disconnectTimers = [null, null];
    }
    this.broadcast(game);
  }

  private onTimeout(game: GameRec): void {
    const s = game.state;
    if (s.phase === 'ended') return;
    const p = s.turn;
    game.timeouts[p]++;
    let r;
    if (game.timeouts[p] >= this.opts.maxTimeouts) {
      r = applyAction(s, p, { type: 'timeout' });
    } else {
      // Automatic move: start a caravan during the opening, otherwise discard a random card.
      const actions = legalActions(s, p);
      const hand = s.players[p].hand;
      const card = hand[Math.floor(Math.random() * hand.length)];
      const a: Action = s.phase === 'main' && card ? { type: 'discard', cardId: card.id } : (actions[0] ?? { type: 'timeout' });
      r = applyAction(s, p, a);
    }
    if (r.ok) this.setState(game, r.state);
  }

  private clearTurnTimer(game: GameRec): void {
    if (game.turnTimer) clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }

  private clearTimers(game: GameRec): void {
    this.clearTurnTimer(game);
    for (const t of game.disconnectTimers) if (t) clearTimeout(t);
  }

  /** Removes a player from their current game (forfeiting it if still running). */
  private detachFromGame(p: PlayerRec): void {
    const game = p.gameId ? this.games.get(p.gameId) : undefined;
    p.gameId = null;
    if (!game) return;
    const idx = game.players.indexOf(p.id) as PlayerIndex;
    game.left.add(idx);
    game.rematch.clear();
    if (game.state.phase !== 'ended') {
      const r = applyAction(game.state, idx, { type: 'forfeit' });
      game.notice = `${p.name} left the game.`;
      if (r.ok) this.setState(game, r.state);
    } else {
      game.notice = `${p.name} left the table.`;
      this.broadcast(game);
    }
    // Drop the game once nobody is attached anymore.
    const other = this.players.get(game.players[idx === 0 ? 1 : 0]);
    if (!other || other.gameId !== game.id) {
      this.clearTimers(game);
      this.games.delete(game.id);
    }
  }

  private broadcast(game: GameRec): void {
    game.players.forEach((pid, i) => {
      const p = this.players.get(pid);
      if (!p?.socket || p.gameId !== game.id) return;
      const idx = i as PlayerIndex;
      const opp = this.players.get(game.players[idx === 0 ? 1 : 0]);
      const rematch = game.rematch.has(idx) ? 'you' : game.rematch.size > 0 ? 'opponent' : 'none';
      const update: GameUpdate = {
        gameId: game.id,
        round: game.round,
        view: viewFor(game.state, idx),
        youName: p.name,
        opponentName: opp?.name ?? 'Opponent',
        opponentConnected: !!opp?.socket && opp.gameId === game.id,
        deadline: game.deadline,
        serverNow: Date.now(),
        rematch,
        settings: game.settings,
        notice: game.notice,
      };
      p.socket.emit('game:state', update);
    });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) if (now - room.created > this.opts.roomTtlMs) this.rooms.delete(code);
    for (const [id, p] of this.players) {
      if (!p.socket && !p.gameId && !p.roomCode) this.players.delete(id);
    }
  }
}
