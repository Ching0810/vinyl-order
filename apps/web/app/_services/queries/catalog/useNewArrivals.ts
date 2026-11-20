'use client';

import { useQuery } from '@tanstack/react-query';

import { listNewArrivals } from '@/services/api/catalog/new-arrivals';

/** The shops' new arrivals — the home page for someone not signed in. */
export const useNewArrivals = () =>
  useQuery({ queryKey: ['catalog', 'new'], queryFn: listNewArrivals });
