"use client";
import { useEffect, useState, type ComponentProps } from "react";
import Storefront, { type PublicStore } from "./storefront";
import { theme } from "@/lib/storefront-theme";
export const MANUAL_PREVIEW_MESSAGE = "sore:manual-preview";
export const PREVIEW_READY_MESSAGE = "sore:preview-ready";
type Overrides = Partial<
  Pick<
    PublicStore,
    "name" | "bio" | "accent" | "stylePreset" | "photo" | "socials"
  >
> & { theme?: unknown; supportEmail?: string };
/**
 * Renders the live storefront and applies the manual editor's unsaved form
 * values, sent from the parent dashboard window. Only same-origin messages are
 * accepted and every value is re-validated before rendering as plain text.
 */
export default function PreviewBridge(
  props: ComponentProps<typeof Storefront>,
) {
  const [overrides, setOverrides] = useState<Overrides>({});
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== MANUAL_PREVIEW_MESSAGE) return;
      const v = event.data.store || {};
      const text = (x: unknown, max: number) =>
        typeof x === "string" ? x.slice(0, max) : undefined;
      setOverrides({
        name: text(v.name, 100),
        bio: text(v.bio, 350),
        accent:
          typeof v.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(v.accent)
            ? v.accent
            : undefined,
        stylePreset: ["studio", "editorial", "botanical"].includes(
          v.stylePreset,
        )
          ? v.stylePreset
          : undefined,
        photo:
          typeof v.photo === "string" && /^(https:\/\/|\/)/.test(v.photo)
            ? v.photo
            : undefined,
        supportEmail: text(v.supportEmail, 254),
        socials:
          v.socials && typeof v.socials === "object"
            ? Object.fromEntries(
                Object.entries(v.socials as Record<string, unknown>).filter(
                  ([, url]) =>
                    typeof url === "string" && /^https:\/\//.test(url),
                ) as [string, string][],
              )
            : undefined,
        theme: v.theme ? theme(v.theme) : undefined,
      });
    }
    window.addEventListener("message", receive);
    window.parent?.postMessage(
      { type: PREVIEW_READY_MESSAGE },
      window.location.origin,
    );
    return () => window.removeEventListener("message", receive);
  }, []);
  const store = { ...props.store } as PublicStore;
  for (const [k, v] of Object.entries(overrides))
    if (v !== undefined && (v !== "" || k === "bio" || k === "photo"))
      (store as Record<string, unknown>)[k] = v;
  return <Storefront {...props} store={store} />;
}
