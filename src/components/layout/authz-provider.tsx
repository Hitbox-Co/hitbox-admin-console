"use client";

import * as React from "react";
import { useAuthzMe } from "@/lib/api/hooks";
import { Permissions } from "@/lib/authz";
import type { AuthzMe } from "@/lib/types";

interface AuthzContextValue {
  me: AuthzMe | undefined;
  perms: Permissions;
  loading: boolean;
  error: unknown;
  refetch: () => void;
}

const AuthzContext = React.createContext<AuthzContextValue>({
  me: undefined,
  perms: new Permissions([]),
  loading: true,
  error: null,
  refetch: () => {},
});

/**
 * Loads the caller's effective permissions once and shares them.
 *
 * Everything downstream - navigation, section visibility, action buttons -
 * reads from here. No component consults a role name.
 */
export function AuthzProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error, refetch } = useAuthzMe();

  const value = React.useMemo<AuthzContextValue>(
    () => ({
      me: data,
      perms: new Permissions(data?.permissions ?? []),
      loading: isLoading,
      error,
      refetch: () => void refetch(),
    }),
    [data, isLoading, error, refetch]
  );

  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
}

export function useAuthz() {
  return React.useContext(AuthzContext);
}

/** Convenience: just the permission helper. */
export function usePermissions(): Permissions {
  return React.useContext(AuthzContext).perms;
}
