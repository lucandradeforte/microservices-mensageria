import { Injectable } from '@nestjs/common';

import { CorrelationContext } from './correlation-context';

type Metadata = Record<string, unknown>;

@Injectable()
export class AppLogger {
  public constructor(private readonly serviceName: string) {}

  public info(message: string, metadata?: Metadata): void {
    this.write('INFO', message, metadata);
  }

  public warn(message: string, metadata?: Metadata): void {
    this.write('WARN', message, metadata);
  }

  public error(message: string, error?: unknown, metadata?: Metadata): void {
    const normalizedError =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error;

    this.write('ERROR', message, {
      ...metadata,
      error: normalizedError,
    });
  }

  private write(level: 'INFO' | 'WARN' | 'ERROR', message: string, metadata?: Metadata): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      correlationId: CorrelationContext.getCorrelationId(),
      message,
      ...metadata,
    };

    if (level === 'ERROR') {
      console.error(JSON.stringify(logEntry));
      return;
    }

    console.log(JSON.stringify(logEntry));
  }
}

