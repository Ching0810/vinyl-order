import { Box } from '@chakra-ui/react';
import Image from 'next/image';
/**
 * A square record cover beside an order line — the demo store's snapshot, or
 * a supplier order's imported cover — or a plain tile when there is none.
 *
 * @param src - the image URL, on a host next.config.ts allows
 * @param size - rendered edge length, as a Chakra size token
 * @param px - the same edge length in pixels, for the image `sizes` hint
 * @param radius - corner rounding, to match the surface it sits on
 */
export default function Cover({
  src,
  size,
  px,
  radius = 'md',
}: {
  src: string | null;
  size: string | Record<string, string>;
  px: number;
  radius?: string;
}) {
  return (
    <Box
      position="relative"
      boxSize={size}
      flexShrink="0"
      borderRadius={radius}
      overflow="hidden"
      bg="bg.muted"
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${px}px`} style={{ objectFit: 'cover' }} />
      ) : null}
    </Box>
  );
}
