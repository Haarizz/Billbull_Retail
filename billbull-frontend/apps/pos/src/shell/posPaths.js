// Router basename derived from Vite's `base` ('/pos/' in builds) so dev, preview and the deployed
// bundle agree. A hard navigation (sign-out) must go through the base too, never to Retail's /login.
export const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

export const tillUrl = (path = '') => `${ROUTER_BASENAME === '/' ? '' : ROUTER_BASENAME}/${path.replace(/^\//, '')}`;

// What <BrowserRouter> gets: the base WITH its trailing slash ('/pos/'). React Router writes the
// till's home route as the bare basename, so '/pos' would put "/pos" (no slash) in the address bar.
// Reloading that is outside the till: Vite dev/preview answers "The server is configured with a
// public base URL of /pos/ - did you mean to visit /pos/ instead?", and offline the service worker
// (scope /pos/) cannot serve it. With '/pos/' home stays at /pos/ and /login at /pos/login.
export const ROUTER_BASE_PATH = tillUrl();
