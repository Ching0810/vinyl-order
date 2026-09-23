'use client';

import type { UseEmblaCarouselType } from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Embla's instance API. Taken from the hook's own tuple rather than imported
 * from `embla-carousel`, which is only a transitive dependency here and so
 * doesn't resolve under pnpm's strict layout.
 */
export type CarouselApi = NonNullable<UseEmblaCarouselType[1]>;

export interface CarouselControls {
  selectedIndex: number;
  /** One entry per reachable position — the source of truth for dot count. */
  scrollSnaps: number[];
  canScrollPrev: boolean;
  canScrollNext: boolean;
  onDotClick: (index: number) => void;
  onPrevClick: () => void;
  onNextClick: () => void;
}

/**
 * Control state for an Embla carousel, following Embla's recommended
 * arrows-and-dots pattern (their `useDotButton` and `usePrevNextButtons`,
 * combined here because a single Controls component renders both).
 *
 * Two details from that pattern matter and are easy to miss:
 *
 * - Dots come from `scrollSnapList()`, not the slide count. The two coincide at
 *   one slide per view but diverge as soon as `slidesToScroll` or `containScroll`
 *   is set, at which point a dot-per-slide would over-count.
 * - A manual navigation resets the autoplay timer. Without it, advancing by hand
 *   just before the timer elapses means the chosen slide is swept away almost
 *   immediately. Which of reset/stop applies depends on `stopOnInteraction`.
 */
export const useCarouselControls = (emblaApi: CarouselApi | undefined): CarouselControls => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const resetAutoplay = useCallback(() => {
    const autoplay = emblaApi?.plugins().autoplay;
    if (!autoplay) return;
    if (autoplay.options.stopOnInteraction === false) autoplay.reset();
    else autoplay.stop();
  }, [emblaApi]);

  const onDotClick = useCallback(
    (index: number) => {
      if (!emblaApi) return;
      emblaApi.scrollTo(index);
      resetAutoplay();
    },
    [emblaApi, resetAutoplay],
  );

  const onPrevClick = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollPrev();
    resetAutoplay();
  }, [emblaApi, resetAutoplay]);

  const onNextClick = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollNext();
    resetAutoplay();
  }, [emblaApi, resetAutoplay]);

  useEffect(() => {
    if (!emblaApi) return undefined;

    const sync = () => {
      setSelectedIndex(emblaApi.selectedScrollSnap());
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };
    const syncSnaps = () => setScrollSnaps(emblaApi.scrollSnapList());

    syncSnaps();
    sync();
    // `reInit` fires on resize and option changes, when the snap list itself
    // can change — so both handlers listen for it.
    emblaApi.on('select', sync).on('reInit', sync).on('reInit', syncSnaps);

    return () => {
      emblaApi.off('select', sync).off('reInit', sync).off('reInit', syncSnaps);
    };
  }, [emblaApi]);

  return {
    selectedIndex,
    scrollSnaps,
    canScrollPrev,
    canScrollNext,
    onDotClick,
    onPrevClick,
    onNextClick,
  };
};
