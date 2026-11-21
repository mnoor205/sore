"use client";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/shared";
export default function Page() {
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/signout", { method: "POST" })
      .then(async (r) => {
        const result = (await r.json()) as { url: string; error?: string };
        if (!r.ok) throw new Error(result.error || "Unable to sign out");
        window.location.href = result.url;
      })
      .catch((e) => setError(e.message));
  }, []);
  return error ? (
    <p role="alert">
      {error} <a href="/sign-out">Try again</a>
    </p>
  ) : (
    <Spinner />
  );
}
