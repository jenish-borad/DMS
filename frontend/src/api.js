// In dev: VITE_API_BASE_URL is empty → Vite proxy handles /api → localhost:3000
// In prod: VITE_API_BASE_URL=https://your-backend.onrender.com → direct backend call
const API_BASE = `${import.meta.env.VITE_API_BASE_URL || ''}/api/v1`;

/**
 * Helper to make API requests with credentials: 'include' (for httpOnly cookies)
 * and generic error handling.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  
  // Set default credentials to 'include' for secure cookie transport
  options.credentials = 'include';
  
  // Prepare headers
  const headers = options.headers || {};
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  options.headers = headers;

  try {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = (result && result.message) || `Request failed with status ${response.status}`;
      const errors = (result && result.errors) || [];
      const error = new Error(errorMsg);
      error.status = response.status;
      error.errors = errors;
      throw error;
    }

    return result;
  } catch (error) {
    if (!error.status) {
      // Network error or fetch failed
      error.message = 'Unable to connect to the server. Please check your network.';
    }
    throw error;
  }
}

export const api = {
  // Authentication
  auth: {
    register: (username, email, fullName, password) => {
      return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, fullName, password }),
      });
    },
    login: (usernameOrEmail, password) => {
      // Backend expects username OR email
      const body = usernameOrEmail.includes('@')
        ? { email: usernameOrEmail, password }
        : { username: usernameOrEmail, password };
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    logout: () => {
      return request('/auth/logout', {
        method: 'POST',
      });
    },
    me: () => {
      return request('/auth/me', {
        method: 'GET',
      });
    },
  },

  // Documents
  documents: {
    create: (formDataOrJson) => {
      const isFormData = formDataOrJson instanceof FormData;
      return request('/documents', {
        method: 'POST',
        body: isFormData ? formDataOrJson : JSON.stringify(formDataOrJson),
      });
    },
    list: (params = {}) => {
      const query = new URLSearchParams();
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);
      if (params.tags) query.append('tags', params.tags);
      if (params.isPublic !== undefined) query.append('isPublic', params.isPublic);
      
      const queryString = query.toString() ? `?${query.toString()}` : '';
      return request(`/documents${queryString}`, {
        method: 'GET',
      });
    },
    get: (id) => {
      return request(`/documents/${id}`, {
        method: 'GET',
      });
    },
    update: (id, updates) => {
      return request(`/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
    },
    delete: (id) => {
      return request(`/documents/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // Search (Central feature)
  search: {
    query: (params = {}) => {
      const query = new URLSearchParams();
      // Normalize q — trim and collapse whitespace so "react  dev " === "react dev"
      if (params.q) {
        const normalized = params.q.trim().replace(/\s+/g, ' ');
        if (normalized) query.append('q', normalized);
      }
      if (params.tags) query.append('tags', params.tags);
      if (params.dateFrom) query.append('dateFrom', params.dateFrom);
      if (params.dateTo) query.append('dateTo', params.dateTo);
      if (params.page) query.append('page', params.page);
      if (params.limit) query.append('limit', params.limit);
      if (params.myDocs !== undefined) query.append('myDocs', params.myDocs);
      // matchMode: "whole" (default) | "partial"
      if (params.matchMode) query.append('matchMode', params.matchMode);

      return request(`/search?${query.toString()}`, {
        method: 'GET',
      });
    },
  },
};
