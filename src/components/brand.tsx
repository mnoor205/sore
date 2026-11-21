import Link from "next/link";
export default function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand sore-brand" aria-label="Sore home">
      sore<span>.</span>
    </Link>
  );
}
