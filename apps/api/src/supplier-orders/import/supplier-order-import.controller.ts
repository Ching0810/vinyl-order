import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CreatedSupplierOrderImportToken,
  ImportSupplierOrderResult,
  PublicUser,
  SupplierOrderImportTokenStatus,
} from '@vinyl-order/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ImportSupplierOrderEmailDto } from '../dto/import-supplier-order-email.dto';
import { ImportingUserId, SupplierOrderImportTokenGuard } from './import-token.guard';
import { SupplierOrderImportTokensService } from './import-token.service';
import { SupplierOrderImportService } from './supplier-order-import.service';

/**
 * Importing supplier orders from the shops' confirmation emails (tracker.md
 * §9.4). Two kinds of caller, so the guard is per route: the token routes
 * are the signed-in user's own, behind their session; the import itself is
 * the user's Apps Script, behind the import token.
 *
 * Listed before SupplierOrdersController in the module: routes register in
 * that order, and `GET /supplier-orders/:id` would otherwise take
 * `import-token` for an id.
 */
@Controller('supplier-orders')
@UsePipes(ZodValidationPipe)
export class SupplierOrderImportController {
  constructor(
    private readonly tokens: SupplierOrderImportTokensService,
    private readonly imports: SupplierOrderImportService,
  ) {}

  /** GET /supplier-orders/import-token — whether I have one, and when it was last used. */
  @Get('import-token')
  @UseGuards(JwtAuthGuard)
  async tokenStatus(@CurrentUser() user: PublicUser): Promise<SupplierOrderImportTokenStatus> {
    return { importToken: await this.tokens.find(user.id) };
  }

  /** POST /supplier-orders/import-token — a new token, replacing mine; shown this once. */
  @Post('import-token')
  @UseGuards(JwtAuthGuard)
  createToken(@CurrentUser() user: PublicUser): Promise<CreatedSupplierOrderImportToken> {
    return this.tokens.create(user.id);
  }

  /** DELETE /supplier-orders/import-token — 204, whether or not I had one. */
  @Delete('import-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeToken(@CurrentUser() user: PublicUser): Promise<void> {
    return this.tokens.remove(user.id);
  }

  /**
   * POST /supplier-orders/import — one confirmation email, from the Apps
   * Script. 201 `created`, 200 `already_recorded`, 422 if it can't be read,
   * 401 without a current import token. Never returns the order.
   *
   * Its own, tighter limit: the script sends a few emails once a day, so
   * more than this is something else hammering a token.
   */
  @Post('import')
  @UseGuards(SupplierOrderImportTokenGuard)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async import(
    @ImportingUserId() userId: string,
    @Body() dto: ImportSupplierOrderEmailDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ImportSupplierOrderResult> {
    const outcome = await this.imports.import(userId, dto);
    response.status(outcome.result === 'created' ? HttpStatus.CREATED : HttpStatus.OK);
    return outcome;
  }
}
