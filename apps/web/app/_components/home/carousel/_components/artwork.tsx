import { Box } from '@chakra-ui/react';
import Image from 'next/image';

/** Sleeve edge length; the disc matches it and sits offset behind. */
const SLEEVE = { base: '160px', md: '260px' };
/** Wide enough for the sleeve plus the part of the disc that shows. */
const ASSEMBLY_W = { base: '235px', md: '385px' };
/** How far the disc is pushed out from behind the sleeve. */
const DISC_OFFSET = { base: '75px', md: '125px' };

/**
 * Grooved black vinyl. Three stacked layers: fine concentric rings, a conic
 * sheen that reads as light travelling across the surface as it turns, and a
 * dark radial base.
 */
const DISC_SURFACE = [
  'repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 5%) 0 1px, transparent 1px 4px)',
  'conic-gradient(from 0deg, rgb(255 255 255 / 11%), transparent 25%, rgb(255 255 255 / 7%) 50%, transparent 75%, rgb(255 255 255 / 11%))',
  'radial-gradient(circle at 50% 50%, #2b2b2b 0%, #0e0e0e 62%, #050505 100%)',
].join(', ');

/**
 * A record half out of its sleeve: the disc turning slowly behind, the sleeve
 * in front. The cover does double duty as the disc's centre label, which is
 * what makes one image enough to build the whole composition.
 *
 * Rotation stops under `prefers-reduced-motion` — it is decorative, and a
 * permanently spinning element is precisely what that preference exists for.
 *
 * @param imageUrl - cover art, or null to render empty frames
 * @param alt - describes the sleeve; the disc label repeats it so is decorative
 * @param eager - true only for the slide shown first (the LCP element)
 */
const Artwork = ({
  imageUrl,
  alt,
  eager,
}: {
  imageUrl: string | null;
  alt: string;
  eager: boolean;
}) => (
  <Box position="relative" w={ASSEMBLY_W} h={SLEEVE} flexShrink="0">
    <Box
      position="absolute"
      insetStart={DISC_OFFSET}
      top="0"
      boxSize={SLEEVE}
      borderRadius="full"
      backgroundImage={DISC_SURFACE}
      boxShadow="0 18px 40px -12px rgb(0 0 0 / 70%)"
      animation="spin 26s linear infinite"
      css={{ '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
    >
      {imageUrl ? (
        <Box position="absolute" inset="34%" borderRadius="full" overflow="hidden">
          <Image src={imageUrl} alt="" fill sizes="120px" style={{ objectFit: 'cover' }} />
        </Box>
      ) : null}
      {/* Spindle hole. */}
      <Box
        position="absolute"
        inset="48%"
        borderRadius="full"
        bg="ink.950"
        boxShadow="inset 0 0 2px rgb(0 0 0 / 90%)"
      />
    </Box>

    <Box
      position="absolute"
      insetStart="0"
      top="0"
      boxSize={SLEEVE}
      borderRadius="2px"
      overflow="hidden"
      bg="ink.900"
      boxShadow="0 22px 50px -14px rgb(0 0 0 / 85%)"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          sizes="(max-width: 48rem) 160px, 260px"
          style={{ objectFit: 'cover' }}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
        />
      ) : null}
    </Box>
  </Box>
);

export default Artwork;
