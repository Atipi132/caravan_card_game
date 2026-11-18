import { describe, expect, it } from 'vitest';
import { applyAction, chooseAction, createGame, evaluate } from '../src';
import type { AiLevel, GameState, PlayerIndex } from '../src';
import { makeState } from './helpers';

function playGame(levels: [AiLevel, AiLevel], seed: number): GameState {
  let s = createGame({ firstPlayer: (seed % 2) as PlayerIndex }, seed);
  let steps = 0;
  while (s.phase !== 'ended' && steps < 600) {
    const a = chooseAction(s, s.turn, levels[s.turn], seed * 1000 + steps);
    expect(a).not.toBeNull();
    const r = applyAction(s, s.turn, a!);
    expect(r.ok).toBe(true);
    if (!r.ok) break;
    s = r.state;
    steps++;
  }
  return s;
}

describe('AI', () => {
  it('always produces legal moves and finishes games', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = playGame(['normal', 'easy'], seed);
      expect(s.phase).toBe('ended');
    }
  });

  it('normal beats easy most of the time', () => {
    let wins = 0;
    const games = 40;
    for (let seed = 1; seed <= games; seed++) {
      const s = playGame(seed % 2 ? ['normal', 'easy'] : ['easy', 'normal'], seed + 100);
      const normalPlayer = seed % 2 ? 0 : 1;
      if (s.winner === normalPlayer) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.55);
  });

  it('hard level plays legal moves', () => {
    const s = playGame(['hard', 'normal'], 3);
    expect(s.phase).toBe('ended');
  }, 60000);

  it('takes an immediate win when available', () => {
    const s = makeState({
      caravans: [
        [['10H', '10S'], ['10H', '10S', '3S'], ['10C', '10D', '2C']],
        [['10C', '10D'], ['10C', '10D'], ['5H']],
      ],
      hands: [['AS', '3C', 'KD', '9H', '2D'], ['4C']],
    });
    const a = chooseAction(s, 0, 'normal', 1)!;
    const r = applyAction(s, 0, a);
    expect(r.ok && r.state.winner).toBe(0);
  });

  it('evaluation does not depend on the hidden opponent hand', () => {
    const s = makeState({ caravans: [[['5H'], [], []], [['5C'], [], []]], hands: [['7H'], ['KS']] });
    const s2 = makeState({ caravans: [[['5H'], [], []], [['5C'], [], []]], hands: [['7H'], ['2C']] });
    expect(evaluate(s, 0)).toBe(evaluate(s2, 0));
  });
});
