import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { PublicUser, SupplierOrder } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSupplierOrderDto } from './dto/create-supplier-order.dto';
import { UpdateSupplierOrderDto } from './dto/update-supplier-order.dto';
import { SupplierOrdersService } from './supplier-orders.service';

/**
 * The signed-in user's own orders at the shops (tracker.md §9).
 *
 * Any signed-in user, no role: everyone keeps their own record. Scoped by the
 * session's user, never by an owner id in the path or body, so there is no
 * identifier to tamper with — the same rule as the cart and the demo orders.
 * ZodValidationPipe validates the bodies against the shared schemas.
 */
@Controller('supplier-orders')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class SupplierOrdersController {
  constructor(private readonly supplierOrders: SupplierOrdersService) {}

  /** GET /supplier-orders — all of the user's orders, newest first. */
  @Get()
  list(@CurrentUser() user: PublicUser): Promise<SupplierOrder[]> {
    return this.supplierOrders.list(user.id);
  }

  /** POST /supplier-orders — record an order and its lines. 409 if already recorded. */
  @Post()
  create(
    @CurrentUser() user: PublicUser,
    @Body() dto: CreateSupplierOrderDto,
  ): Promise<SupplierOrder> {
    return this.supplierOrders.create(user.id, dto);
  }

  /** PATCH /supplier-orders/:id — status, tracking number or note. 404 unless it's the user's. */
  @Patch(':id')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierOrderDto,
  ): Promise<SupplierOrder> {
    return this.supplierOrders.update(user.id, id, dto);
  }

  /** DELETE /supplier-orders/:id — 204; 404 unless it's the user's. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: PublicUser, @Param('id') id: string): Promise<void> {
    return this.supplierOrders.remove(user.id, id);
  }
}
