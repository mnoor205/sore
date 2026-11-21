import Link from "next/link";
export default function Page() {
  return (
    <main className="policy-page">
      <Link className="brand" href="/">
        coachlane.
      </Link>
      <h1>Privacy notice</h1>
      <p>
        This MVP collects your name and email to deliver the resource you
        request and records the source product, timestamps, payment state, and
        delivery attempts. Marketing consent is optional and separate from
        delivery.
      </p>
      <p>
        Store owners can access and export their own customer records. Connected
        AI clients can read catalog and aggregate performance only; buyer
        personal information is excluded.
      </p>
      <p>
        Product views use a random browser identifier stored locally and a
        store-specific hash, deduplicated per UTC day. Creator previews are
        excluded. Requests may be rate limited. Payment details are handled by
        Stripe-hosted checkout.
      </p>
      <p>
        Contact the creator using the support email on their storefront for
        access, refund, privacy or deletion requests. Configure a verified
        transactional email sender before production use. This is an MVP notice;
        the operator must supply business identity, retention periods and
        jurisdiction-specific terms before launch.
      </p>
      <Link href="/">Back to Coachlane</Link>
    </main>
  );
}
