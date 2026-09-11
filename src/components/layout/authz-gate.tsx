"use client";

import * as React from "react";
import { AuthzBootstrapScreen, LoadingScreen } from "@/components/ui/loading-screen";
import { ErrorState } from "@/components/ui/states";
import { useAuthz } from "./authz-provider";

/**
 * Holds the console back until the caller's permissions have resolved.
 *
 * Rendering the shell first and filling it in afterwards would flash a
 * navigation the operator is not entitled to, which is worse than a brief
 * wait — the menu is a statement about what they can do.
 */
export function AuthzGate({ children }: { children: React.ReactNode }) {
  const { loading, error, me, refetch } = useAuthz();

  if (loading) return <AuthzBootstrapScreen />;

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center px-6">
        <div className="w-full max-w-[420px] rounded-[16px] border border-[var(--hairline)] bg-[var(--surface-1)]">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      </div>
    );
  }

  // A resolved-but-absent identity is a transient state between the session
  // landing and the first fetch settling; keep the loading surface rather
  // than flashing an empty shell.
  if (!me) return <LoadingScreen label="Preparing your console" />;

  return <>{children}</>;
}
