import Link from "next/link";

/** Shared wordmark: the supplied emblem sits beside the name, with one accessible name. */
export function Wordmark() {
  return (
    <span className="sore-wordmark" role="img" aria-label="sore">
      <img
        src="/brand/sore-mark.webp"
        className="sore-wordmark-mark"
        width={64}
        height={64}
        alt=""
        aria-hidden="true"
      />
      <span aria-hidden="true">sore</span>
    </span>
  );
}

export default function Brand({
  href = "/",
  className = "brand sore-brand",
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={className} aria-label="Sore home">
      <Wordmark />
    </Link>
  );
}
