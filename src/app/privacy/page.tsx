import Link from "next/link";
import Brand from "@/components/brand";
export default function Page() {
  return (
    <main className="policy-page">
      <Brand />
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
        When a creator enables web analytics, this browser stores a random ID
        for their storefront. It changes each UTC day. The storefront sends
        page and product views with a source category. Sore records a daily
        storefront-specific hash, country, device type and browser family.
        Analytics events omit names, emails, IP addresses, full URLs and search
        terms. Cloudflare retains web traffic events for three months. Sore
        skips private previews and honors Do Not Track and Global Privacy
        Control. Creators can also exclude their signed-in visits.
      </p>
      <p>
        Checkout and delivery records support your purchase independently of web
        analytics. Stripe handles payment details.
      </p>
      <p>
        Contact the creator using the support email on their storefront for
        access, refund, privacy or deletion requests. Configure a verified
        transactional email sender before production use. This is an MVP notice;
        the operator must supply business identity, retention periods and
        jurisdiction-specific terms before launch.
      </p>
      <Link href="/">Back to Sore</Link>
    </main>
  );
}
