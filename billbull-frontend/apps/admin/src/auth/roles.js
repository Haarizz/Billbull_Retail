// Mirrors the platform's role hierarchy: OWNER ⊃ OPERATOR ⊃ VIEWER. Hiding a button is only a
// convenience — the platform API checks the same rule on every call.
const RANK = { VIEWER: 1, OPERATOR: 2, OWNER: 3 };

export const hasRole = (user, needed) => !!user && (RANK[user.role] || 0) >= (RANK[needed] || 99);
