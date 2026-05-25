"use client";

import React, { createContext, useContext, useState } from "react";

interface UserProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface UserContextValue {
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => void;
}

const UserContext = createContext<UserContextValue>({
  profile: null,
  setProfile: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  return (
    <UserContext.Provider value={{ profile, setProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
