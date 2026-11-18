// AI benchmark: npx tsx packages/engine/scripts/bench.ts [games]
import { applyAction, chooseAction, createGame } from '../src';
import type { AiLevel, PlayerIndex } from '../src';

function match(a: AiLevel, b: AiLevel, games: number) {
  let winsA = 0;
  let totalTurns = 0;
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const aSeat = (g % 2) as PlayerIndex;
    const levels: AiLevel[] = aSeat === 0 ? [a, b] : [b, a];
    let s = createGame({ firstPlayer: ((g >> 1) % 2) as PlayerIndex }, 1000 + g);
    let steps = 0;
    while (s.phase !== 'ended' && steps < 800) {
      const act = chooseAction(s, s.turn, levels[s.turn], g * 7777 + steps)!;
      const r = applyAction(s, s.turn, act);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      steps++;
    }
    totalTurns += steps;
    if (s.winner === aSeat) winsA++;
  }
  console.log(`${a} vs ${b}: ${((100 * winsA) / games).toFixed(0)}% (${games} games, avg ${Math.round(totalTurns / games)} turns, ${Date.now() - t0}ms)`);
}

const games = Number(process.argv[2] ?? 100);
match('normal', 'easy', games);
match('hard', 'normal', Math.max(10, Math.floor(games / 4)));
