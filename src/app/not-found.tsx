import Link from "next/link";
export default function Page() {
  return (
    <div className="not-found">
      <span className="brand-icon">c</span>
      <h1>This little corner is empty.</h1>
      <p>The store or product you’re looking for isn’t available.</p>
      <Link className="button primary" href="/">
        Back to Coachlane
      </Link>
    </div>
  );
}
