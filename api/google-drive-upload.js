export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL =
    process.env.GOOGLE_APPS_SCRIPT_UPLOAD_URL ||
    "https://script.google.com/macros/s/AKfycbypLpTfP6swrUoRrM2x6YTa1OFif9uGB6mOmgY7JlaHgKx1cBwp0zt9VNuJpuYsYC9f/exec";

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      return res.status(500).json({ error: data.error || "Google Drive upload failed" });
    }
    return res.status(200).json({
      id: data.id || data.fileId || "",
      name: data.name || body?.fileName || "evidence-file",
      webViewLink: data.webViewLink || data.url || data.fileUrl || "",
      webContentLink: data.webContentLink || "",
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
