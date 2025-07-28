import { SetMetadata } from '@nestjs/common';

export interface ResourceAccessConfig {
  resource: string;
  action: string;
  resourceIdParam?: string; // Parameter name to extract resource ID from request
  allowOwner?: boolean; // Allow if user owns the resource
}

export const RESOURCE_ACCESS_KEY = 'resourceAccess';

/**
 * Decorator to specify resource-level access control
 * 
 * @param config - Resource access configuration
 * 
 * @example
 * @ResourceAccess({
 *   resource: 'order',
 *   action: 'read',
 *   resourceIdParam: 'orderId',
 *   allowOwner: true
 * })
 * @Get('orders/:orderId')
 * getOrder(@Param('orderId') orderId: string) {
 *   return this.orderService.findOne(orderId);
 * }
 */
export const ResourceAccess = (config: ResourceAccessConfig) => 
  SetMetadata(RESOURCE_ACCESS_KEY, config);