import type { EventsServerMessage } from '@landscape/shared';

type Listener = (message: EventsServerMessage) => void;

/** Fan-out of server events (notifications, monitor changes) to every /ws/events client. */
export class EventBus {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(message: EventsServerMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // A broken socket must not stop the others.
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
