import { create } from 'zustand';

export interface User {
  id: number;
  name: string;
  student_id: string | null;
  email: string;
  role: string;
  no_show_count: number;
  rfid_id?: string | null;
  department?: string | null;
  display_id?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isBanned: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  hydrate: () => void;
  setBanned: (banned: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isBanned: false,

  signIn: (token: string, user: User) => {
    try {
      console.log('🔐 Auth Store: Saving token and user...');
      localStorage.setItem('userToken', token);
      localStorage.setItem('userData', JSON.stringify(user));
      console.log('✅ Auth Store: Setting token and user to state');
      set({ token, user, isLoading: false });
    } catch (e) {
      console.error('❌ Error saving auth data', e);
    }
  },

  signOut: () => {
    try {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userData');
      set({ token: null, user: null, isLoading: false });
      console.log('🔒 Signed out');
    } catch (e) {
      console.error('Error clearing auth data', e);
    }
  },

  hydrate: () => {
    try {
      console.log('💧 Auth Store: Hydrating from localStorage...');
      const token = localStorage.getItem('userToken');
      const userDataString = localStorage.getItem('userData');
      console.log('🔍 Retrieved:', { hasToken: !!token, hasUserData: !!userDataString });
      if (token && userDataString) {
        const userData: User = JSON.parse(userDataString);
        console.log('✅ Auth Store: Setting hydrated state, user:', userData.email);
        set({ token, user: userData, isLoading: false });
      } else {
        console.log('⚠️ Auth Store: No credentials found');
        set({ isLoading: false });
      }
    } catch (e) {
      console.error('❌ Error hydrating auth state', e);
      set({ isLoading: false });
    }
  },

  setBanned: (banned: boolean) => {
    if (banned) {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userData');
    }
    set({ isBanned: banned });
  },
}));
