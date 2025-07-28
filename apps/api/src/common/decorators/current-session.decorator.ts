import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the current session data from the request
 * Requires SessionGuard to be applied to the endpoint
 * 
 * @example
 * @UseGuards(JwtAuthGuard, SessionGuard)
 * @Get('session-info')
 * getSessionInfo(@CurrentSession() session: any) {
 *   return {
 *     sessionId: session.sessionId,
 *     lastActivity: session.lastActivity,
 *     ipAddress: session.ipAddress
 *   };
 * }
 * 
 * @example
 * // Extract specific session property
 * @Get('last-activity')
 * getLastActivity(@CurrentSession('lastActivity') lastActivity: Date) {
 *   return { lastActivity };
 * }
 */
export const CurrentSession = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const session = request.session;

    return data ? session?.[data] : session;
  },
);