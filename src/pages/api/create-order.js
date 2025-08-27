import { MercadoPagoConfig, Preference } from "mercadopago";

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new Preference(client);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.warn("❌ Método não permitido:", req.method);
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { title, quantity, price, names, email, clientId } = req.body ?? {};

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

    const result = await preference.create({
      body: {
       items: [
    {
        title,
         quantity: 1, 
         unit_price: price,
         urrency_id: "BRL",
     },
   ],
        payer: {
          name: payerName,
          email,
        },
        back_urls: {
          success: "https://stigween.vercel.app/?status=success",
          failure: "https://stigween.vercel.app/?status=failure",
          pending: "https://stigween.vercel.app/?status=pending"
        },
        notification_url: "https://stigween.vercel.app/api/webhook",
        auto_return: "approved",
        metadata: {
          buyer_friends: JSON.stringify(names),
        },
        external_reference: clientId || email,
      },
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
