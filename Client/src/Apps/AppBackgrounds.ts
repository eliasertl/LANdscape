import type { InstalledApp } from '@landscape/shared';
import { registerFrame } from '../Platform/AppBroker';

/**
 * Hidden background pages for apps that declare `contributes.background`:
 * created on first use (an action without an open window), kept while
 * LANdscape is open, removed on uninstall.
 */
class BackgroundFrames {
  private readonly frames = new Map<string, { iframe: HTMLIFrameElement; unregister: () => void; ready: Promise<Window> }>();

  ensure(app: InstalledApp): Promise<Window> {
    const existing = this.frames.get(app.id);
    if (existing) return existing.ready;
    const entry = app.manifest.contributes.background?.entry;
    if (!entry) return Promise.reject(new Error('No background page'));
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-10px;top:-10px;visibility:hidden';
    iframe.dataset.appBackground = app.id;
    iframe.src = `/apps/frame/${encodeURIComponent(app.id)}/background/main?nonce=${nonce}`;
    document.body.appendChild(iframe);
    const target = iframe.contentWindow as Window;
    const unregister = registerFrame({ app, surface: 'background', surfaceId: 'main', nonce, window: target, ui: {} });
    const ready = new Promise<Window>((resolve) => {
      iframe.addEventListener('load', () => resolve(target), { once: true });
    });
    this.frames.set(app.id, { iframe, unregister, ready });
    return ready;
  }

  stop(appId: string): void {
    const entry = this.frames.get(appId);
    if (!entry) return;
    entry.unregister();
    entry.iframe.remove();
    this.frames.delete(appId);
  }
}

export const backgroundFrames = new BackgroundFrames();
