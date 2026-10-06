// Keep only one Base64 copy in the browser request. Sending aliases together
// doubles the body and makes ordinary call recordings hit Vercel's 413 limit.
const MAX_DRIVE_REQUEST_BYTES = 4_400_000;

export async function uploadEvidenceFileToDrive(file: File, caseId: string) {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("อ่านไฟล์สำหรับอัปโหลดไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
  const body = JSON.stringify({
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    caseId: caseId || "draft-case",
    dataBase64,
  });
  if (new Blob([body]).size > MAX_DRIVE_REQUEST_BYTES) {
    throw new Error("ไฟล์มีขนาดใหญ่เกินช่องทางอัปโหลดสำรอง");
  }
  const response = await fetch("/api/google-drive-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.webViewLink) {
    if (response.status === 413) throw new Error("ไฟล์มีขนาดใหญ่เกินช่องทางอัปโหลดสำรอง");
    throw new Error(payload.error || `อัปโหลดไฟล์สำรองไม่สำเร็จ (HTTP ${response.status})`);
  }
  return String(payload.webViewLink);
}
