import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { cardLabel, isNumberCard, isSold, SOLD_MAX } from '@caravan/engine';
import type { Action, Card, CaravanIndex, PlayerIndex, PlayerView } from '@caravan/engine';
import type { GameSession } from './session';
import {
  CARD_H,
  CARD_W,
  COL_X,
  DECK_POS,
  ZONES,
  caravanCardPos,
  computeLayout,
  computePortraitCaravanSprites,
  computePortraitMetrics,
  exitPoint,
  portraitCaravanCardPos,
  portraitExitPoint,
  portraitSpawnPoint,
  spawnPoint,
} from './layout';
import type { Sprite } from './layout';
import { CardSprite } from './CardSprite';
import type { SpriteVisualState } from './CardSprite';
import { CardImage } from './CardImage';
import { TargetPickerSheet } from './TargetPickerSheet';
import { legalTargets, locateOnTable, targetToAction } from './targets';
import type { Target } from './targets';
import { caravanName, describeAction, endReasonText } from './text';
import { sfx } from '../audio/sfx';
import { statsStore, useStore } from '../settings';
import { useViewport } from '../ui/viewport';

type Mode = 'select' | 'disband';
const LANES: CaravanIndex[] = [0, 1, 2];

interface BoardProps {
  session: GameSession;
}

export function Board({ session }: BoardProps) {
  const view = session.view;
  if (!view) {
    return (
      <div className="board-loading hud-text">
        <span className="blink">Shuffling the deck…</span>
      </div>
    );
  }
  return <BoardInner session={session} view={view} />;
}

function laneKey(p: number, lane: number) {
  return `${p}:${lane}`;
}
function cardKey(p: number, lane: number, index: number) {
  return `${p}:${lane}:${index}`;
}

