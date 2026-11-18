import { useEffect, useMemo, useState } from 'react';
import { CARD_SETS, ALL_RANKS, Rng, randomSeed, specKey, standardDeck, validateDeck } from '@caravan/engine';
import type { CardSet, CardSpec } from '@caravan/engine';
import { Screen } from '../ui/PipMenu';
import { CardImage, SET_LABELS } from '../game/CardImage';
import { deckStore, settingsStore, useStore } from '../settings';
import { sfx } from '../audio/sfx';

const RANK_ORDER = Object.fromEntries(ALL_RANKS.map((r, i) => [r, i]));
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const SET_ORDER = Object.fromEntries(CARD_SETS.map((s, i) => [s, i]));

function sortDeck(d: CardSpec[]): CardSpec[] {
  return d
    .slice()
    .sort(
      (a, b) =>
        RANK_ORDER[a.rank] - RANK_ORDER[b.rank] ||
        (SUIT_ORDER[a.suit ?? ''] ?? 9) - (SUIT_ORDER[b.suit ?? ''] ?? 9) ||
        (a.jokerIndex ?? 0) - (b.jokerIndex ?? 0) ||
        SET_ORDER[a.set] - SET_ORDER[b.set],
    );
}

function allCards(set: CardSet | 'all'): CardSpec[] {
  const sets = set === 'all' ? CARD_SETS : [set];
  return sortDeck(sets.flatMap((s) => standardDeck(s, 2)));
}

/** Random legal deck: 30–54 cards from all sets, with a healthy share of number cards. */
function randomDeck(): CardSpec[] {
  const rng = new Rng(randomSeed());
  const pool = rng.shuffle(CARD_SETS.flatMap((s) => standardDeck(s, 2)));
  const size = 36 + rng.int(13);
  const out: CardSpec[] = [];
  for (const c of pool) {
    if (out.length >= size) break;
    const isNumber = !['J', 'Q', 'K', 'JOKER'].includes(c.rank);
    const faceCount = out.filter((x) => !['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'].includes(x.rank)).length;
    if (!isNumber && faceCount >= size * 0.3) continue;
    out.push(c);
  }
  return sortDeck(out);
}

export function DeckBuilder({ back }: { back: () => void }) {
  const deck = useStore(deckStore);
  const settings = useStore(settingsStore);
  const [filter, setFilter] = useState<CardSet | 'all'>('all');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const inDeck = useMemo(() => new Set(deck.map(specKey)), [deck]);
  const available = useMemo(() => allCards(filter).filter((c) => !inDeck.has(specKey(c))), [filter, inDeck]);
  const validation = validateDeck(deck);
  const counts = useMemo(() => {
    const numbers = deck.filter((c) => !['J', 'Q', 'K', 'JOKER'].includes(c.rank)).length;
    return { numbers, faces: deck.length - numbers };
  }, [deck]);

  const add = (c: CardSpec) => {
    sfx.place();
    deckStore.set((d) => sortDeck([...d, c]));
  };
  const remove = (c: CardSpec) => {
    sfx.slide();
    deckStore.set((d) => d.filter((x) => specKey(x) !== specKey(c)));
  };

  return (
    <Screen
      footer={
        <>
          <span>
            <button className="prompt" onClick={() => deckStore.set(randomDeck())}>
              Randomize Caravan Deck
            </button>
            <button className="prompt" onClick={() => deckStore.set(standardDeck(settings.backSet))}>
              Standard Deck
            </button>
            <button className="prompt" onClick={() => deckStore.set([])}>
              Clear
            </button>
          </span>
          <span>
            <button className="prompt" onClick={() => settingsStore.set((s) => ({ ...s, useCustomDeck: !s.useCustomDeck }))}>
              Use this deck: {settings.useCustomDeck ? 'Yes' : 'No'}
            </button>
            <button className="prompt" onClick={back}>
              Back <span className="prompt-key">Esc)</span>
            </button>
          </span>
        </>
      }
    >
      <div className="deckbuilder">
        <div className="db-header">
          <span>Caravan Deck</span>
          <span data-testid="deck-count">{deck.length}</span>
          <span className="dim">
            {counts.numbers} number · {counts.faces} face
          </span>
          <span className={validation.ok ? 'ok' : 'warn'}>{validation.ok ? 'Valid deck' : validation.errors[0]}</span>
        </div>
        <CardRow cards={deck} onPick={remove} empty="Your deck is empty. Click cards below to add them." />

        <div className="db-header">
          <span>All Cards</span>
          <span>{available.length}</span>
          <div className="db-filters">
            {(['all', ...CARD_SETS] as const).map((s) => (
              <button key={s} className={`db-filter ${filter === s ? 'is-active' : ''}`} onClick={() => setFilter(s)}>
                {s === 'all' ? 'All sets' : SET_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <CardRow cards={available} onPick={add} empty="Every card of this set is already in your deck." />

        <p className="db-help dim">
          A deck needs at least 30 cards. You may mix sets, but not include the same card twice from the same set. The deck is
          used against the AI and in private rooms that allow custom decks.
        </p>
      </div>
    </Screen>
  );
}

function CardRow({ cards, onPick, empty }: { cards: CardSpec[]; onPick: (c: CardSpec) => void; empty: string }) {
  return (
    <div
      className="db-row"
      onWheel={(e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
      }}
    >
      {cards.length === 0 && <div className="db-empty dim">{empty}</div>}
      {cards.map((c) => (
        <button key={specKey(c)} className="db-card" onClick={() => onPick(c)} title={`${SET_LABELS[c.set]}`}>
          <CardImage spec={c} set={c.set} faceUp seed={specKey(c)} />
          <span className="db-set-dot" data-set={c.set} />
        </button>
      ))}
    </div>
  );
}
