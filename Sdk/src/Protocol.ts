/**
 * The postMessage protocol between an app frame and LANdscape's broker
 * (Client/src/Platform/AppBroker.ts). Both sides validate what they receive.
 *
 * Frame → host:   { landscape: 1, nonce, id, method, params }
 * Host → frame:   { landscape: 1, id, result } | { landscape: 1, id, error }
 *                 { landscape: 1, event, data }           (subscriptions, lifecycle)
 */
export const PROTOCOL_VERSION = 1;

export interface RpcRequest {
  landscape: typeof PROTOCOL_VERSION;
  /** Per-frame secret the host handed the frame at load; proves the sender is that frame. */
  nonce: string;
  id: number;
  method: string;
  params: unknown;
}

export type RpcResponse =
  | { landscape: typeof PROTOCOL_VERSION; id: number; result: unknown }
  | { landscape: typeof PROTOCOL_VERSION; id: number; error: { code: string; message: string } };

export interface RpcEvent {
  landscape: typeof PROTOCOL_VERSION;
  event: string;
  data: unknown;
}

/** What the host tells a frame at load time (injected as `window.__landscapeFrame`). */
export interface FrameContext {
  appId: string;
  appName: string;
  version: string;
  surface: 'window' | 'widget' | 'tray' | 'taskbar' | 'startup' | 'background';
  /** Which contribution this frame renders (window id, widget id, …). */
  surfaceId: string;
  nonce: string;
  /** Window params (from actions or openWindow), widget settings, startup params. */
  params: Record<string, unknown>;
  theme: 'light' | 'dark';
  /** Design tokens (CSS custom properties) at load; `theme.changed` events carry updates. */
  tokens: Record<string, string>;
  /** Permissions in effect (all of them when trusted). */
  permissions: string[];
  phone: boolean;
}