function BoardInner({ session, view }: { session: GameSession; view: PlayerView }) {
  const vp = useViewport();
  const me = view.you;
  const opp = (me === 0 ? 1 : 0) as PlayerIndex;
  const myTurn = view.turn === me && view.phase !== 'ended';
  const stats = useStore(statsStore);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);
  const [showEnd, setShowEnd] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [pickerLane, setPickerLane] = useState<{ player: PlayerIndex; caravan: CaravanIndex } | null>(null);
  const [showStats, setShowStats] = useState(false);

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [arenaSize, setArenaSize] = useState({ w: vp.width, h: Math.max(360, vp.height - 240) });

  const busy = useRef(false);
  const firstRender = useRef(true);
  const knownIds = useRef<Set<string>>(new Set());

  const selectedCard: Card | null = useMemo(() => view.hand.find((c) => c.id === selectedId) ?? null, [view.hand, selectedId]);

  // Measure the portrait arena container whenever orientation or window dimensions change.
  useEffect(() => {
    if (!vp.isPortrait) return;
    const el = arenaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        setArenaSize((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vp.isPortrait]);

  // Drop selection & picker when no longer valid.
  useEffect(() => {
    if (selectedId && !selectedCard) setSelectedId(null);
    if (!myTurn) {
      setSelectedId(null);
      setMode('select');
      setPickerLane(null);
    }
  }, [selectedId, selectedCard, myTurn]);

  useEffect(() => {
    if (!selectedCard) setPickerLane(null);
  }, [selectedCard]);

  const flash = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setMessage({ text, kind });
    if (kind === 'error') sfx.error();
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.kind === 'error' ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [message]);

  // React to the last action: sounds, highlight, log line.
  const lastActionRef = useRef(view.lastAction);
  useEffect(() => {
    const a = view.lastAction;
    if (!a || a === lastActionRef.current) return;
    lastActionRef.current = a;
    if (a.action.type === 'play') sfx.place(0.35);
    if (a.action.type === 'discard') sfx.slide();
    if (a.removedIds.length > 0 || a.action.type === 'disband') sfx.remove(0.45);
    if (a.drawnId) sfx.draw(0.55);
    if (a.player !== me) {
      setRecentId(a.card && a.action.type === 'play' && a.card.rank !== 'J' ? a.card.id : null);
      flash(describeAction(view, a, session.opponentName));
    }
  }, [view, me, flash, session.opponentName]);

  useEffect(() => {
    if (!recentId) return;
    const t = setTimeout(() => setRecentId(null), 2200);
    return () => clearTimeout(t);
  }, [recentId]);

  // Turn notification
  const prevTurn = useRef(view.turn);
  useEffect(() => {
    if (view.turn !== prevTurn.current && view.turn === me && view.phase !== 'ended') sfx.turn();
    prevTurn.current = view.turn;
  }, [view.turn, me, view.phase]);

  // Game over
  useEffect(() => {
    if (view.phase !== 'ended') {
      setShowEnd(false);
      return;
    }
    const t = setTimeout(() => {
      setShowEnd(true);
      if (view.winner === me) sfx.win();
      else sfx.lose();
    }, 1100);
    return () => clearTimeout(t);
  }, [view.phase, view.winner, me]);

  // Shuffle sound on a fresh game.
  useEffect(() => {
    if (view.turnNumber === 0) sfx.shuffle();
  }, [view.turnNumber === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(
    async (action: Action) => {
      if (busy.current) return;
      busy.current = true;
      const err = await session.act(action);
      busy.current = false;
      if (err) flash(err, 'error');
      else {
        setSelectedId(null);
        setMode('select');
        setHoveredLane(null);
        setPickerLane(null);
      }
    },
    [session, flash],
  );

  // --- Targets ---------------------------------------------------------------------------------
  const targets: Target[] = useMemo(() => (selectedCard && mode === 'select' ? legalTargets(view, selectedCard) : []), [view, selectedCard, mode]);
  const laneLevel = !!selectedCard && (isNumberCard(selectedCard) || selectedCard.rank === 'Q');
  const useMobileFacePicker = vp.isMobile || vp.isTouch;

  const targetLanes = useMemo(() => {
    const s = new Set<string>();
    if (mode === 'disband') {
      LANES.forEach((l) => view.caravans[me][l].cards.length > 0 && s.add(laneKey(me, l)));
    } else if (laneLevel) {
      targets.forEach((t) => s.add(laneKey(t.player, t.caravan)));
    } else if (useMobileFacePicker && selectedCard) {
      // On mobile/touch, tapping any caravan with valid face-card targets opens the picker (or plays directly if only 1 target).
      targets.forEach((t) => s.add(laneKey(t.player, t.caravan)));
    }
    return s;
  }, [targets, laneLevel, mode, view.caravans, me, useMobileFacePicker, selectedCard]);

  const targetCards = useMemo(() => {
    const s = new Set<string>();
    if (!laneLevel) targets.forEach((t) => t.cardIndex !== undefined && s.add(cardKey(t.player, t.caravan, t.cardIndex)));
    return s;
  }, [targets, laneLevel]);

  const findTarget = useCallback(
    (player: PlayerIndex, lane: CaravanIndex, index?: number): Target | undefined => {
      if (laneLevel) return targets.find((t) => t.player === player && t.caravan === lane);
      return targets.find((t) => t.player === player && t.caravan === lane && t.cardIndex === index);
    },
    [targets, laneLevel],
  );

  // --- Interaction -----------------------------------------------------------------------------
  const selectCard = useCallback(
    (id: string | null) => {
      if (id && !myTurn) {
        flash(session.waiting ? 'Wait for your opponent to play.' : 'It is not your turn.', 'error');
        return;
      }
      setMode('select');
      setPickerLane(null);
      setSelectedId((cur) => (cur === id ? null : id));
      if (id) sfx.select();
    },
    [myTurn, flash, session.waiting],
  );

  /** Handles mobile/touch targeting of a face card (Jack/King/Joker) on a caravan. */
  const handleMobileFaceLane = useCallback(
    (player: PlayerIndex, lane: CaravanIndex): boolean => {
      if (!selectedCard || laneLevel || !useMobileFacePicker) return false;
      const laneTargets = targets.filter((t) => t.player === player && t.caravan === lane && t.cardIndex !== undefined);
      if (laneTargets.length === 0) {
        flash(explainIllegal(view, selectedCard, player), 'error');
        return true;
      }
      if (laneTargets.length === 1) {
        void send(targetToAction(selectedCard, laneTargets[0]));
        return true;
      }
      sfx.blip();
      setPickerLane({ player, caravan: lane });
      return true;
    },
    [selectedCard, laneLevel, useMobileFacePicker, targets, view, send, flash],
  );

  const onLane = useCallback(
    (player: PlayerIndex, lane: CaravanIndex) => {
      if (!myTurn) return;
      if (mode === 'disband') {
        if (player !== me) return flash('You can only discard your own caravans.', 'error');
        if (view.caravans[me][lane].cards.length === 0) return flash('This caravan is empty.', 'error');
        void send({ type: 'disband', caravan: lane });
        return;
      }
      if (!selectedCard) return;
      if (!laneLevel) {
        if (handleMobileFaceLane(player, lane)) return;
        return flash('Choose a card to attach this face card to.', 'error');
      }
      const t = findTarget(player, lane);
      if (t) void send(targetToAction(selectedCard, t));
      else flash(explainIllegal(view, selectedCard, player), 'error');
    },
    [myTurn, mode, me, view, selectedCard, laneLevel, handleMobileFaceLane, findTarget, send, flash],
  );

  const onSpriteClick = useCallback(
    (id: string) => {
      if (view.hand.some((c) => c.id === id)) return selectCard(id);
      const loc = locateOnTable(view, id);
      if (!loc) return;
      if (mode === 'disband' || laneLevel) return onLane(loc.player, loc.caravan);
      if (!selectedCard) return;
      if (handleMobileFaceLane(loc.player, loc.caravan)) return;
      const t = findTarget(loc.player, loc.caravan, loc.index);
      if (t) void send(targetToAction(selectedCard, t));
      else flash(explainIllegal(view, selectedCard, loc.player), 'error');
    },
    [view, mode, laneLevel, selectedCard, handleMobileFaceLane, findTarget, selectCard, onLane, send, flash],
  );

  const discardSelected = useCallback(() => {
    if (!myTurn) return;
    if (view.phase === 'opening') return flash('You cannot discard during the opening round.', 'error');
    if (!selectedCard) return flash('Select a card in your hand first.', 'error');
    void send({ type: 'discard', cardId: selectedCard.id });
  }, [myTurn, view.phase, selectedCard, send, flash]);

  const toggleDisband = useCallback(() => {
    if (!myTurn) return;
    if (view.phase === 'opening') return flash('You cannot discard a caravan during the opening round.', 'error');
    if (view.caravans[me].every((c) => c.cards.length === 0)) return flash('You have no caravan to discard.', 'error');
    setSelectedId(null);
    setPickerLane(null);
    setMode((m) => (m === 'disband' ? 'select' : 'disband'));
    sfx.blip();
  }, [myTurn, view.phase, view.caravans, me, flash]);

  const cancel = useCallback(() => {
    setSelectedId(null);
    setMode('select');
    setPickerLane(null);
    setConfirmForfeit(false);
    setShowStats(false);
  }, []);

  const cycleSelect = useCallback(() => {
    if (!myTurn || view.hand.length === 0) return;
    const idx = view.hand.findIndex((c) => c.id === selectedId);
    const next = view.hand[(idx + 1) % view.hand.length];
    setMode('select');
    setSelectedId(next.id);
    sfx.blip();
  }, [myTurn, view.hand, selectedId]);

  // Keyboard shortcuts (same keys as the PC version of the original game).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'w') cycleSelect();
      else if (k === 'q') discardSelected();
      else if (k === 'e') toggleDisband();
      else if (k === 'r' || k === 'escape') cancel();
      else if (k === 'b') setConfirmForfeit(true);
      else if (/^[1-8]$/.test(k)) {
        const c = view.hand[Number(k) - 1];
        if (c) selectCard(c.id);
      } else if (k === 'a' || k === 's' || k === 'd') {
        const lane = ({ a: 0, s: 1, d: 2 } as const)[k];
        onLane(me, lane);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleSelect, discardSelected, toggleDisband, cancel, selectCard, onLane, view.hand, me]);

  // --- Layout ----------------------------------------------------------------------------------
  const hoveredHandId = hoveredId && view.hand.some((c) => c.id === hoveredId) ? hoveredId : null;
  const desktopSprites = useMemo(
    () => (vp.isPortrait ? [] : computeLayout(view, { selectedId, hoveredHandId })),
    [vp.isPortrait, view, selectedId, hoveredHandId],
  );
  const portraitMetrics = useMemo(() => computePortraitMetrics(arenaSize.w, arenaSize.h), [arenaSize.w, arenaSize.h]);
  const portraitSprites = useMemo(
    () => (vp.isPortrait ? computePortraitCaravanSprites(view, portraitMetrics) : []),
    [vp.isPortrait, view, portraitMetrics],
  );

  const activeSprites = vp.isPortrait ? portraitSprites : desktopSprites;

  const hoveredLoc = hoveredId ? locateOnTable(view, hoveredId) : null;
  const hotLane = hoveredLoc ? laneKey(hoveredLoc.player, hoveredLoc.caravan) : hoveredLane;

  const visualFor = (s: Sprite): SpriteVisualState => {
    let target = false;
    let hot = false;
    if (s.side !== undefined && s.lane !== undefined && s.index !== undefined) {
      const lk = laneKey(s.side, s.lane);
      const count = view.caravans[s.side][s.lane].cards.length;
      if (mode === 'disband') {
        target = targetLanes.has(lk);
        hot = target && hotLane === lk;
      } else if (laneLevel) {
        // Highlight the last card of a legal lane.
        target = targetLanes.has(lk) && s.index === count - 1 && s.kind === 'caravan';
        hot = target && hotLane === lk;
      } else if (selectedCard) {
        target = targetCards.has(cardKey(s.side, s.lane, s.index)) && s.kind === 'caravan';
        const hl = hoveredLoc && hoveredLoc.player === s.side && hoveredLoc.caravan === s.lane && hoveredLoc.index === s.index;
        hot = target && !!hl;
      }
    }
    return {
      selected: s.id === selectedId,
      target,
      hot,
      recent: s.id === recentId,
      interactive: s.kind === 'hand' ? myTurn : target,
    };
  };

  // New cards spawn from their owner's deck; on first render everything is already in place.
  const isFirst = firstRender.current;
  useEffect(() => {
    firstRender.current = false;
    knownIds.current = new Set(activeSprites.map((s) => s.id));
  });

  // --- Shared derived state --------------------------------------------------------------------
  const bids = view.bids;
  const canDiscard = myTurn && view.phase === 'main' && !!selectedCard;
  const canDisband = myTurn && view.phase === 'main' && view.caravans[me].some((c) => c.cards.length > 0);
  const hideKeyHints = vp.isMobile || vp.isTouch;

  const pickerLegalIndices = useMemo(() => {
    const s = new Set<number>();
    if (!pickerLane) return s;
    for (const t of targets) {
      if (t.player === pickerLane.player && t.caravan === pickerLane.caravan && t.cardIndex !== undefined) {
        s.add(t.cardIndex);
      }
    }
    return s;
  }, [pickerLane, targets]);

  // --- Shared dialogs --------------------------------------------------------------------------
  const dialogs = (
    <>
      {pickerLane && selectedCard && (
        <TargetPickerSheet
          selectedCard={selectedCard}
          caravan={view.caravans[pickerLane.player][pickerLane.caravan]}
          caravanTitle={caravanName(view, pickerLane.player, pickerLane.caravan)}
          targetPlayer={pickerLane.player}
          me={me}
          legalIndices={pickerLegalIndices}
          onPick={(cardIndex) => {
            const t = findTarget(pickerLane.player, pickerLane.caravan, cardIndex);
            if (t) void send(targetToAction(selectedCard, t));
          }}
          onCancel={() => setPickerLane(null)}
        />
      )}

      {confirmForfeit && view.phase !== 'ended' && (
        <div className="modal-backdrop" onClick={() => setConfirmForfeit(false)}>
          <div className="pip-box" onClick={(e) => e.stopPropagation()}>
            <div className="pip-title">Forfeit the game?</div>
            <p>Your ante of {session.ante} caps will be lost.</p>
            <div className="pip-actions">
              <button
                className="pip-btn"
                onClick={() => {
                  setConfirmForfeit(false);
                  void session.act({ type: 'forfeit' });
                }}
              >
                Forfeit
              </button>
              <button className="pip-btn" onClick={() => setConfirmForfeit(false)}>
                Keep playing
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnd && view.phase === 'ended' && (
        <div className="modal-backdrop">
          <div className="pip-box end-box" data-testid="game-over">
            <div className="pip-title big">{view.winner === me ? 'You win!' : 'You lose'}</div>
            <p>{endReasonText(view)}</p>
            <p className="dim">
              {view.winner === me ? `+${session.ante}` : `-${session.ante}`} caps · Net total {stats.netTotal}
            </p>
            <div className="final-bids">
              {LANES.map((l) => (
                <div key={l} className="final-lane">
                  <div className={view.laneWinners[l] === opp ? 'win' : ''}>
                    {caravanName(view, opp, l)} {bids[opp][l]}
                  </div>
                  <div className={view.laneWinners[l] === me ? 'win' : ''}>
                    {caravanName(view, me, l)} {bids[me][l]}
                  </div>
                </div>
              ))}
            </div>
            <div className="pip-actions">
              <button className="pip-btn" onClick={session.requestRematch} disabled={session.rematch === 'you'}>
                {session.rematch === 'you' ? 'Waiting for opponent…' : session.rematch === 'opponent' ? 'Accept rematch' : 'Play again'}
              </button>
              <button className="pip-btn" onClick={session.leave}>
                Main menu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // --- Mobile Portrait Render ------------------------------------------------------------------
  if (vp.isPortrait) {
    const m = portraitMetrics;
    const handCount = view.hand.length;
    const handCardW = Math.round(Math.max(66, Math.min(92, vp.width * 0.21)));
    const handCardH = Math.round(handCardW * (CARD_H / CARD_W));
    const handAvailW = Math.min(vp.width - 16, 560);
    const handStep = handCount <= 1 ? 0 : Math.min(handCardW + 8, (handAvailW - handCardW) / (handCount - 1));
    const handTotalW = handCount === 0 ? 0 : handCardW + (handCount - 1) * handStep;

    const statusLine =
      message?.text ??
      session.status ??
      (mode === 'disband'
        ? 'Tap one of your caravans to discard it.'
        : selectedCard && !isNumberCard(selectedCard) && view.phase === 'main'
          ? faceHint(selectedCard)
          : selectedCard
            ? `Selected ${cardLabel(selectedCard)} — tap a highlighted caravan.`
            : view.phase === 'opening' && myTurn
              ? 'Opening round: tap a number card (A–10), then an empty caravan.'
              : null);

    return (
      <div className="m-board" data-testid="mobile-portrait-board">
        {/* Top bar */}
        <header className="m-topbar hud-text">
          <div className="m-top-left">
            <div className="m-opp-name">
              {session.opponentName}
              {!session.opponentConnected && <span className="warn"> (off)</span>}
            </div>
            <div className={`hud-turn m-turn ${myTurn ? 'is-mine' : ''}`}>
              {view.phase === 'ended' ? 'Game over' : myTurn ? 'Your turn' : 'Thinking…'}
            </div>
          </div>

          <div className="m-top-right">
            <span className="m-chip dim" aria-label="Opponent cards">
              H:{view.opponent.hand.length} D:{view.opponent.deckCount}
            </span>
            {session.deadline && view.phase !== 'ended' && <CompactTimer deadline={session.deadline} mine={myTurn} />}
            <button
              type="button"
              className={`m-chip-btn ${showStats ? 'is-active' : ''}`}
              onClick={() => setShowStats((v) => !v)}
            >
              Pot {session.ante * 2}
            </button>
          </div>
        </header>

        {showStats && (
          <div className="m-stats-pop hud-text" onClick={() => setShowStats(false)}>
            <div className="hud-row">
              <span>You:</span>
              <span>{session.youName}</span>
            </div>
            <div className="hud-row">
              <span>Ante Pot:</span>
              <span>{session.ante * 2}</span>
            </div>
            <div className="hud-row">
              <span>Net Total:</span>
              <span>{stats.netTotal}</span>
            </div>
            <div className="hud-row">
              <span>Win/Loss:</span>
              <span>
                {stats.wins}/{stats.losses}
              </span>
            </div>
          </div>
        )}

        {/* Vertical 3-column wooden table arena */}
        <div
          ref={arenaRef}
          className="m-arena"
          onClick={() => cancel()}
          onContextMenu={(e) => {
            e.preventDefault();
            cancel();
          }}
        >
          <div className="table-bg" />
          <div className="table-shade" />

          {/* Carved caravan names & glowing bids */}
          {LANES.map((lane) => (
            <div
              key={lane}
              className="m-lane-label"
              style={{ left: m.colLeft[lane], top: m.stripY, width: m.colW, height: m.stripH }}
            >
              <BidRow bid={bids[opp][lane]} name={caravanName(view, opp, lane)} winner={view.laneWinners[lane] === opp} />
              <BidRow bid={bids[me][lane]} name={caravanName(view, me, lane)} winner={view.laneWinners[lane] === me} />
            </div>
          ))}

          {/* Click zones & ghost slots */}
          {([me, opp] as PlayerIndex[]).map((side) =>
            LANES.map((lane) => {
              const lk = laneKey(side, lane);
              const isMe = side === me;
              const zone = isMe ? m.meZone : m.oppZone;
              const count = view.caravans[side][lane].cards.length;
              const showGhost = targetLanes.has(lk) && laneLevel && !!selectedCard && isNumberCard(selectedCard);
              const ghost = portraitCaravanCardPos(m, isMe, lane, count, count + 1);
              const emptyTarget = mode === 'disband' ? false : targetLanes.has(lk);
              return (
                <div key={lk}>
                  <div
                    className={`lane-zone m-lane-zone ${targetLanes.has(lk) ? 'is-target' : ''}`}
                    style={{ left: m.colLeft[lane], top: zone.top, width: m.colW, height: zone.height }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLane(side, lane);
                    }}
                  />
                  {showGhost && emptyTarget && (
                    <div
                      className="ghost-slot"
                      style={{ left: ghost.x, top: ghost.y, width: m.cardW, height: m.cardH }}
                    />
                  )}
                </div>
              );
            }),
          )}

          {/* Table cards */}
          <AnimatePresence>
            {portraitSprites.map((s) => {
              const isNew = !isFirst && !knownIds.current.has(s.id);
              const spawn = portraitSpawnPoint(view, s.owner, m);
              return (
                <CardSprite
                  key={s.id}
                  sprite={s}
                  width={m.cardW}
                  height={m.cardH}
                  initialPos={isNew ? { x: spawn.x, y: spawn.y, rotate: 0 } : false}
                  exitPos={portraitExitPoint(view, s.owner, s.x, m)}
                  visual={visualFor(s)}
                  onClick={onSpriteClick}
                />
              );
            })}
          </AnimatePresence>
        </div>

        {/* Status / hint strip */}
        <div className={`m-status hud-text ${message?.kind === 'error' ? 'is-error' : ''}`}>
          {statusLine ?? (myTurn ? 'Tap a card in your hand to play.' : `${session.opponentName} is thinking…`)}
        </div>

        {/* Bottom hand & touch action dock */}
        <div className="m-dock">
          <div className="m-hand" style={{ height: handCardH + 14 }}>
            <div className="m-hand-inner" style={{ width: handTotalW, height: handCardH }}>
              {view.hand.map((card, i) => {
                const mid = (handCount - 1) / 2;
                const d = i - mid;
                const selected = card.id === selectedId;
                const left = Math.round(i * handStep);
                const arcY = Math.round(d * d * 1.4);
                const rot = Number((d * 2.2).toFixed(2));
                return (
                  <button
                    key={card.id}
                    type="button"
                    data-card-id={card.id}
                    data-card={card.rank === 'JOKER' ? 'JOKER' : `${card.rank}${card.suit}`}
                    data-kind="hand"
                    className={`m-hand-card ${selected ? 'is-selected' : ''} ${myTurn ? 'is-interactive' : ''}`}
                    style={{
                      width: handCardW,
                      height: handCardH,
                      left,
                      top: selected ? -12 : arcY,
                      transform: `rotate(${selected ? 0 : rot}deg)`,
                      zIndex: selected ? 60 : 10 + i,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectCard(card.id);
                    }}
                  >
                    <CardImage spec={card} set={card.set} faceUp seed={card.id} />
                    <div className="sprite-tint" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="m-actions hud-text">
            <span className="m-deck-pill">Deck {view.me.deckCount}</span>
            <button
              type="button"
              className={`m-act-btn ${canDiscard ? '' : 'is-disabled'}`}
              disabled={!canDiscard}
              onClick={discardSelected}
            >
              Discard
            </button>
            <button
              type="button"
              className={`m-act-btn ${canDisband ? '' : 'is-disabled'} ${mode === 'disband' ? 'is-active' : ''}`}
              disabled={!canDisband}
              onClick={toggleDisband}
            >
              Disband
            </button>
            {selectedCard || mode === 'disband' ? (
              <button type="button" className="m-act-btn" onClick={cancel}>
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="m-act-btn"
                disabled={view.phase === 'ended'}
                onClick={() => setConfirmForfeit(true)}
              >
                Forfeit
              </button>
            )}
          </div>
        </div>

        {dialogs}
      </div>
    );
  }

  // --- Desktop (unchanged) & Mobile Landscape Render -------------------------------------------
  return (
    <>
      <div
        className="plane"
        onClick={() => cancel()}
        onContextMenu={(e) => {
          e.preventDefault();
          cancel();
        }}
      >
        <div className="table-bg" />
        <div className="table-shade" />

        {/* Caravan names carved in the wood, with the bids */}
        {LANES.map((lane) => (
          <div key={lane} className="lane-label" style={{ left: COL_X[lane] - 64, top: 372 }}>
            <BidRow bid={bids[opp][lane]} name={caravanName(view, opp, lane)} winner={view.laneWinners[lane] === opp} />
            <BidRow bid={bids[me][lane]} name={caravanName(view, me, lane)} winner={view.laneWinners[lane] === me} />
          </div>
        ))}

        {/* Click zones + ghost slots */}
        {([me, opp] as PlayerIndex[]).map((side) =>
          LANES.map((lane) => {
            const lk = laneKey(side, lane);
            const isMe = side === me;
            const zone = isMe ? ZONES.me : ZONES.opp;
            const count = view.caravans[side][lane].cards.length;
            const showGhost = targetLanes.has(lk) && laneLevel && !!selectedCard && isNumberCard(selectedCard);
            const ghost = caravanCardPos(isMe, lane, count, count + 1);
            const emptyTarget = mode === 'disband' ? false : targetLanes.has(lk);
            return (
              <div key={lk}>
                <div
                  className={`lane-zone ${targetLanes.has(lk) ? 'is-target' : ''}`}
                  style={{ left: COL_X[lane] - 16, top: zone.top, width: CARD_W + 96, height: zone.bottom - zone.top }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLane(side, lane);
                  }}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setHoveredLane(lk)}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && setHoveredLane((h) => (h === lk ? null : h))}
                />
                {showGhost && emptyTarget && (
                  <div
                    className={`ghost-slot ${hotLane === lk ? 'is-hot' : ''}`}
                    style={{ left: ghost.x, top: ghost.y, width: CARD_W, height: CARD_H }}
                  />
                )}
              </div>
            );
          }),
        )}

        {/* Decks */}
        <DeckPile count={view.me.deckCount} set={view.me.deckTopSet} pos={DECK_POS.me} label="me" />
        <DeckPile count={view.opponent.deckCount} set={view.opponent.deckTopSet} pos={DECK_POS.opp} label="opp" />

        {/* Cards */}
        <AnimatePresence>
          {desktopSprites.map((s) => {
            const isNew = !isFirst && !knownIds.current.has(s.id);
            const spawn = spawnPoint(view, s.owner);
            return (
              <CardSprite
                key={s.id}
                sprite={s}
                initialPos={isNew ? { x: spawn.x, y: spawn.y, rotate: 0 } : false}
                exitPos={exitPoint(view, s.owner, s.x)}
                visual={visualFor(s)}
                onClick={onSpriteClick}
                onHover={setHoveredId}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* HUD (not tilted) */}
      <div className="hud">
        <div className="hud-stats hud-text">
          <div className="hud-row">
            <span>Ante Pot:</span>
            <span>{session.ante * 2}</span>
          </div>
          <div className="hud-row">
            <span>Net Total:</span>
            <span>{stats.netTotal}</span>
          </div>
          <div className="hud-row">
            <span>Win/Loss:</span>
            <span>
              {stats.wins}/{stats.losses}
            </span>
          </div>
          {session.deadline && view.phase !== 'ended' && <TurnTimer deadline={session.deadline} mine={myTurn} />}
        </div>

        <div className="hud-info hud-text">
          <div className="hud-versus">
            {session.youName} <span className="dim">vs</span> {session.opponentName}
            {!session.opponentConnected && <span className="warn"> (disconnected)</span>}
          </div>
          <div className={`hud-turn ${myTurn ? 'is-mine' : ''}`}>
            {view.phase === 'ended' ? 'Game over' : myTurn ? 'Your turn' : `${session.opponentName} is playing…`}
          </div>
          {view.phase === 'opening' && myTurn && <div className="hud-hint">Opening round: start each of your caravans with a number card (A–10).</div>}
          {mode === 'disband' && <div className="hud-hint">Choose one of your caravans to discard.</div>}
          {selectedCard && !isNumberCard(selectedCard) && view.phase === 'main' && <div className="hud-hint">{faceHint(selectedCard)}</div>}
          {message && <div className={`hud-message ${message.kind === 'error' ? 'is-error' : ''}`}>{message.text}</div>}
          {session.status && <div className="hud-message">{session.status}</div>}
        </div>

        <div className="hud-prompts hud-text">
          {!hideKeyHints && <Prompt label="Select Card" k="W" enabled={myTurn} onClick={cycleSelect} />}
          <Prompt label="Discard Card" k="Q" hideKey={hideKeyHints} enabled={canDiscard} onClick={discardSelected} />
          <Prompt label="Discard Track" k="E" hideKey={hideKeyHints} enabled={canDisband} active={mode === 'disband'} onClick={toggleDisband} />
          {selectedCard || mode === 'disband' ? (
            <Prompt label="Cancel" k="R" hideKey={hideKeyHints} enabled onClick={cancel} />
          ) : (
            <Prompt label="Forfeit Game" k="B" hideKey={hideKeyHints} enabled={view.phase !== 'ended'} onClick={() => setConfirmForfeit(true)} />
          )}
        </div>

        <div className="hud-deckcount hud-text" style={{ left: DECK_POS.me.x + CARD_W - 20, top: DECK_POS.me.y + CARD_H - 30 }}>
          {view.me.deckCount}
        </div>
        <div className="hud-deckcount hud-text" style={{ left: DECK_POS.opp.x + CARD_W - 20, top: DECK_POS.opp.y + CARD_H - 30 }}>
          {view.opponent.deckCount}
        </div>
      </div>

      {dialogs}
    </>
  );
}

function BidRow({ bid, name, winner }: { bid: number; name: string; winner: boolean }) {
  const cls = bid > SOLD_MAX ? 'is-over' : isSold(bid) ? 'is-sold' : '';
  return (
    <div className="bid-row">
      <span className={`bid hud-text ${cls} ${winner ? 'is-winner' : ''}`}>{bid}</span>
      <span className="carved">{name}</span>
    </div>
  );
}

function DeckPile({ count, set, pos, label }: { count: number; set: PlayerView['me']['deckTopSet']; pos: { x: number; y: number }; label: string }) {
  const layers = Math.min(4, Math.ceil(count / 12));
  return (
    <div className="deck-pile" data-deck={label} style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}>
      {count === 0 && <div className="deck-empty" />}
      {set &&
        Array.from({ length: layers }, (_, i) => (
          <div key={i} className="deck-layer" style={{ transform: `translate(${-i * 2}px, ${-i * 2}px)` }}>
            <CardImage spec={null} set={set} faceUp={false} seed={`deck-${label}`} />
          </div>
        ))}
    </div>
  );
}

function Prompt({
  label,
  k,
  hideKey,
  enabled,
  active,
  onClick,
}: {
  label: string;
  k: string;
  hideKey?: boolean;
  enabled: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`prompt ${enabled ? '' : 'is-disabled'} ${active ? 'is-active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (enabled) onClick();
      }}
    >
      {label}
      {!hideKey && <span className="prompt-key">{k})</span>}
    </button>
  );
}

function TurnTimer({ deadline, mine }: { deadline: number; mine: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div className={`hud-row ${mine && left <= 10 ? 'warn' : ''}`}>
      <span>{mine ? 'Your time:' : 'Their time:'}</span>
      <span>{left}</span>
    </div>
  );
}

function CompactTimer({ deadline, mine }: { deadline: number; mine: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`m-chip ${mine && left <= 10 ? 'warn' : ''}`}>{left}s</span>;
}

function faceHint(card: Card): string {
  switch (card.rank) {
    case 'J':
      return 'Jack: removes the card it is played on (and its face cards).';
    case 'Q':
      return 'Queen: reverses the direction and changes the suit of a caravan.';
    case 'K':
      return 'King: doubles the value of the card it is played on.';
    default:
      return 'Joker: on an Ace removes all cards of its suit, otherwise all cards of the same value.';
  }
}

function explainIllegal(view: PlayerView, card: Card, player: PlayerIndex): string {
  if (isNumberCard(card)) {
    if (player !== view.you) return 'Number cards can only be played on your own caravans.';
    if (view.phase === 'opening') return 'During the opening round, start a new caravan.';
    return 'That card must follow the suit or the direction of the caravan, and cannot match the last value.';
  }
  if (view.phase === 'opening') return 'Only number cards can be played during the opening round.';
  if (card.rank === 'Q') return 'A Queen goes on the last card of a non-empty caravan.';
  return 'Face cards attach to a number card holding fewer than three face cards.';
}
