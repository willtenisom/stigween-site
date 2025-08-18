import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Por favor defina MONGODB_URI no .env");

const options = {
  // SSL obrigatório para produção
  ssl: true,
};

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
  // Para dev local, às vezes o Windows/Node dá problemas de SSL
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, { ...options, tlsAllowInvalidCertificates: true });
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // Produção: TLS/SSL normal, sem ignorar certificados
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
