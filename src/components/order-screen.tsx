"use client";
import { useEffect, useState } from "react";
import Brand from "./brand";
import Link from "next/link";
import {
  Check,
  Download,
  ShieldCheck,
  Loader2,
  Clock,
  LockKeyhole,
  CreditCard,
} from "lucide-react";
import { api, money, Spinner } from "./shared";
type Order = {
  id: string;
  title: string;
  status: string;
  refunded: number;
  amount: number;
  currency: string;
  isTest?: boolean;
};
export default function OrderScreen({
  orderId,
  accessToken,
  checkout = false,
}: {
  orderId: string;
  accessToken: string;
  checkout?: boolean;
}) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let canceled = false;
    async function load() {
      try {
        const data = await api<Order>(
          `access/${orderId}?token=${encodeURIComponent(accessToken)}`,
        );
        if (!canceled) {
          setOrder(data);
          if (data.status === "pending" && !checkout)
            timer = setTimeout(load, 3000);
        }
      } catch (e) {
        if (!canceled) setError((e as Error).message);
      }
    }
    load();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [accessToken, orderId, checkout]);
  async function simulate(outcome: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>("dev/payment", {
        orderId,
        token: accessToken,
        outcome,
      });
      window.location.href = r.url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(
        `access/${orderId}/download?token=${encodeURIComponent(accessToken)}`,
      );
      window.location.href = r.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const unlocked =
    order && ["paid", "free"].includes(order.status) && !order.refunded;
  return (
    <div className="order-page">
      <Brand />
      <section className="order-card">
        {order?.isTest && (
          <div className="notice">
            <b>Private delivery rehearsal</b>
            <p>
              This simulated purchase made no Stripe charge and sent no email.
              It is excluded from contacts and reporting.
            </p>
          </div>
        )}
        {!order && !error ? (
          <Spinner />
        ) : order ? (
          <>
            {checkout ? (
              <>
                <span className="icon-square lavender">
                  <CreditCard size={28} />
                </span>
                <span className="eyebrow purple">DEVELOPMENT CHECKOUT</span>
                <h1>Let’s test the whole story.</h1>
                <p>
                  This is a local payment simulation. No card details are
                  collected and no money moves.
                </p>
                <div className="order-resource">
                  <b>{order.title}</b>
                  <strong>
                    {money(order.amount, order.currency)}{" "}
                    {order.currency.toUpperCase()}
                  </strong>
                </div>
                <button
                  className="button primary wide"
                  disabled={busy}
                  onClick={() => simulate("success")}
                >
                  {busy && <Loader2 className="spin" size={18} />}Simulate
                  successful payment
                </button>
                <button
                  className="button outline wide"
                  disabled={busy}
                  onClick={() => simulate("failure")}
                >
                  Simulate failed payment
                </button>
                <p className="fine-print">
                  Uses the same order confirmation service as verified Stripe
                  webhooks. Real Stripe Checkout requires activated payments and
                  credentials.
                </p>
              </>
            ) : (
              <>
                <span className={"order-icon " + (unlocked ? "success" : "")}>
                  {unlocked ? (
                    <Check size={30} />
                  ) : order.refunded ? (
                    <LockKeyhole size={28} />
                  ) : (
                    <Clock size={28} />
                  )}
                </span>
                <h1>
                  {unlocked
                    ? "A good idea, now yours."
                    : order.refunded
                      ? "This access has been revoked."
                      : order.status === "pending"
                        ? "A little moment for confirmation."
                        : "Payment wasn’t completed."}
                </h1>
                <p>
                  {unlocked
                    ? "Your resource is ready. Keep this private link safe so you can return to it."
                    : order.refunded
                      ? "This purchase was fully refunded. Please contact the creator for help."
                      : order.status === "pending"
                        ? "We’re waiting for server-side payment confirmation. Your resource unlocks only after a confirmed payment."
                        : "Your resource is locked. No access was granted."}
                </p>
                <div className="order-resource">
                  <span className="micro-label">YOUR RESOURCE</span>
                  <b>{order.title}</b>
                  <small>
                    {order.amount
                      ? money(order.amount, order.currency)
                      : "Free resource"}
                  </small>
                </div>
                {unlocked && (
                  <button
                    className="button primary wide"
                    disabled={busy}
                    onClick={download}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <Download size={18} />
                    )}
                    Access your resource
                  </button>
                )}
                <div className="buyer-security">
                  <ShieldCheck size={16} />
                  Private access · temporary download links
                </div>
                <p className="fine-print">
                  Transactional access email is queued separately from
                  marketing. In development mode, emails are recorded as “not
                  sent”.
                </p>
                <Link href="/dashboard/orders" className="subtle-link">
                  Return to your workspace
                </Link>
              </>
            )}
          </>
        ) : null}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </section>
      <p className="order-footer">A little space for what comes next.</p>
    </div>
  );
}
