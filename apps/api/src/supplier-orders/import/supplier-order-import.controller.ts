import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import type {
  CreatedSupplierOrderImportToken,
  PublicUser,
  SupplierOrderImportTokenStatus,
} from '@vinyl-order/shared';

import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SupplierOrderImportTokensService } from './import-token.service';

/**
 * Importing supplier orders from the shops' confirmation emails (tracker.md
 * §9.4). The token routes are the signed-in user's own, behind their session.
 *
 * Listed before SupplierOrdersController in the module: routes register in
 * that order, and `GET /supplier-orders/:id` would otherwise take
 * `import-token` for an id.
 */
@Controller('supplier-orders/import-token')
@UseGuards(JwtAuthGuard)
export class SupplierOrderImportController {
  constructor(private readonly tokens: SupplierOrderImportTokensService) {}

  /** GET /supplier-orders/import-token — whether I have one, and when it was last used. */
  @Get()
  async status(@CurrentUser() user: PublicUser): Promise<SupplierOrderImportTokenStatus> {
    return { importToken: await this.tokens.find(user.id) };
  }

  /** POST /supplier-orders/import-token — a new token, replacing mine; shown this once. */
  @Post()
  create(@CurrentUser() user: PublicUser): Promise<CreatedSupplierOrderImportToken> {
    return this.tokens.create(user.id);
  }

  /** DELETE /supplier-orders/import-token — 204, whether or not I had one. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: PublicUser): Promise<void> {
    return this.tokens.remove(user.id);
  }
}
