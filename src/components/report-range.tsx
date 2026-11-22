import { ChevronDown } from "lucide-react";

export default function ReportRange({
  label,
  days,
  onChange,
  includeYear,
  disabled,
}: {
  label: string;
  days: string;
  onChange: (days: string) => void;
  includeYear?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="report-range">
      <select
        aria-label={label}
        value={days}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {(includeYear ? [7, 30, 90, 365] : [7, 30, 90]).map((n) => (
          <option key={n} value={n}>
            Last {n} days
          </option>
        ))}
      </select>
      <ChevronDown size={15} aria-hidden="true" />
    </label>
  );
}
