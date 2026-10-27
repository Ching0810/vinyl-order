import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// MOCKPAY_DATABASE_URL, not DATABASE_URL: a DATABASE_URL exported in the shell
// for the API can never send MockPay's migrations to the API's database.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['MOCKPAY_DATABASE_URL'],
  },
});
