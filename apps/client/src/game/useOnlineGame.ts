import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, GameUpdate } from '@caravan/engine';
import type { GameSession } from './session';
import { getSocket, onHello } from '../net/socket';
import { recordResult, settingsStore } from '../settings';

/** A game played against a remote player through the server. */
export function useOnlineGame(initial: GameUpdate, onLeave: () => void): GameSession {
  const [update, setUpdate] = useState<GameUpdate>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const skew = useRef(Date.now() - initial.serverNow);
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    const s = getSocket();
    const onState = (u: GameUpdate) => {
      skew.current = Date.now() - u.serverNow;
      setUpdate(u);
    };
    const onClosed = (p: { reason: string }) => setStatus(p.reason);
    const onDisconnect = () => setStatus((cur) => cur ?? 'Connection lost… reconnecting');
    // After a reconnection the server tells us whether our game still exists (it does not after a restart).
    const offHello = onHello((resumed) =>
      setStatus(resumed ? null : 'This game was interrupted (server restart). Go back to the main menu to start a new one.'),
    );
    s.on('game:state', onState);
    s.on('game:closed', onClosed);
    s.on('disconnect', onDisconnect);
    return () => {
      s.off('game:state', onState);
      s.off('game:closed', onClosed);
      s.off('disconnect', onDisconnect);
      offHello();
    };
  }, []);

  // Stats (one record per finished round).
  const ante = settingsStore.get().ante;
  useEffect(() => {
    const v = update.view;
    const key = `${update.gameId}:${update.round}`;
    if (v.phase === 'ended' && recorded.current !== key) {
      recorded.current = key;
      recordResult(v.winner === v.you, ante);
    }
  }, [update, ante]);

  const act = useCallback(
    (action: Action) =>
      new Promise<string | null>((resolve) => {
        const s = getSocket();
        if (!s.connected) return resolve('Not connected to the server.');
        const t = setTimeout(() => resolve('The server did not answer.'), 8000);
        s.emit('game:action', { action }, (r) => {
          clearTimeout(t);
          resolve(r.ok ? null : r.error);
        });
      }),
    [],
  );

  const requestRematch = useCallback(() => getSocket().emit('game:rematch'), []);
  const leave = useCallback(() => {
    getSocket().emit('game:leave');
    onLeave();
  }, [onLeave]);

  const v = update.view;
  return {
    mode: 'online',
    view: v,
    youName: update.youName,
    opponentName: update.opponentName,
    ante,
    deadline: update.deadline ? update.deadline + skew.current : null,
    opponentConnected: update.opponentConnected,
    rematch: update.rematch,
    waiting: v.phase !== 'ended' && v.turn !== v.you,
    status: status ?? update.notice ?? null,
    act,
    requestRematch,
    leave,
  };
}
