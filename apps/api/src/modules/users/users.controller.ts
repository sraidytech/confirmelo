import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      message: 'Users service is running',
      timestamp: new Date().toISOString(),
    };
  }
}