import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { sfx } from '../audio/sfx';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;
  testId?: string;
}

/** Pip-Boy style vertical menu: highlighted entry with a filled box, keyboard (↑/↓/Enter) and mouse. */
export function PipMenu({ items, autoFocus = true }: { items: MenuItem[]; autoFocus?: boolean }) {
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((i) => !i.disabled)));

  useEffect(() => {
    if (!autoFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setIndex((i) => {
          let n = i;
          for (let k = 0; k < items.length; k++) {
            n = (n + dir + items.length) % items.length;
            if (!items[n].disabled) break;
          }
          return n;
        });
        sfx.blip();
      } else if (e.key === 'Enter') {
        const it = items[index];
        if (it && !it.disabled) {
          sfx.select();
          it.onSelect();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, index, autoFocus]);

  return (
    <div className="pip-menu">
      {items.map((it, i) => (
        <button
          key={it.label}
          data-testid={it.testId}
          className={`pip-menu-item ${i === index ? 'is-active' : ''} ${it.disabled ? 'is-disabled' : ''}`}
          onMouseEnter={() => {
            if (!it.disabled && i !== index) {
              setIndex(i);
              sfx.blip();
            }
          }}
          onClick={() => {
            if (it.disabled) return;
            sfx.select();
            it.onSelect();
          }}
        >
          {it.label}
        </button>
      ))}
      <div className="pip-menu-hint">{items[index]?.hint ?? ''}</div>
    </div>
  );
}

/** Full-screen panel used by menu screens (table background + dark vignette + HUD frame). */
export function Screen({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="screen">
      <div className="table-bg" />
      <div className="screen-shade" />
      <div className="screen-content hud-text">
        {title && <h1 className="screen-title">{title}</h1>}
        {children}
      </div>
      {footer && <div className="screen-footer hud-text">{footer}</div>}
    </div>
  );
}
