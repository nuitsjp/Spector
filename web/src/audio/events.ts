import type { Unsubscribe } from '../contracts';

export class EventStream<T> {
  private readonly listeners = new Set<(event: T) => void>();

  subscribe(listener: (event: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: T): void {
    for (const listener of this.listeners) listener(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
