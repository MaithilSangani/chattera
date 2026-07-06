import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "chatbotDB";

const isPlaceholder =
  !uri ||
  uri.includes("<username>") ||
  uri.includes("<password>") ||
  uri.includes("xxxxx.mongodb.net") ||
  uri.includes("your_mongodb_uri_here");

const options = {
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  serverApi: ServerApiVersion.v1,
};

let clientPromise: Promise<MongoClient>;

if (isPlaceholder) {
  clientPromise = Promise.reject(
    new Error(
      "MongoDB connection string is not configured. Set MONGODB_URI in Vercel or your local .env.local file."
    )
  );
} else {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    const client = new MongoClient(uri!, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }

  clientPromise = globalWithMongo._mongoClientPromise;
}

export default clientPromise;
export { dbName };
