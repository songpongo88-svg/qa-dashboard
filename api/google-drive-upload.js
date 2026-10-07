function driveFileId(value) {
  const text = String(value || "").trim();
  try {
    const url = new URL(text);
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname)) return "";
    return url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get("id") || "";
  } catch { return ""; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL =
    process.env.GOOGLE_APPS_SCRIPT_UPLOAD_URL ||
    "https://script.google.com/macros/s/AKfycbypLpTfP6swrUoRrM2x6YTa1OFif9uGB6mOmgY7JlaHgKx1cBwp0zt9VNuJpuYsYC9f/exec";

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const fileName = body.fileName || body.name || "evidence-file";
    const contentType = body.contentType || body.mimeType || "application/octet-stream";
    const dataBase64 = body.dataBase64 || body.base64 || "";
    if (body.uploadKind === "appeal-image") {
      if (contentType !== "image/jpeg" || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
        return res.status(400).json({ error: "Invalid appeal image" });
      }
      const image = Buffer.from(dataBase64, "base64");
      if (!image.length || image.length > 1024 * 1024 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
        return res.status(400).json({ error: "รูปหลังย่อต้องเป็น JPG และไม่เกิน 1 MB" });
      }
    }
    const uploadPayload = {
      ...body,
      fileName,
      name: body.name || fileName,
      contentType,
      mimeType: body.mimeType || contentType,
      dataBase64,
      base64: body.base64 || dataBase64,
      caseId: body.caseId || "draft-case",
    };

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(uploadPayload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      return res.status(500).json({ error: data.error || "Google Drive upload failed" });
    }

    const nested = data.file && typeof data.file === "object"
      ? data.file
      : data.data && typeof data.data === "object"
        ? data.data
        : {};
    const idCandidates = [data.id, data.fileId, nested.id, nested.fileId,
      ...[data.webViewLink, data.url, data.fileUrl, data.link, nested.webViewLink, nested.url, nested.fileUrl, nested.link].map(driveFileId)];
    const id = idCandidates.map(value => String(value || "").trim()).find(value => /^[A-Za-z0-9_-]+$/.test(value)) || "";
    const webViewLink =
      data.webViewLink ||
      data.url ||
      data.fileUrl ||
      data.link ||
      nested.webViewLink ||
      nested.url ||
      nested.fileUrl ||
      nested.link ||
      (id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : "");

    if (!webViewLink) {
      return res.status(502).json({
        error: "Google Drive upload completed but no file link was returned",
      });
    }

    // Image galleries need the file ID for their inline download URL. Legacy
    // upload scripts sometimes return only the Drive link, so resolve it above.
    if (body.uploadKind === "appeal-image" && !id) {
      return res.status(502).json({ error: "อัปโหลดรูปแล้ว แต่ไม่ได้รับรหัสไฟล์จาก Google Drive กรุณาลองใหม่" });
    }

    return res.status(200).json({
      id,
      name: data.name || nested.name || fileName,
      webViewLink,
      webContentLink: data.webContentLink || nested.webContentLink || "",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
