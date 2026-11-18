import { describe, expect, it } from 'vitest';
import {
  applyAction,
  caravanBid,
  caravanSuit,
  caravanWinner,
  countOwnedCards,
  createGame,
  isNumberCard,
  laneWinner,
  legalActions,
  standardDeck,
  validateDeck,
  viewFor,
} from '../src';
import type { Action, GameState, PlayerIndex } from '../src';
import { caravan, codes, handId, makeState } from './helpers';

function play(s: GameState, player: PlayerIndex, code: string, target: [PlayerIndex, 0 | 1 | 2], cardIndex?: number) {
  return applyAction(s, player, { type: 'play', cardId: handId(s, player, code), target: { player: target[0], caravan: target[1] }, cardIndex });
}

function mustPlay(s: GameState, player: PlayerIndex, code: string, target: [PlayerIndex, 0 | 1 | 2], cardIndex?: number): GameState {
  const r = play(s, player, code, target, cardIndex);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('1.x deck & setup', () => {
  it('standard deck has 54 cards with 2 Jokers', () => {
    const d = standardDeck();
    expect(d).toHaveLength(54);
    expect(d.filter((c) => c.rank === 'JOKER')).toHaveLength(2);
    expect(standardDeck('classic', 0)).toHaveLength(52);
    expect(standardDeck('classic', 1)).toHaveLength(53);
  });

  it('1.22 custom decks: ≥30 cards, no duplicate from the same set, mixed sets allowed', () => {
    const small = standardDeck().slice(0, 29);
    expect(validateDeck(small).ok).toBe(false);
    const dup = [...standardDeck().slice(0, 30), standardDeck()[0]];
    expect(validateDeck(dup).ok).toBe(false);
    const mixed = [...standardDeck('classic'), ...standardDeck('atomic')];
    expect(validateDeck(mixed).ok).toBe(true);
    expect(validateDeck([{ set: 'nope', rank: 'A', suit: 'S' } as never, ...standardDeck()]).ok).toBe(false);
  });

  it('4.1 each player draws eight cards; card ids are opaque and unique', () => {
    const s = createGame({}, 42);
    expect(s.players[0].hand).toHaveLength(8);
    expect(s.players[1].hand).toHaveLength(8);
    expect(s.players[0].deck).toHaveLength(46);
    const ids = new Set([...s.players[0].deck, ...s.players[0].hand, ...s.players[1].deck, ...s.players[1].hand].map((c) => c.id));
    expect(ids.size).toBe(108);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{8}$/);
  });

  it('is deterministic for a given seed', () => {
    expect(createGame({}, 7)).toEqual(createGame({}, 7));
    expect(createGame({}, 7)).not.toEqual(createGame({}, 8));
  });

  it('4.3 mulligan: a hand without 3 number cards is reshuffled', () => {
    // Deck with only 3 number cards among many face cards forces mulligans most of the time.
    const faces = standardDeck().filter((c) => !isNumberCard(c));
    const deck = [...faces, { set: 'atomic', rank: '2', suit: 'S' }, { set: 'atomic', rank: '3', suit: 'S' }, { set: 'atomic', rank: '4', suit: 'S' }] as typeof faces;
    let sawMulligan = false;
    for (let seed = 1; seed < 20; seed++) {
      const s = createGame({ decks: [deck, standardDeck()] }, seed);
      const numbers = s.players[0].hand.filter(isNumberCard).length;
      if (s.mulligans[0] > 0) sawMulligan = true;
      if (s.mulligans[0] < 50) expect(numbers).toBeGreaterThanOrEqual(3);
    }
    expect(sawMulligan).toBe(true);
  });
});

