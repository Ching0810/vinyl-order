'use client';

import { Alert, Button, HStack, Input, Stack } from '@chakra-ui/react';
import { useState } from 'react';

/**
 * A token just made, shown the one time it can be: the API keeps only its
 * hash. Copy is one click; the field is selectable as well, for a browser
 * that won't let the page write to the clipboard.
 *
 * @param token - the new import token
 */
export default function RevealedToken({ token }: { token: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopy('copied');
    } catch {
      setCopy('failed'); // permission denied, or no clipboard API
    }
  };

  return (
    <Alert.Root status="warning" borderRadius="card">
      <Alert.Indicator />
      <Stack flex="1" gap="3" minW="0">
        <Alert.Content>
          <Alert.Title>Copy this token now</Alert.Title>
          <Alert.Description>
            It won&apos;t be shown again. Paste it into your Apps Script as{' '}
            <code>IMPORT_TOKEN</code> (step 3 below). Anyone with it can add orders to your list, so
            keep it out of chats and screenshots.
          </Alert.Description>
        </Alert.Content>
        <HStack gap="2">
          <Input
            value={token}
            readOnly
            fontFamily="mono"
            fontSize="sm"
            bg="bg.panel"
            aria-label="Import token"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button size="sm" borderRadius="full" flexShrink="0" onClick={() => void copyToken()}>
            {copy === 'copied' ? 'Copied' : 'Copy'}
          </Button>
        </HStack>
        {copy === 'failed' ? (
          <Alert.Description>
            Couldn&apos;t copy automatically — select the token and copy it.
          </Alert.Description>
        ) : null}
      </Stack>
    </Alert.Root>
  );
}
