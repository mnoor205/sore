import type { FoundingOffer } from "@/lib/founding-offer";
export default function FoundingPriceChange({
  quote,
}: {
  quote: FoundingOffer["quote"];
}) {
  if (!quote)
    return (
      <p className="sf-unavailable">Live pricing is temporarily unavailable.</p>
    );
  const slots = quote.every,
    claimed = Math.max(0, slots - quote.remaining);
  return (
    <div className="sf-price-change">
      <div className="sf-price-change-label">
        <strong>
          {quote.remaining} {quote.remaining === 1 ? "purchase" : "purchases"}{" "}
          left at ${quote.price}
        </strong>
        {quote.nextPrice !== null && <span>Then ${quote.nextPrice}</span>}
      </div>
      <div
        className="sf-buyer-slots"
        role="img"
        aria-label={`${claimed} of ${slots} purchases completed in this price tier. ${quote.remaining} remaining${quote.nextPrice !== null ? ` before the price increases to $${quote.nextPrice}` : ""}.`}
      >
        {Array.from({ length: slots }, (_, index) => (
          <span key={index} data-claimed={index < claimed} />
        ))}
      </div>
      <p>
        Every {slots} buyers adds ${quote.step}. Get in at the lower price.
      </p>
    </div>
  );
}
