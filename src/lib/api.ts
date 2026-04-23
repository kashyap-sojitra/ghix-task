import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});


export const auth = {
  register: (email: string, password: string) =>
    api.post<{ data: { user: { id: string; email: string }; access_token: string } }>('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    api.post<{ data: { user: { id: string; email: string }; access_token: string } }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ data: { id: string; email: string } }>('/auth/me'),
};


