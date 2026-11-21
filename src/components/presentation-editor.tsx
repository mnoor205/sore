"use client";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import {
  presentation,
  type Presentation,
  sectionIds,
} from "@/lib/presentation";
import AssetUpload from "./asset-upload";
const names = {
  audience: "Who this is for",
  included: "What the buyer receives",
  previews: "Preview images & sample",
  faqs: "Frequently asked questions",
  testimonials: "Creator-supplied testimonials",
};
export default function PresentationEditor({
  value,
  onChange,
}: {
  value: Presentation;
  onChange: (p: Presentation) => void;
}) {
  const change = (patch: Partial<Presentation>) =>
    onChange({ ...value, ...patch });
  return (
    <section className="presentation-editor">
      <h3>Give your product a little more context</h3>
      <p>
        Optional sections only appear when you add content. Arrange or hide the
        five predefined sections below.
      </p>
      {value.sectionOrder.map((key, index) => (
        <div className="section-editor" key={key}>
          <div className="section-editor-heading">
            <b>{names[key]}</b>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!value.hiddenSections.includes(key)}
                onChange={(e) =>
                  change({
                    hiddenSections: e.target.checked
                      ? value.hiddenSections.filter((x) => x !== key)
                      : [...value.hiddenSections, key],
                  })
                }
              />
              Show
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={"Move " + names[key] + " up"}
              disabled={index === 0}
              onClick={() => {
                const order = [...value.sectionOrder];
                [order[index - 1], order[index]] = [
                  order[index],
                  order[index - 1],
                ];
                change({ sectionOrder: order });
              }}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={"Move " + names[key] + " down"}
              disabled={index === 4}
              onClick={() => {
                const order = [...value.sectionOrder];
                [order[index + 1], order[index]] = [
                  order[index],
                  order[index + 1],
                ];
                change({ sectionOrder: order });
              }}
            >
              <ArrowDown size={15} />
            </button>
          </div>
          {key === "audience" && (
            <label>
              Who is this useful for?
              <textarea
                rows={3}
                maxLength={2000}
                value={value.audience}
                onChange={(e) => change({ audience: e.target.value })}
                placeholder="Describe the people this resource is made for."
              />
            </label>
          )}
          {key === "included" && (
            <label>
              Included items, one per line
              <textarea
                rows={4}
                value={value.includedItems.join("\n")}
                onChange={(e) =>
                  change({
                    includedItems: e.target.value
                      .split("\n")
                      .map((x) => x.trim()),
                  })
                }
                placeholder="A practical workbook\nEditable templates\nA getting-started guide"
              />
            </label>
          )}
          {key === "previews" && (
            <>
              <label>
                Preview image URLs, one per line
                <textarea
                  rows={2}
                  value={value.previewImages.join("\n")}
                  onChange={(e) =>
                    change({
                      previewImages: e.target.value
                        .split("\n")
                        .map((x) => x.trim()),
                    })
                  }
                  placeholder="https://…"
                />
              </label>
              <AssetUpload
                purpose="image"
                label="Upload a preview image"
                onUploaded={(a) =>
                  change({ previewImages: [...value.previewImages, a.url] })
                }
              />
              <div className="sample-upload">
                <p>
                  A sample is a separate file you explicitly choose to share
                  publicly after publication. Your purchased deliverable is
                  never used as a sample.
                </p>
                <AssetUpload
                  purpose="sample"
                  label={
                    value.sampleAssetId
                      ? "Replace public sample"
                      : "Upload a separate sample PDF / ZIP"
                  }
                  onUploaded={(a) => change({ sampleAssetId: a.id })}
                />
                {value.sampleAssetId && (
                  <button
                    type="button"
                    className="subtle-link"
                    onClick={() => change({ sampleAssetId: null })}
                  >
                    Remove sample
                  </button>
                )}
              </div>
            </>
          )}
          {key === "faqs" && (
            <>
              {value.faqs.map((faq, i) => (
                <div className="repeatable-field" key={i}>
                  <button
                    type="button"
                    className="icon-button remove-field"
                    aria-label="Remove FAQ"
                    onClick={() =>
                      change({ faqs: value.faqs.filter((_, j) => j !== i) })
                    }
                  >
                    <X size={15} />
                  </button>
                  <label>
                    Question
                    <input
                      maxLength={300}
                      value={faq.question}
                      onChange={(e) =>
                        change({
                          faqs: value.faqs.map((f, j) =>
                            j === i ? { ...f, question: e.target.value } : f,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Answer
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={faq.answer}
                      onChange={(e) =>
                        change({
                          faqs: value.faqs.map((f, j) =>
                            j === i ? { ...f, answer: e.target.value } : f,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                type="button"
                className="button outline compact"
                disabled={value.faqs.length >= 15}
                onClick={() =>
                  change({
                    faqs: [...value.faqs, { question: "", answer: "" }],
                  })
                }
              >
                <Plus size={14} />
                Add FAQ
              </button>
            </>
          )}
          {key === "testimonials" && (
            <>
              <p>
                Use only testimonials you have actually received and have
                permission to publish. Leave this section empty otherwise.
              </p>
              {value.testimonials.map((t, i) => (
                <div className="repeatable-field" key={i}>
                  <button
                    type="button"
                    className="icon-button remove-field"
                    aria-label="Remove testimonial"
                    onClick={() =>
                      change({
                        testimonials: value.testimonials.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                  <label>
                    Quote
                    <textarea
                      maxLength={2000}
                      rows={3}
                      value={t.quote}
                      onChange={(e) =>
                        change({
                          testimonials: value.testimonials.map((f, j) =>
                            j === i ? { ...f, quote: e.target.value } : f,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Name
                      <input
                        maxLength={100}
                        value={t.name}
                        onChange={(e) =>
                          change({
                            testimonials: value.testimonials.map((f, j) =>
                              j === i ? { ...f, name: e.target.value } : f,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Detail (optional)
                      <input
                        maxLength={200}
                        value={t.detail}
                        onChange={(e) =>
                          change({
                            testimonials: value.testimonials.map((f, j) =>
                              j === i ? { ...f, detail: e.target.value } : f,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button outline compact"
                disabled={value.testimonials.length >= 10}
                onClick={() =>
                  change({
                    testimonials: [
                      ...value.testimonials,
                      { quote: "", name: "", detail: "" },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add supplied testimonial
              </button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
