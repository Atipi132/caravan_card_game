import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ROOM_SETTINGS } from '@caravan/engine';
import type { DeckChoice, RoomSettings } from '@caravan/engine';
import { PipMenu, Screen } from '../ui/PipMenu';
import { getSocket, ready } from '../net/socket';
import { deckStore, settingsStore } from '../settings';
import { sfx } from '../audio/sfx';

type LobbyState = { kind: 'menu' } | { kind: 'searching'; since: number } | { kind: 'hosting'; code: string; settings: RoomSettings } | { kind: 'join' } | { kind: 'room-setup' };

function deckChoice(): DeckChoice {
  const s = settingsStore.get();
  return { backSet: s.backSet, custom: s.useCustomDeck ? deckStore.get() : undefined };
}

export function OnlineLobby({ back, joinCode }: { back: () => void; joinCode?: string }) {
  const [state, setState] = useState<LobbyState>({ kind: 'menu' });
  const [connected, setConnected] = useState(getSocket().connected);
  const [online, setOnline] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [code, setCode] = useState(joinCode ?? '');
  const autoJoined = useRef(false);

  useEffect(() => {
    const s = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onStats = (p: { online: number }) => setOnline(p.online);
    const onWaiting = (p: { code: string; settings: RoomSettings }) => setState({ kind: 'hosting', code: p.code, settings: p.settings });
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('server:stats', onStats);
    s.on('room:waiting', onWaiting);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('server:stats', onStats);
      s.off('room:waiting', onWaiting);
    };
  }, []);

  const join = async (c: string) => {
    setError(null);
    await ready();
    getSocket().emit('room:join', { code: c, deck: deckChoice() }, (r) => {
      if (!r.ok) {
        setError(r.error);
        sfx.error();
      }
    });
  };

  // Invitation link: /?room=CODE
  useEffect(() => {
    if (joinCode && !autoJoined.current) {
      autoJoined.current = true;
      void join(joinCode);
    }
  }, [joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const quickMatch = async () => {
    setError(null);
    await ready();
    getSocket().emit('queue:join', { deck: deckChoice() }, (r) => {
      if (r.ok) setState({ kind: 'searching', since: Date.now() });
      else setError(r.error);
    });
  };

  const createRoom = async () => {
    setError(null);
    await ready();
    getSocket().emit('room:create', { settings: roomSettings, deck: deckChoice() }, (r) => {
      if (!r.ok) setError(r.error);
    });
  };

  const cancel = () => {
    const s = getSocket();
    if (state.kind === 'searching') s.emit('queue:leave');
    if (state.kind === 'hosting') s.emit('room:leave');
    setState({ kind: 'menu' });
  };

  const leave = () => {
    cancel();
    back();
  };

  const status = connected ? `Connected${online !== null ? ` · ${online} courier${online === 1 ? '' : 's'} online` : ''}` : 'Connecting to the server…';

  return (
    <Screen title="Play Online" footer={<span className={connected ? '' : 'blink'}>{status}</span>}>
      {state.kind === 'menu' && (
        <PipMenu
          items={[
            { label: 'Quick Match', testId: 'online-quick', onSelect: quickMatch, disabled: !connected, hint: 'Play against the next available courier (standard decks).' },
            { label: 'Create Private Room', testId: 'online-create', onSelect: () => setState({ kind: 'room-setup' }), disabled: !connected, hint: 'Get a code and an invitation link to send to a friend.' },
            { label: 'Join Private Room', testId: 'online-join', onSelect: () => setState({ kind: 'join' }), disabled: !connected, hint: 'Enter the code your friend gave you.' },
            { label: 'Back', onSelect: leave },
          ]}
        />
      )}

      {state.kind === 'searching' && <Searching since={state.since} onCancel={cancel} />}

      {state.kind === 'room-setup' && (
        <PipMenu
          items={[
            { label: 'Create room', testId: 'room-create', onSelect: createRoom },
            {
              label: `Jokers: ${roomSettings.jokers}`,
              onSelect: () => setRoomSettings((r) => ({ ...r, jokers: ((r.jokers + 1) % 3) as 0 | 1 | 2 })),
              hint: 'Number of Jokers in standard decks.',
            },
            {
              label: `Custom decks: ${roomSettings.allowCustomDecks ? 'Allowed' : 'Not allowed'}`,
              onSelect: () => setRoomSettings((r) => ({ ...r, allowCustomDecks: !r.allowCustomDecks })),
              hint: 'Let both players bring the deck they built in the Deck Builder.',
            },
            {
              label: `Turn time: ${roomSettings.turnSeconds}s`,
              onSelect: () => setRoomSettings((r) => ({ ...r, turnSeconds: r.turnSeconds === 30 ? 60 : r.turnSeconds === 60 ? 120 : 30 })),
              hint: 'When the time runs out a random card is discarded. Three timeouts in a row forfeit the game.',
            },
            { label: 'Back', onSelect: () => setState({ kind: 'menu' }) },
          ]}
        />
      )}

      {state.kind === 'hosting' && <Hosting code={state.code} settings={state.settings} onCancel={cancel} />}

      {state.kind === 'join' && (
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 5) void join(code.trim().toUpperCase());
          }}
        >
          <label htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            data-testid="room-code-input"
            className="pip-input code-input"
            value={code}
            maxLength={5}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
          <div className="pip-actions">
            <button className="pip-btn" type="submit" data-testid="room-join-submit" disabled={code.length !== 5}>
              Join
            </button>
            <button className="pip-btn" type="button" onClick={() => setState({ kind: 'menu' })}>
              Back
            </button>
          </div>
        </form>
      )}

      {error && <div className="lobby-error">{error}</div>}
    </Screen>
  );
}

function Searching({ since, onCancel }: { since: number; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const secs = Math.floor((now - since) / 1000);
  return (
    <div className="lobby-box">
      <div className="blink">Looking for an opponent…</div>
      <div className="dim">{secs}s</div>
      {secs >= 30 && <p className="dim">Not many couriers around right now. Share the site with a friend, or try a game against the AI.</p>}
      <div className="pip-actions">
        <button className="pip-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Hosting({ code, settings, onCancel }: { code: string; settings: RoomSettings; onCancel: () => void }) {
  const link = `${window.location.origin}/?room=${code}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Caravan Online — Private Room', text: `Join my Caravan game (room ${code})`, url: link });
    } catch {
      /* user cancelled share sheet */
    }
  };
  return (
    <div className="lobby-box">
      <div>Room code</div>
      <div className="room-code" data-testid="room-code">
        {code}
      </div>
      <div className="room-link">{link}</div>
      <div className="dim">
        Jokers: {settings.jokers} · Custom decks: {settings.allowCustomDecks ? 'yes' : 'no'} · Turn: {settings.turnSeconds}s
      </div>
      <div className="blink">Waiting for your opponent…</div>
      <div className="pip-actions">
        {canShare && (
          <button className="pip-btn" onClick={share}>
            Share invite link
          </button>
        )}
        <button className="pip-btn" onClick={copy}>
          {copied ? 'Copied!' : 'Copy invitation link'}
        </button>
        <button className="pip-btn" onClick={onCancel}>
          Close room
        </button>
      </div>
    </div>
  );
}
