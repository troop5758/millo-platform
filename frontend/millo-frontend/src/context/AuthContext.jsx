import { createContext, useContext, useState } from "react";
import { request } from "../api/client";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  async function login(email, password) {
    const res = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (res.token) {
      localStorage.setItem("token", res.token);
      setUser(res.user);
    }

    return res;
  }

  async function register(email, password) {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
