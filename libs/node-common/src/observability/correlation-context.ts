import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface CorrelationStore {
  correlationId: string;
}

const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

export class CorrelationContext {
  public static run<T>(correlationId: string, callback: () => T): T {
    return correlationStorage.run({ correlationId }, callback);
  }

  public static getCorrelationId(): string | undefined {
    return correlationStorage.getStore()?.correlationId;
  }

  public static getOrCreateCorrelationId(explicitCorrelationId?: string): string {
    return explicitCorrelationId ?? this.getCorrelationId() ?? randomUUID();
  }
}

