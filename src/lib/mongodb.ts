import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

// Check if the URI is missing or contains default placeholders
const isPlaceholder = 
  !uri || 
  uri.includes("<username>") || 
  uri.includes("<password>") || 
  uri.includes("xxxxx.mongodb.net");

let clientPromise: Promise<MongoClient>;

if (isPlaceholder) {
  // Reject lazy promise immediately to avoid DNS query failures for placeholders
  clientPromise = Promise.reject(
    new Error("MongoDB connection string is not configured. Please edit the MONGODB_URI in your \".env.local\" file to connect to MongoDB Atlas.")
  );
} else {
  const options = {};
  let client: MongoClient;

  if (process.env.NODE_ENV === "development") {
    // Preserve connection across hot reloads in dev mode
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri!, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // Standard connection in production
    client = new MongoClient(uri!, options);
    clientPromise = client.connect();
  }
}

export default clientPromise;
  