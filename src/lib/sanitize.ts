import sanitizeHtml from "sanitize-html";

/**
 * Server-side HTML sanitiser for rich-text content coming from the editor.
 * The public site renders contentHtml with dangerouslySetInnerHTML, so this
 * is the XSS boundary: only editor-produced markup survives, and iframes are
 * limited to known video hosts.
 */
const IFRAME_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.facebook.com"];

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "blockquote", "pre", "code",
      "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark",
      "ul", "ol", "li", "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tr", "th", "td", "iframe", "span",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "title", "loading"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      span: ["class"],
      p: ["class", "style"],
      h2: ["style"],
      h3: ["style"],
      h4: ["style"],
      code: ["class"],
    },
    // Only text alignment from the editor; every other inline style is dropped.
    allowedStyles: { "*": { "text-align": [/^(left|center|right|justify)$/] } },
    allowedClasses: { span: ["highlight"], p: ["lead", "text-center"], code: [/^language-[a-z0-9]+$/] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "http", "data"] },
    allowedIframeHostnames: IFRAME_HOSTS,
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.href && /^https?:\/\//.test(attribs.href) ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}),
        },
      }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
      iframe: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy" } }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !!frame.attribs.src?.startsWith("data:") && frame.attribs.src.length > 200_000,
  });
}

export function plainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function readingMinutes(html: string): number {
  const words = plainText(html).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Validates a video URL for VIDEO_EMBED media and returns its provider. */
export function videoProvider(url: string): "youtube" | "vimeo" | "facebook" | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") return "youtube";
  if (host === "vimeo.com" || host === "player.vimeo.com") return "vimeo";
  if (host === "facebook.com" || host === "fb.watch") return "facebook";
  return null;
}
