import { NextResponse } from "next/server";
import manifest from "@/lib/yamios/latest.json";
import { JOIN_SCRIPT_FILES, buildJoinScripts, type JoinScriptKind } from "@/lib/yamios/join-scripts";

export const dynamic = "force-static";

function isKind(value: string): value is JoinScriptKind {
  return value === "windows" || value === "unix";
}

export function generateStaticParams() {
  return [{ kind: "windows" }, { kind: "unix" }];
}

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!isKind(kind)) {
    return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });
  }

  const bundle = buildJoinScripts(manifest);
  if (!bundle) {
    return NextResponse.json({ error: "iso_indisponivel" }, { status: 404 });
  }

  const file = JOIN_SCRIPT_FILES[kind];
  return new NextResponse(bundle[file.field], {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
