export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbylbofwrg2ACewevItVtx5JbHMRKlJxA_hcIkDYzzWkTZERTxX1YD5bO59MoBAk_ccS/exec";

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}