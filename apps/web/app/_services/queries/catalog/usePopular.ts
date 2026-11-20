'use client';

import { useQuery } from '@tanstack/react-query';

import { listPopular } from '@/services/api/catalog/popular';

/** What's popular at the shops — the home page before anything is searched. */
export const usePopular = () =>
  useQuery({ queryKey: ['catalog', 'popular'], queryFn: listPopular });
