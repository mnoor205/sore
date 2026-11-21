import { Check, Download } from "lucide-react";
import { presentation } from "@/lib/presentation";
export default function ProductSections({ value }: { value?: string }) {
  const p = presentation(value);
  return (
    <div className="product-sections">
      {p.sectionOrder
        .filter((k) => !p.hiddenSections.includes(k))
        .map((key) => {
          if (key === "audience" && p.audience)
            return (
              <section key={key}>
                <span className="eyebrow">MADE WITH YOU IN MIND</span>
                <h2>Who this is for</h2>
                <p>{p.audience}</p>
              </section>
            );
          if (key === "included" && p.includedItems.length)
            return (
              <section key={key}>
                <h2>What you’ll receive</h2>
                <ul className="included-list">
                  {p.includedItems.map((item, i) => (
                    <li key={i}>
                      <Check size={18} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          if (key === "previews" && (p.previewImages.length || p.sampleAssetId))
            return (
              <section key={key}>
                <h2>Take a closer look</h2>
                {p.previewImages.length > 0 && (
                  <div className="preview-gallery">
                    {p.previewImages.map((src, i) => (
                      <a href={src} key={i} target="_blank" rel="noreferrer">
                        <img
                          src={src}
                          alt={`Product preview ${i + 1}`}
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
                {p.sampleAssetId && (
                  <a
                    className="button outline"
                    href={"/api/media/" + p.sampleAssetId}
                  >
                    <Download size={16} />
                    Download the free sample
                  </a>
                )}
              </section>
            );
          if (key === "faqs" && p.faqs.length)
            return (
              <section key={key}>
                <h2>A few things you might be wondering</h2>
                {p.faqs.map((f, i) => (
                  <details className="product-faq" key={i}>
                    <summary>{f.question}</summary>
                    <p>{f.answer}</p>
                  </details>
                ))}
              </section>
            );
          if (key === "testimonials" && p.testimonials.length)
            return (
              <section key={key}>
                <h2>In their words</h2>
                {p.testimonials.map((t, i) => (
                  <blockquote key={i}>
                    <p>“{t.quote}”</p>
                    <footer>
                      <b>{t.name}</b>
                      {t.detail && <span>{t.detail}</span>}
                    </footer>
                  </blockquote>
                ))}
              </section>
            );
          return null;
        })}
    </div>
  );
}
