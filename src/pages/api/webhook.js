import { buffer } from "micro";
import nodemailer from "nodemailer";
import clientPromise from "../../lib/mongodb";

export const config = {
  api: { bodyParser: false },
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPaymentEmail(paymentId, payerName, payerEmail, externalReference, buyerFriends, couponData) {
  const friendsList = buyerFriends.filter(
    (friend) => friend.trim().toLowerCase() !== payerName.trim().toLowerCase()
  );

  const couponInfo = couponData.code || couponData.amount > 0 
    ? `Cupom: ${couponData.code || "N/A"} (${couponData.type}) - Valor: R$ ${(couponData.amount / 100).toFixed(2)}`
    : "Nenhum cupom utilizado";

  const textEmail = `
💰 Novo pagamento aprovado!

ID do pagamento: ${paymentId}
Status: approved
Nome do pagador: ${payerName}
E-mail do pagador: ${payerEmail}
External Reference: ${externalReference}
Amigos: ${friendsList.length > 0 ? friendsList.join(", ") : "nenhum"}
${couponInfo}
  `.trim();

  try {
    await transporter.sendMail({
      from: `"Stigween" <${process.env.SMTP_USER}>`,
      to: process.env.CONFIRMATION_EMAIL_TO,
      subject: `Pagamento aprovado - ${payerName}`,
      text: textEmail,
    });
    console.log("[INFO] E-mail enviado para confirmação");
  } catch (err) {
    console.error("[ERROR] Falha ao enviar e-mail:", err);
  }
}

async function sendToSheets(paymentId, payerName, payerEmail, externalReference, buyerFriends, now, couponData) {
  const friendsList = buyerFriends.filter(
    (friend) => friend.trim().toLowerCase() !== payerName.trim().toLowerCase()
  );

  try {
    const sheetsRes = await fetch(process.env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payerName,
        email: payerEmail,
        externalReference,
        friends: friendsList,
        paymentDate: now.toISOString(),
        couponCode: couponData.code || "",
        couponAmount: couponData.amount || 0,
        couponType: couponData.type || "",
        paymentId: paymentId,
      }),
    });

    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text().catch(() => "Erro ao ler resposta do Sheets");
      console.error("[ERROR] Google Sheets:", errText);
    } else {
      console.log("[INFO] Dados enviados ao Google Sheets");
    }
  } catch (err) {
    console.error("[ERROR] Falha ao enviar para Google Sheets:", err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  let body;
  try {
    body = JSON.parse((await buffer(req)).toString());
  } catch {
    return res.status(400).json({ error: "JSON inválido" });
  }

  const paymentId = body?.data?.id || body?.id;
  if (!paymentId) {
    return res.status(400).json({ error: "Campos obrigatórios faltando" });
  }

  console.log("[INFO] Webhook recebido, buscando detalhes do pagamento:", paymentId);

  let payment;
  try {
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    payment = await mpRes.json();

    if (!payment?.id) {
      console.error("[ERROR] Pagamento não encontrado no MP:", paymentId);
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }
  } catch (err) {
    console.error("[ERROR] Falha ao buscar pagamento no MP:", err);
    return res.status(500).json({ error: "Erro ao buscar pagamento" });
  }

  const payerEmail = payment?.payer?.email;
  const payerFirstName = payment?.payer?.first_name || "";
  const payerLastName = payment?.payer?.last_name || "";
  const externalReference = payment?.external_reference || "";
  const metadata = payment?.metadata || {};
  const paymentStatus = payment?.status;

  let buyerFriends = [];
  try {
    const parsed = JSON.parse(metadata.buyer_friends || "[]");
    if (Array.isArray(parsed)) buyerFriends = parsed;
  } catch {
    console.warn("[WARN] buyer_friends inválido");
  }
  
  let payerName = `${payerFirstName} ${payerLastName}`.trim();
  
  console.log(`[DEBUG] Nome extraído do MP: "${payerName}" (first_name: "${payerFirstName}", last_name: "${payerLastName}")`);
  
  if (!payerName) {
    if (buyerFriends.length > 0) {
      payerName = buyerFriends[0];
      console.log(`[DEBUG] Nome extraído do primeiro amigo (pagador): "${payerName}"`);
    }
    
    if (!payerName) {
      payerName = payment?.payer?.name || "";
      console.log(`[DEBUG] Nome do campo payer.name: "${payerName}"`);
    }
    
    if (!payerName) {
      payerName = "Cliente";
      console.log(`[DEBUG] Usando nome genérico: "${payerName}"`);
    }
  }
  
  console.log(`[INFO] Nome final do pagador: "${payerName}"`);

  const couponData = {
    code: "",
    amount: 0,
    type: ""
  };


  if (payment?.coupon_amount && payment.coupon_amount > 0) {
    couponData.amount = payment.coupon_amount;
    couponData.type = "coupon";
  }
  
  if (payment?.discount_amount && payment.discount_amount > 0) {
    couponData.amount = payment.discount_amount;
    couponData.type = "discount";
  }

  couponData.code = metadata.coupon_code || 
                    metadata.promotional_code || 
                    metadata.discount_code || 
                    payment?.coupon_id || 
                    payment?.campaign_id || 
                    "";

  if (!couponData.code && metadata) {
    Object.keys(metadata).forEach(key => {
      if (key.toLowerCase().includes('cupom') || 
          key.toLowerCase().includes('coupon') || 
          key.toLowerCase().includes('promocional') || 
          key.toLowerCase().includes('desconto')) {
        couponData.code = metadata[key];
      }
    });
  }


  if (paymentStatus !== "approved") {
    console.log(`[INFO] Pagamento não aprovado, ignorando. Status: ${paymentStatus}`);
    return res.status(200).json({ message: "Ignorado", status: paymentStatus });
  }

  const now = new Date();

  try {
    const db = (await clientPromise).db();
    const existing = await db.collection("pagamentos").findOne({ paymentId });

    if (existing?.status === "approved") {
      console.log("[INFO] Pagamento já processado, ignorando duplicado:", paymentId);
      return res.status(200).json({ message: "Duplicado ignorado", status: existing.status });
    }

    await db.collection("pagamentos").updateOne(
      { paymentId },
      {
        $set: {
          status: paymentStatus,
          payerEmail,
          payerName,
          externalReference,
          metadata,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    console.log("[INFO] Pagamento salvo no MongoDB");
  } catch (err) {
    console.error("[ERROR] MongoDB:", err);
  }

  if (couponData.code || couponData.amount > 0) {
    console.log("[INFO] Cupom encontrado:", couponData);
  }

  await sendPaymentEmail(paymentId, payerName, payerEmail, externalReference, buyerFriends, couponData);
  await sendToSheets(paymentId, payerName, payerEmail, externalReference, buyerFriends, now, couponData);

  return res.status(200).json({ message: "Processado", paymentId, status: paymentStatus });
}
