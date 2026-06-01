import { useCallback, useLayoutEffect, useRef } from 'react';

export const useReportScrollPreserver = (scrollRefs = []) => {
    const refsRef = useRef(scrollRefs);
    const snapshotRef = useRef(null);

    refsRef.current = scrollRefs;

    const restore = useCallback(() => {
        const snapshot = snapshotRef.current;
        if (!snapshot || typeof window === 'undefined') return;

        window.scrollTo(snapshot.windowLeft, snapshot.windowTop);
        snapshot.elements.forEach(({ index, element, top, left }) => {
            const currentElement = refsRef.current[index]?.current || element;
            if (!currentElement) return;
            currentElement.scrollTop = top;
            currentElement.scrollLeft = left;
        });
    }, []);

    const captureScroll = useCallback(() => {
        if (typeof window === 'undefined') return;

        snapshotRef.current = {
            windowTop: window.scrollY,
            windowLeft: window.scrollX,
            elements: refsRef.current
                .map((ref, index) => {
                    const element = ref?.current;
                    if (!element) return null;
                    return {
                        index,
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
        const frames = [];
        const timers = [];

        frames.push(window.requestAnimationFrame(() => {
            restore();
            frames.push(window.requestAnimationFrame(restore));
        }));

        timers.push(window.setTimeout(restore, 80));
        timers.push(window.setTimeout(() => {
            restore();
            snapshotRef.current = null;
        }, 180));

        return () => {
            frames.forEach(frame => window.cancelAnimationFrame(frame));
            timers.forEach(timer => window.clearTimeout(timer));
        };
    });

    return { captureScroll };
};

export default useReportScrollPreserver;
