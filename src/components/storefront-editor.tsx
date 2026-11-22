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
import {
  MANUAL_PREVIEW_MESSAGE,
  PREVIEW_READY_MESSAGE,
} from "./preview-bridge";
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
        await api("storefront/ai/discard", {});
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
                Change the look, rewrite copy, reorder products or tune product
                sections in plain language. Prices, files and checkout stay
                exactly as they are.
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
}: {
  store: Store;
  onSaved: () => void;
} & ModeProps) {
  const [refresh, setRefresh] = useState(0),
    [hasDraft, setHasDraft] = useState(false),
    [saved, setSaved] = useState(false),
    frame = useRef<HTMLIFrameElement | null>(null),
    values = useRef<StoreFormValues | null>(null);
  const post = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win || !values.current) return;
    win.postMessage(
      { type: MANUAL_PREVIEW_MESSAGE, store: values.current },
      window.location.origin,
    );
  }, []);
  const changed = useCallback(
    (v: StoreFormValues) => {
      values.current = v;
      post();
    },
    [post],
  );
  useEffect(() => {
    api<AiState>("storefront/ai")
      .then((s) => setHasDraft(!!s.draft))
      .catch(() => {});
    function ready(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.data?.type === PREVIEW_READY_MESSAGE &&
        event.source === frame.current?.contentWindow
      )
        post();
    }
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [post]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(t);
  }, [saved]);
  return (
    <div className="editor-workspace manual">
      <section className="manual-panel">
        <p className="manual-intro">
          Edit your storefront directly. The preview updates as you type and
          saving publishes straight to your live storefront.
          {hasDraft &&
            " Your unpublished AI draft is kept separately and isn’t shown here."}
        </p>
        <StoreForm
          store={store}
          onChange={changed}
          onSaved={() => {
            setSaved(true);
            setRefresh((n) => n + 1);
            onSaved();
          }}
        />
        {saved && (
          <p className="chat-notice" role="status">
            Saved to your live storefront.
          </p>
        )}
      </section>
      <DevicePreview
        title="Manual editor storefront preview"
        src="/dashboard/preview?source=manual"
        refreshKey={refresh}
        mode={mode}
        onModeChange={setMode}
        badge={<Badge>Your edits · no AI draft</Badge>}
        onFrame={(el) => {
          frame.current = el;
        }}
      />
    </div>
  );
}
