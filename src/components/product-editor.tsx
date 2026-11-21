"use client";
import { useState } from "react";
import { Upload, FileText, Link2, Loader2, ImageIcon } from "lucide-react";
import { presentation, type Presentation } from "@/lib/presentation";
import PresentationEditor from "./presentation-editor";
import AssetUpload from "./asset-upload";
import { api, Modal } from "./shared";
export type Product = {
  id: string;
  title: string;
  description: string;
  image: string;
  buttonLabel: string;
  price: number;
  kind: string;
  deliveryType: string;
  deliveryUrl: string | null;
  assetId: string | null;
  state: string;
  position: number;
  presentationJson?: string;
  version?: number;
  revisionOf?: string | null;
  suggestedPrice?: number | null;
  priceConfirmed?: number;
  draftSource?: string;
};
export default function ProductEditor({
  product,
  currency,
  onClose,
  onSaved,
  draftOnly = false,
}: {
  product?: Product;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  draftOnly?: boolean;
}) {
  const [details, setDetails] = useState<Presentation>(
    presentation(product?.presentationJson),
  );
  const [confirmedPrice, setConfirmedPrice] = useState(false);
  const [form, setForm] = useState({
      title: product?.title || "",
      description: product?.description || "",
      image: product?.image || "",
      buttonLabel: product?.buttonLabel || "Get the resource",
      price: String((product?.price || 0) / 100),
      kind: product?.kind || "resource",
      deliveryType: product?.deliveryType || "url",
      deliveryUrl: product?.deliveryUrl || "",
      assetId: product?.assetId || null,
      state: product?.state || "draft",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [filename, setFilename] = useState(
      product?.assetId ? "Current deliverable retained" : "",
    );
  const change = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const prepared = await api<{
        assetId: string;
        url: string;
        headers: Record<string, string>;
      }>("uploads", {
        name: file.name,
        size: file.size,
        type:
          file.type ||
          (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/zip"),
      });
      const response = await fetch(prepared.url, {
        method: "PUT",
        headers: prepared.headers,
        body: file,
      });
      if (!response.ok)
        throw new Error("Upload failed. Check the storage CORS configuration.");
      await api("uploads/complete", { assetId: prepared.assetId });
      change("assetId", prepared.assetId);
      setFilename(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(state: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        "products" + (product ? "/" + product.id : ""),
        {
          ...form,
          state,
          price: Math.round(Number(form.price) * 100),
          presentation: {
            ...details,
            includedItems: details.includedItems.filter((x) => x.trim()),
            previewImages: details.previewImages.filter((x) => x.trim()),
          },
          expectedVersion: product?.version,
          confirmSuggestedPrice: confirmedPrice,
        },
        product ? "PATCH" : "POST",
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? "Edit product" : "Add product"}
      onClose={onClose}
      wide
    >
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          save(draftOnly ? "draft" : "published");
        }}
      >
        {product?.draftSource === "mcp" && (
          <div className="notice">
            <b>AI draft · version {product.version}</b>
            <p>
              Review the supplied copy before publishing.
              {product.revisionOf
                ? " This is a separate revision; the live product stays unchanged until you publish."
                : ""}
            </p>
            <a
              className="subtle-link"
              href={"/dashboard/preview?product=" + product.id}
              target="_blank"
              rel="noreferrer"
            >
              Open private product preview
            </a>
          </div>
        )}
        {product?.suggestedPrice !== null &&
          product?.suggestedPrice !== undefined &&
          product.priceConfirmed === 0 && (
            <div className="notice">
              <b>
                Proposed price:{" "}
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency,
                }).format(product.suggestedPrice / 100)}
              </b>
              <p>
                This proposal has not changed your live price. Choose the price
                below and confirm it yourself.
              </p>
              <button
                type="button"
                className="button outline compact"
                onClick={() => {
                  change("price", String(product.suggestedPrice! / 100));
                  setConfirmedPrice(true);
                }}
              >
                Use proposed price
              </button>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmedPrice}
                  onChange={(e) => setConfirmedPrice(e.target.checked)}
                />
                I confirm the price entered below.
              </label>
            </div>
          )}
        <div className="editor-grid">
          <div>
            <label>
              Product title
              <input
                required
                minLength={2}
                maxLength={140}
                value={form.title}
                placeholder="e.g. The Business Reset Workbook"
                onChange={(e) => change("title", e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                maxLength={5000}
                value={form.description}
                placeholder="What will your customer walk away with?"
                onChange={(e) => change("description", e.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Product type
                <select
                  value={form.kind}
                  onChange={(e) => change("kind", e.target.value)}
                >
                  <option value="resource">Digital resource</option>
                  <option value="link">External link</option>
                </select>
              </label>
              <label>
                Price ({currency.toUpperCase()})
                <input
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  disabled={form.kind === "link"}
                  value={form.price}
                  onChange={(e) => change("price", e.target.value)}
                />
                <small>Set to 0 for a free resource.</small>
              </label>
            </div>
            <label>
              Button label
              <input
                required
                maxLength={50}
                value={form.buttonLabel}
                onChange={(e) => change("buttonLabel", e.target.value)}
              />
            </label>
          </div>
          <div>
            <label>Product preview</label>
            <div className="cover-picker">
              {form.image ? (
                <img src={form.image} alt="Product cover preview" />
              ) : (
                <>
                  <ImageIcon size={30} />
                  <span>A good first impression</span>
                </>
              )}
            </div>
            <label>
              Preview image URL
              <input
                type="url"
                value={form.image.startsWith("/") ? "" : form.image}
                placeholder="https://…"
                onChange={(e) => change("image", e.target.value)}
              />
            </label>
            <AssetUpload
              purpose="image"
              label="Upload your cover image"
              onUploaded={(a) => change("image", a.url)}
            />
            <div className="sample-covers">
              {["business-reset", "pricing-playbook", "clarity-guide"].map(
                (n) => (
                  <button
                    type="button"
                    key={n}
                    aria-label={"Choose " + n + " cover"}
                    onClick={() => change("image", "/art/" + n + ".svg")}
                  >
                    <img src={"/art/" + n + ".svg"} alt={n} />
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
        <div className="delivery-box">
          <h3>Deliver the good stuff</h3>
          {form.kind !== "link" && (
            <div className="segmented">
              <button
                type="button"
                className={form.deliveryType === "url" ? "active" : ""}
                onClick={() => change("deliveryType", "url")}
              >
                <Link2 size={16} />
                Resource link
              </button>
              <button
                type="button"
                className={form.deliveryType === "file" ? "active" : ""}
                onClick={() => change("deliveryType", "file")}
              >
                <FileText size={16} />
                PDF or ZIP
              </button>
            </div>
          )}
          {form.deliveryType === "url" || form.kind === "link" ? (
            <label>
              {form.kind === "link"
                ? "Destination URL"
                : "Private delivery URL"}
              <input
                type="url"
                required
                value={form.deliveryUrl}
                placeholder="https://www.notion.so/…"
                onChange={(e) => change("deliveryUrl", e.target.value)}
              />
              <small>
                {form.kind === "link"
                  ? "Visitors open this link directly."
                  : "Only buyers and free-resource recipients receive this link."}
              </small>
            </label>
          ) : (
            <label className="upload-area">
              {uploading ? <Loader2 className="spin" /> : <Upload />}
              <b>{filename || "Choose a PDF or ZIP"}</b>
              <small>
                Up to 25 MB by default. Uploaded files stay private.
              </small>
              <input
                type="file"
                accept=".pdf,.zip"
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                }}
                disabled={uploading}
              />
            </label>
          )}
          <p className="fine-print">
            Replacing a deliverable preserves the version already purchased.
            Downloaded files and external links can still be shared by
            recipients.
          </p>
        </div>
        <PresentationEditor value={details} onChange={setDetails} />
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button
            type="button"
            className="button outline"
            disabled={busy || uploading}
            onClick={() => save("draft")}
          >
            Save as draft
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {busy ? <Loader2 className="spin" size={16} /> : null}
            {draftOnly
              ? "Save draft"
              : product?.state === "published"
                ? "Save changes"
                : product?.revisionOf
                  ? "Publish reviewed revision"
                  : "Publish product"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
