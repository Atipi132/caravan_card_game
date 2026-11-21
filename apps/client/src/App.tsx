import { useCallback, useEffect, useState } from 'react';
import type { AiLevel, GameUpdate } from '@caravan/engine';
import { Stage } from './ui/Stage';
import { MainMenu } from './screens/MainMenu';
import { AiSetup } from './screens/AiSetup';
import { OnlineLobby } from './screens/OnlineLobby';
import { DeckBuilder } from './screens/DeckBuilder';
import { Rules } from './screens/Rules';
import { SettingsScreen } from './screens/SettingsScreen';
import { Board } from './game/Board';
import { useLocalGame } from './game/useLocalGame';
import { useOnlineGame } from './game/useOnlineGame';
import { HUD_COLORS, activeDeck, settingsStore, useStore } from './settings';
import { getSocket, ready } from './net/socket';
import { setAmbience, unlockAudio } from './audio/sfx';

export type Route =
  | { name: 'menu' }
  | { name: 'ai-setup' }
  | { name: 'ai-game'; level: AiLevel; ante: number; key: number }
  | { name: 'online'; joinCode?: string }
  | { name: 'online-game'; initial: GameUpdate }
  | { name: 'deck' }
  | { name: 'rules' }
  | { name: 'settings' };

function initialRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  if (code) return { name: 'online', joinCode: code.toUpperCase() };
  const mode = params.get('mode');
  if (mode === 'ai') return { name: 'ai-setup' };
  if (mode === 'online') return { name: 'online' };
  return { name: 'menu' };
}

export function App() {
  const settings = useStore(settingsStore);
  const [route, setRoute] = useState<Route>(initialRoute);
  const go = useCallback((r: Route) => setRoute(r), []);
  const toMenu = useCallback(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
    setRoute({ name: 'menu' });
  }, []);

  // HUD color as CSS variables.
  useEffect(() => {
    const c = HUD_COLORS[settings.hud];
    const root = document.documentElement.style;
    root.setProperty('--hud', c.main);
    root.setProperty('--hud-dim', c.dim);
    root.setProperty('--hud-glow', c.glow);
    root.setProperty('--hud-bg', c.bg);
  }, [settings.hud]);

  // Unlock audio on the first interaction, keep the ambience in sync.
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setAmbience(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  useEffect(() => {
    setAmbience(true);
  }, [settings.sound, settings.ambience]);

  // Online: resume a running game after a reload, and enter games started from the lobby.
  useEffect(() => {
    const s = getSocket();
    void ready();
    const onState = (u: GameUpdate) => {
      setRoute((r) => (r.name === 'online-game' ? r : { name: 'online-game', initial: u }));
    };
    s.on('game:state', onState);
    return () => {
      s.off('game:state', onState);
    };
  }, []);

  const isGameRoute = route.name === 'ai-game' || route.name === 'online-game';

  return (
    <Stage className={`hud-${settings.hud}`} scalableInLandscape={isGameRoute}>
      {route.name === 'menu' && <MainMenu go={go} />}
      {route.name === 'ai-setup' && <AiSetup go={go} back={toMenu} />}
      {route.name === 'ai-game' && <LocalGameScreen key={route.key} level={route.level} ante={route.ante} onLeave={toMenu} />}
      {route.name === 'online' && <OnlineLobby back={toMenu} joinCode={route.joinCode} />}
      {route.name === 'online-game' && <OnlineGameScreen initial={route.initial} onLeave={toMenu} />}
      {route.name === 'deck' && <DeckBuilder back={toMenu} />}
      {route.name === 'rules' && <Rules back={toMenu} />}
      {route.name === 'settings' && <SettingsScreen back={toMenu} />}
    </Stage>
  );
}

function LocalGameScreen({ level, ante, onLeave }: { level: AiLevel; ante: number; onLeave: () => void }) {
  const [deck] = useState(activeDeck);
  const session = useLocalGame({ aiLevel: level, ante, deck, youName: settingsStore.get().name, onLeave });
  return <Board session={session} />;
}

function OnlineGameScreen({ initial, onLeave }: { initial: GameUpdate; onLeave: () => void }) {
  const session = useOnlineGame(initial, onLeave);
  return <Board key={`${initial.gameId}`} session={session} />;
}
