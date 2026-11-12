import { NextResponse } from "next/server";
import { assertSameOrigin, requireApiUser, serializeError } from "@/lib/api";
import { persistUpload } from "@/lib/services/videoService";
import { createUploadReceipt } from "@/lib/videos/upload-receipt";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Debe adjuntar un archivo de video." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "El video supera el límite de 250 MB." }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = persistUpload(buffer, file.name);

    const receipt = createUploadReceipt(user.id, filename, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
    return NextResponse.json({ file: filename, receipt });
  } catch (error) {
    return serializeError(error);
  }
}
