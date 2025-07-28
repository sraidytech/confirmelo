import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify required permissions for accessing an endpoint
 * 
 * @param permissions - Array of required permission strings
 * 
 * @example
 * @Permissions('orders:read', 'orders:write')
 * @Post('orders')
 * createOrder() {
 *   return { message: 'Order created' };
 * }
 */
export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);