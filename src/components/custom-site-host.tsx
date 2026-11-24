"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  checkoutMessageUrl,
  linkMessageUrl,
  customSiteDocument,
  customSiteSchema,
  CUSTOM_SITE_SANDBOX,
  type CommerceData,
  type CustomSite,
} from "@/lib/custom-site";
export const SITE_PREVIEW_MESSAGE = "sore:site-preview";
export const SITE_PREVIEW_READY = "sore:site-preview-ready";
/** Trusted host. Merchant bytes appear only in srcDoc, never in this DOM. */
export default function CustomSiteHost({
  site,
  data,
  preview = false,
  manual = false,
  fallback,
}: {
  site: CustomSite | null;
  data: CommerceData;
  preview?: boolean;
  manual?: boolean;
  fallback?: ReactNode;
}) {
  const [local, setLocal] = useState(site);
  const [notice, setNotice] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    setLocal(site);
  }, [site]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        manual &&
        event.origin === location.origin &&
        event.source === window.parent &&
        event.data?.type === SITE_PREVIEW_MESSAGE
      ) {
        if (event.data.site === null) setLocal(null);
        else {
          const parsed = customSiteSchema.safeParse(event.data.site);
          if (parsed.success) setLocal(parsed.data);
        }
        return;
      }
      const link = linkMessageUrl(
        event,
        frame.current?.contentWindow ?? null,
        data,
      );
      if (link) {
        // Only the store's own saved https profile links, never arbitrary URLs.
        window.open(link, "_blank", "noopener,noreferrer");
        return;
      }
      const url = checkoutMessageUrl(
        event,
        frame.current?.contentWindow ?? null,
        data,
      );
      if (!url) return;
      if (preview) {
        setNotice(
          "Checkout is disabled in preview. Publish and open your storefront to test it.",
        );
        return;
      }
      // Navigate the trusted host to a URL derived exclusively from real products.
      window.location.assign(url);
    }
    window.addEventListener("message", receive);
    if (manual && window.parent !== window)
      window.parent.postMessage({ type: SITE_PREVIEW_READY }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, [data, manual, preview]);
  if (!local) return <>{fallback}</>;
  return (
    <div className="custom-site-host">
      {preview && notice && (
        <p className="custom-site-notice" role="status">
          {notice}
        </p>
      )}
      <iframe
        ref={frame}
        title={`${data.store.name} custom storefront`}
        sandbox={CUSTOM_SITE_SANDBOX}
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
        srcDoc={customSiteDocument(local, data)}
      />
    </div>
  );
}
