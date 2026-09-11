import { AuthAside } from "@/components/layout/auth-aside";
import { SignInForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthAside
      title="Operations console"
      subtitle="Orders, finance, drops, provenance and access control — scoped to what your role actually covers."
    >
      <SignInForm />
    </AuthAside>
  );
}
