import { AuthAside } from "@/components/layout/auth-aside";
import { SignUpForm } from "@/components/auth/auth-form";

export const metadata = { title: "Request access" };

export default function SignUpPage() {
  return (
    <AuthAside
      title="Request access"
      subtitle="Create your account, then an administrator grants the roles that decide what you can see."
    >
      <SignUpForm />
    </AuthAside>
  );
}
