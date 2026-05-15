export interface FileHandlerResult {
  url: string | null;
  version: string | null;
  saved: boolean;
  message: string;
}

// In-memory token cache (lives for the duration of the serverless function instance)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getGraphToken(): Promise<string | null> {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) return null;

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph token fetch failed: ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export async function saveToOneDrive(params: {
  content: string;
  filename: string;
  folder: string; // e.g. "/Decks/Q2 LP Deck" or "/OMs/Tampa Property"
  contentType?: string;
}): Promise<FileHandlerResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return {
      url: null,
      version: null,
      saved: false,
      message: `OneDrive auth failed: ${String(err)}. Output saved to portal log only.`,
    };
  }

  if (!token) {
    return {
      url: null,
      version: null,
      saved: false,
      message: "OneDrive not configured — AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET not set. Output saved to portal log only.",
    };
  }

  try {
    const userEmail = process.env.SMTP_USER;
    if (!userEmail) throw new Error("SMTP_USER not set — needed for OneDrive user path");

    // Ensure folder path starts with /
    const folderPath = params.folder.startsWith("/") ? params.folder : `/${params.folder}`;
    const fullPath = `${folderPath}/${params.filename}`;

    // Encode path segments individually, preserving slashes
    const encodedPath = fullPath
      .split("/")
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    const uploadUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive/root:/${encodedPath}:/content`;

    const bodyBuffer = Buffer.from(params.content, "utf-8");
    const contentType = params.contentType ?? "text/plain; charset=utf-8";

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "Content-Length": String(bodyBuffer.length),
      },
      body: bodyBuffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Graph API ${res.status}: ${errText}`);
    }

    const fileData = await res.json();
    return {
      url: fileData.webUrl ?? null,
      version: fileData.eTag ?? fileData.id ?? null,
      saved: true,
      message: `Saved to OneDrive: ${fileData.webUrl ?? fullPath}`,
    };
  } catch (err) {
    return {
      url: null,
      version: null,
      saved: false,
      message: `OneDrive save failed: ${String(err)}. Output saved to portal log only.`,
    };
  }
}

export function buildOneDriveFolder(params: {
  prefix: string;
  projectContext: string;
  workflowId: string;
}): string {
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  if (params.prefix === "BUILD" || params.prefix === "WRITE") {
    const type = params.workflowId === "deck-builder" ? "Decks" : "OMs";
    return `/${type}/${params.projectContext}`;
  }
  if (params.workflowId === "save-file-only") {
    return `/Research/${month}`;
  }
  return `/Research/${month}`;
}

export function buildFilename(params: {
  projectContext: string;
  workflowId: string;
}): string {
  const slug = params.projectContext
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  const date = new Date().toISOString().split("T")[0];
  return `${slug}-${params.workflowId}-${date}.txt`;
}
