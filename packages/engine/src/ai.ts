import { caravanBid } from './caravan';
import { SOLD_MAX, SOLD_MIN } from './cards';
import { CARAVAN_INDICES, applyAction, cloneState, laneWinner, legalActions, other } from './game';
import { Rng } from './rng';
import type { Action, Card, GameState, PlayerIndex } from './types';

export type AiLevel = 'easy' | 'normal' | 'hard';

const HAND_VALUE: Record<string, number> = { J: 7, Q: 3, K: 6, JOKER: 8 };

function cardWorth(c: Card): number {
  return HAND_VALUE[c.rank] ?? 1.5;
}

function bidScore(bid: number): number {
  if (bid > SOLD_MAX) return -18 - (bid - SOLD_MAX) * 6;
  if (bid >= SOLD_MIN) return 55 + (bid - SOLD_MIN) * 3;
  // Approaching the window: reward progress, but bids in 11..20 are especially useful.
  return bid * 2;
}

/**
 * Static evaluation of a state from `me`'s point of view. Only uses public information plus `me`'s hand
 * (the card drawn after the evaluated action is excluded so the AI never peeks at its deck).
 */
export function evaluate(s: GameState, me: PlayerIndex, ignoreCardId?: string): number {
  const opp = other(me);
  if (s.phase === 'ended') return s.winner === me ? 100000 : -100000;
  let score = 0;
  let myLanes = 0;
  let oppLanes = 0;
  for (const lane of CARAVAN_INDICES) {
    const mine = caravanBid(s.caravans[me][lane]);
    const theirs = caravanBid(s.caravans[opp][lane]);
    const w = laneWinner(s, lane);
    if (w === me) myLanes++;
    else if (w === opp) oppLanes++;
    score += bidScore(mine) - 0.8 * bidScore(theirs);
    // Being ahead in a sold lane is worth more than just being sold.
    if (w === me) score += 40;
    if (w === opp) score -= 45;
    // Ties in sold lanes are dangerous but not terrible.
    if (mine === theirs && mine >= SOLD_MIN && mine <= SOLD_MAX) score -= 10;
    // Long caravans are vulnerable (more targets) but have more flexibility; keep it mild.
    score -= s.caravans[me][lane].cards.length * 0.3;
  }
  if (myLanes >= 2) score += 80;
  if (oppLanes >= 2) score -= 90;
  for (const c of s.players[me].hand) if (c.id !== ignoreCardId) score += cardWorth(c);
  return score;
}

/** Average worth of an unknown card drawn from the deck. */
const EXPECTED_DRAW = 2.5;

function scoreAction(s: GameState, me: PlayerIndex, a: Action): number {
  const r = applyAction(s, me, a);
  if (!r.ok) return -Infinity;
  return evaluate(r.state, me, r.applied.drawnId) + (r.applied.drawnId ? EXPECTED_DRAW : 0);
}

/** Replaces the opponent's hidden information (hand + deck order) by a random consistent guess. */
function determinize(s: GameState, me: PlayerIndex, rng: Rng): GameState {
  const opp = other(me);
  const c = cloneState(s);
  const unknown = rng.shuffle([...c.players[opp].hand, ...c.players[opp].deck]);
  const handSize = c.players[opp].hand.length;
  c.players[opp].hand = unknown.slice(0, handSize);
  c.players[opp].deck = unknown.slice(handSize);
  // Our own deck order is unknown to us as well.
  c.players[me].deck = rng.shuffle(c.players[me].deck);
  return c;
}

/** Chooses an action for `me`. Returns `null` if no action is possible (game over / not our turn). */
export function chooseAction(s: GameState, me: PlayerIndex, level: AiLevel = 'normal', seed = Date.now()): Action | null {
  const actions = legalActions(s, me);
  if (actions.length === 0) return null;
  const rng = new Rng(seed >>> 0);

  const scored = actions.map((a) => ({ a, v: scoreAction(s, me, a) }));
  scored.sort((x, y) => y.v - x.v);

  if (level === 'easy') {
    // A casual player: often fine, sometimes plays a random legal card.
    if (rng.next() < 0.3) {
      const plays = scored.filter((p) => p.a.type === 'play');
      const pool = plays.length > 0 ? plays : scored;
      return pool[rng.int(pool.length)].a;
    }
    const pool = scored.slice(0, Math.min(6, scored.length));
    const noisy = pool.map((p) => ({ a: p.a, v: p.v + rng.next() * 60 }));
    noisy.sort((x, y) => y.v - x.v);
    return noisy[0].a;
  }

  if (level === 'normal' || s.phase !== 'main') {
    const best = scored[0].v;
    const ties = scored.filter((p) => p.v >= best - 0.01);
    return ties[rng.int(ties.length)].a;
  }

  // Hard: 2-ply search over determinized opponent hands.
  const candidates = scored.slice(0, Math.min(8, scored.length));
  const samples = 6;
  let bestAction = candidates[0].a;
  let bestValue = -Infinity;
  for (const cand of candidates) {
    let total = 0;
    for (let i = 0; i < samples; i++) {
      const d = determinize(s, me, rng);
      const r = applyAction(d, me, cand.a);
      if (!r.ok) continue;
      if (r.state.phase === 'ended') {
        total += evaluate(r.state, me);
        continue;
      }
      const opp = other(me);
      const replies = legalActions(r.state, opp);
      let bestForOpp = -Infinity;
      let resulting = evaluate(r.state, me, r.applied.drawnId);
      for (const reply of replies) {
        const rr = applyAction(r.state, opp, reply);
        if (!rr.ok) continue;
        // The opponent picks the reply that maximises its own evaluation.
        const oppView = evaluate(rr.state, opp, rr.applied.drawnId) + (rr.applied.drawnId ? EXPECTED_DRAW : 0);
        if (oppView > bestForOpp) {
          bestForOpp = oppView;
          resulting = evaluate(rr.state, me, r.applied.drawnId);
        }
      }
      total += resulting;
    }
    const avg = total / samples;
    if (avg > bestValue) {
      bestValue = avg;
      bestAction = cand.a;
    }
  }
  return bestAction;
}
