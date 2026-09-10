'use client';

import { Button, Flex, HStack, IconButton } from '@chakra-ui/react';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons';

/**
 * Carousel navigation: a dot per scroll snap plus previous/next arrows,
 * overlaid on the panel. Purely a view over Embla's API — the parent owns the
 * instance and passes the handlers down.
 *
 * Dots are driven by `scrollSnaps`, not the slide count, because those differ
 * once more than one slide is shown at a time.
 *
 * @param scrollSnaps - Embla's scroll snap list; one dot per entry
 * @param selectedIndex - snap currently shown
 * @param canScrollPrev - false at the start when looping is off
 * @param canScrollNext - false at the end when looping is off
 */
const Controls = ({
  scrollSnaps,
  selectedIndex,
  canScrollPrev,
  canScrollNext,
  onDotClick,
  onPrevClick,
  onNextClick,
}: {
  scrollSnaps: number[];
  selectedIndex: number;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  onDotClick: (index: number) => void;
  onPrevClick: () => void;
  onNextClick: () => void;
}) => (
  <Flex
    position="absolute"
    insetX={{ base: '4', md: '8' }}
    bottom={{ base: '4', md: '6' }}
    align="center"
    justify="space-between"
    gap="4"
  >
    <HStack gap="2">
      {scrollSnaps.map((snap, i) => (
        <Button
          key={snap}
          aria-label={`Go to slide ${i + 1}`}
          aria-current={i === selectedIndex}
          onClick={() => onDotClick(i)}
          unstyled
          w={i === selectedIndex ? '6' : '2'}
          h="2"
          minW="0"
          p="0"
          borderRadius="full"
          bg={i === selectedIndex ? 'brand.400' : 'white/50'}
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
        disabled={!canScrollPrev}
        onClick={onPrevClick}
      >
        <ChevronLeftIcon />
      </IconButton>
      <IconButton
        aria-label="Next slide"
        size="sm"
        variant="subtle"
        borderRadius="full"
        disabled={!canScrollNext}
        onClick={onNextClick}
      >
        <ChevronRightIcon />
      </IconButton>
    </HStack>
  </Flex>
);

export default Controls;
