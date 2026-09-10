'use client';

import { Box, Flex } from '@chakra-ui/react';
import type { Product } from '@vinyl-order/shared';
import Autoplay from 'embla-carousel-autoplay';
import Fade from 'embla-carousel-fade';
import useEmblaCarousel from 'embla-carousel-react';
import { useEffect, useMemo } from 'react';

import Controls from './_components/controls';
import Slide from './_components/slide';
import { type CarouselApi, useCarouselControls } from './_hooks/use-carousel-controls';

export type { CarouselApi };

/** Dwell time per slide before advancing. */
const DEFAULT_DELAY_MS = 6000;

/**
 * Hero carousel, built on Embla.
 *
 * Embla is headless — it owns gestures, looping and timing while the markup and
 * styling stay ours. The Fade plugin replaces the default translate with an
 * opacity cross-fade, so every panel occupies the same box and the section
 * never changes height as it rotates.
 *
 * Autoplay starts disabled and is switched on only after mount, once the motion
 * preference is known: starting it during render and stopping it afterwards
 * would animate briefly for someone who asked it not to.
 *
 * @param slides - featured products in display order
 * @param autoplayDelay - ms each slide holds before advancing
 * @param loop - whether the last slide wraps round to the first
 * @param onApiReady - receives Embla's instance API (scrollTo, on, plugins, …)
 *   so a parent can drive the carousel programmatically
 */
const Carousel = ({
  slides,
  autoplayDelay = DEFAULT_DELAY_MS,
  loop = true,
  onApiReady,
}: {
  slides: Product[];
  autoplayDelay?: number;
  loop?: boolean;
  onApiReady?: (api: CarouselApi) => void;
}) => {
  // Plugin instances need a stable identity — a fresh array each render would
  // make Embla re-initialise on every pass.
  const plugins = useMemo(
    () => [
      Autoplay({
        delay: autoplayDelay,
        playOnInit: false,
        // The plugin handles pausing while the pointer or focus is inside.
        // `stopOnInteraction: false` lets it resume afterwards rather than
        // stopping permanently on the first arrow click.
        stopOnMouseEnter: true,
        stopOnFocusIn: true,
        stopOnInteraction: false,
      }),
      Fade(),
    ],
    [autoplayDelay],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop }, plugins);
  const controls = useCarouselControls(emblaApi);

  useEffect(() => {
    if (emblaApi) onApiReady?.(emblaApi);
  }, [emblaApi, onApiReady]);

  useEffect(() => {
    if (!emblaApi) return undefined;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const autoplay = emblaApi.plugins().autoplay;
      if (!autoplay) return;
      if (query.matches) autoplay.stop();
      else autoplay.play();
    };
    sync();
    query.addEventListener('change', sync);

    return () => query.removeEventListener('change', sync);
  }, [emblaApi]);

  return (
    <Box
      position="relative"
      borderRadius="panel"
      overflow="hidden"
      bg="ink.950"
      h={{ base: '400px', md: '520px' }}
      aria-roledescription="carousel"
    >
      <Box ref={emblaRef} h="full" overflow="hidden">
        <Flex h="full">
          {slides.map((product, i) => (
            <Box
              key={product.id}
              position="relative"
              flex="0 0 100%"
              minW="0"
              h="full"
              // Every slide stays mounted for the cross-fade, so the ones not
              // showing have to leave the accessibility tree.
              aria-hidden={i !== controls.selectedIndex}
            >
              <Slide product={product} eager={i === 0} index={i} total={slides.length} />
            </Box>
          ))}
        </Flex>
      </Box>

      {slides.length > 1 ? (
        <Controls
          scrollSnaps={controls.scrollSnaps}
          selectedIndex={controls.selectedIndex}
          canScrollPrev={controls.canScrollPrev}
          canScrollNext={controls.canScrollNext}
          onDotClick={controls.onDotClick}
          onPrevClick={controls.onPrevClick}
          onNextClick={controls.onNextClick}
        />
      ) : null}
    </Box>
  );
};

export default Carousel;
