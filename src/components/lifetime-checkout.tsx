"use client";

import { useEffect, useRef, useState } from "react";
import { lifetimeCheckoutPath } from "@/lib/lifetime-checkout";
import { api } from "./shared";

const purchaseIntent = "sore-lifetime-checkout";

export function LifetimeBuy({
  price,
  available,
}: {
  price?: number;
  available: boolean;
}) {
  if (!available || price === undefined)
    return (
      <button className="sf-button sf-primary" disabled>
        Checkout unavailable
      </button>
    );

  return (
    <a
      className="sf-button sf-primary"
      href={lifetimeCheckoutPath}
      onClick={() => {
        try {
          sessionStorage.setItem(purchaseIntent, "1");
        } catch {}
      }}
    >
      Get lifetime access — ${price}
    </a>
  );
}

export function StartLifetimeCheckout() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const opening = useRef(false);

  async function openCheckout() {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError("");
    try {
      const { url } = await api<{ url: string }>("billing/checkout", {
        kind: "lifetime",
      });
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      opening.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(purchaseIntent)) return;
      sessionStorage.removeItem(purchaseIntent);
    } catch {
      return;
    }
    void openCheckout();
  }, []);

  return (
    <main className="policy-page">
      <h1>Founding lifetime access</h1>
      <p>Review your one-time payment on Stripe.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy} onClick={openCheckout}>
        {busy ? "Opening Stripe Checkout…" : "Continue to Stripe Checkout"}
      </button>
      <p>
        <a href="/dashboard/billing">Back to billing</a>
      </p>
    </main>
  );
}
