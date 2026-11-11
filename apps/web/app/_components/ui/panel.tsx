import { Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
/**
 * A titled card grouping related form fields.
 *
 * Long forms — a product's release metadata, pricing and artwork; a supplier
 * order and its records — read better in labelled panels: the eye has
 * somewhere to land, and it is obvious which fields belong together.
 *
 * @param title - the group's label
 * @param description - optional one-line explanation
 * @param children - the fields in this group
 */
export default function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Stack
      gap="5"
      p={{ base: '5', md: '6' }}
      borderRadius="card"
      borderWidth="1px"
      borderColor="border.muted"
      bg="bg.panel"
    >
      <Stack gap="1">
        <Text textStyle="eyebrow" color="fg.muted">
          {title}
        </Text>
        {description ? (
          <Text fontSize="sm" color="fg.subtle">
            {description}
          </Text>
        ) : null}
      </Stack>
      {children}
    </Stack>
  );
}
