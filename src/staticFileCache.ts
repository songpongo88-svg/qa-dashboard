type CachedStaticResponse = {
  status: number;
  statusText: string;
  contentType: string;
  buffer: ArrayBuffer;
};

const staticResponseCache = new Map<string, Promise<CachedStaticResponse>>();

export async function fetchCachedStaticResponse(url: string) {
  // Separate assets from different deploys and never retain a failed download.
  const version = String(import.meta.env.VITE_DEPLOY_COMMIT_SHA || "");
  const requestUrl = version && url.startsWith("/")
    ? `${url}${url.includes("?") ? "&" : "?"}deploy=${encodeURIComponent(version)}` : url;
  const cacheKey = requestUrl;
  if (!staticResponseCache.has(cacheKey)) {
    staticResponseCache.set(
      cacheKey,
      fetch(requestUrl, { cache: "no-cache" }).then(async (response) => {
        if (!response.ok) throw new Error(`Static file unavailable (${response.status}): ${url}`);
        return {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type") || "",
        buffer: await response.arrayBuffer(),
        };
      }).catch(error => {
        staticResponseCache.delete(cacheKey);
        throw error;
      })
    );
  }

  const cached = await staticResponseCache.get(cacheKey)!;
  return new Response(cached.buffer.slice(0), {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.contentType ? { "Content-Type": cached.contentType } : undefined,
  });
}
