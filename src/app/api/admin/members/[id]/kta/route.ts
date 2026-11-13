import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { can } from "@/lib/security/rbac";
import { forbidden } from "@/lib/http";
import { cardFile, issueCard, listCards, revokeCard, rotateQrToken } from "@/server/services/kta.service";

type P = { id: string };

/**
 * GET /api/admin/members/:id/kta?format=pdf|png → active card file (download)
 * GET /api/admin/members/:id/kta               → card history
 */
export const GET = adminRoute<P>({ permission: "member:read" }, async ({ req, params, auth, ctx }) => {
  const id = paramStr(params.id);
  const format = req.nextUrl.searchParams.get("format");
  if (format === "pdf" || format === "png") {
    if (!can(auth.user.role, "kta:issue")) throw forbidden();
    const file = await cardFile(auth, id, format, ctx);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `${format === "pdf" ? "inline" : "attachment"}; filename="${file.filename}"`,
      },
    });
  }
  return ok(await listCards(auth, id));
});

const actionSchema = z.object({ action: z.enum(["issue", "revoke", "rotate_qr"]).default("issue") });

/** POST { action: "issue" | "revoke" | "rotate_qr" } */
export const POST = adminRoute<P>({ permission: "kta:issue" }, async ({ req, params, auth, ctx }) => {
  const id = paramStr(params.id);
  const { action } = await parseJson(req, actionSchema);
  if (action === "revoke") {
    await revokeCard(auth, id, ctx);
    return ok({ revoked: true });
  }
  if (action === "rotate_qr") {
    await rotateQrToken(auth, id, ctx);
    return ok({ rotated: true, note: "Previous cards revoked — issue a new card" });
  }
  return ok(await issueCard(auth, id, ctx), { status: 201 });
});
