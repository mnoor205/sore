import Link from "next/link";
import Brand from "@/components/brand";
export default function Page() {
  return (
    <div className="not-found">
      <Brand />
      <h1>This little corner is empty.</h1>
      <p>The store or product you’re looking for isn’t available.</p>
      <Link className="button primary" href="/">
        Back to Sore
      </Link>
    </div>
  );
}