describe('4.x opening round', () => {
  it('only number cards on own empty caravans, no discard, no draw; ends after 3 cards each with 5 in hand', () => {
    let s = createGame({}, 3);
    expect(s.phase).toBe('opening');
    const p = s.turn;
    const face = s.players[p].hand.find((c) => !isNumberCard(c));
    if (face) {
      const r = applyAction(s, p, { type: 'play', cardId: face.id, target: { player: p, caravan: 0 }, cardIndex: 0 });
      expect(r.ok).toBe(false);
    }
    expect(applyAction(s, p, { type: 'discard', cardId: s.players[p].hand[0].id }).ok).toBe(false);

    for (let turn = 0; turn < 6; turn++) {
      const player = s.turn;
      const num = s.players[player].hand.find(isNumberCard)!;
      const empty = s.caravans[player].findIndex((c) => c.cards.length === 0) as 0 | 1 | 2;
      if (turn === 2) {
        // Cannot stack on an already started caravan during the opening round.
        const started = s.caravans[player].findIndex((c) => c.cards.length > 0) as 0 | 1 | 2;
        const bad = applyAction(s, player, { type: 'play', cardId: num.id, target: { player, caravan: started } });
        expect(bad.ok).toBe(false);
      }
      const r = applyAction(s, player, { type: 'play', cardId: num.id, target: { player, caravan: empty } });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.applied.drawnId).toBeUndefined();
        s = r.state;
      }
    }
    expect(s.phase).toBe('main');
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.turn).toBe(s.firstPlayer);
  });

  it('turns alternate and players cannot act out of turn', () => {
    const s = createGame({}, 5);
    const notTurn = (s.turn === 0 ? 1 : 0) as PlayerIndex;
    const num = s.players[notTurn].hand.find(isNumberCard)!;
    expect(applyAction(s, notTurn, { type: 'play', cardId: num.id, target: { player: notTurn, caravan: 0 } }).ok).toBe(false);
  });
});

