import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  Auth,
  Public,
  CurrentUser,
  CurrentSession,
} from '../../../common/decorators';

@ApiTags('Protected Examples')
@Controller('protected')
export class ProtectedController {
  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Public endpoint - no authentication required' })
  publicEndpoint() {
    return {
      message: 'This is a public endpoint',
      timestamp: new Date().toISOString(),
    };
  }

  @Auth()
  @Get('authenticated')
  @ApiOperation({ summary: 'Authenticated endpoint - requires valid JWT' })
  authenticatedEndpoint(@CurrentUser() user: any) {
    return {
      message: 'This endpoint requires authentication',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  @Auth({ roles: [UserRole.ADMIN, UserRole.TEAM_LEADER] })
  @Get('admin-only')
  @ApiOperation({ summary: 'Admin/Team Leader only endpoint' })
  adminOnlyEndpoint(@CurrentUser() user: any) {
    return {
      message: 'This endpoint is for admins and team leaders only',
      userRole: user.role,
    };
  }

  @Auth({ permissions: ['orders:read', 'orders:write'] })
  @Get('orders-permission')
  @ApiOperation({ summary: 'Endpoint requiring specific permissions' })
  ordersPermissionEndpoint(@CurrentUser() user: any) {
    return {
      message: 'This endpoint requires orders read and write permissions',
      userRole: user.role,
    };
  }

  @Auth({
    resourceAccess: {
      resource: 'order',
      action: 'read',
      resourceIdParam: 'orderId',
      allowOwner: true,
    },
  })
  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Resource-specific access control' })
  getOrder(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    return {
      message: `Access granted to order ${orderId}`,
      userId: user.id,
      userRole: user.role,
    };
  }

  @Auth({ requireSession: true })
  @Get('session-required')
  @ApiOperation({ summary: 'Endpoint requiring active session' })
  sessionRequiredEndpoint(
    @CurrentUser() user: any,
    @CurrentSession() session: any,
  ) {
    return {
      message: 'This endpoint requires an active session',
      user: {
        id: user.id,
        email: user.email,
      },
      session: {
        sessionId: session.sessionId,
        lastActivity: session.lastActivity,
        ipAddress: session.ipAddress,
      },
    };
  }

  @Auth({
    roles: [UserRole.ADMIN],
    permissions: ['users:read'],
    requireSession: true,
  })
  @Get('complex-auth')
  @ApiOperation({ summary: 'Complex authentication with multiple requirements' })
  complexAuthEndpoint(
    @CurrentUser() user: any,
    @CurrentSession() session: any,
  ) {
    return {
      message: 'This endpoint requires admin role, users:read permission, and active session',
      user: {
        id: user.id,
        role: user.role,
      },
      sessionId: session.sessionId,
    };
  }
}