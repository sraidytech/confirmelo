import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      message: 'Organizations service is running',
      timestamp: new Date().toISOString(),
    };
  }
}