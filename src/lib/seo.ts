import { useEffect } from "react";

// Lightweight per-page <head> management for the public (indexable) pages.
// Client-rendered, but Google executes JS so these are picked up on crawl.
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta(opts: { title: string; description?: string; canonicalPath?: string }) {
  const { title, description, canonicalPath } = opts;
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    upsertMeta("property", "og:title", title);
    if (description) {
      upsertMeta("name", "description", description);
      upsertMeta("property", "og:description", description);
    }
    if (canonicalPath) {
      const url = `https://chordfinderai.com${canonicalPath}`;
      upsertLink("canonical", url);
      upsertMeta("property", "og:url", url);
    }
    return () => {
      document.title = prevTitle;
    };
  }, [title, description, canonicalPath]);
}
