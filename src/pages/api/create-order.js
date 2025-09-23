import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.warn("❌ Método não permitido:", req.method);
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { title, quantity, price, names, email, clientId, coupon } = req.body ?? {};

  if (
    !title || typeof title !== "string" ||
    !quantity || typeof quantity !== "number" || quantity < 1 ||
    !price || typeof price !== "number" || price <= 0 ||
    !names || !Array.isArray(names) || names.length === 0 ||
    !email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    console.warn("⚠️ Dados inválidos ou incompletos:", req.body);
    return res.status(400).json({ error: "Dados inválidos ou incompletos" });
  }

  try {
    const payerName = names.map(n => String(n)).join(", ");

    console.log(`📦 Criando preferência para: ${payerName} <${email}>`);

    const envBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.SITE_URL || "";
    const headerProto = req.headers["x-forwarded-proto"] || (req.headers.origin ? new URL(req.headers.origin).protocol.replace(":", "") : "");
    const headerHost = req.headers["x-forwarded-host"] || req.headers.host || "";
    const inferredBase = headerProto && headerHost ? `${headerProto}://${headerHost}` : "";
    const baseUrl = (envBase || inferredBase || "http://localhost:3000").replace(/\/$/, "");

    const isLocalhost = /localhost|127\.0\.0\.1/i.test(baseUrl);

    const backUrls = {
      success: `${baseUrl}/?status=success`,
      failure: `${baseUrl}/?status=failure`,
      pending: `${baseUrl}/?status=pending`,
    };

    const preferenceBody = {
      items: [
        {
          title,
          quantity: 1,
          unit_price: price,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: payerName,
        email,
      },
      back_urls: backUrls,
      notification_url: `${baseUrl}/api/webhook`,
      metadata: {
        buyer_friends: JSON.stringify(names),
        coupon_code: coupon || "",
        promotional_code: coupon || "",
      },
      external_reference: clientId || email,
    };

    // Mercado Pago rejeita auto_return quando back_urls não são públicos (ex.: localhost)
    if (!isLocalhost) {
      preferenceBody.auto_return = "approved";
    }

    const result = await preference.create({
      body: preferenceBody,
    });

    if (!result?.id || !result?.init_point) {
      console.error("❌ Resposta inesperada do MercadoPago:", result);
      return res.status(502).json({ error: "Falha ao criar preferência" });
    }

    console.log(`✅ Preferência criada: ${result.id}`);

    
    return res.status(200).json({
      init_point: result.init_point,
      preference_id: result.id,
    });
  } catch (err) {
    console.error("❌ Erro MercadoPago:", err);
    return res.status(500).json({ error: "Erro interno ao criar preferência" });
  }
}
