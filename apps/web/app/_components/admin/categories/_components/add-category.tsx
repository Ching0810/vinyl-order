'use client';

import { Button, Field, HStack, Input, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

/** Mirrors the shared slugSchema so bad input is caught before the request. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Create a new storefront tab.
 *
 * Label and slug are entered separately rather than deriving one from the
 * other: a label like 華語 has no sensible automatic slug, and the slug is the
 * URL identity, so guessing it would be worse than asking.
 *
 * @param onCreate - called with a validated label and slug
 * @param busy - a write is in flight
 */
const AddCategory = ({
  onCreate,
  busy,
}: {
  onCreate: (values: { name: string; slug: string }) => void;
  busy: boolean;
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const slugInvalid = slug.length > 0 && !SLUG_PATTERN.test(slug);
  const canSubmit = name.trim().length > 0 && slug.length > 0 && !slugInvalid && !busy;

  const submit = () => {
    if (!canSubmit) return;
    onCreate({ name: name.trim(), slug });
    setName('');
    setSlug('');
  };

  return (
    <Stack gap="4">
      <HStack gap="3" align="start">
        <Field.Root flex="1">
          <Field.Label>Label</Field.Label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="華語"
          />
        </Field.Root>

        <Field.Root flex="1" invalid={slugInvalid}>
          <Field.Label>Slug</Field.Label>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="mandarin"
          />
          <Field.ErrorText>Lowercase letters, numbers and single hyphens.</Field.ErrorText>
        </Field.Root>
      </HStack>

      <HStack justify="space-between">
        <Text fontSize="xs" color="fg.subtle">
          The slug becomes the URL and should not change once links exist.
        </Text>
        <Button size="sm" colorPalette="brand" disabled={!canSubmit} onClick={submit}>
          Add category
        </Button>
      </HStack>
    </Stack>
  );
};

export default AddCategory;
