import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Cart, PublicUser } from '@vinyl-order/shared';
import { ZodValidationPipe } from 'nestjs-zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

/**
 * The signed-in customer's cart.
 *
 * Guarded but not role-restricted — this is the one write surface ordinary
 * customers have. Every route derives the cart from the authenticated user
 * rather than a path parameter, so there is no identifier to tamper with and
 * no way to read or modify someone else's cart.
 *
 * Each mutation returns the whole cart, so a client never needs a follow-up
 * read to refresh its badge and totals.
 */
@Controller('cart')
@UseGuards(JwtAuthGuard)
@UsePipes(ZodValidationPipe)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  find(@CurrentUser() user: PublicUser): Promise<Cart> {
    return this.cart.find(user.id);
  }

  @Post('items')
  addItem(@CurrentUser() user: PublicUser, @Body() dto: AddCartItemDto): Promise<Cart> {
    return this.cart.addItem(user.id, dto);
  }

  @Patch('items/:productId')
  updateItem(
    @CurrentUser() user: PublicUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<Cart> {
    return this.cart.updateItem(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  removeItem(
    @CurrentUser() user: PublicUser,
    @Param('productId') productId: string,
  ): Promise<Cart> {
    return this.cart.removeItem(user.id, productId);
  }

  @Delete()
  clear(@CurrentUser() user: PublicUser): Promise<Cart> {
    return this.cart.clear(user.id);
  }
}
