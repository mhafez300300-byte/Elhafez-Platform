import { Global, Injectable, Module } from '@nestjs/common';

export interface PlatformEvent { type: string; occurredAt: string; }
export type EventHandler<T extends PlatformEvent = PlatformEvent> = (event: T) => Promise<void> | void;

@Injectable()
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  subscribe<T extends PlatformEvent>(type: string, handler: EventHandler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as EventHandler);
  }
  async publish<T extends PlatformEvent>(event: T): Promise<void> {
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    for (const handler of handlers) await handler(event);
  }
}

@Global()
@Module({ providers: [EventBus], exports: [EventBus] })
export class EventsModule {}
