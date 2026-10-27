import { Module } from '@nestjs/common';

import { DiagnosticsController } from './diagnostics.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, DiagnosticsController],
})
export class HealthModule {}
