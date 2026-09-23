import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Cart } from '@vinyl-order/shared';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Cart writes against the stock they ask for.
 *
 * A cart records an intention, so these caps are housekeeping rather than a
 * promise: stock can fall after a line is added, and checkout is what really
 * refuses to oversell (see orders.e2e-spec).
 */
describe('Cart (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const createProduct = (stock: number) =>
    prisma.product.create({
      data: { title: `Album ${randomUUID()}`, artist: 'Test Artist', priceCents: 1_000, stock },
    });

  const createShopper = async () => {
    const user = await prisma.user.create({
      data: { email: `shopper-${randomUUID()}@test.local`, passwordHash: 'unused' },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: jwt.sign(payload) };
  };

  const add = (token: string, productId: string, quantity: number) =>
    request(app.getHttpServer())
      .post('/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity });

  const setQuantity = (token: string, productId: string, quantity: number) =>
    request(app.getHttpServer())
      .patch(`/cart/items/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity });

  const quantityOf = (res: { body: unknown }, productId: string) =>
    (res.body as Cart).items.find((item) => item.productId === productId)?.quantity;

  it('caps a new line at the stock', async () => {
    const product = await createProduct(3);
    const { token } = await createShopper();

    const res = await add(token, product.id, 10).expect(201);

    expect(quantityOf(res, product.id)).toBe(3);
  });

  /** Adding what is already in the cart increments it, so the cap applies to the total. */
  it('caps repeated adds at the stock', async () => {
    const product = await createProduct(3);
    const { token } = await createShopper();

    await add(token, product.id, 2).expect(201);
    const res = await add(token, product.id, 2).expect(201);

    expect(quantityOf(res, product.id)).toBe(3);
  });

  it('caps an absolute quantity at the stock', async () => {
    const product = await createProduct(3);
    const { token } = await createShopper();
    await add(token, product.id, 1).expect(201);

    const res = await setQuantity(token, product.id, 9).expect(200);

    expect(quantityOf(res, product.id)).toBe(3);
  });

  it('leaves a quantity within the stock alone', async () => {
    const product = await createProduct(5);
    const { token } = await createShopper();

    const res = await add(token, product.id, 4).expect(201);

    expect(quantityOf(res, product.id)).toBe(4);
  });

  /** No quantity can be capped to, so this is refused rather than adjusted. */
  it('refuses a sold-out record', async () => {
    const product = await createProduct(0);
    const { token } = await createShopper();

    const res = await add(token, product.id, 1).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('refuses raising a line whose record has sold out since', async () => {
    const product = await createProduct(2);
    const { token } = await createShopper();
    await add(token, product.id, 1).expect(201);
    await prisma.product.update({ where: { id: product.id }, data: { stock: 0 } });

    const res = await setQuantity(token, product.id, 2).expect(409);

    expect((res.body as { code: string }).code).toBe('OUT_OF_STOCK');
  });

  it('requires a signed-in user', async () => {
    const product = await createProduct(1);

    await request(app.getHttpServer())
      .post('/cart/items')
      .send({ productId: product.id, quantity: 1 })
      .expect(401);
  });

  /** The cap is a courtesy: a line already over the stock is left as it is. */
  it('leaves a line that the stock fell under', async () => {
    const product = await createProduct(5);
    const { token } = await createShopper();
    await add(token, product.id, 5).expect(201);

    await prisma.product.update({ where: { id: product.id }, data: { stock: 1 } });

    const res = await request(app.getHttpServer())
      .get('/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(quantityOf(res, product.id)).toBe(5);
  });
});
