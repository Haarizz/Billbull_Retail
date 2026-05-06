import { useCallback } from 'react';

/**
 * Custom hook to handle document printing with dynamic titles.
 * This ensures that when a user prints or saves as PDF, the browser
 * uses the correct filename by temporarily overriding document.title.
 */
export const usePrintDocument = () => {
    const print = useCallback((title, trigger = null) => {
        const originalTitle = document.title;
        document.title = title;

        // If a specific trigger function is provided (like a printHtml call), use it.
        // Otherwise, use the standard window.print().
        if (typeof trigger === 'function') {
            trigger();
        } else {
            window.print();
        }

        // We use a small delay before restoring the title to ensure
        // the browser's print subsystem has captured the title correctly.
        // Some browsers read the title again when the "Save" button is clicked.
        setTimeout(() => {
            document.title = originalTitle;
        }, 1000);
    }, []);

    return { print };
};
