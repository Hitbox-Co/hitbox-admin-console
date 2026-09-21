import { AuthAside } from "@/components/layout/auth-aside";
import { SignInForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string }>;
}) {
  // An invitation for an address that already has an account lands here.
  const { __clerk_ticket: ticket } = await searchParams;

  return (
    <AuthAside
      title={ticket ? "Accept your invitation" : "Operations console"}
      subtitle={
        ticket
          ? "You already have an account. Confirming the invitation signs you in."
          : "Orders, finance, drops, provenance and access control — scoped to what your role actually covers."
      }
    >
      <SignInForm ticket={ticket} />
    </AuthAside>
  );
}
