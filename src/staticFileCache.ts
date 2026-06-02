type CachedStaticResponse = {
  status: number;
  statusText: string;
  contentType: string;
  buffer: ArrayBuffer;
};

const staticResponseCache = new Map<string, Promise<CachedStaticResponse>>();

export async function fetchCachedStaticResponse(url: string) {
  const cacheKey = url;
  if (!staticResponseCache.has(cacheKey)) {
    staticResponseCache.set(
      cacheKey,
      fetch(url, { cache: "default" }).then(async (response) => ({
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type") || "",
        buffer: await response.arrayBuffer(),
      }))
    );
  }

  const cached = await staticResponseCache.get(cacheKey)!;
  return new Response(cached.buffer.slice(0), {
    status: cached.status,
    statusText: cached.statusText,
    headers: cached.contentType ? { "Content-Type": cached.contentType } : undefined,
  });
}
