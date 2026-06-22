import crypto from "node:crypto";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES * 1.4) {
        reject(new Error("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw.trim()) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured.");

  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Google service account JSON is missing client_email or private_key.");
  }

  return {
    clientEmail: parsed.client_email,
    privateKey: normalizePrivateKey(parsed.private_key),
  };
}

async function getAccessToken() {
  const account = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: account.clientEmail,
    scope: DRIVE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(account.privateKey);
  const assertion = `${unsignedToken}.${base64Url(signature)}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || "Google token request failed.");
  }

  return tokenPayload.access_token;
}

function safeFileName(value) {
  return String(value || "evidence-file")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "evidence-file";
}

function buildMultipartBody(metadata, fileBuffer, contentType) {
  const boundary = `qa-drive-${crypto.randomBytes(12).toString("hex")}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType || "application/octet-stream"}\r\n\r\n`,
      "utf8"
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);

  return { boundary, body };
}

async function createReaderPermission(fileId, accessToken) {
  const mode = String(process.env.GOOGLE_DRIVE_LINK_PERMISSION || "").toLowerCase();
  if (!["anyone", "anyone_with_link", "public"].includes(mode)) return;

  await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const folderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
    if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not configured.");

    const rawBody = await readRequestBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const fileName = safeFileName(payload.fileName);
    const contentType = String(payload.contentType || "application/octet-stream");
    const dataBase64 = String(payload.dataBase64 || "");
    const caseId = safeFileName(payload.caseId || "uncategorized");

    if (!dataBase64) throw new Error("File data is missing.");
    const fileBuffer = Buffer.from(dataBase64, "base64");
    if (!fileBuffer.length) throw new Error("File is empty.");
    if (fileBuffer.length > MAX_UPLOAD_BYTES) throw new Error("File is larger than 15 MB.");

    const accessToken = await getAccessToken();
    const metadata = {
      name: `${caseId}-${Date.now()}-${fileName}`,
      parents: [folderId],
    };
    const multipart = buildMultipartBody(metadata, fileBuffer, contentType);

    const uploadResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${multipart.boundary}`,
          "Content-Length": String(multipart.body.length),
        },
        body: multipart.body,
      }
    );

    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok || !uploadPayload.id) {
      throw new Error(uploadPayload.error?.message || "Google Drive upload failed.");
    }

    await createReaderPermission(uploadPayload.id, accessToken);

    sendJson(response, 200, {
      id: uploadPayload.id,
      name: uploadPayload.name,
      webViewLink: uploadPayload.webViewLink || `https://drive.google.com/file/d/${uploadPayload.id}/view`,
      webContentLink: uploadPayload.webContentLink || "",
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Google Drive upload failed.",
    });
  }
}
