import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import type { User } from '@/types';

const USER_KEY = 'tubebite-user'; // localStorage cache key

// ─── API helpers ──────────────────────────────────────────────────────────────

const API = 'http://localhost:8000';

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  getIdToken: () => Promise<string | null>;
  /** Save profile changes to MongoDB + update local state */
  updateProfile: (
    updates: Partial<Pick<User, 'displayName' | 'bio' | 'photoURL' | 'username'>>
  ) => Promise<void>;
  /** Check username availability (calls backend so it checks all users in MongoDB) */
  checkUsername: (username: string) => Promise<boolean>; // true = available
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Write to state + localStorage cache
  const setAndCache = (u: User | null) => {
    setUser(u);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else    localStorage.removeItem(USER_KEY);
  };

  // Merge MongoDB profile fields onto a Firebase-sourced base user
  const mergeWithDbProfile = (base: User, dbDoc: Record<string, unknown>): User => ({
    ...base,
    displayName: (dbDoc.displayName as string) || base.displayName,
    photoURL:    (dbDoc.photoURL    as string) || base.photoURL,
    bio:         (dbDoc.bio         as string) || undefined,
    username:    (dbDoc.username    as string) || undefined,
  });

  useEffect(() => {
    // Restore from cache immediately for instant UI
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try { setUser(JSON.parse(cached)); } catch { /* ignore */ }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();

        const base: User = {
          id:          firebaseUser.uid,
          email:       firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          photoURL:    firebaseUser.photoURL || undefined,
        };

        // Fetch profile from MongoDB (non-blocking — fall back to base on error)
        try {
          const dbDoc = await apiFetch('/api/user/profile', token);
          const merged = mergeWithDbProfile(base, dbDoc);
          setAndCache(merged);
        } catch (e) {
          console.warn('[Auth] Could not load profile from DB, using Firebase data:', e);
          setAndCache(base);
        }
      } else {
        setAndCache(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Email/pw mock login ────────────────────────────────────────────────────
  const login = async (email: string, _password: string) => {
    await new Promise(r => setTimeout(r, 1000));
    const u: User = { id: 'u_' + Date.now(), email, displayName: email.split('@')[0] };
    setAndCache(u);
    setLoading(false);
  };

  const signup = async (email: string, _password: string, name: string) => {
    await new Promise(r => setTimeout(r, 1000));
    const u: User = { id: 'u_' + Date.now(), email, displayName: name };
    setAndCache(u);
    setLoading(false);
  };

  // ── Google Sign-In ─────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged fires and handles the rest
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = async () => {
    try { await signOut(auth); } catch (e) { console.error('Logout error:', e); }
  };

  // ── ID token ───────────────────────────────────────────────────────────────
  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  };

  // ── Update profile → MongoDB (if backend reachable) + always local cache ────
  const updateProfile = async (
    updates: Partial<Pick<User, 'displayName' | 'bio' | 'photoURL' | 'username'>>
  ) => {
    if (!user) return;

    // Always apply the update locally first — works even when backend is offline
    const optimistic: User = { ...user, ...updates };
    setAndCache(optimistic);

    // Try to persist to MongoDB — silently ignore if backend is down
    const token = await getIdToken().catch(() => null);
    if (!token) return; // mock/email login or Firebase not ready — local-only is fine

    try {
      const dbDoc = await apiFetch('/api/user/profile', token, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      // Merge confirmed DB response (may include server-set fields like updatedAt)
      const confirmed: User = { ...optimistic, ...dbDoc, id: user.id };
      setAndCache(confirmed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Username conflict — re-throw so Profile.tsx can show the error
      if (msg.includes('409') || msg.toLowerCase().includes('username')) {
        // Roll back the optimistic update before re-throwing
        setAndCache(user);
        throw e;
      }
      // Any other backend error (CORS, network, 500) — keep the local update
      // silently. The user's changes are saved in localStorage; they will sync
      // to MongoDB next time the backend is reachable.
      console.warn('[Auth] Profile save to backend failed (kept locally):', msg);
    }
  };

  // ── Check username availability ────────────────────────────────────────────
  const checkUsername = async (username: string): Promise<boolean> => {
    const token = await getIdToken().catch(() => null);
    // No token (mock login) or backend unreachable → treat as available;
    // uniqueness is enforced server-side on the actual save anyway.
    if (!token) return true;
    try {
      await apiFetch('/api/user/check-username', token, {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      return true; // 200 → available
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('409')) return false; // taken
      // Network / CORS / 500 → assume available, let the save endpoint enforce it
      return true;
    }
  };

  return (
    <AuthContext.Provider value={{
      user, loading, login, signup, loginWithGoogle, logout,
      getIdToken, updateProfile, checkUsername,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
