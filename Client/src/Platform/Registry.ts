import { useSyncExternalStore } from 'react';

/** Where an entry comes from: compiled into LANdscape, or contributed by an installed app. */
export type EntrySource = { kind: 'builtin' } | { kind: 'app'; appId: string };

export interface RegistryEntry {
  id: string;
  source?: EntrySource;
}

/**
 * An observable map of extension points (apps, widgets, tray items, …).
 * Built-ins and catalog apps register through the same calls, so nothing
 * else needs a fixed id list. `list()` keeps registration order and returns
 * the same array until something changes (safe for useSyncExternalStore).
 */
export class Registry<T extends RegistryEntry> {
  private readonly entries = new Map<string, T>();
  private readonly listeners = new Set<() => void>();
  private snapshot: T[] = [];

  constructor(readonly name: string) {}

  /** Adds or replaces an entry. Returns a function that removes exactly this registration. */
  register(entry: T): () => void {
    this.entries.set(entry.id, entry);
    this.changed();
    return () => {
      if (this.entries.get(entry.id) === entry) this.unregister(entry.id);
    };
  }

  unregister(id: string): void {
    if (this.entries.delete(id)) this.changed();
  }

  /** Removes everything an app contributed (used on uninstall and when safe mode skips apps). */
  unregisterApp(appId: string): void {
    let removed = false;
    for (const [id, entry] of this.entries) {
      if (entry.source?.kind === 'app' && entry.source.appId === appId) {
        this.entries.delete(id);
        removed = true;
      }
    }
    if (removed) this.changed();
  }

  get(id: string): T | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): T[] {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    this.snapshot = [...this.entries.values()];
    for (const listener of this.listeners) listener();
  }
}

/** All entries of a registry, re-rendering when it changes. */
export function useRegistry<T extends RegistryEntry>(registry: Registry<T>): T[] {
  return useSyncExternalStore(registry.subscribe, () => registry.list());
}

/** One entry of a registry (undefined until registered). */
export function useRegistryEntry<T extends RegistryEntry>(registry: Registry<T>, id: string | null | undefined): T | undefined {
  const list = useRegistry(registry);
  return id ? (list.find((entry) => entry.id === id) ?? undefined) : undefined;
}
