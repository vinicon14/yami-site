import { NextResponse } from "next/server";
import {
  chargesEnabled,
  formatPriceBrl,
  getMpAccessToken,
  getMpMode,
  getPriceBrl,
  getSiteUrl,
  PRODUCT,
} from "@/lib/config";
import { getStore } from "@/lib/db";
import {
  buildPreferencePayload,
  checkoutInitPoint,
  createPreference,
  reusablePendingOrder,
} from "@/lib/mp-checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Envio clássico de formulário às vezes não manda Origin; checa Referer.
    const referer = req.headers.get("referer");
    if (!referer) return false;
    try {
      return new URL(referer).origin === new URL(getSiteUrl()).origin;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).origin === new URL(getSiteUrl()).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) {
      return NextResponse.json({ error: "origem inválida" }, { status: 403 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    let email = "";
    let name = "";
    let accepted = false;

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      email = String(body.email ?? "").trim().toLowerCase();
      name = String(body.name ?? "").trim();
      accepted = Boolean(body.accepted);
    } else {
      const form = await req.formData();
      email = String(form.get("email") ?? "").trim().toLowerCase();
      name = String(form.get("name") ?? "").trim();
      accepted = String(form.get("accepted") ?? "") === "on" || String(form.get("accepted") ?? "") === "true";
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "informe um e-mail válido" }, { status: 400 });
    }
    if (!accepted) {
      return NextResponse.json({ error: "aceite os termos para continuar" }, { status: 400 });
    }

    const price = getPriceBrl();
    const store = await getStore();
    const reusable = reusablePendingOrder(await store.getOrdersByEmail(email), {
      amountBrl: price,
    });
    if (reusable?.mpPreferenceId) {
      return NextResponse.redirect(checkoutInitPoint(reusable.mpPreferenceId), {
        status: 303,
      });
    }
    const order = await store.createOrder({
      id: crypto.randomUUID(),
      email,
      name: name || null,
      amountBrl: price,
    });

    if (!chargesEnabled()) {
      if (getMpMode() === "production") {
        return NextResponse.json(
          {
            error:
              "Cobrança real está ligada, mas o token do Mercado Pago não está configurado neste ambiente.",
          },
          { status: 503 },
        );
      }
      // Modo teste: não chama a API do Mercado Pago.
      const url = `${getSiteUrl()}/checkout?demo=1&pedido=${encodeURIComponent(order.id)}`;
      return NextResponse.redirect(url, { status: 303 });
    }

    const payload = buildPreferencePayload({
      orderId: order.id,
      email,
      name,
      price,
      siteUrl: getSiteUrl(),
      version: PRODUCT.version,
    });

    const preference = await createPreference(payload, getMpAccessToken());
    await store.setPreferenceId(order.id, preference.id);

    return NextResponse.redirect(preference.init_point, { status: 303 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha no checkout";
    // Nunca incluir tokens ou corpos de API.
    console.error("checkout_failed", message);
    return NextResponse.json(
      {
        error: `Não foi possível iniciar o pagamento de ${formatPriceBrl()}. Tente de novo em instantes.`,
      },
      { status: 500 },
    );
  }
}
