import axios, { AxiosInstance } from 'axios';

const VITE_API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL;

const getBaseURL = (): string => {
  if (VITE_API_BASE_URL) return VITE_API_BASE_URL;
  return '/api';
};

export const API_URL = getBaseURL();

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error fetching token from localStorage', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 && error.response?.data?.error === 'BANNED') {
      console.warn('User is BANNED, setting global banned state');
      try {
        import('../store/authStore').then(({ useAuthStore }) => {
          useAuthStore.getState().setBanned(true);
        });
      } catch (e) {
        console.error(e);
      }
    } else if (error.response?.status === 401) {
      console.warn('Unauthorized (401) received, clearing auth state');
      try {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userData');
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register') && !window.location.pathname.startsWith('/forgot-password') && !window.location.pathname.startsWith('/reset-password')) {
          window.location.href = '/login';
        }
      } catch (e) {
        console.error(e);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
