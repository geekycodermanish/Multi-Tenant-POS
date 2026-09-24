import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../services/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealthStatus() {
    const status = await this.healthService.checkAllConnections();
    return {
      timestamp: new Date().toISOString(),
      ...status,
    };
  }

  @Get('database')
  async getDatabaseStatus() {
    const database = await this.healthService.checkDatabaseConnection();
    return {
      timestamp: new Date().toISOString(),
      database,
    };
  }

  @Get('cache')
  async getCacheStatus() {
    const cache = await this.healthService.checkRedisConnection();
    return {
      timestamp: new Date().toISOString(),
      cache,
    };
  }
}