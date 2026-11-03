'use strict';

(async () => {
  const api = window.posDesktop;
  const form = document.getElementById('form');
  const input = document.getElementById('address');
  const status = document.getElementById('status');
  const buttons = [document.getElementById('save'), document.getElementById('test')];
  const back = document.getElementById('back');

  const show = (text, kind) => {
    status.textContent = text || '';
    status.className = `status ${kind || ''}`;
  };
  const busy = (on) => buttons.forEach((b) => { b.disabled = on; });

  const state = await api.getState();
  document.getElementById('version').textContent = `Version ${state.version}`;
  if (state.serverOrigin) {
    input.value = state.serverOrigin;
    back.hidden = false;
  }
  input.focus();
  input.select();

  async function run(action) {
    busy(true);
    show('Checking the server…');
    try {
      const result = action === 'save' ? await api.saveServer(input.value) : await api.checkServer(input.value);
      if (!result.ok) return show(result.error, 'error');
      if (result.origin) input.value = result.origin;
      if (result.warning) return show(`${action === 'save' ? 'Connected.' : 'Server found.'} ${result.warning}`, 'warn');
      show(action === 'save' ? 'Connected. Opening the till…' : 'Server found. Press Connect to use it.', 'ok');
    } catch (err) {
      show(String(err?.message || err), 'error');
    } finally {
      busy(false);
    }
  }

  // A result belongs to the address that was checked: clear it as soon as the address changes.
  input.addEventListener('input', () => show(''));

  form.addEventListener('submit', (e) => { e.preventDefault(); run('save'); });
  document.getElementById('test').addEventListener('click', () => run('test'));
  back.addEventListener('click', () => api.retry());
})();
