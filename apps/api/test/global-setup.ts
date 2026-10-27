import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config as loadEnvFile } from 'dotenv';

/** A database the suite resets, and the Prisma project that owns it. */
interface TestDatabase {
  /** The package whose prisma.config.ts, schema and migrations it uses. */
  root: string;
  /** The variable naming it, in that package's .env.test. */
  urlVar: string;
}

/**
 * Prepares the test databases once, before any e2e spec runs.
 *
 * The suite needs a real Postgres: the checkout guarantees come from row
 * locking, which no mock can reproduce. So tests get their own databases and a
 * clean schema on every run — ours, and MockPay's, which keeps a database of
 * its own (docs/design/deploy.md §6.5).
 */
export default function globalSetup(): void {
  const api: TestDatabase = { root: resolve(__dirname, '..'), urlVar: 'DATABASE_URL' };
  const mockpay: TestDatabase = {
    root: resolve(__dirname, '../../mockpay'),
    urlVar: 'MOCKPAY_DATABASE_URL',
  };

  // Check both before resetting either, so a wrong name in one file can't
  // leave the other database already wiped.
  const apiUrl = testDatabaseUrl(api);
  const mockpayUrl = testDatabaseUrl(mockpay);

  reset(api, apiUrl);
  reset(mockpay, mockpayUrl);

  // Jest forks its workers after this runs, so the specs inherit the test
  // connection strings — and a value in apps/api/.env can't send them to a
  // dev database.
  process.env.DATABASE_URL = apiUrl;
  process.env.MOCKPAY_DATABASE_URL = mockpayUrl;
}

/** The database's URL from its package's .env.test, if it names a test database. */
function testDatabaseUrl({ root, urlVar }: TestDatabase): string {
  // override: true so a URL already exported in the shell cannot redirect the
  // reset below at another database.
  const envFile = resolve(root, '.env.test');
  const { parsed, error } = loadEnvFile({ path: envFile, override: true });
  if (error) throw error;

  const url = parsed?.[urlVar];
  if (!url) throw new Error(`${envFile} must define ${urlVar}`);

  // The one guard that matters: `migrate reset` drops every table, so refuse to
  // run it anywhere but a database named for tests. One wrong value here would
  // otherwise wipe a dev database.
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${databaseName}": an e2e database name must end in _test. ` +
        `Check ${urlVar} in ${envFile}.`,
    );
  }
  return url;
}

/**
 * Replays the migrations rather than `db push`. Reset runs the migration SQL,
 * which is the only place the hand-written CHECK (stock >= 0) lives — db push
 * builds from schema.prisma alone and would silently omit it, leaving the
 * tests checking a constraint that isn't there.
 *
 * The URL is passed explicitly because each prisma.config.ts does
 * `import 'dotenv/config'`, which loads that package's .env — the DEV
 * database. --force skips the confirmation prompt. Prisma 7 no longer
 * regenerates the client here, so there is no generate step to opt out of.
 */
function reset({ root, urlVar }: TestDatabase, url: string): void {
  execFileSync(resolve(root, 'node_modules/.bin/prisma'), ['migrate', 'reset', '--force'], {
    cwd: root,
    env: { ...process.env, [urlVar]: url },
    stdio: 'inherit',
  });
}
