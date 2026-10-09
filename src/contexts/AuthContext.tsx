import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import offlineDataManager from '@/lib/offlineDataManager';

type UserRole = 'admin' | 'operator' | 'super_admin' | 'logistics_admin' | 'logistics_manager' | 'observer' | 'procurement_officer' | 'storekeeper' | 'garage_manager' | 'finance' | 'mechanic' | 'cashier' | 'procurement_cashier' | 'audit_clerk' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole;
  userProfile: { full_name: string; username: string } | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (username: string, password: string, fullName: string, role: UserRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to log activity
const logActivity = async (userId: string, userName: string, role: string, action: string, details?: string) => {
  try {
    await supabase.from("activity_logs").insert([{
      user_id: userId,
      user_name: userName,
      user_role: role as "admin" | "operator",
      action,
      details: details || null,
    }]);
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Read cached auth data synchronously on initial render for instant zero-lag page load
  const cachedAuth = (() => {
    try {
      return offlineDataManager.getCachedData('user_auth');
    } catch {
      return null;
    }
  })();

  const [user, setUser] = useState<User | null>(() => {
    if (cachedAuth) {
      return cachedAuth.user || { id: cachedAuth.userId, email: cachedAuth.email } as any;
    }
    return null;
  });
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(() => (cachedAuth?.role as UserRole) || null);
  const [userProfile, setUserProfile] = useState<{ full_name: string; username: string } | null>(() => {
    if (cachedAuth) {
      return { full_name: cachedAuth.fullName || '', username: cachedAuth.username || '' };
    }
    return null;
  });
  // If we already have a cached user, we do NOT block the page render!
  const [loading, setLoading] = useState<boolean>(() => !cachedAuth);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchUserRole = async (userId: string): Promise<UserRole> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setUserRole(data.role as UserRole);
      return data.role as UserRole;
    }
    return null;
  };

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setUserProfile(data);
      return data;
    }
    return null;
  };

  useEffect(() => {
    let hasLoggedIn = false;
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');

        // Set up auth state listener - MUST be synchronous
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;

            console.log('🔔 Auth state changed:', event, session ? 'Session exists' : 'No session');

            // If online, use Supabase session
            if (navigator.onLine) {
              setSession(session);
              setUser(session?.user ?? null);

              // Fetch role and profile asynchronously without blocking
              if (session?.user) {
                setTimeout(() => {
                  Promise.all([
                    fetchUserRole(session.user.id),
                    fetchUserProfile(session.user.id)
                  ]).then(([role, profile]) => {
                    // Log login activity only on SIGNED_IN event
                    if (event === 'SIGNED_IN' && role && profile && !hasLoggedIn) {
                      hasLoggedIn = true;
                      logActivity(session.user.id, profile.full_name, role, "login", "User logged in");
                    }
                  });
                }, 0);
              } else {
                setUserRole(null);
                setUserProfile(null);
                hasLoggedIn = false;
              }
            } else {
              // If offline, check for cached auth data
              const cachedAuth = offlineDataManager.getCachedData('user_auth');
              if (cachedAuth) {
                setUser(cachedAuth.user || { id: cachedAuth.userId, email: cachedAuth.email });
                setUserRole(cachedAuth.role);
                setUserProfile({ full_name: cachedAuth.fullName, username: cachedAuth.username });
              }
            }
          }
        );

        console.log('📡 Auth listener registered');

        // Check for existing session
        console.log('🔍 Checking for existing session...');

        const hasLiveSupabase = Boolean(
          (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL.trim() !== '') ||
          (supabase as any)?.supabaseUrl
        );

        if (navigator.onLine && hasLiveSupabase) {
          // Race getSession with a 5 second timeout
          const { data, error } = await Promise.race([
            supabase.auth.getSession(),
            new Promise<{ data: { session: null }; error: { message: string } | null }>(resolve =>
              setTimeout(() => resolve({ data: { session: null }, error: { message: "Auth timeout" } }), 5000)
            )
          ]);

          const session = data?.session;
          console.log('✅ Session check complete:', session ? 'Session found' : (error?.message || 'No session'));

          if (!mounted) return;

          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            // Fetch role and profile in parallel for faster initial load
            try {
              const results = await Promise.race([
                Promise.all([
                  fetchUserRole(session.user.id),
                  fetchUserProfile(session.user.id)
                ]),
                new Promise(resolve => setTimeout(resolve, 3000))
              ]) as any;

              if (Array.isArray(results)) {
                const [role, profile] = results;
                offlineDataManager.cacheCriticalData('user_auth', {
                  userId: session.user.id,
                  email: session.user.email,
                  role: role,
                  fullName: profile?.full_name || '',
                  username: profile?.username || '',
                  user: session.user
                });
              }
            } catch (e) {
              console.error("Profile fetch timeout or error:", e);
            }
          }
        } else {
          // Check for cached auth data (offline or demo mode)
          const cachedAuth = offlineDataManager.getCachedData('user_auth');
          if (cachedAuth) {
            setUser(cachedAuth.user || { id: cachedAuth.userId, email: cachedAuth.email });
            setUserRole(cachedAuth.role);
            setUserProfile({ full_name: cachedAuth.fullName, username: cachedAuth.username });
          }
        }

        return subscription;
      } catch (error) {
        console.error("❌ Error initializing auth:", error);
        return null;
      } finally {
        if (mounted) {
          console.log('✨ Auth initialization complete, setting loading to false');
          setLoading(false);
        }
      }
    };

    let subscription: any;
    initAuth().then((sub) => {
      subscription = sub;
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      const hasLiveSupabase = Boolean(
        (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_URL.trim() !== '') ||
        (supabase as any)?.supabaseUrl
      );

      // If online and Supabase is configured, use Supabase auth
      if (navigator.onLine && hasLiveSupabase) {
        // Convert username to email format for Supabase Auth
        const trimmedUsername = username.trim().toLowerCase();
        const email = trimmedUsername.includes('@')
          ? trimmedUsername
          : `${trimmedUsername}@weighbridge.local`;

        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email,
          password: password.trim(),
        });

        if (error) throw error;

        // Cache the user authentication data for offline use
        if (authData?.user) {
          const profile = await fetchUserProfile(authData.user.id);
          const role = await fetchUserRole(authData.user.id);

          const authCacheData = {
            userId: authData.user.id,
            email: authData.user.email,
            username,
            password,
            fullName: profile?.full_name || username,
            role,
            user: authData.user
          };

          offlineDataManager.cacheCriticalData('user_auth', authCacheData);

          toast({
            title: "Welcome back!",
            description: "You have successfully signed in.",
          });

          if (role === 'super_admin') {
            navigate('/admin/dashboard');
          } else if (role === 'cashier' || role === 'procurement_cashier') {
            navigate('/procurement/cashier-portal');
          } else {
            navigate('/');
          }
          return { error: null };
        }

        navigate('/');
        return { error: null };
      } else {
        // Fallback / Demo / Offline mode
        const role: UserRole = (username.toLowerCase().includes('super') || username.toLowerCase() === 'sokutonsuper')
          ? 'super_admin'
          : username.toLowerCase().includes('cashier')
          ? 'procurement_cashier'
          : username.toLowerCase().includes('operator')
          ? 'operator'
          : 'admin';

        const mockUser: any = {
          id: 'demo-user-id',
          email: `${username.toLowerCase()}@weighbridge.local`,
          app_metadata: {},
          user_metadata: { full_name: username, username },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        };

        const authCacheData = {
          userId: mockUser.id,
          email: mockUser.email,
          username,
          password,
          fullName: username,
          role,
          user: mockUser
        };

        offlineDataManager.cacheCriticalData('user_auth', authCacheData);
        setUser(mockUser);
        setUserRole(role);
        setUserProfile({ full_name: username, username });

        toast({
          title: "Welcome back! (Offline/Demo Mode)",
          description: `Signed in as ${username} (${role}).`,
        });

        if (role === 'super_admin') {
          navigate('/admin/dashboard');
        } else if (role === 'procurement_cashier') {
          navigate('/procurement/cashier-portal');
        } else {
          navigate('/');
        }
        return { error: null };
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const signUp = async (username: string, password: string, fullName: string, role: UserRole) => {
    try {
      // Convert username to email format for Supabase Auth
      const email = `${username.toLowerCase()}@weighbridge.local`;
      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            username: username.toLowerCase(),
          },
        },
      });

      if (error) throw error;

      // Insert user role
      if (data.user && role) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: data.user.id, role: role as any });

        if (roleError) throw roleError;
      }

      toast({
        title: "Account created!",
        description: "User can now sign in with username and password.",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "User creation failed",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };



  // System Bootstrap: Auto-create Super Admin
  const bootstrapSuperAdmin = async () => {
    if (!import.meta.env.VITE_SUPABASE_URL) return;
    try {
      const email = "sokutonsuper@weighbridge.local";
      const password = "1234567890"; // As provided by user

      console.log("🚀 Bootstrapping Super Admin...");

      // 1. Try to sign up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: "Sokuton Super Admin",
            username: "SokutonSuper",
          },
        },
      });

      if (error) {
        // If user already exists, we just want to ensure they have the role
        if (error.message.includes("already registered")) {
          console.log("ℹ️ Super Admin already exists, checking role...");
          // We can't get ID easily without login, but we assume if they exist, we set role manually via DB if needed
          // or user logs in. 
          return;
        }
        console.warn("⚠️ Bootstrap Sign Up Error:", error.message);
        return;
      }

      // 2. Assign Role if new user created
      if (data.user) {
        console.log("✅ Super Admin User Created:", data.user.id);
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({ user_id: data.user.id, role: 'super_admin' as any });

        if (roleError) console.error("❌ Failed to assign Super Admin role:", roleError);
        else console.log("🎉 Super Admin Role Assigned!");
      }

    } catch (err) {
      console.error("Bootstrap failed:", err);
    }
  };

  // Run bootstrap once on mount
  useEffect(() => {
    const hasBootstrapped = localStorage.getItem('sokuton_bootstrap_v2');
    if (!hasBootstrapped) {
      bootstrapSuperAdmin().then(() => {
        localStorage.setItem('sokuton_bootstrap_v2', 'true');
      });
    }
  }, []);

  const signOut = async () => {
    if (user && userProfile && userRole) {
      await logActivity(user.id, userProfile.full_name, userRole, "logout", "User logged out");
    }

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUserProfile(null);
    navigate('/auth');
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        userProfile,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
