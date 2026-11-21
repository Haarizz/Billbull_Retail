/**
 * Tap feedback for POS product-grid tiles, done with the Web Animations API on the
 * tile element itself so the (large) grid never re-renders for it. Silently does
 * nothing where element.animate is missing (jsdom) and keeps motion minimal when
 * the OS asks for reduced motion.
 *
 *   'added'    — bounce + yellow glow + a "+N" badge popping up from the tile
 *   'deferred' — light pulse (an entry dialog opened; nothing added yet)
 *   'error'    — short horizontal shake + red glow
 */

const reducedMotion = () => {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const animate = (el, keyframes, options) => {
  if (!el || typeof el.animate !== 'function') return null;
  try { return el.animate(keyframes, options); } catch { return null; }
};

const showBadge = (tile, text, reduced) => {
  if (typeof document === 'undefined' || !tile?.appendChild) return;
  // One badge at a time per tile — rapid taps restart it instead of stacking.
  tile.querySelector?.('[data-tile-add-badge]')?.remove();
  if (getComputedStyle(tile).position === 'static') tile.style.position = 'relative';

  const badge = document.createElement('span');
  badge.setAttribute('data-tile-add-badge', '');
  badge.setAttribute('aria-hidden', 'true');
  badge.textContent = text;
  Object.assign(badge.style, {
    position: 'absolute',
    top: '6px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '20',
    pointerEvents: 'none',
    padding: '2px 8px',
    borderRadius: '9999px',
    background: '#327F74',
    color: '#fff',
    fontSize: '11px',
    fontWeight: '800',
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  });
  tile.appendChild(badge);

  const anim = reduced
    ? animate(badge, [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 700, fill: 'forwards' })
    : animate(badge, [
      { opacity: 0, transform: 'translate(-50%, 10px) scale(0.6)' },
      { opacity: 1, transform: 'translate(-50%, 0) scale(1.15)', offset: 0.25 },
      { opacity: 1, transform: 'translate(-50%, -4px) scale(1)', offset: 0.6 },
      { opacity: 0, transform: 'translate(-50%, -18px) scale(1)' },
    ], { duration: 900, easing: 'ease-out', fill: 'forwards' });

  const remove = () => badge.remove();
  if (anim) anim.onfinish = remove;
  else setTimeout(remove, 900);
};

export const playProductTileFeedback = (tile, kind = 'added', { quantity = 1 } = {}) => {
  if (!tile) return;
  const reduced = reducedMotion();

  if (kind === 'error') {
    animate(tile, reduced
      ? [{ boxShadow: '0 0 0 3px rgba(239,68,68,0.7)' }, { boxShadow: '0 0 0 0 rgba(239,68,68,0)' }]
      : [
        { transform: 'translateX(0)', boxShadow: '0 0 0 3px rgba(239,68,68,0.7)' },
        { transform: 'translateX(-5px)', offset: 0.2 },
        { transform: 'translateX(5px)', offset: 0.4 },
        { transform: 'translateX(-3px)', offset: 0.6 },
        { transform: 'translateX(3px)', offset: 0.8 },
        { transform: 'translateX(0)', boxShadow: '0 0 0 0 rgba(239,68,68,0)' },
      ], { duration: 420, easing: 'ease-out' });
    return;
  }

  if (kind === 'deferred') {
    animate(tile, [
      { boxShadow: '0 0 0 3px rgba(245,199,66,0.7)' },
      { boxShadow: '0 0 0 0 rgba(245,199,66,0)' },
    ], { duration: 450, easing: 'ease-out' });
    return;
  }

  animate(tile, reduced
    ? [{ boxShadow: '0 0 0 3px rgba(245,199,66,0.9)' }, { boxShadow: '0 0 0 0 rgba(245,199,66,0)' }]
    : [
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(245,199,66,0)', backgroundColor: '#FFFFFF' },
      { transform: 'scale(0.92)', boxShadow: '0 0 0 3px rgba(245,199,66,0.9)', backgroundColor: '#FFF3C4', offset: 0.2 },
      { transform: 'scale(1.04)', boxShadow: '0 0 0 4px rgba(245,199,66,0.6)', backgroundColor: '#FFF8E7', offset: 0.5 },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(245,199,66,0)', backgroundColor: '#FFFFFF' },
    ], { duration: 650, easing: 'ease-out' });
  showBadge(tile, `+${quantity}`, reduced);
};

export default playProductTileFeedback;
