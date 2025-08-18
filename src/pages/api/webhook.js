import { buffer } from "micro";
import nodemailer from "nodemailer";
import clientPromise from "../../lib/mongodb";

export const config = {
  api: { bodyParser: false },
};

// ===========================
// Configuração do transporter de e-mail
// ===========================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ===========================
// Função para envio de e-mail
// ===========================
async function sendPaymentEmail(paymentId, payerName, payerEmail, externalReference, buyerFriends) {
  const textEmail = `
💰 Novo pagamento aprovado!

ID do pagamento: ${paymentId}
Status: approved
Nome do pagador: ${payerName}
E-mail do pagador: ${payerEmail}
External Reference: ${externalReference}
Amigos: ${buyerFriends.join(", ") || "nenhum"}
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

// ===========================
// Função para envio ao Google Sheets
// ===========================
async function sendToSheets(paymentId, payerName, payerEmail, externalReference, buyerFriends, now) {
  try {
    const sheetsRes = await fetch(process.env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payerName,
        email: payerEmail,
        externalReference,
        friends: buyerFriends,
        paymentDate: now.toISOString(),
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

// ===========================
// Webhook handler
// ===========================
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

  const paymentId = body?.id;
  const payerEmail = body?.payer?.email;
  const payerFirstName = body?.payer?.first_name || "";
  const payerLastName = body?.payer?.last_name || "";
  const externalReference = body?.external_reference || "";
  const metadata = body?.metadata || {};

  if (!paymentId || !payerEmail) {
    return res.status(400).json({ error: "Campos obrigatórios faltando" });
  }

  const paymentStatus = body?.status || "approved";
  const payerName = `${payerFirstName} ${payerLastName}`.trim();

  let buyerFriends = [];
  try {
    const parsed = JSON.parse(metadata.buyer_friends || "[]");
    if (Array.isArray(parsed)) buyerFriends = parsed;
  } catch {
    console.warn("[WARN] buyer_friends inválido");
  }

  if (paymentStatus !== "approved") {
    console.log(`[INFO] Pagamento não aprovado, ignorando. Status: ${paymentStatus}`);
    return res.status(200).json({ message: "Ignorado", status: paymentStatus });
  }

  console.log("[INFO] Pagamento aprovado:", { paymentId, payerName, externalReference });

  const now = new Date();

  // ===========================
  // Salva no MongoDB
  // ===========================
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

  // ===========================
  // Envia notificações
  // ===========================
  await sendPaymentEmail(paymentId, payerName, payerEmail, externalReference, buyerFriends);
  await sendToSheets(paymentId, payerName, payerEmail, externalReference, buyerFriends, now);

  return res.status(200).json({ message: "Processado", paymentId, status: paymentStatus });
}
