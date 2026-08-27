import axios from 'axios';

const TOKEN_KEY = 'pp_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Login failures (wrong password = 401, pending/rejected account = 403) must
// surface on the login form, not bounce the user away from it. Every other
// 401/403 means the stored token is dead (expired, or the account was
// deactivated mid-session) — clear it and send the user to log in again.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginRequest = error.config?.url?.includes('/auth/login');

    if ((status === 401 || status === 403) && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export { TOKEN_KEY };
export default api;
