import { AuthAside } from "@/components/layout/auth-aside";
import { SignUpForm } from "@/components/auth/auth-form";

export const metadata = { title: "Request access" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string }>;
}) {
  // Clerk's invitation mail links back with the ticket in the query string.
  const { __clerk_ticket: ticket } = await searchParams;

  return (
    <AuthAside
      title={ticket ? "Accept your invitation" : "Request access"}
      subtitle={
        ticket
          ? "Your invitation is waiting. Finish setting up the account it was sent to."
          : "Create your account, then an administrator grants the roles that decide what you can see."
      }
    >
      <SignUpForm ticket={ticket} />
    </AuthAside>
  );
}
