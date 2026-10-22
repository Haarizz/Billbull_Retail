import { useEffect, useRef } from "react";
import { heartbeatPosTerminal } from "../api/posApi";

/**
 * Sends a heartbeat to the backend on mount and every `intervalMs` milliseconds.
 * Stops automatically when the component unmounts.
 */
export function useHeartbeat(terminalId, intervalMs = 60_000) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!terminalId) return;

    const beat = () => {
      heartbeatPosTerminal(terminalId).catch(() => {
        // Heartbeat failure is non-blocking — offline detection handles it server-side
      });
    };

    beat();
    timerRef.current = setInterval(beat, intervalMs);

    return () => clearInterval(timerRef.current);
  }, [terminalId, intervalMs]);
}
