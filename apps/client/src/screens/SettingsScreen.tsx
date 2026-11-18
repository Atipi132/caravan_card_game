import { useEffect, useState } from 'react';
import { CARD_SETS } from '@caravan/engine';
import { Screen } from '../ui/PipMenu';
import { CardImage, SET_LABELS } from '../game/CardImage';
import { settingsStore, statsStore, useStore } from '../settings';
import { sfx } from '../audio/sfx';

export function SettingsScreen({ back }: { back: () => void }) {
  const s = useStore(settingsStore);
  const [name, setName] = useState(s.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (patch: Partial<typeof s>) => settingsStore.set((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const saveName = () => {
    const clean = name.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 20);
    if (clean) set({ name: clean });
    setName(clean || s.name);
  };

  return (
    <Screen
      title="Settings"
      footer={
        <span>
          <button className="prompt" onClick={back}>
            Back <span className="prompt-key">Esc)</span>
          </button>
        </span>
      }
    >
      <div className="settings-grid">
        <label>Name</label>
        <input
          className="pip-input"
          data-testid="name-input"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />

        <label>HUD color</label>
        <div className="seg">
          {(['amber', 'green'] as const).map((c) => (
            <button key={c} className={`seg-btn ${s.hud === c ? 'is-active' : ''}`} data-testid={`hud-${c}`} onClick={() => set({ hud: c })}>
              {c === 'amber' ? 'Amber' : 'Green'}
            </button>
          ))}
        </div>

        <label>Sound effects</label>
        <div className="seg">
          <button className={`seg-btn ${s.sound ? 'is-active' : ''}`} onClick={() => set({ sound: true })}>
            On
          </button>
          <button className={`seg-btn ${!s.sound ? 'is-active' : ''}`} onClick={() => set({ sound: false })}>
            Off
          </button>
        </div>

        <label>Desert wind</label>
        <div className="seg">
          <button className={`seg-btn ${s.ambience ? 'is-active' : ''}`} onClick={() => set({ ambience: true })}>
            On
          </button>
          <button className={`seg-btn ${!s.ambience ? 'is-active' : ''}`} onClick={() => set({ ambience: false })}>
            Off
          </button>
        </div>

        <label>Volume</label>
        <input
          type="range"
          className="pip-range"
          min={0}
          max={1}
          step={0.05}
          value={s.volume}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          onPointerUp={() => sfx.place()}
        />

        <label>Card back</label>
        <div className="back-picker">
          {CARD_SETS.map((set_) => (
            <button key={set_} className={`back-option ${s.backSet === set_ ? 'is-active' : ''}`} onClick={() => set({ backSet: set_ })} title={SET_LABELS[set_]}>
              <CardImage spec={null} set={set_} faceUp={false} seed={`pick-${set_}`} />
              <span>{SET_LABELS[set_]}</span>
            </button>
          ))}
        </div>

        <label>Statistics</label>
        <div>
          {confirmReset ? (
            <>
              <button
                className="pip-btn"
                onClick={() => {
                  statsStore.set({ netTotal: 0, wins: 0, losses: 0 });
                  setConfirmReset(false);
                }}
              >
                Really reset?
              </button>
              <button className="pip-btn" onClick={() => setConfirmReset(false)}>
                No
              </button>
            </>
          ) : (
            <button className="pip-btn" onClick={() => setConfirmReset(true)}>
              Reset Net Total & Win/Loss
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}
