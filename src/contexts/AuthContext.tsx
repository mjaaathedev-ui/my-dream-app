import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      console.log('[Auth] Fetching profile for', userId);
      const { data, error } = await supabase
        .from('users_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('[Auth] No profile row yet, retrying in 1s...');
          await new Promise(r => setTimeout(r, 1000));
          const retry = await supabase
            .from('users_profile')
            .select('*')
            .eq('user_id', userId)
            .single();
          if (!retry.error && retry.data) {
            return retry.data as UserProfile;
          }
          return null;
        }
        console.error('[Auth] fetchProfile error:', error.message);
        return null;
      }

      return (data as UserProfile) ?? null;
    } catch (err) {
      console.error('[Auth] fetchProfile exception:', err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let mounted = true;

    console.log('[Auth] Init');

    // Safety timeout - never stay on loading spinner forever
    const safetyTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[Auth] Safety timeout hit - forcing loading=false');
        setLoading(false);
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, sess) => {
        console.log('[Auth] Event:', event, '| User:', sess?.user?.email ?? 'none');
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (sess) {
            setSession(sess);
            setUser(sess.user);
          }
          return;
        }

        // SIGNED_IN, INITIAL_SESSION, USER_UPDATED
        if (sess?.user) {
          setSession(sess);
          setUser(sess.user);
          // Use setTimeout to avoid Supabase deadlock with auth state listener
          setTimeout(async () => {
            if (!mounted) return;
            const p = await fetchProfile(sess.user.id);
            if (mounted) {
              setProfile(p);
              setLoading(false);
            }
          }, 0);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
