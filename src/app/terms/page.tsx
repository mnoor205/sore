import Link from "next/link";
export default function Page() {
  return (
    <main className="policy-page">
      <Link className="brand" href="/">
        Sore.
      </Link>
      <h1>Resource terms</h1>
      <p>
        Digital resources are sold or provided by the creator identified on the
        storefront. Contact that creator for product support, licensing and
        refund policies. The creator is responsible for product-sale taxes and
        disputes.
      </p>
      <p>
        Paid access unlocks only after confirmed payment. A full refund revokes
        further protected access. Downloaded files and external resource links
        cannot be made impossible to share. Replacing a resource preserves the
        purchased version’s access.
      </p>
      <p>
        Sore’s platform plan is separate from resource purchases. A
        founding lifetime entitlement retains the purchased capabilities and
        quotas without automatic subscription conversion. Recurring
        subscriptions have a seven-day failed-payment grace period; new
        checkouts pause after lapse, while exports and existing buyer access
        remain available.
      </p>
      <p>
        This is a development MVP. No production legal identity, refund policy
        or jurisdiction has been configured. The operator and each creator must
        publish appropriate final policies before accepting live sales.
      </p>
      <Link href="/">Back to Sore</Link>
    </main>
  );
}
