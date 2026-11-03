'use strict';

(async () => {
  const api = window.posDesktop;
  const RETRY_SECONDS = 15;

  const reason = new URLSearchParams(location.search).get('reason');
  document.getElementById('reason').textContent = reason || '';

  const state = await api.getState();
  document.getElementById('server').textContent = state.serverOrigin || 'not set';

  document.getElementById('retry').addEventListener('click', () => api.retry());
  document.getElementById('setup').addEventListener('click', () => api.openSetup());

  let left = RETRY_SECONDS;
  const countdown = document.getElementById('countdown');
  const tick = () => {
    countdown.textContent = `Retrying in ${left}s…`;
    if (left-- <= 0) api.retry();
    else setTimeout(tick, 1000);
  };
  tick();
})();
