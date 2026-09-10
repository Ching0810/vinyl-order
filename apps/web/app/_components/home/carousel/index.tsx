'use client';

import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import { useEffect, useState } from 'react';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';

import Slide from './_components/slide';

/** Dwell time per slide before advancing. */
const ROTATE_MS = 6000;

/**
 * Hero carousel. Slides are stacked and cross-faded rather than translated, so
 * every panel occupies the same box and the section never changes height as it
 * rotates.
 *
 * Autoplay stops while the pointer or keyboard focus is inside the carousel, so
 * it can't move out from under someone reading or tabbing through it, and never
 * starts at all when the visitor has asked for reduced motion.
 *
 * @param slides - featured products, already in display order
 */
const Carousel = ({ slides }: { slides: Product[] }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (paused || reduceMotion || slides.length < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion, slides.length]);

  const go = (next: number) => setIndex((next + slides.length) % slides.length);

  return (
    <Box
      position="relative"
      overflow="hidden"
      borderRadius="panel"
      bg="ink.950"
      h={{ base: '400px', md: '520px' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((slide, i) => (
        <Box
          key={slide.id}
          position="absolute"
          inset="0"
          opacity={i === index ? 1 : 0}
          transition="opacity 0.6s ease"
          // Hidden slides stay in the DOM for the cross-fade, so they must be
          // taken out of the accessibility tree and the tab order.
          aria-hidden={i !== index}
          pointerEvents={i === index ? 'auto' : 'none'}
        >
          <Slide product={slide} eager={i === 0} />
        </Box>
      ))}

      {slides.length > 1 ? (
        <Flex
          position="absolute"
          insetX={{ base: '4', md: '8' }}
          bottom={{ base: '4', md: '6' }}
          align="center"
          justify="space-between"
          gap="4"
        >
          <HStack gap="2">
            {slides.map((slide, i) => (
              <Button
                key={slide.id}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                unstyled
                w={i === index ? '6' : '2'}
                h="2"
                minW="0"
                p="0"
                borderRadius="full"
                bg={i === index ? 'brand.400' : 'white/50'}
                transition="width 0.3s ease, background 0.3s ease"
                cursor="pointer"
              />
            ))}
          </HStack>

          <HStack gap="2">
            <IconButton
              aria-label="Previous slide"
              size="sm"
              variant="subtle"
              borderRadius="full"
              onClick={() => go(index - 1)}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              aria-label="Next slide"
              size="sm"
              variant="subtle"
              borderRadius="full"
              onClick={() => go(index + 1)}
            >
              <ChevronRightIcon />
            </IconButton>
          </HStack>
        </Flex>
      ) : null}
    </Box>
  );
};

export default Carousel;
