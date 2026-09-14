import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Image from 'next/image';
import NextLink from 'next/link';

import { formatPrice } from '@/lib/utils/currency';

import Artwork from './artwork';

/**
 * The slide's decorative layers, behind the content: a blurred wash of the
 * cover, a warm key light, a hairline edge and the ghosted slide numeral.
 *
 * @param imageUrl - cover art for the wash; omitted when the product has none
 * @param index - zero-based position, shown as a ghosted numeral
 */
const Backdrop = ({ imageUrl, index }: { imageUrl: Product['imageUrl']; index: number }) => (
  <>
    {imageUrl ? (
      <Box
        position="absolute"
        inset="0"
        aria-hidden
        opacity="0.22"
        filter="blur(64px) saturate(150%)"
        transform="scale(1.3)"
        maskImage="linear-gradient(to left, black 0%, transparent 62%)"
      >
        <Image src={imageUrl} alt="" fill sizes="100vw" style={{ objectFit: 'cover' }} />
      </Box>
    ) : null}

    {/* Warm key light behind the record. */}
    <Box
      position="absolute"
      inset="0"
      pointerEvents="none"
      backgroundImage="radial-gradient(58% 90% at 22% 50%, rgb(201 135 31 / 24%), transparent 70%)"
    />

    {/* Hairline edge — gives the panel a defined boundary against the page. */}
    <Box
      position="absolute"
      inset="0"
      pointerEvents="none"
      borderWidth="1px"
      borderColor="white/10"
      borderRadius="panel"
    />

    <Text
      position="absolute"
      top={{ base: '4', md: '8' }}
      insetEnd={{ base: '5', md: '10' }}
      aria-hidden
      textStyle="display"
      fontSize={{ base: '5xl', md: '8xl' }}
      lineHeight="1"
      color="white/8"
      userSelect="none"
    >
      {String(index + 1).padStart(2, '0')}
    </Text>
  </>
);

/**
 * One carousel panel: a record half out of its sleeve, beside the release
 * details.
 *
 * The ground is deep and near-black with a single warm glow thrown behind the
 * disc, rather than a full-bleed blur of the cover. A blurred cover fills the
 * panel with whatever muddy average that particular artwork happens to have;
 * confining it to a masked wash on the trailing edge keeps per-slide colour
 * variety while the type side stays clean and legible.
 *
 * The whole panel links to the product page. Fade already turns off pointer
 * events on hidden slides, so a click only reaches the one showing, and Embla
 * swallows the click that ends a swipe.
 *
 * @param product - the featured product
 * @param eager - true only for the slide shown first (the LCP element)
 * @param active - whether this slide is the one showing; hidden slides leave the tab order
 * @param index - zero-based position, shown as a ghosted numeral
 * @param total - number of slides
 */
const Slide = ({
  product,
  eager,
  active,
  index,
  total,
}: {
  product: Product;
  eager: boolean;
  active: boolean;
  index: number;
  total: number;
}) => (
  <Box
    asChild
    position="absolute"
    inset="0"
    overflow="hidden"
    bg="ink.950"
    // Inset so the ring isn't clipped by the carousel's rounded, overflow-hidden frame.
    _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400', outlineOffset: '-4px' }}
  >
    {/* aria-hidden on the wrapper doesn't stop focus, so hidden slides opt out explicitly. */}
    <NextLink href={`/products/${product.id}`} tabIndex={active ? undefined : -1}>
      <Backdrop imageUrl={product.imageUrl} index={index} />

      <Flex
        position="relative"
        h="full"
        align="center"
        gap={{ base: '6', md: '16' }}
        px={{ base: '6', md: '14' }}
        direction={{ base: 'column', md: 'row' }}
        justify="center"
      >
        <Artwork
          imageUrl={product.imageUrl}
          alt={`${product.artist} – ${product.title}`}
          eager={eager}
        />

        <Stack
          gap={{ base: '3', md: '4' }}
          textAlign={{ base: 'center', md: 'start' }}
          align={{ base: 'center', md: 'start' }}
          maxW="lg"
        >
          <Text textStyle="eyebrow" color="brand.300">
            Featured · {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
          </Text>

          <Heading
            as="h2"
            textStyle="display"
            fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
            color="ink.50"
            lineClamp={2}
          >
            {product.artist}
          </Heading>

          <Text
            fontSize={{ base: 'sm', md: 'lg' }}
            color="ink.300"
            lineClamp={2}
            fontWeight="medium"
          >
            {product.title}
          </Text>

          {product.year || product.format[0] ? (
            <Text fontSize="2xs" color="ink.500" letterSpacing="label" textTransform="uppercase">
              {[product.year, product.format[0]].filter(Boolean).join(' · ')}
            </Text>
          ) : null}

          <Box
            mt="1"
            px="4"
            py="1.5"
            borderRadius="full"
            borderWidth="1px"
            borderColor="brand.400/40"
            bg="brand.400/10"
          >
            <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="bold" color="brand.200">
              {formatPrice(product.priceCents, product.currency)}
            </Text>
          </Box>
        </Stack>
      </Flex>
    </NextLink>
  </Box>
);

export default Slide;
