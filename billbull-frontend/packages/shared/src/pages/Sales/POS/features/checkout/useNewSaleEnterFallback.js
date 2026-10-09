import { useEffect, useRef } from 'react';
import { isFieldTarget } from '../../../../../utils/editableTarget';

/**
 * Enter on the COMPLETE screen starts the next sale even when the POS input controller did not
 * take it (posInputV2 off, or the caret on no registered target). The controller handles keys in
 * the capture phase and stops what it takes, scanner Enters included, so those never reach this
 * bubble-phase listener. Another button, a field, or a dialog stacked on top (Share Receipt)
 * keeps its own Enter.
 *
 * @param newSaleRef  ref to the New Sale button
 * @param onNewSale   starts the next sale
 */
export function useNewSaleEnterFallback(newSaleRef, onNewSale) {
  const onNewSaleRef = useRef(onNewSale);
  useEffect(() => { onNewSaleRef.current = onNewSale; }, [onNewSale]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Enter' || event.repeat || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const newSale = newSaleRef.current;
      if (target && target !== newSale) {
        if (isFieldTarget(target)) return;
        if (target.closest('button, a[href], [role="button"], [role="menuitem"], [role="option"]')) return;
        const dialog = target.closest('[role="dialog"]');
        if (dialog && !(newSale && dialog.contains(newSale))) return;
      }
      // Also cancels the button's own Enter activation, so the sale starts once.
      event.preventDefault();
      onNewSaleRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [newSaleRef]);
}
