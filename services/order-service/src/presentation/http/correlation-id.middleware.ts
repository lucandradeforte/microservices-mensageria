import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import { CorrelationContext } from '@microservices/node-common';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    const headerValue = request.header('x-correlation-id');
    const correlationId = CorrelationContext.getOrCreateCorrelationId(headerValue);

    response.setHeader('x-correlation-id', correlationId);
    CorrelationContext.run(correlationId, () => next());
  }
}

