import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config as loadEnvFile } from 'dotenv';

/**
 * Prepares the test database once, before any e2e spec runs.
 *
 * The suite needs a real Postgres: the checkout guarantees come from row
 * locking, which no mock can reproduce. So tests get their own database and a
 * clean schema on every run.
 */
export default function globalSetup(): void {
  const apiRoot = resolve(__dirname, '..');

  // override: true so a DATABASE_URL already exported in the shell cannot
  // redirect the reset below at another database.
  const { parsed, error } = loadEnvFile({ path: resolve(apiRoot, '.env.test'), override: true });
  if (error) throw error;

  const databaseUrl = parsed?.DATABASE_URL;
  if (!databaseUrl) throw new Error('.env.test must define DATABASE_URL');

  // The one guard that matters: `migrate reset` drops every table, so refuse to
  // run it anywhere but a database named for tests. One wrong value here would
  // otherwise wipe the dev catalogue.
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${databaseName}": the e2e database name must end in _test. ` +
        'Check DATABASE_URL in apps/api/.env.test.',
    );
  }

  // Replay the migrations rather than `db push`. Reset runs the migration SQL,
  // which is the only place the hand-written CHECK (stock >= 0) lives — db push
  // builds from schema.prisma alone and would silently omit it, leaving the
  // tests checking a constraint that isn't there.
  //
  // DATABASE_URL is passed explicitly because prisma.config.ts does
  // `import 'dotenv/config'`, which loads .env — the DEV database.
  // --force skips the confirmation prompt. Prisma 7 no longer regenerates the
  // client here, so there is no generate step to opt out of.
  execFileSync(resolve(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'reset', '--force'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  // Jest forks its workers after this runs, so the specs inherit the test
  // connection string.
  process.env.DATABASE_URL = databaseUrl;
}
