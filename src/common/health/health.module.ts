import { Module, Global } from '@nestjs/common';
import { HealthService } from '../services/health.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}