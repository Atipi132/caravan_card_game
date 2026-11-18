import { useSyncExternalStore } from 'react';
import { standardDeck, validateDeck } from '@caravan/engine';
import type { AiLevel, CardSet, CardSpec } from '@caravan/engine';

export type HudColor = 'amber' | 'green';

export interface Settings {
  name: string;
  hud: HudColor;
  sound: boolean;
  ambience: boolean;
  volume: number;
  aiLevel: AiLevel;
  ante: number;
  /** Use the custom deck from the deck builder (vs AI, and in private rooms that allow it). */
  useCustomDeck: boolean;
  /** Card back of the standard deck. */
  backSet: CardSet;
}

export interface Stats {
  netTotal: number;
  wins: number;
  losses: number;
}

const KEYS = { settings: 'caravan.settings', stats: 'caravan.stats', deck: 'caravan.deck', playerId: 'caravan.playerId' };

const DEFAULT_SETTINGS: Settings = {
  name: `Courier${Math.floor(Math.random() * 900 + 100)}`,
  hud: 'amber',
  sound: true,
  ambience: true,
  volume: 0.7,
  aiLevel: 'normal',
  ante: 50,
  useCustomDeck: false,
  backSet: 'atomic',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

type Listener = () => void;

/** Tiny observable store persisted in localStorage. */
class Store<T> {
  private listeners = new Set<Listener>();
  constructor(
    private key: string,
    private value: T,
  ) {}
  get = (): T => this.value;
  set = (next: T | ((prev: T) => T)): void => {
    this.value = typeof next === 'function' ? (next as (p: T) => T)(this.value) : next;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.value));
    } catch {
      /* storage full or disabled */
    }
    this.listeners.forEach((l) => l());
  };
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

export const settingsStore = new Store<Settings>(KEYS.settings, read(KEYS.settings, DEFAULT_SETTINGS));
export const statsStore = new Store<Stats>(KEYS.stats, read(KEYS.stats, { netTotal: 0, wins: 0, losses: 0 }));
export const deckStore = new Store<CardSpec[]>(KEYS.deck, readArray<CardSpec>(KEYS.deck) ?? standardDeck('atomic'));

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function getPlayerId(): string {
  let id = localStorage.getItem(KEYS.playerId);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEYS.playerId, id);
  }
  return id;
}

/** The deck the player brings to a game: custom deck if enabled and valid, else the standard one. */
export function activeDeck(): CardSpec[] {
  const s = settingsStore.get();
  const deck = deckStore.get();
  if (s.useCustomDeck && validateDeck(deck).ok) return deck;
  return standardDeck(s.backSet);
}

export function recordResult(won: boolean, ante: number): void {
  statsStore.set((st) => ({
    netTotal: st.netTotal + (won ? ante : -ante),
    wins: st.wins + (won ? 1 : 0),
    losses: st.losses + (won ? 0 : 1),
  }));
}

export const HUD_COLORS: Record<HudColor, { main: string; dim: string; glow: string; bg: string }> = {
  amber: { main: '#ffb642', dim: 'rgba(255, 182, 66, 0.45)', glow: 'rgba(255, 182, 66, 0.55)', bg: 'rgba(255, 182, 66, 0.16)' },
  green: { main: '#1aff80', dim: 'rgba(26, 255, 128, 0.45)', glow: 'rgba(26, 255, 128, 0.5)', bg: 'rgba(26, 255, 128, 0.14)' },
};
