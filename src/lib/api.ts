import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface GeneratePlanPayload {
  origin_country: string;
  destination_country: string;
  current_role: string;
  target_role: string;
  salary_expectation: number;
  salary_currency: string;
  timeline_months: number;
  work_authorisation_constraint: string;
}

export interface SavePlanPayload {
  title?: string;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
}



export const auth = {
  register: (email: string, password: string) =>
    api.post<{ data: { user: { id: string; email: string }; access_token: string } }>('/auth/register', { email, password }),
  login: (email: string, password: string) =>
    api.post<{ data: { user: { id: string; email: string }; access_token: string } }>('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ data: { id: string; email: string } }>('/auth/me'),
};


export const plans = {
  generate: (payload: GeneratePlanPayload) => api.post('/plans/generate', payload),
  save: (payload: SavePlanPayload) => api.post('/plans', payload),
  list: () => api.get('/plans'),
  get: (id: string) => api.get(`/plans/${id}`),
  delete: (id: string) => api.delete(`/plans/${id}`),
};

export const destinations = {
  list: () => api.get('/destinations'),
  roles: (slug: string) => api.get(`/destinations/${slug}/roles`),
};