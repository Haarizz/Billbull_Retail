import { createContext, useContext } from 'react';

// What the application hosting the POS workspace lets the till do. Static configuration supplied at
// app-composition level — it owns no state. The embedded Retail route (/sales/pos) keeps every
// capability it has today, which is the default. The standalone POS app (/pos/) turns terminal and
// counter administration off: that stays in Retail (Enterprise → POS Administration).
export const EMBEDDED_POS_HOST = Object.freeze({ terminalAdministration: true });
export const STANDALONE_POS_HOST = Object.freeze({ terminalAdministration: false });

export const PosHostContext = createContext(EMBEDDED_POS_HOST);

export const usePosHost = () => useContext(PosHostContext);
