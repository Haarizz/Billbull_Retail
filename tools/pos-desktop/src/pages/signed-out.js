'use strict';

(async () => {
  const api = window.posDesktop;

  const signIn = document.getElementById('signin');
  signIn.addEventListener('click', () => api.retry());
  document.getElementById('setup').addEventListener('click', () => api.openSetup());
  signIn.focus();

  const state = await api.getState();
  document.getElementById('server').textContent = state.serverOrigin || 'not set';
})();
