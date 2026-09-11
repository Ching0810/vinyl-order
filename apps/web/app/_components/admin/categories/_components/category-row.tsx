'use client';

import { Badge, Button, HStack, IconButton, Input, Stack, Text } from '@chakra-ui/react';
import type { Category } from '@vinyl-order/shared';
import { useState } from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons';

/**
 * One tab in the admin list: its label, slug, how many products it holds, and
 * the controls to reorder, rename or remove it.
 *
 * The product count is shown next to Delete on purpose — removing a category
 * cascades its assignments, so "西洋 · 96 products" is the warning.
 */
const CategoryRow = ({
  category,
  isFirst,
  isLast,
  busy,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: {
  category: Category;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (values: { name: string; slug: string }) => void;
  onDelete: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [slug, setSlug] = useState(category.slug);

  const cancel = () => {
    setName(category.name);
    setSlug(category.slug);
    setEditing(false);
  };

  const save = () => {
    onSave({ name: name.trim(), slug: slug.trim() });
    setEditing(false);
  };

  return (
    <HStack
      gap="4"
      p="3"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="card"
      bg="bg.panel"
      align={editing ? 'end' : 'center'}
    >
      <HStack gap="1" flexShrink="0">
        <IconButton
          aria-label={`Move ${category.name} up`}
          size="xs"
          variant="outline"
          disabled={isFirst || busy || editing}
          onClick={onMoveUp}
        >
          <ChevronUpIcon />
        </IconButton>
        <IconButton
          aria-label={`Move ${category.name} down`}
          size="xs"
          variant="outline"
          disabled={isLast || busy || editing}
          onClick={onMoveDown}
        >
          <ChevronDownIcon />
        </IconButton>
      </HStack>

      {editing ? (
        <HStack gap="3" flex="1" minW="0">
          <Stack gap="1" flex="1" minW="0">
            <Text fontSize="2xs" color="fg.subtle">
              Label
            </Text>
            <Input size="sm" value={name} onChange={(e) => setName(e.target.value)} />
          </Stack>
          <Stack gap="1" flex="1" minW="0">
            <Text fontSize="2xs" color="fg.subtle">
              Slug (URL)
            </Text>
            <Input size="sm" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Stack>
        </HStack>
      ) : (
        <Stack gap="0.5" flex="1" minW="0">
          <Text fontWeight="semibold" truncate>
            {category.name}
          </Text>
          <Text fontSize="xs" color="fg.muted" truncate>
            /products?category={category.slug}
          </Text>
        </Stack>
      )}

      <Badge flexShrink="0" colorPalette={category.productCount ? 'gray' : 'orange'}>
        {category.productCount ?? 0} products
      </Badge>

      <HStack gap="2" flexShrink="0">
        {editing ? (
          <>
            <Button size="xs" variant="outline" onClick={cancel}>
              Cancel
            </Button>
            <Button size="xs" colorPalette="brand" disabled={!name || !slug} onClick={save}>
              Save
            </Button>
          </>
        ) : (
          <>
            <Button size="xs" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="xs"
              variant="outline"
              colorPalette="red"
              disabled={busy}
              onClick={onDelete}
            >
              Delete
            </Button>
          </>
        )}
      </HStack>
    </HStack>
  );
};

export default CategoryRow;
