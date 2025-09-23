import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Por favor defina MONGODB_URI no .env");

const options = {
  ssl: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 60000, 
};

let client;
let clientPromise;

async function connectClient() {
  try {
    console.log("[MongoDB] Tentando conectar ao banco...");
    const client = new MongoClient(uri, options);
    await client.connect();
    console.log("[MongoDB] Conexão bem-sucedida!");
    return client;
  } catch (err) {
    console.error("[MongoDB] Falha ao conectar:", err);
    throw err;
  }
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    clientPromise = connectClient();
    global._mongoClientPromise = clientPromise;
  } else {
    clientPromise = global._mongoClientPromise;
  }
} else {
  clientPromise = connectClient();
}

export default clientPromise;
