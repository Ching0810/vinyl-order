import { Box } from '@chakra-ui/react';
import Image from 'next/image';

/**
 * A square record cover from an order line's snapshot, or a plain tile when
 * the record had no image.
 *
 * @param src - the snapshotted image URL
 * @param size - rendered edge length, as a Chakra size token
 * @param px - the same edge length in pixels, for the image `sizes` hint
 */
const Cover = ({
  src,
  size,
  px,
}: {
  src: string | null;
  size: string | Record<string, string>;
  px: number;
}) => (
  <Box
    position="relative"
    boxSize={size}
    flexShrink="0"
    borderRadius="md"
    overflow="hidden"
    bg="bg.muted"
  >
    {src ? <Image src={src} alt="" fill sizes={`${px}px`} style={{ objectFit: 'cover' }} /> : null}
  </Box>
);

export default Cover;
