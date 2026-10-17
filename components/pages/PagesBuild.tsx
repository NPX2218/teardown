import type { CSSProperties } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Public files are requested as root paths (`/models/...`). Next only prefixes
 * its own `/_next` assets for `basePath`, so the Pages build rewrites those
 * fetches in the browser. Absent unless PAGES_EXPORT=1.
 */
function prefixScript(base: string): string {
  return `(() => {
    try {
      var base = ${JSON.stringify(base)};
      var roots = ["/models/", "/textures/", "/sounds/", "/audio/", "/imagine/"];
      function rewrite(url) {
        if (typeof url !== "string" || url === "") return url;
        var abs;
        try { abs = new URL(url, location.origin); } catch (e) { return url; }
        if (abs.origin !== location.origin) return url;
        var path = abs.pathname;
        if (path === base || path.indexOf(base + "/") === 0) return url;
        var hit = false;
        for (var i = 0; i < roots.length; i++) {
          var root = roots[i];
          if (path === root.slice(0, -1) || path.indexOf(root) === 0) { hit = true; break; }
        }
        if (!hit) return url;
        abs.pathname = base + path;
        if (url.charAt(0) === "/" && url.charAt(1) !== "/") return abs.pathname + abs.search + abs.hash;
        return abs.toString();
      }
      var origFetch = window.fetch;
      if (typeof origFetch === "function") {
        window.fetch = function (input, init) {
          try {
            if (typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)) {
              input = rewrite(String(input));
            } else if (typeof Request !== "undefined" && input instanceof Request) {
              var nextUrl = rewrite(input.url);
              if (nextUrl !== input.url) input = new Request(nextUrl, input);
            }
          } catch (e) {}
          return origFetch.call(this, input, init);
        };
      }
      if (typeof XMLHttpRequest !== "undefined") {
        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
          var args = Array.prototype.slice.call(arguments);
          if (typeof args[1] === "string") args[1] = rewrite(args[1]);
          return origOpen.apply(this, args);
        };
      }
      function patchSrc(proto) {
        if (!proto) return;
        var desc = Object.getOwnPropertyDescriptor(proto, "src");
        if (!desc || typeof desc.set !== "function") return;
        Object.defineProperty(proto, "src", {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (value) {
            desc.set.call(this, typeof value === "string" ? rewrite(value) : value);
          },
        });
      }
      if (window.HTMLImageElement) patchSrc(HTMLImageElement.prototype);
      if (window.HTMLMediaElement) patchSrc(HTMLMediaElement.prototype);
      var origSet = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (name, value) {
        if ((name === "src" || name === "href") && typeof value === "string") value = rewrite(value);
        return origSet.call(this, name, value);
      };
    } catch (e) {}
  })();`;
}

const NOTE: CSSProperties = {
  position: "fixed",
  zIndex: 400,
  left: 12,
  bottom: 36,
  margin: 0,
  padding: "2px 8px",
  borderRadius: 4,
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  lineHeight: 1.4,
  color: "var(--text-sx)",
  background: "var(--scrim-80)",
  pointerEvents: "none",
};

/** Runs before app scripts so GLB, texture, sound, and audio URLs include the Pages base path. */
export function PagesAssetPrefix() {
  if (!BASE) return null;
  return <script dangerouslySetInnerHTML={{ __html: prefixScript(BASE) }} />;
}

export function PagesPreviewNote() {
  if (!BASE) return null;
  return <p style={NOTE}>Preview of main · static build</p>;
}
