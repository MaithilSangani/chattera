import { NextResponse } from "next/server";
import clientPromise, { dbName } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || username.trim().length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters." },
        { status: 400 }
      );
    }
    if (!password || password.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db(dbName);
    const usersCollection = db.collection("users");

    const normalizedUsername = username.trim().toLowerCase();

    // Check if user exists
    const user = await usersCollection.findOne({ username: normalizedUsername });

    if (user) {
      // User exists, verify password
      if (user.password !== password) {
        return NextResponse.json(
          { error: "Incorrect password for this username." },
          { status: 401 }
        );
      }
      return NextResponse.json({ username: user.usernameDisplay }, { status: 200 });
    } else {
      // User doesn't exist, auto-register them
      await usersCollection.insertOne({
        username: normalizedUsername,
        usernameDisplay: username.trim(),
        password,
        createdAt: new Date(),
      });

      return NextResponse.json(
        { username: username.trim() },
        { status: 201 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currentUser = searchParams.get("currentUser");

    const client = await clientPromise;
    const db = client.db(dbName);
    const usersCollection = db.collection("users");
    const messagesCollection = db.collection("messages");

    // Fetch all users, projecting usernameDisplay and username, excluding passwords
    const users = await usersCollection
      .find({}, { projection: { password: 0 } })
      .toArray();

    let assistantCount = 0;
    if (currentUser) {
      const normCurrentUser = currentUser.trim().toLowerCase();
      // Count messages with the Assistant
      assistantCount = await messagesCollection.countDocuments({
        chatOwner: normCurrentUser,
        $or: [
          { recipient: "Assistant" },
          { recipient: { $exists: false } }
        ]
      });
    }

    // Map DB fields and calculate message count for each contact
    const formattedUsers = await Promise.all(
      users.map(async (u) => {
        const usernameKey = u.username;
        let messageCount = 0;

        if (currentUser) {
          const normCurrentUser = currentUser.trim().toLowerCase();
          const normContact = usernameKey.trim().toLowerCase();
          
          messageCount = await messagesCollection.countDocuments({
            $or: [
              { sender: normCurrentUser, recipient: normContact },
              { sender: normContact, recipient: normCurrentUser }
            ]
          });
        }

        return {
          username: u.usernameDisplay || u.username,
          usernameKey: usernameKey,
          messageCount: messageCount,
        };
      })
    );

    return NextResponse.json({
      assistantCount,
      contacts: formattedUsers
    }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
