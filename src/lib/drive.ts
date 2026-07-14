import { Readable } from "node:stream";
import {
  auth as googleAuth,
  drive as driveApi,
  type drive_v3,
} from "@googleapis/drive";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type UploadResult = { fileId: string; webViewLink: string };

let cachedDrive: drive_v3.Drive | null = null;

/**
 * Authenticate as a real Google user via OAuth2 (client id/secret + a
 * long-lived refresh token). We use OAuth — not a service account — because a
 * service account has no Drive storage quota and cannot own files in a personal
 * (My Drive) folder. Uploaded files are owned by the authorizing user and count
 * against their normal Drive quota. The OAuth2 client auto-refreshes the
 * short-lived access token using the refresh token.
 */
function getDrive(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN",
    );
  }

  const oauth2 = new googleAuth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  cachedDrive = driveApi({ version: "v3", auth: oauth2 });
  return cachedDrive;
}

/**
 * Upload a .docx buffer to the configured Drive folder (owned by the OAuth
 * user). Throws on failure so the run can retry.
 */
export async function uploadToDrive(
  buffer: Buffer,
  filename: string,
): Promise<UploadResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");
  }

  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: DOCX_MIME, body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error("Drive upload returned no file id");
  }

  return { fileId, webViewLink: res.data.webViewLink ?? "" };
}
