import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  /** True when the user has a row in public.realestate_user_profile (Real Estate suite). */
  isRealEstateUser: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isRealEstateUser: false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRealEstateUser, setIsRealEstateUser] = useState(false);
  const roleCheckVersionRef = useRef(0);

  const loadAccessFlags = async (userId: string) => {
    const [rolesRes, reRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("realestate_user_profile").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    const admin = rolesRes.data?.some((r: any) => r.role === "admin") ?? false;
    const reUser = !!reRes.data;
    setIsAdmin(admin);
    setIsRealEstateUser(reUser);
    return { admin, isRealEstateUser: reUser };
  };

  useEffect(() => {
    let mounted = true;
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setIsAdmin(false);
        setIsRealEstateUser(false);
        setLoading(false);
        return;
      }
      const checkVersion = ++roleCheckVersionRef.current;
      setLoading(true);
      void loadAccessFlags(nextSession.user.id)
        .catch(() => {
          if (mounted && roleCheckVersionRef.current === checkVersion) {
            setIsAdmin(false);
            setIsRealEstateUser(false);
          }
        })
        .finally(() => {
          if (mounted && roleCheckVersionRef.current === checkVersion) setLoading(false);
        });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        applySession(session);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsRealEstateUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isAdmin, isRealEstateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
