"use client";
import { useState, type ReactNode } from "react";
import type { VisitReport } from "@/lib/reporting";

const date = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const number = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});
const formatDay = (day: string) => date.format(new Date(day + "T00:00:00Z"));

function VisitChart({ days }: { days: VisitReport["days"] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const size = days.length > 30 ? 7 : 1;
  const points = [];
  for (let i = 0; i < days.length; i += size) {
    const slice = days.slice(i, i + size);
    const first = formatDay(slice[0].day);
    const last = formatDay(slice[slice.length - 1].day);
    points.push({
      label: first === last ? first : first + " – " + last,
      count: slice.reduce((n, day) => n + day.count, 0),
    });
  }
  const peak = Math.max(1, ...points.map((p) => p.count));
  const x = (i: number) => (1000 * i) / Math.max(1, points.length - 1);
  const y = (value: number) => 96 - (value / peak) * 90;
  const index = Math.min(selected ?? points.length - 1, points.length - 1);
  const point = points[index];
  return (
    <div className="visit-chart">
      <div className="visit-caption">
        <span>{size === 1 ? "Daily" : "Weekly"} product views · UTC</span>
        <output>
          {point.label} · {number.format(point.count)} views
        </output>
      </div>
      <div className="visit-plot">
        <span className="visit-scale">
          {number.format(peak)}
          <span>0</span>
        </span>
        <div className="visit-line">
          <svg
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 6H1000 M0 51H1000 M0 96H1000"
              className="visit-gridlines"
            />
            <polyline
              points={points.map((p, i) => x(i) + "," + y(p.count)).join(" ")}
            />
          </svg>
          <i
            className="visit-point"
            style={{ left: x(index) / 10 + "%", top: y(point.count) + "%" }}
          />
          <input
            type="range"
            min={0}
            max={points.length - 1}
            value={index}
            aria-label="Explore product views over time"
            aria-valuetext={point.label + ", " + point.count + " views"}
            onChange={(e) => setSelected(Number(e.currentTarget.value))}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse") return;
              const rect = e.currentTarget.getBoundingClientRect();
              setSelected(
                Math.max(
                  0,
                  Math.min(
                    points.length - 1,
                    Math.round(
                      ((e.clientX - rect.left) / rect.width) *
                        (points.length - 1),
                    ),
                  ),
                ),
              );
            }}
          />
        </div>
      </div>
      <div className="visit-caption">
        <span>{formatDay(days[0].day)}</span>
        <span>{formatDay(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

export default function VisitAnalytics({
  report,
  rangeControl,
}: {
  report: VisitReport;
  rangeControl?: ReactNode;
}) {
  const { days, total, previous, products } = report;
  const busiest = days.reduce(
    (best, d) => (d.count > best.count ? d : best),
    days[0],
  );
  const delta = total - previous;
  return (
    <section className="panel visit-panel" aria-label="Product views">
      <div className="panel-heading">
        <h2>Product views</h2>
        {rangeControl}
      </div>
      <p>
        One view per visitor, per product, per UTC day. Creator previews are
        excluded.
      </p>
      <div className="visit-summary">
        <div>
          <span>Measured views</span>
          <strong>{number.format(total)}</strong>
        </div>
        <div>
          <span>Previous {days.length} days</span>
          <strong>{number.format(previous)}</strong>
          {previous > 0 && (
            <small>
              {delta > 0 ? "+" : ""}
              {percent.format(delta / previous)} change
            </small>
          )}
        </div>
        <div>
          <span>Busiest day</span>
          <strong>{total ? formatDay(busiest.day) : "—"}</strong>
          {total > 0 && <small>{number.format(busiest.count)} views</small>}
        </div>
      </div>
      <VisitChart days={days} />
      <h3>Views by product</h3>
      {total === 0 ? (
        <p className="visit-empty">No measured product views in this period.</p>
      ) : (
        <ul className="visit-ranking">
          {products.map((p) => (
            <li key={p.id}>
              <div>
                <b>{p.title}</b>
                <span>
                  {number.format(p.count)} views ·{" "}
                  {percent.format(p.count / total)}
                </span>
              </div>
              <div className="visit-track">
                <i style={{ width: (100 * p.count) / total + "%" }} />
              </div>
              <small>
                {number.format(p.orders)} paid orders ·{" "}
                {number.format(p.signups)} free signups
              </small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
