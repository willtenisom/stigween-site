import fetch from "node-fetch";
import clientPromise from "../../lib/mongodb";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Payment ID ausente" });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    return res.status(500).json({ error: "Token Mercado Pago não configurado" });
  }

  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const paymentData = await response.json();

    const client = await clientPromise;
    const db = client.db();
    const collection = db.collection("pagamentos");

    let payerName = `${paymentData.payer?.first_name || ""} ${paymentData.payer?.last_name || ""}`.trim();
    
    if (!payerName && paymentData.metadata?.buyer_friends) {
      try {
        const parsed = JSON.parse(paymentData.metadata.buyer_friends || "[]");
        if (Array.isArray(parsed) && parsed.length > 0) {
          payerName = parsed[0]; 
        }
      } catch {
      }
    }
    
    if (!payerName) {
      payerName = paymentData.payer?.name || "Cliente";
    }

    await collection.updateOne(
      { paymentId: id },
      {
        $set: {
          status: paymentData.status,
          payerEmail: paymentData.payer?.email || null,
          payerName: payerName || null,
          externalReference: paymentData.external_reference || null,
          metadata: paymentData.metadata || {},
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({ message: "Pagamento atualizado com sucesso", paymentData });
  } catch (error) {
    console.error("[ERROR] Erro ao atualizar pagamento:", error);
    return res.status(500).json({ error: "Erro ao atualizar pagamento" });
  }
}
