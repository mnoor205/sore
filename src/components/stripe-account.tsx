"use client";
import { useEffect, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";
import type { StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectAccountManagement,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayments,
  ConnectPayouts,
} from "@stripe/react-connect-js";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { api, Empty } from "./shared";
import {
  guessStripeCountry,
  STRIPE_COUNTRIES,
  type StripeCountry,
} from "@/lib/stripe-countries";

/** Business country picker, required by Stripe before a new account exists. */
export function CountrySelect({
  value,
  onChange,
}: {
  value: StripeCountry | "";
  onChange: (country: StripeCountry) => void;
}) {
  const [names] = useState(() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!value) onChange(guessStripeCountry());
  }, [value, onChange]);
  return (
    <label className="country-select">
      <span>Business country</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StripeCountry)}
      >
        {[...STRIPE_COUNTRIES]
          .map((c) => ({ c, name: names?.of(c) || c }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ c, name }) => (
            <option key={c} value={c}>
              {name}
            </option>
          ))}
      </select>
    </label>
  );
}

type Tab = "account" | "payments" | "payouts";
const tabs: { id: Tab; name: string }[] = [
  { id: "payments", name: "Payments" },
  { id: "payouts", name: "Payouts" },
  { id: "account", name: "Account details" },
];

/**
 * The creator's own Stripe connected account, managed in place with Stripe's
 * Connect embedded components. Each session is minted server-side for the
 * signed-in creator's account only.
 */
export default function StripeAccount({
  stripeAccount,
  onConnect,
  busy,
}: {
  stripeAccount: string | null;
  onConnect: (country?: StripeCountry) => void;
  busy: boolean;
}) {
  const [country, setCountry] = useState<StripeCountry | "">("");
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState<Tab>("payments");

  useEffect(() => {
    if (!stripeAccount) return;
    let cancelled = false;
    (async () => {
      try {
        // The first session also tells us the publishable key; later refreshes
        // (sessions are short-lived) just mint a new client secret.
        const first = await api<{
          clientSecret: string;
          publishableKey: string;
        }>("payments/account-session", {});
        if (cancelled) return;
        let initial: string | null = first.clientSecret;
        const css = getComputedStyle(document.documentElement);
        const value = (name: string, fallback: string) =>
          css.getPropertyValue(name).trim() || fallback;
        setInstance(
          loadConnectAndInitialize({
            publishableKey: first.publishableKey,
            fetchClientSecret: async () => {
              if (initial) {
                const secret = initial;
                initial = null;
                return secret;
              }
              return (
                await api<{ clientSecret: string }>(
                  "payments/account-session",
                  {},
                )
              ).clientSecret;
            },
            appearance: {
              overlays: "dialog",
              variables: {
                colorPrimary: value("--brand-pink", "#ec008c"),
                colorBackground: value("--bg", "#fffafb"),
                colorText: value("--ink", "#252531"),
                colorSecondaryText: value("--muted", "#777684"),
                colorBorder: value("--line", "#f1e4ea"),
                fontFamily: value("--font", "system-ui, sans-serif"),
                borderRadius: "12px",
              },
            },
          }),
        );
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripeAccount]);

  if (!stripeAccount)
    return (
      <div className="panel">
        <Empty
          icon={<CreditCard />}
          title="Connect Stripe to get paid"
          action={
            <div className="connect-stripe-row">
              <CountrySelect value={country} onChange={setCountry} />
              <button
                className="button primary"
                disabled={busy || !country}
                onClick={() => onConnect(country || undefined)}
              >
                <CreditCard size={17} />
                Connect Stripe
              </button>
            </div>
          }
        >
          Your customers pay you directly through your own Stripe account. Once
          it&apos;s connected, you can manage it right here.
        </Empty>
      </div>
    );

  return (
    <div className="stripe-account">
      {error ? (
        <div className="error-box">{error}</div>
      ) : !instance ? (
        <div className="page-loading">
          <Loader2 className="spin" />
          Loading your Stripe account…
        </div>
      ) : (
        <ConnectComponentsProvider connectInstance={instance}>
          <ConnectNotificationBanner />
          <div className="tabs stripe-account-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <section className="panel stripe-account-panel">
            {tab === "account" && <ConnectAccountManagement />}
            {tab === "payments" && <ConnectPayments />}
            {tab === "payouts" && <ConnectPayouts />}
          </section>
        </ConnectComponentsProvider>
      )}
      <p className="stripe-account-foot">
        Prefer the full view?{" "}
        <a
          href={`https://dashboard.stripe.com/${stripeAccount}`}
          target="_blank"
          rel="noreferrer"
        >
          Open your Stripe Dashboard <ExternalLink size={13} />
        </a>
      </p>
    </div>
  );
}
