import { AuthzProvider } from "@/components/layout/authz-provider";
import { AuthzGate } from "@/components/layout/authz-gate";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthzProvider>
      {/* Nothing can render until /authz/me answers — the navigation itself
          is derived from it. */}
      <AuthzGate>
        <AppShell>{children}</AppShell>
      </AuthzGate>
    </AuthzProvider>
  );
}
