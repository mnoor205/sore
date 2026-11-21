"use client";
import { useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Menu,
  Plus,
  Search,
  SquarePen,
  Folder,
  Copy,
  ThumbsUp,
  RotateCcw,
} from "lucide-react";

const examples = [
  {
    label: "What to promote next",
    question:
      "Look at my Sore sales. What should I focus on to make more money this month?",
    lead: "Put your next promotion behind The Business Reset.",
    reason:
      "It brought in $348 from 12 orders, converting 5% of measured visits. The Pricing Playbook converted 2%.",
    action:
      "Send your next Instagram story to the workbook. Keep the price at $29 for this test, then compare orders and conversion in Sore.",
    tools: "get_product_performance · list_products",
  },
  {
    label: "Find the sales bottleneck",
    question:
      "Which offer needs work before I send it more traffic? Use my Sore data.",
    lead: "Work on The Pricing Playbook’s product page first.",
    reason:
      "It had 250 measured visits and 5 orders — 2% conversion, compared with 5% for The Business Reset. It already gets attention; fewer visits turn into orders.",
    action:
      "Test a clearer outcome and a preview of what’s inside. Keep the price steady so you can compare the page change against the next set of Sore orders.",
    tools: "get_product_performance · list_products",
  },
  {
    label: "Choose the next product",
    question:
      "Based on what people buy and download in Sore, what should I build next?",
    lead: "Test a small paid follow-up to Find Your Clarity.",
    reason:
      "The free guide has 78 requests. The Business Reset also has 12 paid orders, so a practical workbook is a format worth exploring.",
    action:
      "Outline a focused next-step workbook before building a large course. Free requests show interest, not willingness to pay — validate the paid offer first.",
    tools: "get_product_performance · get_store_context",
  },
];
export default function MarketingDemo() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return (
    <figure
      className="sf-claude-demo"
      aria-label="Illustrative Claude conversation using Sore store data"
    >
      <div className="cl-app">
        <aside className="cl-sidebar">
          <div className="cl-wordmark">Claude</div>
          <div className="cl-navigation">
            <span>
              <SquarePen size={17} />
              New chat
            </span>
            <span>
              <Search size={17} />
              Search
            </span>
            <span>
              <Folder size={17} />
              Projects
            </span>
          </div>
          <small>Recents</small>
          <div className="cl-recents" aria-label="Example Claude conversations">
            {examples.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="cl-profile">
            <span>JL</span>Jamie Lane
          </div>
        </aside>
        <div className="cl-main">
          <header className="cl-header">
            <Menu size={19} className="cl-mobile-menu" />
            <span className="cl-mobile-brand">Claude</span>
            <span className="cl-conversation-title">{example.label}</span>
            <span className="cl-example-label">Illustrative demo</span>
          </header>
          <div
            className="cl-mobile-examples"
            aria-label="Example conversations"
          >
            {examples.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                {index === 0
                  ? "Promote"
                  : index === 1
                    ? "Improve"
                    : "Build next"}
              </button>
            ))}
          </div>
          <div className="cl-thread" key={selected}>
            <div className="cl-user">{example.question}</div>
            <div className="cl-response">
              <img
                className="cl-avatar"
                src="/ai/claude.svg"
                width={28}
                height={28}
                alt="Claude"
              />
              <div className="cl-response-body">
                <details className="cl-tool-source">
                  <summary>
                    <Check size={14} />
                    <span>Used Sore</span>
                    <ChevronDown size={13} />
                  </summary>
                  <p>
                    {example.tools}
                    <br />
                    Jamie Lane’s store · Last 30 days
                  </p>
                </details>
                <p className="cl-lead">{example.lead}</p>
                <p>{example.reason}</p>
                <div
                  className="cl-data"
                  aria-label="Illustrative sales data from Sore"
                >
                  <div>
                    <span>Product</span>
                    <span>Views</span>
                    <span>Orders</span>
                    <span>Sales</span>
                  </div>
                  <div>
                    <strong>Business Reset</strong>
                    <span>240</span>
                    <span>12</span>
                    <span>$348</span>
                  </div>
                  <div>
                    <strong>Pricing Playbook</strong>
                    <span>250</span>
                    <span>5</span>
                    <span>$95</span>
                  </div>
                  {selected === 2 && (
                    <div>
                      <strong>Clarity guide</strong>
                      <span>—</span>
                      <span>78 free</span>
                      <span>—</span>
                    </div>
                  )}
                </div>
                <p>
                  <strong>Next move:</strong> {example.action}
                </p>
                <div className="cl-feedback" aria-hidden="true">
                  <Copy size={14} />
                  <ThumbsUp size={14} />
                  <RotateCcw size={14} />
                </div>
              </div>
            </div>
          </div>
          <div
            className="cl-composer"
            aria-label="Illustrative Claude message composer"
          >
            <span>Reply to Claude…</span>
            <div>
              <Plus size={19} />
              <span>
                Claude <ChevronDown size={12} />
              </span>
              <span className="cl-send">
                <ArrowUp size={17} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
