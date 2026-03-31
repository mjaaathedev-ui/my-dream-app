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
  const fetchingProfile = useRef(false);
  const initialized = useRef(false);

  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    if (fetchingProfile.current) return null;
    fetchingProfile.current = true;
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // PGRST116 = no row found - profile trigger may not have fired yet
        if (error.code === 'PGRST116') {
          console.log('[Auth] No profile row yet, retrying in 1s...');
          await new Promise(r => setTimeout(r, 1000));
          const retry = await supabase
            .from('users_profile')
            .select('*')
            .eq('user_id', userId)
            .single();
          if (!retry.error && retry.data) {
            setProfile(retry.data as UserProfile);
            return retry.data as UserProfile;
          }
          // Still no profile — set null so routing doesn't hang forever
          setProfile(null);
          return null;
        }
        console.error('[Auth] fetchProfile error:', error.message);
        setProfile(null);
        return null;
      }

      if (data) {
        setProfile(data as UserProfile);
        return data as UserProfile;
      }
      return null;
    } finally {
      fetchingProfile.current = false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      fetchingProfile.current = false;
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let mounted = true;

    // Check if this is an OAuth callback — tokens appear in hash or search params
    const isOAuthCallback =
      window.location.hash.includes('access_token') ||
      window.location.hash.includes('error') ||
      window.location.search.includes('code=') ||
      window.location.search.includes('error=');

    console.log('[Auth] Init | isOAuthCallback:', isOAuthCallback, '| hash:', window.location.hash.slice(0, 40), '| search:', window.location.search.slice(0, 40));

    // Subscribe FIRST before getSession so we never miss an event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] Event:', event, '| User:', session?.user?.email ?? 'none');
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED'
        ) {
          if (session?.user) {
            setSession(session);
            setUser(session.user);
            fetchingProfile.current = false;
            await fetchProfile(session.user.id);
          } else {
            // INITIAL_SESSION with no user = definitely logged out
            setProfile(null);
          }
          setLoading(false);
          return;
        }
      }
    );

    // If NOT an OAuth callback, also call getSession as a fallback
    // (handles page refreshes where onAuthStateChange may not fire SIGNED_IN)
    if (!isOAuthCallback) {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        console.log('[Auth] getSession fallback:', session?.user?.email ?? 'no session');
        if (!mounted) return;
        // onAuthStateChange INITIAL_SESSION will also fire — whichever resolves
        // last wins, which is fine since they carry the same session
        if (session?.user && !user) {
          setSession(session);
          setUser(session.user);
          fetchingProfile.current = false;
          await fetchProfile(session.user.id);
          if (mounted) setLoading(false);
        }
      });
    }

    return () => {
      mounted = false;
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