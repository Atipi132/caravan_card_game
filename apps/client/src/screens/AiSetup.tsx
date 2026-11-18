import type { AiLevel } from '@caravan/engine';
import type { Route } from '../App';
import { PipMenu, Screen } from '../ui/PipMenu';
import { settingsStore, useStore } from '../settings';

const LEVELS: AiLevel[] = ['easy', 'normal', 'hard'];
const ANTES = [0, 10, 25, 50, 100, 250, 500];
const LEVEL_LABEL: Record<AiLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

function cycle<T>(list: T[], cur: T): T {
  return list[(list.indexOf(cur) + 1) % list.length];
}

export function AiSetup({ go, back }: { go: (r: Route) => void; back: () => void }) {
  const s = useStore(settingsStore);
  return (
    <Screen title="Play vs AI">
      <PipMenu
        items={[
          {
            label: 'Deal the cards',
            testId: 'ai-start',
            onSelect: () => go({ name: 'ai-game', level: s.aiLevel, ante: s.ante, key: Date.now() }),
            hint: `You bet ${s.ante} caps. ${s.useCustomDeck ? 'Using your custom deck.' : 'Using a standard 54 card deck.'}`,
          },
          {
            label: `Difficulty: ${LEVEL_LABEL[s.aiLevel]}`,
            testId: 'ai-level',
            onSelect: () => settingsStore.set((x) => ({ ...x, aiLevel: cycle(LEVELS, x.aiLevel) })),
            hint: 'Easy makes mistakes, Normal plays solid, Hard looks one move ahead.',
          },
          {
            label: `Ante: ${s.ante} caps`,
            onSelect: () => settingsStore.set((x) => ({ ...x, ante: cycle(ANTES, x.ante) })),
            hint: 'Cosmetic bet added to your Net Total when you win, removed when you lose.',
          },
          {
            label: `Deck: ${s.useCustomDeck ? 'Custom' : 'Standard'}`,
            onSelect: () => settingsStore.set((x) => ({ ...x, useCustomDeck: !x.useCustomDeck })),
            hint: 'Build your custom deck in the Deck Builder.',
          },
          { label: 'Back', onSelect: back },
        ]}
      />
    </Screen>
  );
}
