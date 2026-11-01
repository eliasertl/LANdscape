import type { FrameContext, RpcEvent, RpcResponse } from './Protocol';
import type { Landscape, ThemeTokens, Unsubscribe } from './Types';

/**
 * The SDK runtime, injected by the host into every app frame (as an inline
 * script before the app's own code). It turns `window.landscape.*` calls
 * into postMessage RPC to the broker and dispatches broker events to
 * listeners. Nothing here has access to LANdscape's origin: the frame is
 * sandboxed without allow-same-origin.
 */
declare global {
  interface Window {
    __landscapeFrame?: FrameContext;
    landscape?: Landscape;
  }
}

(() => {
  const context = window.__landscapeFrame;
  if (!context || window.landscape) return;
  const parent = window.parent;
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const closeGuards = new Set<() => boolean | Promise<boolean>>();
  const actionHandlers = new Map<string, (params: Record<string, unknown>) => void | Promise<void>>();

  const call = (method: string, params: unknown = {}): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      parent.postMessage({ landscape: 1, nonce: context.nonce, id, method, params }, '*');
    });

  const on = (event: string, listener: (data: unknown) => void): Unsubscribe => {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  };

  window.addEventListener('message', (message: MessageEvent<RpcResponse | RpcEvent>) => {
    if (message.source !== parent) return;
    const data = message.data;
    if (!data || data.landscape !== 1) return;
    if ('id' in data) {
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if ('error' in data) entry.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
      else entry.resolve(data.result);
      return;
    }
    if ('event' in data) {
      if (data.event === 'action.run') {
        const run = data.data as { id: string; params: Record<string, unknown>; token: number };
        const handler = actionHandlers.get(run.id);
        Promise.resolve(handler ? handler(run.params) : undefined).then(
          () => call('action.done', { token: run.token }),
          (error: unknown) => call('action.done', { token: run.token, error: error instanceof Error ? error.message : String(error) }),
        );
        return;
      }
      if (data.event === 'window.beforeClose') {
        const token = (data.data as { token: number }).token;
        Promise.all([...closeGuards].map((g) => Promise.resolve(g()))).then(
          (results) => call('window.closeDecision', { token, allow: results.every(Boolean) }),
          () => call('window.closeDecision', { token, allow: true }),
        );
        return;
      }
      for (const listener of listeners.get(data.event) ?? []) listener(data.data);
    }
  });

  /** Subscriptions: the host assigns a subscription id; events arrive as `<kind>:<id>`. */
  const subscribe = (kind: string, params: unknown, listener: (data: unknown) => void): Unsubscribe => {
    let subscriptionId: string | null = null;
    let off: Unsubscribe | null = null;
    let cancelled = false;
    void call(`${kind}.subscribe`, params).then((id) => {
      subscriptionId = String(id);
      if (cancelled) {
        void call(`${kind}.unsubscribe`, { id: subscriptionId });
        return;
      }
      off = on(`${kind}:${subscriptionId}`, listener);
    });
    return () => {
      cancelled = true;
      off?.();
      if (subscriptionId) void call(`${kind}.unsubscribe`, { id: subscriptionId });
    };
  };

  let theme: ThemeTokens = { theme: context.theme, tokens: context.tokens };
  on('theme.changed', (data) => {
    theme = data as ThemeTokens;
    if (applied) applyTokens();
  });
  let applied = false;
  const applyTokens = () => {
    applied = true;
    const root = document.documentElement;
    root.dataset.theme = theme.theme;
    for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
    root.style.colorScheme = theme.theme;
  };

  const landscape: Landscape = {
    context,
    metrics: {
      subscribe: (metric, intervalMs, listener) => subscribe('metrics', { metric, intervalMs }, listener as (data: unknown) => void),
      sample: (metric) => call('metrics.sample', { metric }) as Promise<never>,
    },
    docker: {
      list: () => call('docker.list') as Promise<never>,
      action: (containerId, action) => call('docker.action', { containerId, action }) as Promise<void>,
      stats: (containerId, listener) => subscribe('docker.stats', { containerId }, listener as (data: unknown) => void),
    },
    files: {
      home: () => call('files.home') as Promise<string>,
      list: (path) => call('files.list', { path }) as Promise<never>,
      stat: (path) => call('files.stat', { path }) as Promise<never>,
      read: (path) => call('files.read', { path }) as Promise<string>,
      write: (path, content) => call('files.write', { path, content }) as Promise<void>,
      mkdir: (dir, name) => call('files.mkdir', { dir, name }) as Promise<void>,
      rename: (path, name) => call('files.rename', { path, name }) as Promise<void>,
      delete: (paths) => call('files.delete', { paths }) as Promise<void>,
      download: (path) => call('files.download', { path }) as Promise<void>,
    },
    ssh: { exec: (command, timeoutMs) => call('ssh.exec', { command, timeoutMs }) as Promise<never> },
    logs: { open: (source, listener) => subscribe('logs', source, listener as (data: unknown) => void) },
    processes: { kill: (pid, signal) => call('processes.kill', { pid, signal }) as Promise<void> },
    shortcuts: {
      list: () => call('shortcuts.list') as Promise<never>,
      create: (input) => call('shortcuts.create', input) as Promise<never>,
    },
    notifications: { notify: (input) => call('notifications.notify', input) as Promise<void> },
    storage: {
      get: (key) => call('storage.get', { key }) as Promise<never>,
      set: (key, value) => call('storage.set', { key, value }) as Promise<void>,
      delete: (key) => call('storage.delete', { key }) as Promise<void>,
      list: (prefix) => call('storage.list', { prefix }) as Promise<string[]>,
    },
    net: { fetch: (url, init) => call('net.fetch', { url, ...init }) as Promise<never> },
    monitor: {
      register: (target) => call('monitor.register', target) as Promise<never>,
      unregister: (key) => call('monitor.unregister', { key }) as Promise<void>,
      statuses: () => call('monitor.statuses') as Promise<never>,
      subscribe: (listener) => subscribe('monitor', {}, listener as (data: unknown) => void),
    },
    actions: {
      invoke: (id, params) => call('actions.invoke', { id, params: params ?? {} }) as Promise<void>,
      handle: (id, handler) => {
        actionHandlers.set(id, handler);
        return () => {
          if (actionHandlers.get(id) === handler) actionHandlers.delete(id);
        };
      },
    },
    theme: {
      current: () => theme,
      subscribe: (listener) => on('theme.changed', listener as (data: unknown) => void),
      apply: applyTokens,
    },
    ui: {
      setTitle: (title) => void call('ui.setTitle', { title }),
      toast: (message, kind) => void call('ui.toast', { message, kind: kind ?? 'info' }),
      openWindow: (windowId, params) => void call('ui.openWindow', { windowId: windowId ?? 'main', params: params ?? {} }),
      close: () => void call('ui.close'),
      confirm: (input) => call('ui.confirm', input) as Promise<boolean>,
      onParams: (listener) => on('params', listener as (data: unknown) => void),
      onBeforeClose: (guard) => {
        closeGuards.add(guard);
        return () => closeGuards.delete(guard);
      },
    },
  };
  window.landscape = landscape;
  // Tell the host the SDK is ready (it then delivers queued events such as the first params).
  parent.postMessage({ landscape: 1, nonce: context.nonce, id: 0, method: 'frame.ready', params: {} }, '*');
})();

export {};
