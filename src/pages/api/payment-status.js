import clientPromise from "../../lib/mongodb";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { clientId, paymentId } = req.query;

  if (!clientId && !paymentId) {
    return res.status(400).json({ error: "clientId ou paymentId é obrigatório" });
  }

  try {
    const db = (await clientPromise).db();
    
    const searchQuery = paymentId 
      ? { paymentId } 
      : { externalReference: clientId };
    
    const payment = await db.collection("pagamentos").findOne(
      searchQuery,
      { sort: { createdAt: -1 } }
    );

    if (!payment) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    return res.status(200).json({
      status: payment.status,
      paymentId: payment.paymentId,
      payerName: payment.payerName,
      payerEmail: payment.payerEmail,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  } catch (err) {
    console.error("[ERROR] Erro ao buscar status do pagamento:", err);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}
