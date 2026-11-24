"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Smartphone, RotateCw, ExternalLink } from "lucide-react";
export type PreviewMode = "mobile" | "desktop";
// Real device viewports: the iframe is laid out at these CSS sizes, so the
// storefront's own responsive rules decide what renders. The frame is then
// scaled down with a transform to fit whatever space the dashboard has.
const PHONE = { width: 390, height: 844, bezel: 12, status: 50 };
const DESKTOP = { width: 1280, height: 800, chrome: 38 };
/**
 * Live preview of the real storefront in an iPhone-style frame (default) or a
 * scaled desktop browser. Mode survives refreshes, and refreshing keeps the
 * current scroll position so an AI edit doesn't jump the merchant to the top.
 */
export default function DevicePreview({
  src,
  refreshKey,
  title,
  badge,
  onFrame,
  mode,
  onModeChange,
}: {
  src: string;
  refreshKey: number;
  title: string;
  badge?: React.ReactNode;
  onFrame?: (frame: HTMLIFrameElement | null) => void;
  /** Controlled by the editor so the choice survives refreshes and tab switches. */
  mode: PreviewMode;
  onModeChange: (mode: PreviewMode) => void;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 }),
    [loading, setLoading] = useState(true),
    stage = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement | null>(null),
    scroll = useRef<number | null>(null),
    firstRefresh = useRef(true);
  const setMode = onModeChange;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Reload in place on each edit, remembering where the merchant had scrolled.
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      scroll.current = win.scrollY;
      setLoading(true);
      win.location.replace(src);
    } catch {
      if (frame.current) frame.current.src = src;
    }
  }, [refreshKey, src]);
  const loaded = useCallback(() => {
    setLoading(false);
    const win = frame.current?.contentWindow;
    if (win && scroll.current !== null) {
      const y = scroll.current;
      scroll.current = null;
      try {
        win.scrollTo(0, y);
      } catch {}
    }
  }, []);
  const outer =
    mode === "mobile"
      ? {
          width: PHONE.width + PHONE.bezel * 2,
          height: PHONE.height + PHONE.bezel * 2,
        }
      : { width: DESKTOP.width, height: DESKTOP.height + DESKTOP.chrome };
  const scale =
    box.width && box.height
      ? Math.min(
          1,
          (box.width - 8) / outer.width,
          (box.height - 8) / outer.height,
        )
      : 0;
  const viewport =
    mode === "mobile"
      ? { width: PHONE.width, height: PHONE.height - PHONE.status }
      : { width: DESKTOP.width, height: DESKTOP.height };
  return (
    <section className="device-preview" aria-label={title}>
      <div className="device-toolbar">
        <div
          className="device-toggle"
          role="radiogroup"
          aria-label="Preview size"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === "mobile"}
            className={mode === "mobile" ? "active" : ""}
            onClick={() => setMode("mobile")}
          >
            <Smartphone size={14} /> Mobile
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "desktop"}
            className={mode === "desktop" ? "active" : ""}
            onClick={() => setMode("desktop")}
          >
            <Monitor size={14} /> Desktop
          </button>
        </div>
        <div className="device-toolbar-end">
          {badge}
          {loading && (
            <span className="device-loading" aria-live="polite">
              <RotateCw size={12} className="spin" /> Updating
            </span>
          )}
          <a
            className="icon-button"
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label="Open this preview in a new tab"
            title="Open in a new tab"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
      <div className="device-stage" ref={stage} data-mode={mode}>
        <div
          className="device-scaler"
          style={{
            width: outer.width * scale,
            height: outer.height * scale,
            visibility: scale ? "visible" : "hidden",
          }}
        >
          <div
            className={"device-frame device-" + mode}
            style={{
              width: outer.width,
              height: outer.height,
              transform: `scale(${scale})`,
            }}
            data-testid="device-frame"
          >
            {mode === "mobile" ? (
              <>
                <div className="device-status" aria-hidden="true">
                  <span>9:41</span>
                  <span className="device-island" />
                  <span className="device-signal">
                    <i />
                    <i />
                    <i />
                    <b />
                  </span>
                </div>
                <span className="device-home" aria-hidden="true" />
              </>
            ) : (
              <div className="device-chrome" aria-hidden="true">
                <span className="device-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="device-url">Storefront preview</span>
              </div>
            )}
            <iframe
              ref={(el) => {
                frame.current = el;
                onFrame?.(el);
              }}
              title={title}
              src={src}
              onLoad={loaded}
              style={{ width: viewport.width, height: viewport.height }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
