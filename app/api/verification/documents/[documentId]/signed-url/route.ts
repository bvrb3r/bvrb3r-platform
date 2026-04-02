import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import {
  createVerificationDocumentSignedUrl,
  isVerificationAccessError
} from "@/lib/platform-admin/verification-service";

export async function POST(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { user } = await getCurrentUserFromServer();
    if (user.accountStatus && user.accountStatus !== "active") {
      return NextResponse.json({ error: "Account access is disabled." }, { status: 403 });
    }

    const { documentId } = await params;
    const result = await createVerificationDocumentSignedUrl(documentId, user);
    return NextResponse.json(result);
  } catch (error) {
    if (isVerificationAccessError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to create a secure verification document URL." }, { status: 500 });
  }
}
