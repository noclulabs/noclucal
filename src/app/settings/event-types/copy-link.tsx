"use client";

import { useState } from "react";

interface CopyLinkProps {
  /** The absolute public booking URL, built server-side via `publicBookingUrl`. */
  url: string;
}

/**
 * Read-only display of an event type's public booking URL with a copy-to-
 * clipboard button. The slug is not editable here (that lives in the edit
 * form); this is share-only. The URL is built on the server from the app-URL
 * helper and passed in, so this component never constructs the host.
 */
export function CopyLink({ url }: CopyLinkProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (insecure context, denied permission).
      // The URL is still visible for manual selection, so fail quietly.
    }
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="truncate text-xs text-foreground-muted" title={url}>
        {url}
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center rounded-full border-[1.5px] border-border px-3 py-1 text-xs font-medium text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
