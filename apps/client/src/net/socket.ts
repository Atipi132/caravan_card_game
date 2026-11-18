import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@caravan/engine';
import { getPlayerId, settingsStore } from '../settings';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;
let helloDone: Promise<boolean> | null = null;
const helloListeners = new Set<(resumed: boolean) => void>();

/** Lazily connects to the game server (same origin) and identifies with the anonymous player id. */
export function getSocket(): ClientSocket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 800 });
    const hello = () =>
      new Promise<boolean>((resolve) => {
        socket!.emit('hello', { playerId: getPlayerId(), name: settingsStore.get().name }, (r) => {
          const resumed = r.ok ? r.resumed : false;
          helloListeners.forEach((l) => l(resumed));
          resolve(resumed);
        });
      });
    let first: (v: boolean) => void = () => {};
    helloDone = new Promise((resolve) => (first = resolve));
    // Identify on every (re)connection, e.g. after a network drop or a server restart.
    socket.on('connect', () => {
      const p = hello();
      void p.then(first);
      helloDone = p;
    });
  }
  return socket;
}

/** Resolves once the server knows who we are; value tells whether a running game was resumed. */
export function ready(): Promise<boolean> {
  getSocket();
  return helloDone!;
}

/** Called after every successful identification with the server. */
export function onHello(listener: (resumed: boolean) => void): () => void {
  helloListeners.add(listener);
  return () => helloListeners.delete(listener);
}
