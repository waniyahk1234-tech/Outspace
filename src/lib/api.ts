import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Profile, MentorDetails, Subscription } from '../shared/types';

export interface AuthUser extends Profile {
  email?: string;
  email_verified?: boolean;
  auth_provider?: string;
  mentor_details?: MentorDetails | null;
  subscription?: Subscription | null;
  pending_requests_count?: number;
}

const TOKEN_KEY = 'outspace_session_token';

export function getSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore storage errors in restricted contexts
  }
}

export async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const token = getSessionToken();
  const baseHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  if (token) {
    baseHeaders['Authorization'] = `Bearer ${token}`;
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed') as Error & {
      status?: number;
      code?: string;
      data?: Record<string, unknown>;
    };
    err.status = res.status;
    err.code = data.code;
    err.data = data;
    throw err;
  }
  return data as T;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const data = await apiFetch<{ user: AuthUser | null }>('/api/auth/me');
      setUser(data.user);
      if (!data.user) {
        setSessionToken(null);
      }
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setSessionToken(null);
    setUser(null);
  }, []);

  return React.createElement(AuthContext.Provider, { value: { user, loading, refreshUser, logout } }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}
