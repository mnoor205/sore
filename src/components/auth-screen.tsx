"use client";
import Brand from "./brand";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BookOpen, Check, Loader2 } from "lucide-react";
export default function AuthScreen({
  signup = false,
  developmentMode = false,
  accessReady = false,
  loginUrl = "",
  brandedEmail = false,
}: {
  signup?: boolean;
  developmentMode?: boolean;
  accessReady?: boolean;
  loginUrl?: string;
  brandedEmail?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [emailLoginUrl, setEmailLoginUrl] = useState(loginUrl);
  useEffect(() => {
    if (!loginUrl) return;
    const target = new URL(loginUrl);
    const returnTo = new URLSearchParams(window.location.search).get(
      "redirect_url",
    );
    if (returnTo) target.searchParams.set("next", returnTo);
    setEmailLoginUrl(target.href);
  }, [loginUrl]);
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false);
  async function emailSubmit(event: FormEvent, resend = false) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const returnTo =
        new URLSearchParams(window.location.search).get("redirect_url") ||
        (signup ? "/onboarding" : "/dashboard");
      const r = await fetch("/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sent && !resend
            ? { action: "verify", code }
            : { action: "request", email, returnTo },
        ),
      });
      const data = (await r.json()) as { error?: string; url?: string };
      if (!r.ok) throw new Error(data.error || "Please try again.");
      if (data.url) window.location.assign(data.url);
      else {
        setSent(true);
        setCode("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enter(workspace: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/dev/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });
      const data = (await r.json()) as { error?: string; url: string };
      if (!r.ok) throw new Error(data.error);
      const dest = new URLSearchParams(window.location.search).get(
        "redirect_url",
      );
      window.location.href =
        dest && dest.startsWith(window.location.origin + "/") ? dest : data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Brand />
        <div>
          <span className="eyebrow">A HOME FOR WHAT YOU KNOW</span>
          <h1>
            Turn what you know
            <br />
            into your next sale.
          </h1>
          <p>
            Make a little space for your expertise.
            <br />
            We’ll take care of the storefront.
          </p>
        </div>
        <span>Built around your next chapter.</span>
      </aside>
      <main className="auth-content">
        <div className="auth-card">
          <div className="icon-square lavender">
            <BookOpen />
          </div>
          <h1>
            {developmentMode
              ? "Your workspace awaits."
              : accessReady
                ? signup
                  ? "Create your creator account."
                  : "Sign in with your email."
                : "Creator sign-in is being configured."}
          </h1>
          <p>
            {developmentMode
              ? "Explore the creator experience or start with a blank storefront."
              : accessReady
                ? "Get a one-time code in your inbox. No password needed."
                : "This storefront platform is online. Creator access will be available once authentication is connected."}
          </p>
          <div className="notice">
            <b>
              {developmentMode
                ? "Local development mode"
                : accessReady
                  ? "Secure email verification"
                  : "Setup in progress"}
            </b>
            <br />
            {developmentMode
              ? "Authentication, checkout, and emails are simulated. No money moves and no emails are sent."
              : accessReady
                ? brandedEmail
                  ? "Your code comes from login@getsore.me and expires in 10 minutes."
                  : "Cloudflare will verify your email, then bring you back to your workspace."
                : "Creator authentication is not connected yet. No payments are being accepted."}
          </div>
          {!developmentMode && accessReady && brandedEmail && (
            <form className="auth-email-form" onSubmit={emailSubmit}>
              {!sent ? (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
              ) : (
                <>
                  <p className="auth-code-note" aria-live="polite">
                    We sent a code to <strong>{email}</strong>.
                  </p>
                  <label>
                    Sign-in code
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      required
                      maxLength={6}
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      className="auth-code-input"
                    />
                  </label>
                </>
              )}
              <button className="button primary wide" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : null}
                {sent ? "Verify & sign in" : "Send sign-in code"}
              </button>
              {sent && (
                <div className="auth-resend">
                  <button
                    type="button"
                    className="subtle-link"
                    disabled={busy}
                    onClick={(e) => emailSubmit(e, true)}
                  >
                    Resend code
                  </button>
                  <button
                    type="button"
                    className="subtle-link"
                    disabled={busy}
                    onClick={() => {
                      setSent(false);
                      setCode("");
                      setError("");
                    }}
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </form>
          )}
          {!developmentMode && accessReady && !brandedEmail && (
            <a className="button primary wide" href={emailLoginUrl}>
              Continue with email
            </a>
          )}
          {developmentMode && (
            <>
              <button
                className="button primary wide"
                disabled={busy}
                onClick={() => enter("demo")}
              >
                {busy ? <Loader2 className="spin" size={18} /> : null}Explore
                demo workspace
              </button>
              <button
                className="button outline wide"
                disabled={busy}
                onClick={() => enter("new")}
              >
                Create an empty store
              </button>
              <div className="auth-note">
                <Check size={15} /> Demo products are separate from real stores.
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Link className="subtle-link" href="/">
            Back to Sore
          </Link>
        </div>
      </main>
    </div>
  );
}
