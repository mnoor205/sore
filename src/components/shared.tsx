"use client";
import { type ReactNode, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    "/api/" + path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value = (await r.json()) as T & { error?: string };
  if (!r.ok) {
    if (r.status === 401 && path === "workspace")
      window.location.href =
        "/sign-in?redirect_url=" + encodeURIComponent(window.location.href);
    throw new Error(value.error || "Something went wrong");
  }
  return value;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(
      () =>
        document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
      0,
    );
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button:not([disabled]), [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea, [role="dialog"] a[href]',
          ),
        ];
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = old;
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "modal-wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Spinner() {
  return (
    <div className="page-loading">
      <Loader2 className="spin" />
      Loading your workspace…
    </div>
  );
}
export const money = (n: number, c = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(
    n / 100,
  );
export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
