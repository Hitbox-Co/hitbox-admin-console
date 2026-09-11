"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { ArrowRight, Eye, EyeOff, Info, KeyRound, Mail, ShieldAlert } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/primitives";

/**
 * First-party email + password sign-in.
 *
 * Clerk's drop-in <SignIn /> panel is deliberately not used — these are our
 * own fields, our own layout, our own copy. Clerk remains the identity
 * provider through its headless hooks, so no password is ever handled or
 * stored by this app.
 *
 * The form ADAPTS to the instance. Password is only a valid first factor if
 * the Clerk instance enables it; this one currently exposes `email_code`
 * only, so submitting a password would fail no matter what it was. Rather
 * than dead-end, the form asks Clerk which first factors the identifier
 * actually supports and takes that route — and picks password back up
 * automatically the moment it is switched on in the Clerk dashboard.
 *
 * This Clerk build (7.9.x) ships the signals API: `useSignIn()` returns
 * `{ signIn, errors, fetchStatus }`, methods RESOLVE with `{ error }`
 * rather than throwing, and `finalize()` activates the session.
 * See node_modules/@clerk/shared/dist/types/signInFuture.d.ts
 */

const AFTER_AUTH = "/dashboard";

/** A FieldError carries both a terse and a long message; prefer the long one. */
function fieldText(err: { message: string; longMessage?: string } | null | undefined) {
  if (!err) return undefined;
  return err.longMessage ?? err.message;
}

