"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authErrorMessage,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  signUp,
} from "@/lib/auth";

type Mode = "signin" | "signup" | "confirm";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [pendingEmail, setPendingEmail] = useState("");
  const [notice, setNotice] = useState<string>();
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string>();

  useEffect(() => {
    document.title = "sign in · engram";
  }, []);

  function switchMode(next: Mode) {
    setNotice(undefined);
    setResendError(undefined);
    setMode(next);
  }

  const [signInError, signInAction, signingIn] = useActionState<
    string | undefined,
    FormData
  >(async (_prev, fd) => {
    const email = String(fd.get("email"));
    try {
      await signIn({
        username: email,
        password: String(fd.get("password")),
      });
      router.replace("/");
      return undefined;
    } catch (e) {
      // Signed up but never confirmed: don't dead-end — reopen the confirm step.
      if (
        e &&
        typeof e === "object" &&
        "name" in e &&
        (e as { name: string }).name === "UserNotConfirmedException"
      ) {
        setPendingEmail(email);
        setMode("confirm");
        try {
          await resendSignUpCode({ username: email });
          setNotice(`we sent a fresh code to ${email}`);
        } catch {
          setNotice(`enter the code we emailed to ${email}`);
        }
        return undefined;
      }
      return authErrorMessage(e, "Sign-in failed");
    }
  }, undefined);

  const [signUpError, signUpAction, signingUp] = useActionState<
    string | undefined,
    FormData
  >(async (_prev, fd) => {
    const email = String(fd.get("email"));
    try {
      await signUp({
        username: email,
        password: String(fd.get("password")),
        options: { userAttributes: { email } },
      });
      setPendingEmail(email);
      setNotice(undefined);
      setMode("confirm");
      return undefined;
    } catch (e) {
      return authErrorMessage(e, "Sign-up failed");
    }
  }, undefined);

  const [confirmError, confirmAction, confirming] = useActionState<
    string | undefined,
    FormData
  >(async (_prev, fd) => {
    try {
      await confirmSignUp({
        username: pendingEmail,
        confirmationCode: String(fd.get("code")).trim(),
      });
      setNotice("Account confirmed. Sign in below.");
      setMode("signin");
      return undefined;
    } catch (e) {
      return authErrorMessage(e, "Confirmation failed");
    }
  }, undefined);

  async function resend() {
    setResending(true);
    setResendError(undefined);
    try {
      await resendSignUpCode({ username: pendingEmail });
      setNotice(`a fresh code is on its way to ${pendingEmail}`);
    } catch (e) {
      setNotice(undefined);
      setResendError(authErrorMessage(e, "Couldn't resend the code"));
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="container">
      <header className="masthead">
        <h1>
          en<em>gram</em>
        </h1>
        <p className="tagline">
          turn anything you read into memories that stick
        </p>
      </header>

      <div className="auth-card">
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {mode === "signin" && (
          <form action={signInAction} className="auth-form">
            <h2>Sign in</h2>
            <label>
              email
              <input
                type="email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                required
              />
            </label>
            <label>
              password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button type="submit" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
            {signInError && (
              <p className="error" role="alert">
                {signInError}
              </p>
            )}
            <p className="auth-toggle">
              No account?{" "}
              <button type="button" onClick={() => switchMode("signup")}>
                sign up
              </button>
            </p>
          </form>
        )}

        {mode === "signup" && (
          <form action={signUpAction} className="auth-form">
            <h2>Sign up</h2>
            <label>
              email
              <input
                type="email"
                name="email"
                autoComplete="email"
                spellCheck={false}
                required
              />
            </label>
            <label>
              password (10+ characters)
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            <button type="submit" disabled={signingUp}>
              {signingUp ? "Creating…" : "Create account"}
            </button>
            {signUpError && (
              <p className="error" role="alert">
                {signUpError}
              </p>
            )}
            <p className="auth-toggle">
              Have an account?{" "}
              <button type="button" onClick={() => switchMode("signin")}>
                sign in
              </button>
            </p>
          </form>
        )}

        {mode === "confirm" && (
          <form action={confirmAction} className="auth-form">
            <h2>Check your email</h2>
            <p className="hint">we sent a code to {pendingEmail}</p>
            <label>
              confirmation code
              <input
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            <button type="submit" disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm"}
            </button>
            {confirmError && (
              <p className="error" role="alert">
                {confirmError}
              </p>
            )}
            {resendError && (
              <p className="error" role="alert">
                {resendError}
              </p>
            )}
            <p className="auth-toggle">
              Code never arrived?{" "}
              <button type="button" onClick={resend} disabled={resending}>
                {resending ? "sending…" : "resend code"}
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
