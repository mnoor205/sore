"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Rocket,
  Copy,
} from "lucide-react";
import DevicePreview, { type PreviewMode } from "./device-preview";
import StoreForm, { type Store, type StoreFormValues } from "./store-form";
import { MANUAL_PREVIEW_MESSAGE } from "./preview-bridge";
import {
  type CustomSite,
  SITE_FILE_BYTES,
  SITE_TOTAL_BYTES,
  customSiteSchema,
} from "@/lib/custom-site";
import { SITE_PREVIEW_MESSAGE, SITE_PREVIEW_READY } from "./custom-site-host";
import AssetUpload from "./asset-upload";
import { siteImageUrl } from "@/lib/site-images";

import { api, Badge, Modal } from "./shared";
type Message = {
  id: string;
  role: "user" | "assistant" | "event";
  content: string;
  changes: string[];
  pending?: boolean;
};
type AiState = {
  draft: { version: number; updatedAt: number; changes: string[] } | null;
  messages: Message[];
  model: string;
  connected: boolean;
  customSite: CustomSite | null;
  publishedSite: CustomSite | null;
  starter: CustomSite;
  images: { id: string; name: string; url: string }[];
};
export type EditorTab = "ai" | "manual";
const suggestions = [
  "Make my storefront feel warm, calm and minimal",
  "Rewrite my bio so it sounds friendlier",
  "Add an announcement bar for my newest resource",
  "Show my products in a grid on desktop",
];
export default function StorefrontEditor({
  store,
  initialTab,
  onSaved,
  onCopyLink,
}: {
  store: Store;
  initialTab: EditorTab;
  onSaved: () => void;
  onCopyLink: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>(initialTab),
    // Mobile by default; kept across AI refreshes and tab switches.
    [mode, setMode] = useState<PreviewMode>("mobile");
  const choose = (next: EditorTab) => {
    setTab(next);
    window.history.replaceState(
      null,
      "",
      next === "manual"
        ? "/dashboard/storefront/manual"
        : "/dashboard/storefront",
    );
  };
  return (
    <div className="storefront-editor">
      <div
        className="editor-tabs"
        role="tablist"
        aria-label="Storefront editor"
      >
        <button
          role="tab"
          id="tab-ai"
          aria-selected={tab === "ai"}
          aria-controls="panel-ai"
          className={tab === "ai" ? "active" : ""}
          onClick={() => choose("ai")}
        >
          <Sparkles size={15} /> AI editor
        </button>
        <button
          role="tab"
          id="tab-manual"
          aria-selected={tab === "manual"}
          aria-controls="panel-manual"
          className={tab === "manual" ? "active" : ""}
          onClick={() => choose("manual")}
        >
          <SlidersHorizontal size={15} /> Manual editor
        </button>
        <button
          className="icon-button editor-copy"
          aria-label="Copy storefront link"
          title="Copy storefront link"
          onClick={onCopyLink}
        >
          <Copy size={15} />
        </button>
      </div>
      {tab === "ai" ? (
        <div role="tabpanel" id="panel-ai" aria-labelledby="tab-ai">
          <AiEditor onPublished={onSaved} mode={mode} setMode={setMode} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-manual" aria-labelledby="tab-manual">
          <ManualEditor
            store={store}
            onSaved={onSaved}
            mode={mode}
            setMode={setMode}
          />
        </div>
      )}
    </div>
  );
}
type ModeProps = {
  mode: PreviewMode;
  setMode: (mode: PreviewMode) => void;
};
function AiEditor({
  onPublished,
  mode,
  setMode,
}: { onPublished: () => void } & ModeProps) {
  const [state, setState] = useState<AiState | null>(null),
    [input, setInput] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [confirm, setConfirm] = useState<"publish" | "discard" | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    list = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const next = await api<AiState>("storefront/ai");
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    load().catch((e) => setError((e as Error).message));
  }, [load]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state?.messages.length, sending]);
  async function send(text = input) {
    const message = text.trim();
    if (!message || sending || !state) return;
    setSending(true);
    setError("");
    setNotice("");
    setInput("");
    setState({
      ...state,
      messages: [
        ...state.messages,
        { id: "pending", role: "user", content: message, changes: [] },
      ],
    });
    try {
      const result = await api<{ changes: string[] }>("storefront/ai/chat", {
        message,
        expectedVersion: state.draft?.version ?? null,
      });
      await load();
      if (result.changes.length) setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setInput(message);
      await load().catch(() => {});
    } finally {
      setSending(false);
    }
  }
  async function finish(kind: "publish" | "discard") {
    if (!state?.draft) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "publish") {
        await api("storefront/ai/publish", {
          expectedVersion: state.draft.version,
        });
        setNotice("Published. Your live storefront now matches this preview.");
        onPublished();
      } else {
        await api("storefront/ai/discard", {
          expectedVersion: state.draft.version,
        });
        setNotice("Draft discarded. Your live storefront wasn’t changed.");
      }
      setConfirm(null);
      await load();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const draft = state?.draft;
  return (
    <div className="editor-workspace">
      <section className="ai-chat" aria-label="AI editor chat">
        <div className={"draft-bar " + (draft ? "has-draft" : "")}>
          {draft ? (
            <>
              <div>
                <b>Unpublished draft</b>
                <span>
                  {draft.changes.length} change
                  {draft.changes.length === 1 ? "" : "s"} · only you can see
                  this
                </span>
              </div>
              <div className="draft-actions">
                <button
                  className="button outline compact"
                  onClick={() => setConfirm("discard")}
                  disabled={busy || sending}
                >
                  <Trash2 size={14} /> Discard
                </button>
                <button
                  className="button primary compact"
                  onClick={() => setConfirm("publish")}
                  disabled={busy || sending || !draft.changes.length}
                >
                  <Rocket size={14} /> Publish
                </button>
              </div>
            </>
          ) : (
            <div>
              <b>Showing your live storefront</b>
              <span>
                Ask for a change to start a private draft. Nothing goes live
                until you publish.
              </span>
            </div>
          )}
        </div>
        <div className="chat-log" ref={list} aria-live="polite">
          {!state ? (
            <div className="chat-empty">
              <Loader2 className="spin" size={18} />
            </div>
          ) : state.messages.length === 0 ? (
            <div className="chat-empty">
              <Sparkles size={22} />
              <h3>Describe the storefront you want.</h3>
              <p>
                Create responsive layouts, animations, custom sections and
                hash-linked pages using your Sore images. Prices, files and
                checkout stay exactly as they are.
              </p>
              <div className="chat-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={sending || !state.connected}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            state.messages.map((m) => (
              <div className={"chat-message chat-" + m.role} key={m.id}>
                <p>{m.content}</p>
                {m.changes.length > 0 && (
                  <ul className="chat-changes" aria-label="Changes">
                    {m.changes.slice(0, 8).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                    {m.changes.length > 8 && (
                      <li>+{m.changes.length - 8} more</li>
                    )}
                  </ul>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="chat-message chat-assistant chat-typing">
              <Loader2 className="spin" size={14} /> Editing your draft…
            </div>
          )}
        </div>
        {notice && <p className="chat-notice">{notice}</p>}
        <details className="chat-notice">
          <summary>What can the AI build?</summary>
          <p>
            Layouts, colors, copy, inline SVG, animations, system fonts and
            hash-linked pages. Upload images in the manual editor, then ask the
            AI to use them. Buttons can open your products’ checkout and the
            profile links saved in Store details.
          </p>
          <p>
            No external scripts, libraries, fonts, remote images,
            YouTube/Calendly embeds, analytics, custom domains, backend logic,
            data storage or signup/contact forms. Prices and files belong in the
            product editor; payments use Sore checkout.
          </p>
        </details>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {state && !state.connected && (
          <p className="notice">
            The AI editor isn’t connected in this environment. The manual editor
            still works.
          </p>
        )}
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Describe a storefront change"
            rows={2}
            maxLength={2000}
            value={input}
            placeholder="e.g. Make it feel like a calm wellness studio with a sage background"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!state?.connected}
          />
          <button
            className="button primary"
            aria-label="Send"
            disabled={sending || !input.trim() || !state?.connected}
          >
            {sending ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <ArrowUp size={16} />
            )}
          </button>
        </form>
        <small className="chat-footnote">
          Powered by Claude Haiku 5.5 through Cloudflare AI Gateway. Review the
          preview before publishing.
        </small>
      </section>
      <DevicePreview
        title="AI draft storefront preview"
        src="/dashboard/preview?source=ai"
        refreshKey={refresh}
        mode={mode}
        onModeChange={setMode}
        badge={
          draft ? <Badge tone="purple">AI draft</Badge> : <Badge>Live</Badge>
        }
      />
      {confirm && draft && (
        <Modal
          title={
            confirm === "publish"
              ? "Publish your AI draft?"
              : "Discard your AI draft?"
          }
          onClose={() => !busy && setConfirm(null)}
        >
          <div className="confirm-draft">
            {confirm === "publish" ? (
              <p>
                These changes will appear on your public storefront right away.
                Prices, files and checkout aren’t affected.
              </p>
            ) : (
              <p>
                This removes every unpublished AI change. Your live storefront
                stays exactly as it is.
              </p>
            )}
            <ul>
              {draft.changes.slice(0, 12).map((c, i) => (
                <li key={i}>{c}</li>
              ))}
              {draft.changes.length > 12 && (
                <li>+{draft.changes.length - 12} more</li>
              )}
            </ul>
            <div className="confirm-actions">
              <button
                className="button outline"
                onClick={() => setConfirm(null)}
                disabled={busy}
              >
                Keep editing
              </button>
              <button
                className={
                  "button " + (confirm === "publish" ? "primary" : "danger")
                }
                onClick={() => finish(confirm)}
                disabled={busy}
              >
                {busy && <Loader2 className="spin" size={15} />}
                {confirm === "publish" ? "Publish changes" : "Discard draft"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ManualEditor({
  store,
  onSaved,
  mode,
  setMode,
}: { store: Store; onSaved: () => void } & ModeProps) {
  const [state, setState] = useState<AiState | null>(null),
    [site, setSite] = useState<CustomSite | null>(null),
    [file, setFile] = useState<keyof CustomSite>("html"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [savedVersion, setSavedVersion] = useState<number | null>(null),
    [refresh, setRefresh] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null),
    values = useRef<CustomSite | null>(null),
    profile = useRef<StoreFormValues | null>(null);
  const post = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      { type: SITE_PREVIEW_MESSAGE, site: values.current },
      window.location.origin,
    );
    // Unsaved store details for the template preview (used without custom code).
    if (profile.current)
      win.postMessage(
        { type: MANUAL_PREVIEW_MESSAGE, store: profile.current },
        window.location.origin,
      );
  }, []);
  const profileChanged = useCallback(
    (v: StoreFormValues) => {
      profile.current = v;
      post();
    },
    [post],
  );
  const load = useCallback(async () => {
    const next = await api<AiState>("storefront/ai");
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    load()
      .then((s) => {
        setSite(s.publishedSite);
        values.current = s.publishedSite;
        post();
      })
      .catch((e) => setError((e as Error).message));
  }, [load, post]);
  useEffect(() => {
    function ready(event: MessageEvent) {
      if (
        event.origin === location.origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === SITE_PREVIEW_READY
      )
        post();
    }
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [post]);
  useEffect(() => {
    values.current = site;
    const timer = setTimeout(post, 300);
    return () => clearTimeout(timer);
  }, [site, post]);
  function edit(next: CustomSite | null) {
    setSite(next);
    setDirty(true);
    setSavedVersion(null);
    setNotice("");
  }
  async function save() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      if (site) customSiteSchema.parse(site);
      const result = await api<{ draftVersion: number }>("storefront/site", {
        site,
        expectedVersion: state.draft?.version ?? null,
      });
      setSavedVersion(result.draftVersion);
      setDirty(false);
      await load();
      setNotice("Draft saved. Review the preview, then publish.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish(action: "publish" | "discard") {
    if (!savedVersion) return;
    setBusy(true);
    setError("");
    try {
      await api("storefront/ai/" + action, { expectedVersion: savedVersion });
      const next = await load();
      setSavedVersion(null);
      setDirty(false);
      setSite(next.publishedSite);
      setNotice(
        action === "publish"
          ? "Published to your storefront."
          : "Draft discarded.",
      );
      if (action === "publish") onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor-workspace manual">
      <section className="manual-panel">
        <p className="manual-intro">
          Edit HTML, CSS and JavaScript. This preview starts from your published
          site, independent of the AI draft. Save a private draft, then publish.
        </p>
        <details className="manual-profile">
          <summary>Images for your website</summary>
          <p>
            Upload public PNG, JPEG, WebP, GIF or AVIF images. Copy a URL into
            your HTML/CSS, or ask the AI to use it. These images are public even
            before publishing. SVG and images hosted elsewhere are blocked.
          </p>
          <AssetUpload
            purpose="image"
            label="Upload website image"
            onUploaded={(asset) => {
              const image = {
                ...asset,
                url: siteImageUrl(asset.url, location.origin),
              };
              setState((current) =>
                current
                  ? { ...current, images: [...current.images, image] }
                  : current,
              );
            }}
          />
          {state?.images.map((image) => (
            <label className="site-image-url" key={image.id}>
              {image.name}
              <input
                aria-label={`Image URL for ${image.name}`}
                readOnly
                value={image.url}
                onFocus={(event) => event.target.select()}
              />
            </label>
          ))}
        </details>
        {state?.draft && savedVersion === null && (
          <p className="chat-notice">
            An unpublished draft exists. Saving replaces the draft’s site files.{" "}
            <button
              className="button outline compact"
              onClick={() => {
                setSite(state.customSite);
                setSavedVersion(state.draft!.version);
                setDirty(false);
              }}
            >
              Load saved draft
            </button>
          </p>
        )}
        <details className="manual-profile">
          <summary>Store details</summary>
          <p className="manual-intro">
            Name, bio, photo, links and support email. Saving updates your live
            store right away and feeds <code>window.Sore</code> in custom code.
          </p>
          <StoreForm
            store={store}
            onChange={profileChanged}
            onSaved={() => {
              setNotice("Store details saved to your live storefront.");
              setRefresh((n) => n + 1);
              load().catch(() => {});
              onSaved();
            }}
          />
        </details>
        {!state ? (
          <Loader2 className="spin" size={18} />
        ) : (
          <>
            {!site ? (
              <p>
                Using the platform template.{" "}
                <button
                  className="button primary compact"
                  onClick={() => edit(state.starter)}
                >
                  Start from current template
                </button>
              </p>
            ) : (
              <>
                <div
                  className="site-code-tabs"
                  role="tablist"
                  aria-label="Site files"
                >
                  {(["html", "css", "js"] as const).map((k) => (
                    <button
                      role="tab"
                      aria-selected={file === k}
                      className={
                        "button compact " + (file === k ? "primary" : "outline")
                      }
                      key={k}
                      onClick={() => setFile(k)}
                    >
                      {k === "html"
                        ? "index.html"
                        : k === "css"
                          ? "style.css"
                          : "script.js"}
                    </button>
                  ))}
                </div>
                <label>
                  {file.toUpperCase()}
                  <textarea
                    className="site-code-input"
                    spellCheck={false}
                    aria-label={file.toUpperCase() + " code"}
                    value={site[file]}
                    onChange={(e) => edit({ ...site, [file]: e.target.value })}
                  />
                </label>
                <small>
                  {new TextEncoder().encode(site[file]).byteLength} /{" "}
                  {SITE_FILE_BYTES} bytes per file · {SITE_TOTAL_BYTES} bytes
                  total
                </small>
                <p>
                  <code>window.Sore.products</code> supplies real products and
                  formatted prices. Use <code>Sore.checkout(productId)</code> to
                  open platform checkout and{" "}
                  <code>Sore.openLink(url)</code> to open one of your saved
                  profile links (<code>Sore.store.socials</code>). Use hash
                  links for extra pages. Other external links, assets, network
                  requests and forms are blocked.
                </p>
                <button
                  className="button outline compact"
                  onClick={() => edit(null)}
                >
                  Reset to platform template
                </button>
              </>
            )}
            <div className="site-code-actions">
              <button
                className="button primary"
                disabled={busy || !dirty}
                onClick={save}
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
              <button
                className="button primary"
                disabled={busy || dirty || !savedVersion}
                onClick={() => finish("publish")}
              >
                Publish
              </button>
              <button
                className="button outline"
                disabled={busy || !savedVersion}
                onClick={() => finish("discard")}
              >
                Discard saved draft
              </button>
            </div>
          </>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="chat-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      <DevicePreview
        title="Manual editor storefront preview"
        src="/dashboard/preview?source=manual"
        refreshKey={refresh}
        mode={mode}
        onModeChange={setMode}
        badge={<Badge>Your code · private preview</Badge>}
        onFrame={(el) => {
          frame.current = el;
        }}
      />
    </div>
  );
}