describe('5.1 turn actions', () => {
  it('playing a card draws a new one', () => {
    const s = makeState({ caravans: [[['5H'], [], []], [[], [], []]], hands: [['7H', '2C'], ['3C']] });
    const r = play(s, 0, '7H', [0, 0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0].hand).toHaveLength(2);
    expect(r.state.players[0].deck).toHaveLength(9);
    expect(r.state.turn).toBe(1);
  });

  it('discarding a card draws a new one and goes to the discard pile', () => {
    const s = makeState({ hands: [['7H', '2C'], ['3C']] });
    const r = applyAction(s, 0, { type: 'discard', cardId: handId(s, 0, '7H') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[0].discard.map((c) => c.rank)).toEqual(['7']);
    expect(r.state.players[0].hand).toHaveLength(2);
  });

  it('disbanding removes all cards of one own caravan to the discard piles and does not draw', () => {
    const s = makeState({ caravans: [[['5H', '7H+KS'], [], []], [[], [], []]], hands: [['7C'], ['3C']] });
    // Opponent's King attached to our caravan goes to the opponent's discard pile.
    s.caravans[0][0].cards[1].attachments[0] = { ...s.caravans[0][0].cards[1].attachments[0], owner: 1 };
    const r = applyAction(s, 0, { type: 'disband', caravan: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.caravans[0][0].cards).toHaveLength(0);
    expect(r.state.players[0].discard).toHaveLength(2);
    expect(r.state.players[1].discard).toHaveLength(1);
    expect(r.state.players[0].hand).toHaveLength(1);
    expect(r.applied.removedIds).toHaveLength(3);
  });

  it('cannot disband an empty or an opponent caravan', () => {
    const s = makeState({ hands: [['7C'], ['3C']] });
    expect(applyAction(s, 0, { type: 'disband', caravan: 1 }).ok).toBe(false);
  });
});

describe('5.2 number cards', () => {
  it('5.21 second card sets direction and any suit works', () => {
    const s = makeState({ caravans: [[['5H'], [], []], [[], [], []]], hands: [['9C', '3S'], []] });
    const s2 = mustPlay(s, 0, '9C', [0, 0]);
    expect(s2.caravans[0][0].direction).toBe('asc');
    const s3 = mustPlay(s, 0, '3S', [0, 0]);
    expect(s3.caravans[0][0].direction).toBe('desc');
  });

  it('5.21 must follow suit or direction', () => {
    // 3H -> 7S ascending, suit S.
    const base = makeState({ caravans: [[['3H', '7S'], [], []], [[], [], []]], hands: [['9D', '5D', '2S', '4C'], []] });
    expect(play(base, 0, '9D', [0, 0]).ok).toBe(true); // ascending
    expect(play(base, 0, '5D', [0, 0]).ok).toBe(false); // wrong suit, descending
    expect(play(base, 0, '2S', [0, 0]).ok).toBe(true); // suit match
    expect(play(base, 0, '4C', [0, 0]).ok).toBe(false);
  });

  it('5.22 sequences do not need to be connected', () => {
    const s = makeState({ caravans: [[['7H', '3S'], [], []], [[], [], []]], hands: [['2D', 'AC', '5D'], []] });
    expect(play(s, 0, '2D', [0, 0]).ok).toBe(true);
    expect(play(s, 0, 'AC', [0, 0]).ok).toBe(true);
    expect(play(s, 0, '5D', [0, 0]).ok).toBe(false);
  });

  it('5.23 playing a matching suit against the direction establishes a new direction', () => {
    const s = makeState({ caravans: [[['3H', '7S'], [], []], [[], [], []]], hands: [['2S'], []] });
    const s2 = mustPlay(s, 0, '2S', [0, 0]);
    expect(s2.caravans[0][0].direction).toBe('desc');
  });

  it('5.24 never on the same value, even with matching suit', () => {
    const s = makeState({ caravans: [[['10H'], ['3S', '7S'], []], [[], [], []]], hands: [['10D', '7D'], []] });
    expect(play(s, 0, '10D', [0, 0]).ok).toBe(false);
    s.players[0].hand.push({ ...s.players[0].hand[0], id: 'x', suit: 'S', rank: '7' });
    expect(applyAction(s, 0, { type: 'play', cardId: 'x', target: { player: 0, caravan: 1 } }).ok).toBe(false);
  });

  it('5.25 number cards only on own caravans', () => {
    const s = makeState({ caravans: [[[], [], []], [['5H'], [], []]], hands: [['7H'], []] });
    expect(play(s, 0, '7H', [1, 0]).ok).toBe(false);
  });

  it('5.5 an emptied caravan can be restarted with any number card', () => {
    const s = makeState({ hands: [['7H'], []] });
    expect(play(s, 0, '7H', [0, 2]).ok).toBe(true);
  });
});

describe('5.3 face cards', () => {
  it('5.32 face cards can be played on the opponent caravans', () => {
    const s = makeState({ caravans: [[[], [], []], [['5H', '9H'], [], []]], hands: [['KS', 'JC'], []] });
    const r = play(s, 0, 'KS', [1, 0], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(caravanBid(r.state.caravans[1][0])).toBe(23);
  });

  it('5.33 face cards cannot be played on an empty caravan', () => {
    const s = makeState({ hands: [['KS', 'QS', 'JS', 'JOKER'], []] });
    for (const code of ['KS', 'QS', 'JS', 'JOKER']) expect(play(s, 0, code, [0, 0], 0).ok).toBe(false);
  });

  it('5.34 Jack removes the card and its attachments to the discard piles', () => {
    const s = makeState({ caravans: [[[], [], []], [['5H', '9H+KS', '10H'], [], []]], hands: [['JC'], []] });
    const r = play(s, 0, 'JC', [1, 0], 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(r.state.caravans[1][0])).toEqual(['5H', '10H']);
    expect(r.state.players[1].discard.map((c) => c.rank).sort()).toEqual(['9', 'K']);
    expect(r.state.players[0].discard.map((c) => c.rank)).toEqual(['J']);
    expect(r.applied.removedIds).toHaveLength(3);
  });

  it('5.35 Queen only on the last card; reverses direction and changes suit', () => {
    const s = makeState({ caravans: [[['3H', '7H'], [], []], [[], [], []]], hands: [['QS', '5S', '9C', '5C'], []] });
    expect(play(s, 0, 'QS', [0, 0], 0).ok).toBe(false);
    const s2 = mustPlay(s, 0, 'QS', [0, 0]);
    expect(s2.caravans[0][0].direction).toBe('desc');
    expect(caravanSuit(s2.caravans[0][0])).toBe('S');
    // Queen does not add to the bid.
    expect(caravanBid(s2.caravans[0][0])).toBe(10);
    s2.turn = 0;
    expect(play(s2, 0, '5C', [0, 0]).ok).toBe(true); // descending now
    expect(play(s2, 0, '9C', [0, 0]).ok).toBe(false); // ascending and not spades
    expect(play(s2, 0, '5S', [0, 0]).ok).toBe(true);
  });

  it('5.35 multiple Queens reverse the effect back', () => {
    const s = makeState({ caravans: [[['3H', '7H+QS+QD'], [], []], [[], [], []]], hands: [['9C'], []] });
    expect(s.caravans[0][0].direction).toBe('asc');
    expect(caravanSuit(s.caravans[0][0])).toBe('D');
    expect(play(s, 0, '9C', [0, 0]).ok).toBe(true);
  });

  it('5.35 Queen can be played on the opponent caravan', () => {
    const s = makeState({ caravans: [[[], [], []], [['3H', '7H'], [], []]], hands: [['QS'], []] });
    const s2 = mustPlay(s, 0, 'QS', [1, 0]);
    expect(s2.caravans[1][0].direction).toBe('desc');
  });

  it('5.36 King doubles the value; multiple Kings stack', () => {
    expect(caravanBid(caravan(['5H', '10H+KS']))).toBe(25);
    expect(caravanBid(caravan(['5H', '10H+KS+KD']))).toBe(45);
    expect(caravanBid(caravan(['AH+KS+KD+KC']))).toBe(8);
  });

  it('5.36 Kings can be played on any card of a caravan, not just the last', () => {
    const s = makeState({ caravans: [[['2H', '5H', '9H'], [], []], [[], [], []]], hands: [['KS'], []] });
    const s2 = mustPlay(s, 0, 'KS', [0, 0], 0);
    expect(caravanBid(s2.caravans[0][0])).toBe(18);
  });

  it('5.37 Joker on a number card removes all other cards of that value on both sides', () => {
    const s = makeState({
      caravans: [
        [['7H', '4H', '7S'], ['7C+KS'], []],
        [['2D', '7D', '9D'], ['3C'], []],
      ],
      hands: [['JOKER'], []],
    });
    const r = play(s, 0, 'JOKER', [0, 0], 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(r.state.caravans[0][0])).toEqual(['7H+JOKER', '4H']);
    expect(codes(r.state.caravans[0][1])).toEqual([]);
    expect(codes(r.state.caravans[1][0])).toEqual(['2D', '9D']);
    expect(codes(r.state.caravans[1][1])).toEqual(['3C']);
    // 7S, 7C, KS(attached) for player 0 and 7D for player 1
    expect(r.state.players[0].discard).toHaveLength(3);
    expect(r.state.players[1].discard).toHaveLength(1);
  });

  it('5.37 Joker on an Ace removes all other number cards of the printed suit (Queens do not save them)', () => {
    const s = makeState({
      caravans: [
        [['AS', '4S', '6H+QS'], ['8S+KD'], []],
        [['2S', '7D'], ['AD', '3S'], []],
      ],
      hands: [['JOKER'], []],
    });
    const r = play(s, 0, 'JOKER', [0, 0], 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(r.state.caravans[0][0])).toEqual(['AS+JOKER', '6H+QS']);
    expect(codes(r.state.caravans[0][1])).toEqual([]);
    expect(codes(r.state.caravans[1][0])).toEqual(['7D']);
    expect(codes(r.state.caravans[1][1])).toEqual(['AD']);
  });

  it('5.37 Joker on a non-ace does not remove aces / Joker on an ace does not remove other suits', () => {
    const s = makeState({ caravans: [[['AH', '5H'], [], []], [['AS', '2S'], [], []]], hands: [['JOKER'], []] });
    const r = play(s, 0, 'JOKER', [0, 0], 0);
    expect(r.ok && codes(r.state.caravans[1][0])).toEqual(['AS', '2S']);
    expect(r.ok && codes(r.state.caravans[0][0])).toEqual(['AH+JOKER']);
  });

  it('5.38 at most three face cards per number card; Jack cannot remove a card holding three', () => {
    const s = makeState({ caravans: [[['5H+KS+KD+QH'], [], []], [[], [], []]], hands: [['JC', 'KC', 'JOKER'], []] });
    expect(play(s, 0, 'JC', [0, 0], 0).ok).toBe(false);
    expect(play(s, 0, 'KC', [0, 0], 0).ok).toBe(false);
    expect(play(s, 0, 'JOKER', [0, 0], 0).ok).toBe(false);
  });

  it('5.38 a card holding three face cards can still be removed by a Joker on another card', () => {
    const s = makeState({ caravans: [[['5H+KS+KD+QH'], ['5C'], []], [[], [], []]], hands: [['JOKER'], []] });
    const r = play(s, 0, 'JOKER', [0, 1], 0);
    expect(r.ok && codes(r.state.caravans[0][0])).toEqual([]);
    expect(r.ok && r.state.players[0].discard).toHaveLength(4);
  });
});

describe('5.4 direction after removals', () => {
  it('two identical numbers left adjacent keep the previous direction (6-7Q-6, Jack on 7 → 6-6 descending)', () => {
    const s = makeState({ caravans: [[['6H', '7H+QS', '6S'], [], []], [[], [], []]], hands: [['JC', '4D', '9D'], []] });
    expect(s.caravans[0][0].direction).toBe('desc');
    const s2 = mustPlay(s, 0, 'JC', [0, 0], 1);
    expect(codes(s2.caravans[0][0])).toEqual(['6H', '6S']);
    expect(s2.caravans[0][0].direction).toBe('desc');
    s2.turn = 0;
    expect(play(s2, 0, '4D', [0, 0]).ok).toBe(true);
    expect(play(s2, 0, '9D', [0, 0]).ok).toBe(false);
  });

  it('otherwise the direction is recomputed from the remaining cards (2-6H-4H, remove 6 → ascending)', () => {
    const s = makeState({ caravans: [[['2C', '6H', '4H'], [], []], [[], [], []]], hands: [['JC'], []] });
    expect(s.caravans[0][0].direction).toBe('desc');
    const s2 = mustPlay(s, 0, 'JC', [0, 0], 1);
    expect(s2.caravans[0][0].direction).toBe('asc');
  });

  it('removing the last card brings back the Queen effect of the new last card', () => {
    const s = makeState({ caravans: [[['3C', '7H+QS', '9S'], [], []], [[], [], []]], hands: [['JC'], []] });
    const s2 = mustPlay(s, 0, 'JC', [0, 0], 2);
    expect(s2.caravans[0][0].direction).toBe('desc');
    expect(caravanSuit(s2.caravans[0][0])).toBe('S');
  });

  it('a caravan reduced to one card has no direction', () => {
    const s = makeState({ caravans: [[['3C', '7H'], [], []], [[], [], []]], hands: [['JC'], []] });
    const s2 = mustPlay(s, 0, 'JC', [0, 0], 1);
    expect(s2.caravans[0][0].direction).toBeNull();
  });
});

describe('6.x winning', () => {
  it('3.2 a caravan is sold with a bid of 21 to 26', () => {
    const s = makeState({ caravans: [[['10H', '9H', '2H'], ['10H', '10S', '7S'], []], [[], [], []]] });
    expect(laneWinner(s, 0)).toBe(0); // 21
    expect(laneWinner(s, 1)).toBeNull(); // 27 is over
  });

  it('6.2 ties are not sold; the higher sold bid wins a lane; a lane is won against an oversold caravan', () => {
    const s = makeState({
      caravans: [
        [['10H', '10S', '2H'], ['10H', '10S', '3S'], ['10C', '10D', '2C']],
        [['10C', '10D', '2D'], ['10C', '10D', '4D'], ['10H', '10S', '8S']],
      ],
    });
    expect(laneWinner(s, 0)).toBeNull(); // 22 vs 22
    expect(laneWinner(s, 1)).toBe(1); // 23 vs 24
    expect(laneWinner(s, 2)).toBe(0); // 22 vs 28
    expect(caravanWinner(s)).toBeNull();
  });

  it('6.2 the game ends when all three lanes are decided; two lanes win', () => {
    const s = makeState({
      caravans: [
        [['10H', '10S'], ['10H', '10S', '3S'], ['10C', '10D', '2C']],
        [['10C', '10D', '2D'], ['10C', '10D', '4D'], ['5H']],
      ],
      hands: [['AS', '3C'], ['4C']],
    });
    const r = play(s, 0, 'AS', [0, 0]); // 21 vs 22 → lane 0 to player 1, lane 1 to player 1, lane 2 to player 0
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.phase).toBe('ended');
    expect(r.state.winner).toBe(1);
    expect(r.state.endReason).toBe('caravans');
    expect(applyAction(r.state, 1, { type: 'discard', cardId: r.state.players[1].hand[0].id }).ok).toBe(false);
  });

  it('6.2 two lanes won but a tied third lane does not end the game', () => {
    const s = makeState({
      caravans: [
        [['10H', '10S', '2H'], ['10H', '10S', '3S'], ['10C', '10D']],
        [['10C', '10D', '2D'], ['10C', '10D'], ['5H']],
      ],
      hands: [['3C', '2S'], ['4C']],
    });
    const r = play(s, 0, '2S', [0, 2]);
    expect(r.ok && r.state.phase).toBe('main');
  });

  it('6.3 a player who runs out of cards loses', () => {
    const s = makeState({ caravans: [[['5H'], [], []], [['5C'], [], []]], hands: [['7H'], []], decks: [3, 0] });
    const r = play(s, 0, '7H', [0, 0]);
    expect(r.ok && r.state.phase).toBe('ended');
    expect(r.ok && r.state.winner).toBe(0);
    expect(r.ok && r.state.endReason).toBe('out-of-cards');
  });

  it('a player can keep playing from the hand once the deck is empty', () => {
    const s = makeState({ caravans: [[['5H'], [], []], [[], [], []]], hands: [['7H', '8H'], ['2C']], decks: [0, 0] });
    const r = play(s, 0, '7H', [0, 0]);
    expect(r.ok && r.state.phase).toBe('main');
    expect(r.ok && r.state.players[0].hand).toHaveLength(1);
  });

  it('forfeit ends the game for either player at any time', () => {
    const s = makeState({ hands: [['7H'], ['2C']] });
    const r = applyAction(s, 1, { type: 'forfeit' });
    expect(r.ok && r.state.winner).toBe(0);
    expect(r.ok && r.state.endReason).toBe('forfeit');
  });
});

describe('legal actions, views and invariants', () => {
  it('legalActions only returns valid actions and includes discard/disband in the main phase', () => {
    const s = makeState({ caravans: [[['5H', '7H'], [], []], [['3C'], [], []]], hands: [['9H', 'KS', 'QD', 'JC', 'JOKER'], []] });
    const actions = legalActions(s, 0);
    for (const a of actions) expect(applyAction(s, 0, a).ok).toBe(true);
    expect(actions.some((a) => a.type === 'disband')).toBe(true);
    expect(actions.filter((a) => a.type === 'discard')).toHaveLength(5);
    expect(legalActions(s, 1)).toEqual([]);
  });

  it('views hide the opponent hand and decks', () => {
    const s = createGame({}, 11);
    const v = viewFor(s, 0);
    const json = JSON.stringify(v);
    for (const c of s.players[1].hand) {
      expect(v.opponent.hand.find((h) => h.id === c.id)).toEqual({ id: c.id, set: c.set, owner: 1, hidden: true });
    }
    for (const c of s.players[1].deck) expect(json).not.toContain(c.id);
    for (const c of s.players[0].deck) expect(json).not.toContain(c.id);
    expect(v.hand).toEqual(s.players[0].hand);
    expect(v.opponent.deckCount).toBe(46);
  });

  it('random full games conserve cards and always terminate', () => {
    for (let seed = 1; seed <= 150; seed++) {
      let s = createGame({ firstPlayer: (seed % 2) as PlayerIndex }, seed);
      let rngState = seed * 7919;
      let steps = 0;
      while (s.phase !== 'ended' && steps < 2000) {
        const actions = legalActions(s, s.turn);
        expect(actions.length).toBeGreaterThan(0);
        rngState = (rngState * 1103515245 + 12345) >>> 0;
        // Bias toward plays so games actually progress.
        const plays = actions.filter((a) => a.type === 'play');
        const pool: Action[] = plays.length > 0 && rngState % 10 < 8 ? plays : actions;
        const a = pool[rngState % pool.length];
        const r = applyAction(s, s.turn, a);
        expect(r.ok).toBe(true);
        if (!r.ok) break;
        s = r.state;
        expect(countOwnedCards(s, 0)).toBe(54);
        expect(countOwnedCards(s, 1)).toBe(54);
        for (const side of s.caravans) for (const c of side) for (const p of c.cards) expect(p.attachments.length).toBeLessThanOrEqual(3);
        steps++;
      }
      expect(s.phase).toBe('ended');
    }
  });
});
