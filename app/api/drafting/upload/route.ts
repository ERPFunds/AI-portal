import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseOfficeAsync } from "officeparser";

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CHARS = 60_000;           // cap context stuffed into the prompt

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const filename: string = file.name;
  const mimeType: string = file.type;
  const arrayBuffer = await file.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max 10 MB)` }, { status: 413 });
  }

  const buf = Buffer.from(arrayBuffer);

  let text = "";
  try {
    if (/text|markdown|json|csv/.test(mimeType) || /\.(txt|md|csv|json)$/i.test(filename)) {
      text = buf.toString("utf-8");
    } else {
      text = await parseOfficeAsync(buf);
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not extract text: ${String(err)}` }, { status: 422 });
  }

  text = text.replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);

  if (!text) {
    return NextResponse.json({ error: "No readable text found in file" }, { status: 422 });
  }

  return NextResponse.json({ filename, text, chars: text.length });
}
