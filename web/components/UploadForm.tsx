"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/api";

export function UploadForm() {
  const router = useRouter();

  const [error, formAction, isPending] = useActionState<
    string | undefined,
    FormData
  >(async (_previousError, formData) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      return "Choose a file first.";
    try {
      const { deckId } = await uploadFile(file);
      router.push(`/decks/${deckId}`);
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : "Upload failed";
    }
  }, undefined);

  return (
    <form action={formAction}>
      <label className={`upload-zone ${isPending ? "busy" : ""}`}>
        <input
          type="file"
          name="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md"
          disabled={isPending}
          aria-describedby={error ? "upload-error" : undefined}
          onChange={(e) => {
            e.currentTarget.form?.requestSubmit();
            // Clear so picking the same file again (after a failure) re-fires change.
            e.currentTarget.value = "";
          }}
        />
        <span className="upload-title">
          {isPending ? "Filing your pages…" : "Drop anything worth remembering"}
        </span>
        <span className="upload-hint">pdf · image · text — max 20 mb</span>
      </label>
      {error && (
        <p id="upload-error" className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
