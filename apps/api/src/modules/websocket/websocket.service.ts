import { Injectable } from '@nestjs/common';

@Injectable()
export class WebsocketService {
  // Placeholder service - will be implemented in subsequent tasks
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'WebsocketService',
    };
  }
}