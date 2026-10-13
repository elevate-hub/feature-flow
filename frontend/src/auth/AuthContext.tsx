import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, type LoginPayload, type User } from "../api/client";

const TOKEN_KEY = "featureflow.access-token";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (credentials: LoginPayload) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    api
      .me(token)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) signOut();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [signOut]);

  const signIn = useCallback(async (credentials: LoginPayload) => {
    const { access_token: token } = await api.login(credentials);
    sessionStorage.setItem(TOKEN_KEY, token);
    try {
      const currentUser = await api.me(token);
      setUser(currentUser);
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
