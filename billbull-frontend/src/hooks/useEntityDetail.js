import { useCallback, useEffect, useRef, useState } from "react";

import {
  ENTITY_DETAIL_FETCHERS,
  EntityDetailForbiddenError,
} from "../api/entityDetailApi";

/**
 * Selection debounce. The global search modal is a details checker, not only a command
 * palette: holding ArrowDown walks the result list, and every stop on the way would
 * otherwise start a detail request. 175ms is long enough that a key-repeat run costs one
 * request at the end of it, short enough that a deliberate selection feels immediate.
 */
export const ENTITY_DETAIL_DEBOUNCE_MS = 175;

/** Cache key. Type-qualified because ids are only unique within a type. */
const cacheKey = (type, id) => `${type}:${id}`;

const IDLE = { key: null, status: "idle", data: null, error: null, forbidden: false };

/**
 * Loads the detail payload for the currently selected search result.
 *
 * <p>Owns the whole request lifecycle so the modal does not have to:
 *
 * <ul>
 *   <li><b>Debounce</b> — arrow-key and mouse selection go through the same path, and
 *       neither waits for Enter.
 *   <li><b>Abort</b> — on a new selection, on modal close and on unmount.
 *   <li><b>Staleness</b> — a response is only applied when it belongs to the selection
 *       still on screen, so a slow earlier request cannot overwrite a newer one.
 *   <li><b>Cache</b> — per session (the hook's own ref, cleared when the modal closes),
 *       so walking back up the list costs nothing. No cache library, by design.
 *   <li><b>403</b> — surfaced as a distinct `forbidden` state the panel renders inline,
 *       rather than only as the interceptor's global toast.
 * </ul>
 *
 * @param {{ type?: string, id?: string, code?: string } | null} result the selected row
 * @param {{ enabled?: boolean }} options `enabled: false` (modal closed) aborts and resets
 */
const useEntityDetail = (result, { enabled = true } = {}) => {
  const [state, setState] = useState(IDLE);

  const cacheRef = useRef(new Map());
  const controllerRef = useRef(null);
  // The selection a response must still match to be applied.
  const selectionRef = useRef(null);

  const type = enabled ? result?.type ?? null : null;
  const id = enabled ? result?.id ?? null : null;
  const supported = Boolean(type && ENTITY_DETAIL_FETCHERS[type]);
  const key = supported && id ? cacheKey(type, id) : null;

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    // Nothing selected, or a type with no panel: drop anything in flight and go idle.
    if (!supported || !key) {
      abort();
      selectionRef.current = null;
      setState(IDLE);
      return undefined;
    }

    // A new selection invalidates the previous request immediately — before the
    // debounce, so the network is quiet while the user is still moving.
    abort();
    selectionRef.current = key;

    const cached = cacheRef.current.get(key);
    if (cached) {
      setState({ key, status: "success", data: cached, error: null, forbidden: false });
      return undefined;
    }

    setState({ key, status: "loading", data: null, error: null, forbidden: false });

    const timer = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      const fetcher = ENTITY_DETAIL_FETCHERS[type];

      fetcher(result, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted || selectionRef.current !== key) return;
          cacheRef.current.set(key, data);
          setState({ key, status: "success", data, error: null, forbidden: false });
        })
        .catch((error) => {
          if (controller.signal.aborted || selectionRef.current !== key) return;
          const forbidden =
            error instanceof EntityDetailForbiddenError
            || error?.forbidden === true
            || error?.response?.status === 403;
          setState({
            key,
            status: "error",
            data: null,
            forbidden,
            error: forbidden
              ? "You don't have permission to view these details."
              : "Could not load details.",
          });
        })
        .finally(() => {
          if (controllerRef.current === controller) controllerRef.current = null;
        });
    }, ENTITY_DETAIL_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `result` is intentionally not a dependency: it is a fresh object on every render
    // of the modal, and the identity that matters is the type/id pair keyed above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, type, supported, abort]);

  // Closing the modal drops both the in-flight request and the session cache, so
  // reopening never shows a figure that has since moved.
  useEffect(() => {
    if (enabled) return;
    abort();
    cacheRef.current.clear();
    selectionRef.current = null;
  }, [enabled, abort]);

  useEffect(() => () => abort(), [abort]);

  // The state carries the selection it belongs to. Between a selection change and the
  // effect that reacts to it there is one render where `state` still describes the
  // previous row — handing that payload to the new row's panel would render one
  // entity's numbers under another's name, so it reads as loading instead.
  const describesCurrentSelection = state.key === key;
  const status = !supported || !key
    ? "idle"
    : describesCurrentSelection
      ? state.status
      : "loading";

  return {
    status,
    data: describesCurrentSelection ? state.data : null,
    error: describesCurrentSelection ? state.error : null,
    forbidden: describesCurrentSelection ? state.forbidden : false,
    supported,
  };
};

export default useEntityDetail;
