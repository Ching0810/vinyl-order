import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import type { JwtPayload } from '../src/auth/jwt.strategy';
import type { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The HTTP answers the services give for Prisma's "already exists" (P2002)
 * and "not found" (P2025), on every route that translates one.
 *
 * Each route says which unique index it expects, so a clash on any other
 * index would surface instead of being reported as this one; these pin that
 * the names it expects are the ones Postgres reports.
 */
describe('Prisma errors as HTTP answers (e2e)', () => {
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

  const createUser = async (role: Role) => {
    const user = await prisma.user.create({
      data: { email: `${role}-${randomUUID()}@test.local`, passwordHash: 'unused', role },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    return { user, token: jwt.sign(payload) };
  };

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** A slug no other test uses: lowercase letters, numbers and hyphens. */
  const freshSlug = () => `cat-${randomUUID()}`;

  describe('already exists → 409', () => {
    it('registering an email that is taken', async () => {
      const { user } = await createUser('customer');

      await server()
        .post('/auth/register')
        .send({ email: user.email, password: 'long-enough' })
        .expect(409);
    });

    it('creating a category with a slug that is taken', async () => {
      const { token } = await createUser('admin');
      const taken = await prisma.category.create({ data: { slug: freshSlug(), name: 'Taken' } });

      await server()
        .post('/categories')
        .set(auth(token))
        .send({ slug: taken.slug, name: 'Again' })
        .expect(409);
    });

    it("renaming a category's slug to one that is taken", async () => {
      const { token } = await createUser('admin');
      const taken = await prisma.category.create({ data: { slug: freshSlug(), name: 'Taken' } });
      const other = await prisma.category.create({ data: { slug: freshSlug(), name: 'Other' } });

      await server()
        .patch(`/categories/${other.id}`)
        .set(auth(token))
        .send({ slug: taken.slug })
        .expect(409);
    });
  });

  describe('not found → 404', () => {
    it('updating or deleting a category that does not exist', async () => {
      const { token } = await createUser('admin');

      await server()
        .patch(`/categories/${randomUUID()}`)
        .set(auth(token))
        .send({ name: 'x' })
        .expect(404);
      await server().delete(`/categories/${randomUUID()}`).set(auth(token)).expect(404);
    });

    it('updating or deleting a product that does not exist', async () => {
      const { token } = await createUser('admin');

      await server()
        .patch(`/products/${randomUUID()}`)
        .set(auth(token))
        .send({ title: 'x' })
        .expect(404);
      await server().delete(`/products/${randomUUID()}`).set(auth(token)).expect(404);
    });

    it('changing the quantity of a record that is not in the cart', async () => {
      const { token } = await createUser('customer');
      const inCart = await prisma.product.create({
        data: { title: `In ${randomUUID()}`, artist: 'A', priceCents: 1_000, stock: 5 },
      });
      const notInCart = await prisma.product.create({
        data: { title: `Out ${randomUUID()}`, artist: 'A', priceCents: 1_000, stock: 5 },
      });
      // Gives the user a cart, so the 404 is about the line, not the cart.
      await server()
        .post('/cart/items')
        .set(auth(token))
        .send({ productId: inCart.id, quantity: 1 })
        .expect(201);

      await server()
        .patch(`/cart/items/${notInCart.id}`)
        .set(auth(token))
        .send({ quantity: 2 })
        .expect(404);
    });
  });
});
