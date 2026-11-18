import type { Route } from '../App';
import { PipMenu, Screen } from '../ui/PipMenu';
import { CardImage } from '../game/CardImage';
import { settingsStore, statsStore, useStore } from '../settings';

const FAN = [
  { rank: 'A', suit: 'S' },
  { rank: 'K', suit: 'H' },
  { rank: 'JOKER', suit: null, jokerIndex: 1 },
  { rank: 'Q', suit: 'D' },
  { rank: '10', suit: 'C' },
] as const;

export function MainMenu({ go }: { go: (r: Route) => void }) {
  const stats = useStore(statsStore);
  const settings = useStore(settingsStore);
  return (
    <Screen
      footer={
        <>
          <span>
            Net Total: {stats.netTotal} caps · Win/Loss: {stats.wins}/{stats.losses}
          </span>
          <span className="dim">Unofficial fan project – not affiliated with Bethesda Softworks or Obsidian Entertainment.</span>
        </>
      }
    >
      <div className="menu-layout">
        <div className="menu-left">
          <h1 className="game-title">CARAVAN</h1>
          <div className="game-subtitle">A card game of the Mojave Wasteland</div>
          <PipMenu
            items={[
              { label: 'Play vs AI', testId: 'menu-ai', onSelect: () => go({ name: 'ai-setup' }), hint: 'Play a game against a computer opponent.' },
              { label: 'Play Online', testId: 'menu-online', onSelect: () => go({ name: 'online' }), hint: 'Quick match against a random player, or a private room with a friend.' },
              { label: 'Deck Builder', testId: 'menu-deck', onSelect: () => go({ name: 'deck' }), hint: 'Build your own Caravan deck from the six casino card sets.' },
              { label: 'How to Play', testId: 'menu-rules', onSelect: () => go({ name: 'rules' }), hint: 'The complete rules of Caravan.' },
              { label: 'Settings', testId: 'menu-settings', onSelect: () => go({ name: 'settings' }), hint: 'Name, HUD color, sound and card back.' },
            ]}
          />
        </div>
        <div className="menu-fan" aria-hidden>
          {FAN.map((c, i) => (
            <div key={i} className="menu-fan-card" style={{ transform: `translate(${i * 70 - 140}px, ${Math.abs(i - 2) * 18}px) rotate(${(i - 2) * 9}deg)` }}>
              <CardImage spec={{ ...c, set: settings.backSet }} set={settings.backSet} faceUp seed={`menu${i}`} />
            </div>
          ))}
          <div className="menu-fan-card back" style={{ transform: 'translate(120px, 190px) rotate(14deg)' }}>
            <CardImage spec={null} set={settings.backSet} faceUp={false} seed="menu-back" />
          </div>
        </div>
      </div>
    </Screen>
  );
}
