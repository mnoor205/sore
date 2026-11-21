"use client";
import { useEffect, useState } from "react";
import { api } from "./shared";
import type {
  AnalyticsResponse,
  TrafficReport,
} from "@/lib/storefront-analytics";

const regions = new Intl.DisplayNames(["en"], { type: "region" });
const count = new Intl.NumberFormat("en");
const date = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
function downloadReport(
  slug: string,
  traffic: TrafficReport,
  commerce: AnalyticsResponse["commerce"],
) {
  const data = {
    storefront: slug,
    timezone: "UTC",
    from: traffic.trend[0].day,
    to: traffic.trend[traffic.trend.length - 1].day,
    ...traffic,
    commerce,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = slug + "-analytics-" + data.from + "-" + data.to + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Trend({ trend }: { trend: TrafficReport["trend"] }) {
  const max = Math.max(1, ...trend.map((row) => row.views));
  return (
    <div className="traffic-trend">
      <div className="traffic-axis">
        <span>{count.format(max)}</span>
        <span>0</span>
      </div>
      <div
        className="traffic-bars"
        role="img"
        aria-label={`Daily pageviews over ${trend.length} days. Peak ${count.format(max)}. Daily values follow in the table.`}
      >
        {trend.map((row) => (
          <span
            key={row.day}
            style={{ height: (100 * row.views) / max + "%" }}
            title={`${row.day} · ${count.format(row.views)} pageviews`}
          />
        ))}
      </div>
      <div className="traffic-dates">
        <span>{date.format(new Date(trend[0].day))}</span>
        <span>{date.format(new Date(trend[trend.length - 1].day))} UTC</span>
      </div>
      <details>
        <summary>Daily traffic</summary>
        <table>
          <thead>
            <tr>
              <th>UTC date</th>
              <th>Visitors</th>
              <th>Pageviews</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((row) => (
              <tr key={row.day}>
                <th scope="row">{row.day}</th>
                <td>{count.format(row.visitors)}</td>
                <td>{count.format(row.views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
export default function StorefrontAnalytics({
  slug,
  products,
}: {
  slug: string;
  products: { id: string; title: string }[];
}) {
  const [days, setDays] = useState("30");
  const [report, setReport] = useState<AnalyticsResponse | null>(null);
  const [revision, refresh] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setReport(null);
    setError("");
    api<AnalyticsResponse>("analytics?days=" + days)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [days, revision]);
  async function toggle(
    field: "trackingEnabled" | "excludeOwnerVisits",
    enabled: boolean,
  ) {
    setSaving(true);
    setError("");
    try {
      await api("analytics/settings", { [field]: enabled }, "PATCH");
      setReport(
        (current) =>
          current && {
            ...current,
            settings: { ...current.settings, [field]: enabled },
          },
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const traffic = report?.traffic;
  const views = traffic?.trend.reduce((sum, row) => sum + row.views, 0) ?? 0;
  const visitors =
    traffic?.trend.reduce((sum, row) => sum + row.visitors, 0) ?? 0;
  return (
    <div className="traffic-report">
      <section className="panel">
        <div className="panel-heading">
          <h2>Storefront traffic</h2>
          <select
            aria-label="Analytics date range"
            value={days}
            disabled={saving}
            onChange={(e) => setDays(e.target.value)}
          >
            {["7", "30", "90"].map((n) => (
              <option key={n} value={n}>
                Last {n} days
              </option>
            ))}
          </select>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}{" "}
            <button
              className="subtle-link"
              disabled={saving}
              onClick={() => refresh((n) => n + 1)}
            >
              Reload
            </button>
          </p>
        )}
        {!report && !error && <p role="status">Loading traffic…</p>}
        {report?.status === "setup" && (
          <p role="status">
            Web analytics setup is pending. Your Sore operator can connect
            Cloudflare Analytics Engine to show traffic here.
          </p>
        )}
        {report?.status === "unavailable" && (
          <p role="status">
            Traffic data is unavailable. A new dataset becomes available after
            its first pageview.{" "}
            <button
              className="subtle-link"
              disabled={saving}
              onClick={() => refresh((n) => n + 1)}
            >
              Try again
            </button>
          </p>
        )}
        {report && !report.settings.trackingEnabled && (
          <p className="notice">Tracking is paused for this storefront.</p>
        )}
        {traffic && report && (
          <>
            <dl className="traffic-metrics">
              <div>
                <dt>Estimated daily visitors</dt>
                <dd>{count.format(visitors)}</dd>
              </div>
              <div>
                <dt>Pageviews</dt>
                <dd>{count.format(views)}</dd>
              </div>
            </dl>
            <p>
              Visitors are counted once per browser per UTC day and added across
              the range. Sampling and blocked storage can affect estimates.
            </p>
            {views ? (
              <>
                <h3>Pageviews by day</h3>
                <Trend trend={traffic.trend} />
              </>
            ) : (
              <p role="status">No pageviews recorded in this period.</p>
            )}
            <button
              className="button outline"
              onClick={() => downloadReport(slug, traffic, report.commerce)}
            >
              Export report
            </button>
          </>
        )}
      </section>
      {traffic && !!views && (
        <div className="traffic-breakdowns">
          {(
            [
              [
                "Top pages and products",
                traffic.pages.map((row) => ({
                  ...row,
                  label: row.label
                    ? products.find((p) => p.id === row.label)?.title ||
                      "Product " + row.label
                    : "/" + slug,
                })),
              ],
              ["Traffic sources", traffic.sources],
              [
                "Countries",
                traffic.countries.map((row) => ({
                  ...row,
                  label: /^[A-Z]{2}$/.test(row.label)
                    ? regions.of(row.label) || row.label
                    : row.label,
                })),
              ],
              ["Devices", traffic.devices],
              ["Browsers", traffic.browsers],
            ] as const
          ).map(([title, rows]) => (
            <section key={title} className="panel">
              <h3>{title}</h3>
              <table>
                <thead>
                  <tr>
                    <th>
                      {title === "Top pages and products" ? "Page" : "Group"}
                    </th>
                    <th>Pageviews</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.label}</td>
                      <td>{count.format(row.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
      {report && (
        <>
          <section className="panel">
            <h2>Shopping activity</h2>
            <dl className="traffic-metrics">
              <div>
                <dt>Product pageviews</dt>
                <dd>{traffic ? count.format(traffic.productViews) : "—"}</dd>
              </div>
              <div>
                <dt>Checkout starts</dt>
                <dd>{count.format(report.commerce.checkouts)}</dd>
              </div>
              <div>
                <dt>Purchases</dt>
                <dd>{count.format(report.commerce.purchases)}</dd>
              </div>
            </dl>
            <p>
              Checkout starts count paid checkout sessions opened. Purchases
              count confirmed payments. These order totals are independent of
              web tracking and visitor identity.
            </p>
          </section>
          <section className="panel">
            <h2>Tracking preferences</h2>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={report.settings.trackingEnabled}
                disabled={saving}
                onChange={(e) => toggle("trackingEnabled", e.target.checked)}
              />
              <span>Track storefront visits</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={report.settings.excludeOwnerVisits}
                disabled={saving}
                onChange={(e) => toggle("excludeOwnerVisits", e.target.checked)}
              />
              <span>Ignore my visits while I’m signed in</span>
            </label>
            <p>
              Private previews are excluded. Sore honors Do Not Track and Global
              Privacy Control. A random browser ID is scoped to this storefront
              and changes daily. Traffic reports use source categories, country
              and browser or device families.{" "}
              <a href="/privacy">Privacy notice</a>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
