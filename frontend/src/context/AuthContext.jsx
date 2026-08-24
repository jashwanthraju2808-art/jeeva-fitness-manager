import { createContext, useContext, useEffect, useState } from "react";
import API from "../api/axios";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const hasToken = !!localStorage.getItem("token");

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(hasToken);

  async function refreshUser() {
    const token = localStorage.getItem("token");

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await API.get("/auth/me");

      setUser({
        id: res.data.id,
        username: res.data.username,
        role: res.data.role,
      });
    } catch (err) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasToken) {
      return;
    }

    let cancelled = false;

    API.get("/auth/me")
      .then((res) => {
        if (!cancelled) {
          setUser({
            id: res.data.id,
            username: res.data.username,
            role: res.data.role,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem("token");
          localStorage.removeItem("username");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = {
    user,
    setUser,
    setLoading,   // exposed so Login can clear loading immediately after setUser
    refreshUser,
    isAdmin: user?.role === "admin",
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    return {
      user: null,
      setUser: () => {},
      setLoading: () => {},
      refreshUser: async () => {},
      isAdmin: false,
      loading: false,
    };
  }

  return ctx;
}