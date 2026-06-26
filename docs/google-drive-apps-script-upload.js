const QA_EVIDENCE_FOLDER_ID = "1RoWdiu-lcB287rVBHzmNCXPMTnejE8TK";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const fileName = sanitizeFileName(payload.fileName || payload.name || "evidence-file");
    const contentType = payload.contentType || payload.mimeType || "application/octet-stream";
    const caseId = sanitizeFileName(payload.caseId || "uncategorized");
    const dataBase64 = payload.dataBase64 || payload.base64 || "";

    if (!dataBase64) {
      return jsonResponse({ error: "File data is missing." });
    }

    const bytes = Utilities.base64Decode(dataBase64);
    const blob = Utilities.newBlob(bytes, contentType, `${caseId}-${Date.now()}-${fileName}`);
    const folder = DriveApp.getFolderById(QA_EVIDENCE_FOLDER_ID);
    const file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse({
      id: file.getId(),
      name: file.getName(),
      webViewLink: file.getUrl(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error && error.message ? error.message : error) });
  }
}

function sanitizeFileName(value) {
  return String(value || "evidence-file")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "evidence-file";
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
