"use client";
import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { api } from "./shared";
export default function AssetUpload({
  purpose,
  onUploaded,
  label,
}: {
  purpose: "image" | "sample" | "deliverable";
  onUploaded: (asset: { id: string; url: string; name: string }) => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState("");
  return (
    <div className="asset-upload">
      <label className="button outline compact">
        {busy ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}{" "}
        {busy ? "Uploading…" : label}
        <input
          aria-label={label}
          type="file"
          hidden
          disabled={busy}
          accept={
            purpose === "image"
              ? ".png,.jpg,.jpeg,.webp,.gif,.avif"
              : ".pdf,.zip"
          }
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              const a = await api<{
                assetId: string;
                url: string;
                headers: Record<string, string>;
              }>("uploads", {
                purpose,
                name: file.name,
                size: file.size,
                type:
                  file.type ||
                  (/\.pdf$/i.test(file.name)
                    ? "application/pdf"
                    : "application/zip"),
              });
              const response = await fetch(a.url, {
                method: "PUT",
                headers: a.headers,
                body: file,
              });
              if (!response.ok) throw new Error("Upload failed. Please retry.");
              await api("uploads/complete", { assetId: a.assetId });
              setName(file.name);
              onUploaded({
                id: a.assetId,
                url: "/api/media/" + a.assetId,
                name: file.name,
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {name && <small>{name}</small>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
