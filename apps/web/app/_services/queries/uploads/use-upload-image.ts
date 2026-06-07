'use client';

import { useMutation } from '@tanstack/react-query';

import { uploadImage } from '@/services/api/uploads';

/** Image-upload mutation. `mutateAsync(file)` resolves to `{ url }`. */
export const useUploadImage = () =>
  useMutation({
    mutationFn: uploadImage,
  });
