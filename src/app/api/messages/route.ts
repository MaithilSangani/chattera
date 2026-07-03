import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sender = searchParams.get("sender") || searchParams.get("username"); // fallback to old username query param
    const recipient = searchParams.get("recipient") || "Assistant";

    if (!sender) {
      return NextResponse.json(
        { error: "Sender query parameter is required." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("chatbotDB");
    const messagesCollection = db.collection("messages");

    const normSender = sender.trim().toLowerCase();
    const normRecipient = recipient.trim().toLowerCase();

    let query = {};
    if (normRecipient === "assistant") {
      // Chat history with the Assistant bot
      query = {
        chatOwner: normSender,
        $or: [
          { recipient: "Assistant" },
          { recipient: { $exists: false } } // match old messages
        ]
      };
    } else {
      // Private chat history between two real users
      query = {
        $or: [
          { sender: normSender, recipient: normRecipient },
          { sender: normRecipient, recipient: normSender }
        ]
      };
    }

    const messages = await messagesCollection
      .find(query)
      .sort({ createdAt: 1 })
      .toArray();

    // Map DB fields to client format
    const formattedMessages = messages.map((m) => ({
      id: m._id.toString(),
      role: m.role || (m.sender === normSender ? "user" : "bot"),
      senderName: m.senderName || m.sender,
      content: m.content,
      fileData: m.fileData || null,
      fileName: m.fileName || null,
      fileType: m.fileType || null,
      createdAt: m.createdAt,
    }));

    return NextResponse.json(formattedMessages, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { role, senderName, sender, recipient, content, fileData, fileName, fileType } = await request.json();

    const activeSender = sender || senderName;
    const activeRecipient = recipient || "Assistant";

    if (!activeSender || (!content && !fileData)) {
      return NextResponse.json(
        { error: "Sender and either content or file attachment are required." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("chatbotDB");
    const messagesCollection = db.collection("messages");

    const normSender = activeSender.trim().toLowerCase();
    const normRecipient = activeRecipient.trim().toLowerCase();
    const createdAt = new Date();

    const newMessagesToInsert = [];

    // 1. Insert User Message
    const userMsg = {
      chatOwner: normSender,
      sender: normSender,
      recipient: normRecipient === "assistant" ? "Assistant" : normRecipient,
      role: role || "user",
      senderName: activeSender.trim(),
      content: content || "",
      fileData: fileData || null,
      fileName: fileName || null,
      fileType: fileType || null,
      createdAt: createdAt,
    };
    newMessagesToInsert.push(userMsg);

    // 2. Generate and Insert Assistant Reply if the recipient is the bot
    let botMsg = null;
    if (normRecipient === "assistant" && role !== "bot") {
      let replyText = "hii";
      const query = (content || "").toLowerCase().trim();

      if (query === "hii" || query === "hi" || query === "hello") {
        replyText = "hii! How can I help you?";
      } else if (query === "how are you?" || query === "how are you") {
        replyText = "I am fine, how are you?";
      } else if (query.includes("mongodb") || query.includes("database")) {
        replyText = "I am connected to the 'chatbotDB' database on MongoDB Atlas. You can store users and messages here.";
      } else if (query === "tell me a joke") {
        replyText = "Why don't databases go to bars? Because they prefer a clean table join!";
      } else {
        replyText = "How can I assist you with your workspace questions?";
      }

      botMsg = {
        chatOwner: normSender,
        sender: "assistant",
        recipient: normSender,
        role: "bot",
        senderName: "Assistant",
        content: replyText,
        fileData: null,
        fileName: null,
        fileType: null,
        createdAt: new Date(createdAt.getTime() + 100), // slightly later timestamp
      };
      newMessagesToInsert.push(botMsg);
    }

    const result = await messagesCollection.insertMany(newMessagesToInsert);

    // Format response to send back to client
    const responseArray = [
      {
        id: result.insertedIds[0].toString(),
        role: userMsg.role,
        senderName: userMsg.senderName,
        content: userMsg.content,
        fileData: userMsg.fileData,
        fileName: userMsg.fileName,
        fileType: userMsg.fileType,
      },
    ];

    if (botMsg) {
      responseArray.push({
        id: result.insertedIds[1].toString(),
        role: botMsg.role,
        senderName: botMsg.senderName,
        content: botMsg.content,
        fileData: null,
        fileName: null,
        fileType: null,
      });
    }

    return NextResponse.json(responseArray, { status: 201 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sender = searchParams.get("sender") || searchParams.get("username");
    const recipient = searchParams.get("recipient") || "Assistant";

    if (!sender) {
      return NextResponse.json(
        { error: "Sender query parameter is required." },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("chatbotDB");
    const messagesCollection = db.collection("messages");

    const normSender = sender.trim().toLowerCase();
    const normRecipient = recipient.trim().toLowerCase();

    let query = {};
    if (normRecipient === "assistant") {
      query = {
        chatOwner: normSender,
        $or: [
          { recipient: "Assistant" },
          { recipient: { $exists: false } }
        ]
      };
    } else {
      query = {
        $or: [
          { sender: normSender, recipient: normRecipient },
          { sender: normRecipient, recipient: normSender }
        ]
      };
    }

    // Delete messages matching the query
    await messagesCollection.deleteMany(query);

    return NextResponse.json({ message: "Chat history cleared successfully." }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: `Database error: ${errorMessage}` },
      { status: 500 }
    );
  }
}
