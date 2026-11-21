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
  const claimed = 5 - quote.remaining;
  return (
    <div className="sf-price-change">
      <div className="sf-price-change-label">
        <strong>
          {quote.remaining} {quote.remaining === 1 ? "purchase" : "purchases"}{" "}
          left at ${quote.price}
        </strong>
        <span>Then ${quote.nextPrice}</span>
      </div>
      <div
        className="sf-buyer-slots"
        role="img"
        aria-label={`${claimed} of 5 purchases completed in this price tier. ${quote.remaining} remaining before the price increases to ${quote.nextPrice}.`}
      >
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} data-claimed={index < claimed} />
        ))}
      </div>
      <p>Every 5 buyers adds $10. Get in at the lower price.</p>
    </div>
  );
}
