import { useEffect } from 'react';

/**
 * A custom hook to map keyboard shortcuts to callbacks.
 * 
 * @param {Object} shortcutMap - A dictionary mapping string keys to callbacks.
 *   Examples of valid keys: "ctrl+p", "ctrl+s", "alt+c", "meta+s", "escape"
 *   The callback should be a function: `(e) => { ... }`
 */
const useShortcuts = (shortcutMap) => {
    useEffect(() => {
        if (!shortcutMap || Object.keys(shortcutMap).length === 0) return;

        const handleKeyDown = (event) => {
            // Reconstruct the key string based on modifiers
            const keys = [];
            if (event.ctrlKey) keys.push('ctrl');
            if (event.metaKey) keys.push('meta');
            if (event.altKey) keys.push('alt');
            if (event.shiftKey) keys.push('shift');

            if (event.key !== 'Control' && event.key !== 'Meta' && event.key !== 'Alt' && event.key !== 'Shift') {
                keys.push(event.key.toLowerCase());
            }

            const shortcutString = keys.join('+');

            // Find if there's a match
            // Handle both exact matches and normalized matches like ctrl+s / meta+s interchangeably if desired,
            // but for simplicity, exact match is preferred.
            if (shortcutMap[shortcutString]) {
                event.preventDefault(); // Prevent browser default (e.g., Save Page, Print Page, etc.)
                shortcutMap[shortcutString](event);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [shortcutMap]);
};

export default useShortcuts;
