'use client';

import { Code, Link, Stack, Text, chakra } from '@chakra-ui/react';

import Panel from '@/components/ui/panel';
import { absoluteApiUrl } from '@/lib/core/http';

/** The script and its instructions, in this site's public repository. */
const SCRIPT_URL = 'https://github.com/Ching0810/vinyl-order/tree/main/tools/gmail-import';

const Step = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <chakra.li ps="1">
    <Text fontWeight="semibold">{title}</Text>
    <Stack gap="1" mt="1" fontSize="sm" color="fg.muted">
      {children}
    </Stack>
  </chakra.li>
);

/**
 * How to set up the Gmail side, once (tracker.md §9.4): a short Apps Script
 * in the user's own Google account sends the shops' confirmations here every
 * day. The site never gets access to the mailbox; the script does, so the
 * user is asked to read it before running it.
 *
 * Rendered only once the user is known, in the browser, so the page's own
 * address is there to build the import URL from.
 */
export default function SetupSteps() {
  const importUrl = absoluteApiUrl('/supplier-orders/import');

  return (
    <Panel
      title="Set up Gmail"
      description="Once. After that, confirmations from THT, Cosmic and Rotten Blues arrive here by themselves."
    >
      <chakra.ol listStyleType="decimal" ps="5" display="flex" flexDirection="column" gap="4">
        <Step title="Create an import token">
          <Text>Above, and copy it — it is shown only once.</Text>
        </Step>
        <Step title="Add the script to your Google account">
          <Text>
            Open{' '}
            <Link href="https://script.google.com" target="_blank" rel="noreferrer">
              script.google.com
            </Link>{' '}
            and create a new project. Paste in <Code>Code.gs</Code> and <Code>appsscript.json</Code>{' '}
            from{' '}
            <Link href={SCRIPT_URL} target="_blank" rel="noreferrer">
              the repository
            </Link>
            .
          </Text>
          <Text>
            Read it first — one short file, mostly comments — because it will be able to read your
            mail. It only searches for the shops&apos; confirmations and sends those here, without
            their links.
          </Text>
        </Step>
        <Step title="Give it your token">
          <Text>
            In the project&apos;s settings, under Script properties, add <Code>IMPORT_TOKEN</Code>{' '}
            (your token) and <Code>IMPORT_URL</Code>:
          </Text>
          <Code display="block" whiteSpace="pre-wrap" wordBreak="break-all" p="2">
            {importUrl}
          </Code>
        </Step>
        <Step title="Run it once">
          <Text>
            Run <Code>install</Code> and allow the access it asks for. It then runs once a day by
            itself.
          </Text>
          <Text>
            Imported emails get the Gmail label <Code>vinyl-imported</Code>. Ones it couldn&apos;t
            read get <Code>vinyl-import-failed</Code> — record those by hand. Candlelight sends no
            confirmation of its own, so its orders are always recorded by hand.
          </Text>
        </Step>
      </chakra.ol>
    </Panel>
  );
}
