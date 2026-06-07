import { http } from '@/lib/core/http';

/**
 * POST /admin/uploads — admin-only image upload. Wraps the file in FormData
 * under the `file` field (matches the API's FileInterceptor('file')) and returns
 * the public URL to store on Product.imageUrl.
 */
export const uploadImage = (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  return http.postForm<{ url: string }>('/admin/uploads', form);
};
