import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_SETS, applyAction, chooseAction, createGame, randomSeed, standardDeck, viewFor } from '@caravan/engine';
import type { Action, AiLevel, CardSpec, GameState, PlayerIndex } from '@caravan/engine';
import type { GameSession } from './session';
import { recordResult } from '../settings';

export interface LocalGameOptions {
  aiLevel: AiLevel;
  ante: number;
  deck: CardSpec[];
  youName: string;
  onLeave: () => void;
}

const AI_NAMES: Record<AiLevel, string[]> = {
  easy: ['Dusty', 'Rusty Joe', 'Sunny'],
  normal: ['Old Pete', 'Mags', 'Cactus Jack'],
  hard: ['Lady Luck', 'The Dealer', 'Ace Delgado'],
};

function newGame(deck: CardSpec[]): GameState {
  const seed = randomSeed();
  const yourSet = deck[0]?.set ?? 'atomic';
  const others = CARD_SETS.filter((s) => s !== yourSet && s !== 'classic');
  const aiSet = others[seed % others.length];
  return createGame({ decks: [deck, standardDeck(aiSet)], firstPlayer: (seed % 2) as PlayerIndex }, seed);
}

const HUMAN: PlayerIndex = 0;
const AI: PlayerIndex = 1;

/** A game against the AI, fully simulated in the browser. */
export function useLocalGame(opts: LocalGameOptions): GameSession {
  const [state, setState] = useState<GameState>(() => newGame(opts.deck));
  const [waiting, setWaiting] = useState(false);
  const recorded = useRef(false);
  const [opponentName] = useState(() => {
    const names = AI_NAMES[opts.aiLevel];
    return names[Math.floor(Math.random() * names.length)];
  });

  // AI turn
  useEffect(() => {
    if (state.phase === 'ended' || state.turn !== AI) return;
    setWaiting(true);
    const delay = state.phase === 'opening' ? 650 : 900 + Math.random() * 600;
    const t = setTimeout(() => {
      const action = chooseAction(state, AI, opts.aiLevel, randomSeed());
      if (action) {
        const r = applyAction(state, AI, action);
        if (r.ok) setState(r.state);
      }
      setWaiting(false);
    }, delay);
    return () => clearTimeout(t);
  }, [state, opts.aiLevel]);

  // Stats
  useEffect(() => {
    if (state.phase === 'ended' && !recorded.current) {
      recorded.current = true;
      recordResult(state.winner === HUMAN, opts.ante);
    }
  }, [state, opts.ante]);

  const act = useCallback(
    async (action: Action) => {
      const r = applyAction(state, HUMAN, action);
      if (!r.ok) return r.error;
      setState(r.state);
      return null;
    },
    [state],
  );

  const requestRematch = useCallback(() => {
    recorded.current = false;
    setState(newGame(opts.deck));
  }, [opts.deck]);

  const view = useMemo(() => viewFor(state, HUMAN), [state]);

  return {
    mode: 'ai',
    view,
    youName: opts.youName,
    opponentName,
    ante: opts.ante,
    deadline: null,
    opponentConnected: true,
    rematch: 'none',
    waiting,
    status: null,
    act,
    requestRematch,
    leave: opts.onLeave,
  };
}
