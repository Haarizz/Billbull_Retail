import { useCallback, useLayoutEffect, useRef } from 'react';

export const useReportScrollPreserver = (scrollRefs = []) => {
    const refsRef = useRef(scrollRefs);
    const snapshotRef = useRef(null);

    refsRef.current = scrollRefs;

    const restore = useCallback(() => {
        const snapshot = snapshotRef.current;
        if (!snapshot || typeof window === 'undefined') return;

        window.scrollTo(snapshot.windowLeft, snapshot.windowTop);
        snapshot.elements.forEach(({ element, top, left }) => {
            if (!element) return;
            element.scrollTop = top;
            element.scrollLeft = left;
        });
    }, []);

    const captureScroll = useCallback(() => {
        if (typeof window === 'undefined') return;

        snapshotRef.current = {
            windowTop: window.scrollY,
            windowLeft: window.scrollX,
            elements: refsRef.current
                .map(ref => {
                    const element = ref?.current;
                    if (!element) return null;
                    return {
                        element,
                        top: element.scrollTop,
                        left: element.scrollLeft
                    };
                })
                .filter(Boolean)
        };
    }, []);

    useLayoutEffect(() => {
        if (!snapshotRef.current) return undefined;

        restore();
        const frame = window.requestAnimationFrame(() => {
            restore();
            snapshotRef.current = null;
        });

        return () => window.cancelAnimationFrame(frame);
    });

    return { captureScroll };
};

export default useReportScrollPreserver;
