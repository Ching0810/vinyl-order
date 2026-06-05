import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Liveness endpoint for load balancers / Cloud Run health checks.
 * @SkipThrottle so frequent probes don't consume the global rate limit.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; uptime: number; timestamp: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
