import { useEffect } from 'react';
import { Screen } from '../ui/PipMenu';
import { useViewport } from '../ui/viewport';

export function Rules({ back }: { back: () => void }) {
  const vp = useViewport();
  const isTouch = vp.isMobile || vp.isTouch;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  return (
    <Screen
      title="How to Play Caravan"
      footer={
        <span>
          <button className="prompt" onClick={back}>
            Back {!isTouch && <span className="prompt-key">Esc)</span>}
          </button>
        </span>
      }
    >
      <div className="rules pip-scroll">
        <section>
          <h2>Objective</h2>
          <p>
            Each player builds three caravans facing the opponent's three caravans. A caravan is <b>sold</b> when its bid – the sum of its
            number cards – is between <b>21 and 26</b>. A sold caravan beats the facing caravan if that one is not sold, or if its bid is
            higher. Ties do not count.
          </p>
          <p>
            The game ends as soon as all three pairs of caravans have a winner. The player who wins <b>two or three</b> of them wins the
            game and the ante pot. A player who runs out of cards loses.
          </p>
        </section>

        <section>
          <h2>Opening round</h2>
          <p>
            Both players draw eight cards. For the first three turns, each player must start one of their caravans with a number card (A
            to 10). No discarding, no face cards. If your hand has fewer than three number cards it is reshuffled automatically.
          </p>
        </section>

        <section>
          <h2>Your turn</h2>
          <ul>
            <li>Play a card from your hand, then draw a card, or</li>
            <li>Discard a card from your hand, then draw a card, or</li>
            <li>Discard one of your caravans entirely ("Discard Track").</li>
          </ul>
        </section>

        <section>
          <h2>Number cards (A = 1, 2–10)</h2>
          <p>
            Number cards go on your own caravans only. The second card sets the direction (ascending or descending). After that, a new card
            must either continue the direction or match the suit of the caravan. Matching the suit against the direction reverses it. A
            card may never be placed directly on a card of the same value.
          </p>
        </section>

        <section>
          <h2>Face cards & Jokers</h2>
          <p>Face cards can be played on any caravan – yours or your opponent's – and are attached to a number card (max three per card).</p>
          <dl>
            <dt>Jack</dt>
            <dd>Removes the number card it is played on, together with its attached face cards.</dd>
            <dt>Queen</dt>
            <dd>Played on the last card of a caravan: reverses the direction and changes the suit to the Queen's suit.</dd>
            <dt>King</dt>
            <dd>Doubles the value of the card it is played on. Several Kings keep doubling (5 → 10 → 20…).</dd>
            <dt>Joker</dt>
            <dd>
              On an Ace: removes every other number card of the Ace's suit from the table. On a 2–10: removes every other card of the same
              value from the table. Both sides are affected.
            </dd>
          </dl>
          <p className="dim">
            If a removal leaves two cards of the same value next to each other, the caravan keeps the direction it had before.
          </p>
        </section>

        <section>
          <h2>Controls</h2>
          {isTouch ? (
            <dl className="controls">
              <dt>Play a card</dt>
              <dd>Tap a card in your hand to select it, then tap a highlighted caravan to play it.</dd>
              <dt>Face cards (J, K, Joker)</dt>
              <dd>Tap any highlighted caravan. If it has multiple targets, a picker pops up so you can tap the exact card.</dd>
              <dt>Discard / Disband</dt>
              <dd>Use the action bar at the bottom of the screen to discard a selected card or disband one of your caravans.</dd>
              <dt>Cancel</dt>
              <dd>Tap Cancel or empty table space.</dd>
            </dl>
          ) : (
            <dl className="controls">
              <dt>Click a card</dt>
              <dd>Select it in your hand, then click a highlighted caravan or card to play it.</dd>
              <dt>W / 1–8</dt>
              <dd>Select a card in your hand.</dd>
              <dt>A / S / D</dt>
              <dd>Play the selected number card (or Queen) on your 1st / 2nd / 3rd caravan.</dd>
              <dt>Q</dt>
              <dd>Discard the selected card.</dd>
              <dt>E</dt>
              <dd>Discard Track: choose one of your caravans to discard.</dd>
              <dt>R / Esc / right click</dt>
              <dd>Cancel.</dd>
              <dt>B</dt>
              <dd>Forfeit the game.</dd>
            </dl>
          )}
        </section>
      </div>
    </Screen>
  );
}
