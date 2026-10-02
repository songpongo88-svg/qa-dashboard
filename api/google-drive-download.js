export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query?.id || "").trim();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid Google Drive file id" });
  }

  try {
    const target = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    const response = await fetch(target, { redirect: "follow" });
    if (!response.ok) {
      return res.status(response.status).json({ error: "Google Drive download failed" });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("text/html")) {
      return res.status(502).json({
        error: "Google Drive returned a viewer page instead of the file. Check file sharing permission.",
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const inline = String(req.query?.inline || "") === "1";
    const requestedName = String(req.query?.name || "").replace(/[\r\n"]/g, "").trim();
    const fallbackName = contentType.startsWith("audio/") ? `voice-${id}` : `evidence-${id}.pdf`;
    const safeName = requestedName || fallbackName;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName}"`);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Google Drive download failed",
    });
  }
}
