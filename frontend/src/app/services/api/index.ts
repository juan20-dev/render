import { authApi } from './auth.api';
import { adminApi } from './admin.api';
import { catalogApi } from './catalog.api';
import { salesApi } from './sales.api';

export const api = {
  ...authApi,
  ...adminApi,
  ...catalogApi,
  ...salesApi,
};
