import { http } from '@/lib/core/http';

/** POST /notifications/read — mark all the user's notifications read. */
export const markNotificationsRead = (): Promise<void> => http.post<void>('/notifications/read');
