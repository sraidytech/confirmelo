/**
 * Correlation ID Middleware
 * Ensures every request has a unique correlation ID for request tracing
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithCorrelationId, res: Response, next: NextFunction): void {
    // Get correlation ID from header or generate new one
    const correlationId = (req.get('X-Correlation-ID') as string) || uuidv4();
    
    // Attach to request object
    req.correlationId = correlationId;
    
    // Set response header
    res.setHeader('X-Correlation-ID', correlationId);
    
    next();
  }
}