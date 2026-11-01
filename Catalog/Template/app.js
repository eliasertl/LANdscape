// The host injects `window.landscape` (see Docs/AppSdk.md); this file only uses it.
/* global landscape */
(async () => {
  landscape.theme.apply();
  const { appName, version, surface, params } = landscape.context;
  document.getElementById('context').textContent = `${appName} ${version} · surface "${surface}" · params ${JSON.stringify(params)}`;
  document.getElementById('title').textContent = appName;

  const button = document.getElementById('count');
  let count = (await landscape.storage.get('count')) ?? 0;
  const render = () => {
    button.textContent = `Clicked ${count} time${count === 1 ? '' : 's'}`;
  };
  render();
  button.addEventListener('click', async () => {
    count += 1;
    render();
    await landscape.storage.set('count', count);
  });
  document.getElementById('reset').addEventListener('click', async () => {
    count = 0;
    render();
    await landscape.storage.set('count', 0);
  });

  landscape.metrics.subscribe('cpu', 2000, (sample) => {
    const cpu = document.getElementById('cpu');
    if ('unavailable' in sample) cpu.textContent = `CPU not available: ${sample.unavailable}`;
    else cpu.textContent = `CPU ${sample.data.total.toFixed(0)} % · ${sample.data.cores.length} cores`;
  });

  document.getElementById('notify').addEventListener('click', () => {
    landscape.notifications.notify({ title: 'Hello from the template', body: 'This notification came through the SDK.', level: 'info' });
  });

  // Actions sent to an open window (no background page needed for this one, but it also works here).
  landscape.actions.handle('greet', (p) => landscape.ui.toast(`Hello, ${p.name || 'World'}!`, 'success'));
  if (params.action === 'greet') landscape.ui.toast(`Hello, ${params.name || 'World'}!`, 'success');
})();
