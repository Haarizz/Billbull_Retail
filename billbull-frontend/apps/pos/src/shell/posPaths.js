// Router basename derived from Vite's `base` ('/pos/' in builds) so dev, preview and the deployed
// bundle agree. A hard navigation (sign-out) must go through the base too, never to Retail's /login.
export const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

export const tillUrl = (path = '') => `${ROUTER_BASENAME === '/' ? '' : ROUTER_BASENAME}/${path.replace(/^\//, '')}`;
