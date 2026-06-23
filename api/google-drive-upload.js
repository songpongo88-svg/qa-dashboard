export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbypLpTfP6swrUoRrM2x6YTa1OFif9uGB6mOmgY7JlaHgKx1cBwp0zt9VNuJpuYsYC9f/exec";

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}