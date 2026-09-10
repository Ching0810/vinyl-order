import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';

import { formatPrice } from '@/lib/utils/currency';

/**
 * One carousel panel, built around square cover art rather than a wide banner.
 *
 * A record only has its sleeve, and stretching a square into a full-bleed panel
 * crops or letterboxes it. So the sleeve is shown at its native ratio beside the
 * release details, with a blurred, scaled copy behind as ambient colour — that
 * fills the panel without distorting the artwork. Both layers share one `src`,
 * so it costs a single request.
 *
 * Only the first slide loads eagerly: it is the page's Largest Contentful Paint
 * element, while the rest are off-screen until the carousel advances.
 *
 * @param product - the featured product
 * @param eager - true only for the slide shown first
 */
const Slide = ({ product, eager }: { product: Product; eager: boolean }) => (
  <Box position="absolute" inset="0" overflow="hidden">
    {product.imageUrl ? (
      <Box
        position="absolute"
        inset="0"
        aria-hidden
        opacity="0.35"
        transform="scale(1.2)"
        filter="blur(48px)"
      >
        <Image src={product.imageUrl} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} />
      </Box>
    ) : null}

    {/* Contrast floor: cover art is arbitrary, so the copy can't rely on it. */}
    <Box
      position="absolute"
      inset="0"
      backgroundImage="linear-gradient(90deg, rgb(16 14 13 / 92%) 0%, rgb(16 14 13 / 70%) 55%, rgb(16 14 13 / 45%) 100%)"
    />

    <Flex
      position="relative"
      h="full"
      align="center"
      gap={{ base: '6', md: '12' }}
      px={{ base: '6', md: '16' }}
      direction={{ base: 'column', md: 'row' }}
      justify={{ base: 'center', md: 'flex-start' }}
    >
      <Box
        position="relative"
        flexShrink="0"
        boxSize={{ base: '150px', md: '280px' }}
        borderRadius="card"
        overflow="hidden"
        boxShadow="lift"
        bg="ink.900"
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={`${product.artist} – ${product.title}`}
            fill
            sizes="(max-width: 48rem) 150px, 280px"
            style={{ objectFit: 'cover' }}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
          />
        ) : null}
      </Box>

      <Stack gap={{ base: '2', md: '3' }} textAlign={{ base: 'center', md: 'start' }} maxW="xl">
        <Text textStyle="eyebrow" color="brand.300">
          Featured
        </Text>

        <Heading
          as="h2"
          textStyle="display"
          fontSize={{ base: '2xl', md: '4xl', lg: '5xl' }}
          color="ink.50"
          lineClamp={2}
        >
          {product.artist}
        </Heading>

        <Text fontSize={{ base: 'sm', md: 'xl' }} color="ink.300" lineClamp={2}>
          {product.title}
        </Text>

        {product.year || product.format[0] ? (
          <Text
            fontSize="2xs"
            color="ink.400"
            letterSpacing="label"
            textTransform="uppercase"
            display={{ base: 'none', md: 'block' }}
          >
            {[product.year, product.format[0]].filter(Boolean).join(' · ')}
          </Text>
        ) : null}

        <Text fontSize={{ base: 'lg', md: '2xl' }} fontWeight="bold" color="ink.50" pt="1">
          {formatPrice(product.priceCents, product.currency)}
        </Text>
      </Stack>
    </Flex>
  </Box>
);

export default Slide;
