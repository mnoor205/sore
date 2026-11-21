"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export default function McpSetupGuide({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError("");
    } catch {
      setError("Select and copy the connection URL below.");
    }
  }
  return (
    <details className="sm-setup-guide" id="connection-guide">
      <summary>Connect your assistant, step by step</summary>
      <div className="sm-guide-body">
        <ol>
          <li>
            <strong>Create your Sore store.</strong> Add a product, then open
            Connect AI in your dashboard.
          </li>
          <li>
            <strong>Add a remote MCP connection in your assistant.</strong> Look
            for its connector or integration settings. Names and availability
            depend on your assistant and plan.
          </li>
          <li>
            <strong>Paste your connection URL.</strong>
            <div className="sm-copy-url">
              <code>{url}</code>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy MCP connection URL"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <span role="status">
              {error || (copied ? "Connection URL copied." : "")}
            </span>
          </li>
          <li>
            <strong>Sign in to Sore and choose permissions.</strong> Approve
            catalog and aggregate reporting access. Draft writing requires a
            separate, optional permission.
          </li>
          <li>
            <strong>Try “List my products.”</strong> Confirm that the assistant
            returns your actual catalog. You can revoke the connection from your
            dashboard.
          </li>
        </ol>
        <p>
          Need a hand? Setup help includes connecting your assistant.
          Client-specific guides and one-click setup shortcuts are planned.
        </p>
      </div>
    </details>
  );
}
