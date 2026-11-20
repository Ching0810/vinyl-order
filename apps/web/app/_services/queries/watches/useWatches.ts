'use client';

import { useQuery } from '@tanstack/react-query';

import { listWatches } from '@/services/api/watches/list';
import { watchesQueryKey } from '@/services/queries/watches/useTrackListing';

/**
 * The versions the signed-in user tracks.
 *
 * @param enabled - false when no one is signed in: the list is theirs alone
 */
export const useWatches = ({ enabled }: { enabled: boolean }) =>
  useQuery({ queryKey: watchesQueryKey, queryFn: listWatches, enabled });
