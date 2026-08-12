import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type User = {
  user_id: string | number;
  username: string;
  firstname?: string | null;
  lastname?: string | null;
  permissions: number;
  branch_id?: string | number | null;
  branch_name?: string | null;
  branch_code?: string | null;
};

type UserContextType = {
  user: User | null;
  isLoggedIn: boolean;
  login: (userData: User, token: string) => void;
  syncSessionUser: (userData: User) => void;
  clearSession: () => void;
  logout: () => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => !!localStorage.getItem('token'));

  const login = useCallback((userData: User, token: string) => {
    setUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
  }, []);

  const syncSessionUser = useCallback((userData: User) => {
    setUser(userData);
    setIsLoggedIn(true);
    localStorage.setItem('user', JSON.stringify(userData));
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }, []);

  const logout = useCallback(() => {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.replace('/');
    }
  }, [clearSession]);

  const contextValue = useMemo(
    () => ({ user, isLoggedIn, login, syncSessionUser, clearSession, logout }),
    [user, isLoggedIn, login, syncSessionUser, clearSession, logout]
  );

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
