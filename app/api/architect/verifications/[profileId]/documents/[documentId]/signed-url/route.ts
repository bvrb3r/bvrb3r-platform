import { NextResponse } from "next/server";
import {
  createArchitectVerificationDocumentSignedUrl,
  isVerificationAccessError
} from "@/lib/platform-admin/verification-service";
import { requireArchitectAdmin } from "@/app/api/architect/verifications/_shared";

export async function POST(_request: Request, { params }: { params: Promise<{ profileId: string; documentId: string }> }) {
  const access = await requireArchitectAdmin();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { profileId, documentId } = await params;
    const result = await createArchitectVerificationDocumentSignedUrl(profileId, documentId, access.user);
    return NextResponse.json(result);
  } catch (error) {
    if (isVerificationAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to create a secure verification document URL." }, { status: 500 });
  }
}