function Notice({
  tone = "danger",
  icon: Icon = ShieldAlert,
  children,
}: {
  tone?: "danger" | "info";
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  if (!children) return null;
  const styles =
    tone === "danger"
      ? "border-[rgba(204,92,92,0.25)] bg-[var(--danger-dim)] text-[var(--danger)]"
      : "border-[var(--hairline-strong)] bg-[var(--surface-2)] text-[var(--text-2)]";
  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={`flex items-start gap-2 rounded-[8px] border px-3 py-2.5 text-[12px] leading-relaxed ${styles}`}
    >
      <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoComplete: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-10 pr-9 text-[14px]"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-1.5 text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/** States this form deliberately does not collect a factor for. */
const SIGN_IN_BLOCKED: Partial<Record<string, string>> = {
  needs_second_factor:
    "This account has two-factor authentication enabled. Complete the second step from your authenticator app, then sign in again.",
  needs_new_password:
    "This password has expired and must be reset before you can sign in.",
  needs_client_trust:
    "This device needs to be verified before it can sign in. Check your email for a verification request.",
  needs_protect_check:
    "An additional security check is required before this sign-in can finish.",
};

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

type Step = "credentials" | "code";

export function SignInForm() {
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [step, setStep] = React.useState<Step>("credentials");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  /** Null until Clerk tells us; then remembered for the rest of the visit. */
  const [passwordAllowed, setPasswordAllowed] = React.useState<boolean | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const busy = submitting || fetchStatus === "fetching";
  const emailError = fieldText(errors.fields.identifier);
  const passwordError = fieldText(errors.fields.password);
  const codeError = fieldText(errors.fields.code);

  const complete = async () => {
    await signIn.finalize({ navigate: () => router.push(AFTER_AUTH) });
  };

  const sendCode = async () => {
    const { error } = await signIn.emailCode.sendCode();
    if (error) {
      setFormError(error.longMessage ?? error.message);
      return false;
    }
    setStep("code");
    return true;
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setFormError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      // Establish the sign-in first so Clerk can tell us which first
      // factors this identifier actually supports on this instance.
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) {
        if (!errors.fields.identifier) {
          setFormError(created.error.longMessage ?? created.error.message);
        }
        return;
      }

      const supportsPassword = signIn.supportedFirstFactors.some(
        (f) => f.strategy === "password"
      );
      setPasswordAllowed(supportsPassword);

      if (supportsPassword) {
        if (!password) {
          // We could not know a password was needed until Clerk answered.
          setFormError("Enter your password to continue.");
          return;
        }
        const { error } = await signIn.password({
          identifier: email.trim(),
          password,
        });
        if (error) {
          if (!errors.fields.password && !errors.fields.identifier) {
            setFormError(error.longMessage ?? error.message);
          }
          return;
        }
      } else {
        // Password is not a sign-in factor on this instance. Say so plainly
        // and fall through to the one-time code.
        const supportsEmailCode = signIn.supportedFirstFactors.some(
          (f) => f.strategy === "email_code"
        );
        if (!supportsEmailCode) {
          setFormError(
            "This Clerk instance has no sign-in method this form can use. Enable Password or Email code in the Clerk dashboard."
          );
          return;
        }
        setNotice(
          "This workspace signs in with a one-time email code, not a password. We just sent you one."
        );
        await sendCode();
        return;
      }

      if (signIn.status === "complete") {
        await complete();
        return;
      }
      setFormError(
        SIGN_IN_BLOCKED[signIn.status] ??
          `This account needs an extra step to finish signing in (${signIn.status}).`
      );
    } catch {
      setFormError("Could not reach the identity service. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setFormError(null);
    setSubmitting(true);

    try {
      const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
      if (error) {
        if (!errors.fields.code) {
          setFormError(error.longMessage ?? error.message);
        }
        return;
      }

      if (signIn.status === "complete") {
        await complete();
        return;
      }
      setFormError(
        SIGN_IN_BLOCKED[signIn.status] ??
          `This account needs an extra step to finish signing in (${signIn.status}).`
      );
    } catch {
      setFormError("Could not reach the identity service. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "code") {
    return (
      <form onSubmit={submitCode} className="space-y-4" noValidate>
        <Notice>{formError ?? errors.global?.[0]?.longMessage}</Notice>
        {notice ? (
          <Notice tone="info" icon={Mail}>
            {notice}
          </Notice>
        ) : null}

        <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          Enter the six-digit code sent to{" "}
          <span className="font-medium text-[var(--text-1)]">{email}</span>.
        </p>

        <Field label="Sign-in code" htmlFor="signin-code" error={codeError}>
          <Input
            id="signin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            invalid={!!codeError}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            className="tnum h-10 text-center font-mono text-[18px] tracking-[0.3em]"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full text-[14px]"
          disabled={code.length < 6}
          loading={busy}
        >
          {busy ? "Verifying" : "Verify and continue"}
        </Button>

        <div className="flex items-center justify-between gap-3 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCode("");
              setStep("credentials");
            }}
            className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="space-y-4" noValidate>
      <Notice>{formError ?? errors.global?.[0]?.longMessage}</Notice>

      <Field label="Work email" htmlFor="email" error={emailError}>
        <Input
          id="email"
          type="email"
          value={email}
          invalid={!!emailError}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@hitbox.com"
          autoFocus
          className="h-10 text-[14px]"
        />
      </Field>

      {/* Once Clerk has told us password is not a first factor, stop asking
          for one — a field that cannot work is worse than no field. */}
      {passwordAllowed === false ? (
        <Notice tone="info" icon={Info}>
          This workspace is configured for one-time email codes. Continue and
          we&rsquo;ll send you one. To sign in with a password instead, enable
          Password as a sign-in factor in the Clerk dashboard.
        </Notice>
      ) : (
        <Field label="Password" htmlFor="password" error={passwordError}>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            invalid={!!passwordError}
            autoComplete="current-password"
            placeholder="••••••••••"
          />
        </Field>
      )}

      {/*
        Only the email is required to submit. Whether a password is even a
        valid factor is something the instance decides, and we cannot know it
        until Clerk has answered — so blocking the button on a password the
        instance may not accept would dead-end the form.
      */}
      <Button
        type="submit"
        variant="primary"
        className="h-10 w-full text-[14px]"
        disabled={!email}
        loading={busy}
      >
        {busy
          ? "Checking"
          : passwordAllowed === false
            ? "Send sign-in code"
            : "Continue"}
        {!busy ? <ArrowRight className="h-4 w-4" /> : null}
      </Button>

      <p className="pt-1 text-center text-[12px] text-[var(--text-3)]">
        No account yet?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-[var(--accent-text)] underline-offset-2 transition-colors hover:text-[var(--text-1)] hover:underline"
        >
          Request access
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Sign up                                                             */
/* ------------------------------------------------------------------ */

export function SignUpForm() {
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [stage, setStage] = React.useState<"details" | "verify">("details");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const busy = submitting || fetchStatus === "fetching";
  const emailError = fieldText(errors.fields.emailAddress);
  const passwordError = fieldText(errors.fields.password);
  const codeError = fieldText(errors.fields.code);

  const finish = async () => {
    if (signUp.status === "complete") {
      await signUp.finalize({ navigate: () => router.push(AFTER_AUTH) });
      return true;
    }
    return false;
  };

  const startSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setFormError(null);
    setSubmitting(true);

    try {
      const created = await signUp.password({
        emailAddress: email.trim(),
        password,
      });
      if (created.error) {
        if (!errors.fields.emailAddress && !errors.fields.password) {
          setFormError(created.error.longMessage ?? created.error.message);
        }
        return;
      }

      if (await finish()) return;

      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setFormError(sent.error.longMessage ?? sent.error.message);
        return;
      }
      setStage("verify");
    } catch {
      setFormError("Could not reach the identity service. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setFormError(null);
    setSubmitting(true);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: code.trim(),
      });
      if (error) {
        if (!errors.fields.code) {
          setFormError(error.longMessage ?? error.message);
        }
        return;
      }

      if (await finish()) return;

      setFormError(
        `Your account still needs something before it can be used (${signUp.status}).`
      );
    } catch {
      setFormError("Could not reach the identity service. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "verify") {
    return (
      <form onSubmit={verify} className="space-y-4" noValidate>
        <Notice>{formError ?? errors.global?.[0]?.longMessage}</Notice>

        <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          We sent a six-digit code to{" "}
          <span className="font-medium text-[var(--text-1)]">{email}</span>.
        </p>

        <Field label="Verification code" htmlFor="code" error={codeError}>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            invalid={!!codeError}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
            className="tnum h-10 text-center font-mono text-[18px] tracking-[0.3em]"
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full text-[14px]"
          disabled={code.length < 6}
          loading={busy}
        >
          {busy ? "Verifying" : "Verify and continue"}
        </Button>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setStage("details");
          }}
          className="w-full text-center text-[12px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={startSignUp} className="space-y-4" noValidate>
      <Notice>{formError ?? errors.global?.[0]?.longMessage}</Notice>

      <Field label="Work email" htmlFor="signup-email" error={emailError}>
        <Input
          id="signup-email"
          type="email"
          value={email}
          invalid={!!emailError}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@hitbox.com"
          autoFocus
          className="h-10 text-[14px]"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="signup-password"
        error={passwordError}
        hint="At least 8 characters. Clerk rejects passwords found in known breaches."
      >
        <PasswordInput
          id="signup-password"
          value={password}
          onChange={setPassword}
          invalid={!!passwordError}
          autoComplete="new-password"
          placeholder="••••••••••"
        />
      </Field>

      {/* Bot protection is on for this instance. Clerk mounts its widget
          here; without this element it cannot render a challenge. */}
      <div id="clerk-captcha" />

      <Button
        type="submit"
        variant="primary"
        className="h-10 w-full text-[14px]"
        disabled={!email || password.length < 8}
        loading={busy}
      >
        {busy ? "Creating account" : "Create account"}
        {!busy ? <ArrowRight className="h-4 w-4" /> : null}
      </Button>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--text-3)]">
        <KeyRound className="mt-[2px] h-3 w-3 shrink-0" aria-hidden />
        Creating an account does not grant access. An administrator assigns the
        roles that decide what you can see.
      </p>

      <p className="pt-1 text-center text-[12px] text-[var(--text-3)]">
        Already have access?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-[var(--accent-text)] underline-offset-2 transition-colors hover:text-[var(--text-1)] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
