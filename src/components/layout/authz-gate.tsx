"use client";

import * as React from "react";
import { useClerk } from "@clerk/nextjs";
import { Clock, ShieldOff } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { AuthzBootstrapScreen, LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/primitives";
import { ErrorState } from "@/components/ui/states";
import { useAuthz } from "./authz-provider";

/**
 * Holds the console back until the caller's permissions have resolved.
 *
 * Rendering the shell first and filling it in afterwards would flash a
 * navigation the operator is not entitled to, which is worse than a brief
 * wait — the menu is a statement about what they can do.
 *
 * Two error codes from the requireAuth pipeline (authentication.md §3) get
 * their own screen rather than the generic error state:
 *
 *  - AUTH_ACCOUNT_NOT_FOUND: the Clerk session is valid but the
 *    user.created webhook hasn't landed yet (a real race on first sign-up).
 *    "In practice it resolves in well under a second" — show a calm waiting
 *    state, not a red failure, and never poll in a tight loop.
 *  - AUTH_ACCOUNT_SUSPENDED: terminal. There is nothing to retry; offer
 *    sign-out and a support contact.
 */
export function AuthzGate({ children }: { children: React.ReactNode }) {
  const { loading, error, me, refetch } = useAuthz();
  const { signOut } = useClerk();

  if (loading) return <AuthzBootstrapScreen />;

  if (error instanceof ApiError && error.code === "AUTH_ACCOUNT_NOT_FOUND") {
    return <ProvisioningScreen onRetry={refetch} />;
  }

  if (error instanceof ApiError && error.code === "AUTH_ACCOUNT_SUSPENDED") {
    return <SuspendedScreen onSignOut={() => signOut()} />;
  }

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

function ProvisioningScreen({ onRetry }: { onRetry: () => void }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Docs: "resolves in well under a second" normally — a bounded, spaced
  // retry rather than a tight loop. If it's still not there after a while,
  // stop guessing and let the operator retry by hand.
  React.useEffect(() => {
    if (elapsed > 0 && elapsed % 4 === 0 && elapsed <= 12) onRetry();
  }, [elapsed, onRetry]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-1)]">
        <Clock className="h-5 w-5 text-[var(--warning)]" />
      </span>
      <div>
        <p className="text-[14px] font-medium text-[var(--text-1)]">
          Setting up your account
        </p>
        <p className="mt-1.5 max-w-[360px] text-[12.5px] leading-relaxed text-[var(--text-3)]">
          Your sign-in worked, but HitBox hasn&rsquo;t finished linking your
          account yet. This normally takes a couple of seconds.
        </p>
      </div>
      {elapsed > 12 ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function SuspendedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)]">
        <ShieldOff className="h-5 w-5 text-[var(--danger)]" />
      </span>
      <div>
        <p className="text-[14px] font-medium text-[var(--text-1)]">
          This account has been suspended
        </p>
        <p className="mt-1.5 max-w-[360px] text-[12.5px] leading-relaxed text-[var(--text-3)]">
          Contact a HitBox administrator if you believe this is a mistake.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}
