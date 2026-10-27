import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

/** How the API sees the request that asked, address by address. */
interface RequestIp {
  /** The client as Express decided it — what the rate limit counts by. */
  ip: string | undefined;
  /** The chain within TRUST_PROXY's reach, client first; empty when it is 0. */
  ips: string[];
  /** X-Forwarded-For as it arrived: what the client wrote, then each proxy's entry. */
  forwardedFor: string | null;
  /** The address the connection itself came from — the nearest proxy, if any. */
  remoteAddress: string | undefined;
}

/**
 * Admin-only views of how the API sees its traffic, for setting it up on a
 * host. Not public: the answer names the host's own proxies.
 */
@Controller('admin/debug')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DiagnosticsController {
  /**
   * GET /admin/debug/request-ip — how many proxies a request passed and which
   * address the API took as the client's. TRUST_PROXY is right when `ip` is
   * the caller's own public address (docs/design/deploy.md §6.2).
   */
  @Get('request-ip')
  requestIp(@Req() req: Request): RequestIp {
    return {
      ip: req.ip,
      ips: req.ips,
      forwardedFor: req.get('X-Forwarded-For') ?? null,
      remoteAddress: req.socket.remoteAddress,
    };
  }
}
