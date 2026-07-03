"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import styles from "./page.module.css";

interface Message {
  id: string;
  role: "bot" | "user";
  senderName: string;
  content: string;
  fileData?: string | null;
  fileName?: string | null;
  fileType?: string | null;
}

interface Friend {
  username: string;
  usernameKey: string;
  messageCount: number;
}

export default function Home() {
  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [signedInUser, setSignedInUser] = useState("");
  const [showUsername, setShowUsername] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Contacts list
  const [usersList, setUsersList] = useState<Friend[]>([]);
  const [assistantMsgCount, setAssistantMsgCount] = useState<number>(0);
  const [activeRecipient, setActiveRecipient] = useState<string>("Assistant");
  const [activeRecipientName, setActiveRecipientName] = useState<string>("Assistant");

  // Mobile sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Unread message tracking (last viewed message count for each recipient)
  const [lastViewedCounts, setLastViewedCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chatbot_last_viewed_counts");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
  });

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  // Staged File Attachment State
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    type: string;
    size: string;
    base64: string;
  } | null>(null);

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">("light");
  
  // MongoDB Atlas Connection Status
  const [dbStatus, setDbStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [dbErrorMsg, setDbErrorMsg] = useState<string>("");
  
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Auth Session & Theme
  useEffect(() => {
    // Theme initialization
    const savedTheme = localStorage.getItem("chatbot_theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    }

    // Auth initialization
    const savedUser = localStorage.getItem("chatbot_username");
    if (savedUser) {
      setSignedInUser(savedUser);
      setIsLoggedIn(true);
      fetchUsersList(savedUser);
    }
  }, []);

  // Handle active contact changes and message polling
  useEffect(() => {
    if (!isLoggedIn || !signedInUser) return;
    
    // Stage 1: Load history immediately with loading spinner
    loadMessageHistory(signedInUser, activeRecipient);
    
    // Stage 2: Load users list to see any new accounts
    fetchUsersList(signedInUser);
    
    // Stage 3: Setup polling every 3 seconds ONLY for private user chats
    // (We don't need to poll the Assistant bot since it replies immediately)
    if (activeRecipient !== "Assistant") {
      const interval = setInterval(() => {
        pollMessages(signedInUser, activeRecipient);
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [activeRecipient, isLoggedIn, signedInUser]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Update message counts viewed for active thread
  useEffect(() => {
    if (messages.length > 0 && isLoggedIn && signedInUser) {
      setLastViewedCounts((prev) => {
        const next = { ...prev, [activeRecipient]: messages.length };
        if (typeof window !== "undefined") {
          localStorage.setItem("chatbot_last_viewed_counts", JSON.stringify(next));
        }
        return next;
      });
    }
  }, [messages, activeRecipient, isLoggedIn, signedInUser]);

  // Background polling for all contact message counts (notification badges)
  useEffect(() => {
    if (!isLoggedIn || !signedInUser) return;

    const interval = setInterval(() => {
      fetchUsersList(signedInUser);
    }, 4000);

    return () => clearInterval(interval);
  }, [isLoggedIn, signedInUser]);

  // Close the mobile sidebar automatically when returning to desktop width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch list of all registered users in database along with message counts
  const fetchUsersList = async (currentUsername: string) => {
    try {
      const response = await fetch(`/api/auth?currentUser=${encodeURIComponent(currentUsername)}`);
      if (response.ok) {
        const data = await response.json();
        setAssistantMsgCount(data.assistantCount || 0);
        
        // Filter out current user so they don't see themselves in their friends list
        const filtered = (data.contacts || []).filter(
          (u: Friend) => u.usernameKey !== currentUsername.toLowerCase()
        );
        setUsersList(filtered);
      }
    } catch (err) {
      console.warn("Failed to load contacts list:", err);
    }
  };

  // Load message history from MongoDB Atlas
  const loadMessageHistory = async (sender: string, recipient: string) => {
    setIsLoadingMessages(true);
    setDbStatus("checking");
    setDbErrorMsg("");
    
    try {
      const response = await fetch(
        `/api/messages?sender=${encodeURIComponent(sender)}&recipient=${encodeURIComponent(recipient)}`
      );
      const data = await response.json();
      
      if (response.ok) {
        setMessages(data);
        setDbStatus("connected");
        fetchUsersList(sender);
      } else {
        setDbStatus("disconnected");
        setDbErrorMsg(data.error || "Failed to load messages from backend");
        console.warn("Backend error:", data.error);
      }
    } catch (err) {
      setDbStatus("disconnected");
      setDbErrorMsg("Could not connect to the API backend. Please check if local server is running.");
      console.warn("Connection error:", err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Background polling for messages (avoids showing full loading spinner for smooth real-time chat)
  const pollMessages = async (sender: string, recipient: string) => {
    try {
      const response = await fetch(
        `/api/messages?sender=${encodeURIComponent(sender)}&recipient=${encodeURIComponent(recipient)}`
      );
      if (response.ok) {
        const data = await response.json();
        // Update messages state only if message count differs
        // (Simple optimization: comparing lengths or contents stringified)
        setMessages((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data)) {
            fetchUsersList(sender);
            return data;
          }
          return prev;
        });
        setDbStatus("connected");
      }
    } catch (err) {
      console.warn("Polling connection error:", err);
    }
  };

  // Handle Authentication (Sign In & Auto-Register)
  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (usernameInput.trim().length < 3) {
      setAuthError("Username must be at least 3 characters.");
      return;
    }
    if (passwordInput.length < 4) {
      setAuthError("Password must be at least 4 characters.");
      return;
    }

    setIsLoadingMessages(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSignedInUser(data.username);
        setIsLoggedIn(true);
        localStorage.setItem("chatbot_username", data.username);
        
        // Retrieve contacts and default messages
        fetchUsersList(data.username);
        loadMessageHistory(data.username, activeRecipient);
      } else {
        setAuthError(data.error || "Authentication failed.");
      }
    } catch (err) {
      setAuthError("Could not connect to the authentication database server.");
      console.warn(err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Sign Out
  const handleSignOut = () => {
    setIsLoggedIn(false);
    setSignedInUser("");
    setUsernameInput("");
    setPasswordInput("");
    setMessages([]);
    setUsersList([]);
    setActiveRecipient("Assistant");
    setActiveRecipientName("Assistant");
    setSidebarOpen(false);
    localStorage.removeItem("chatbot_username");
  };

  // Toggle Theme
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("chatbot_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  // Select a contact/thread and close the mobile sidebar drawer
  const handleSelectRecipient = (usernameKey: string, displayName: string) => {
    setActiveRecipient(usernameKey);
    setActiveRecipientName(displayName);
    setSidebarOpen(false);
  };

  // Clear Chat History (deletes from database)
  const handleClearHistory = async () => {
    if (messages.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete all messages in this chat with ${activeRecipientName}? This action is permanent.`)) {
      return;
    }
    
    setIsLoadingMessages(true);
    try {
      const response = await fetch(
        `/api/messages?sender=${encodeURIComponent(signedInUser)}&recipient=${encodeURIComponent(activeRecipient)}`,
        { method: "DELETE" }
      );
      
      if (response.ok) {
        setMessages([]);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete chat history.");
      }
    } catch (err) {
      alert("Could not connect to the database to clear history.");
      console.warn(err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Staged File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    // File size safety check: Limit to 4.5 MB for database storage limits
    if (file.size > 4.5 * 1024 * 1024) {
      alert("File size exceeds the 4.5MB limit. Please select a smaller image or document.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        type: file.type,
        size: (file.size / 1024).toFixed(1) + " KB",
        base64: reader.result as string,
      });
    };
    reader.onerror = () => {
      alert("Failed to read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  // Cancel selected file attachment
  const handleCancelFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Send Message
  const handleSendMessage = async (textToSend: string) => {
    const messageContent = textToSend.trim();
    if (!messageContent && !attachedFile) return;
    if (!signedInUser) return;

    setInputValue("");
    setIsTyping(true);

    // Optimistically insert user message in UI for fast responsive loading
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      senderName: signedInUser,
      content: messageContent,
      fileData: attachedFile?.base64 || null,
      fileName: attachedFile?.name || null,
      fileType: attachedFile?.type || null,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    
    // Reset staged file before sending over network
    const stagedFile = attachedFile;
    setAttachedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          sender: signedInUser,
          recipient: activeRecipient,
          content: messageContent,
          fileData: stagedFile?.base64 || null,
          fileName: stagedFile?.name || null,
          fileType: stagedFile?.type || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update messages with actual database-saved records
        setMessages((prev) => [
          ...prev.filter((m) => !m.id.startsWith("temp-")),
          ...data,
        ]);
        setDbStatus("connected");
        fetchUsersList(signedInUser);
      } else {
        setDbStatus("disconnected");
        setDbErrorMsg(data.error || "Failed to save message.");
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      }
    } catch (err) {
      setDbStatus("disconnected");
      setDbErrorMsg("Could not send message. Please verify your connection to MongoDB.");
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      console.warn("Send error:", err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  // Pre-configured suggestions to trigger chat
  const suggestions = [
    { prompt: "hi", label: "Say hello to start the chat" },
    { prompt: "how are you?", label: "Ask how it is doing" },
    { prompt: "Tell me a joke", label: "Request a simple joke" },
    { prompt: "MongoDB Atlas setup details", label: "Ask how MongoDB works" }
  ];

  // Helper to check if file is an image
  const isImageFile = (mimeType?: string | null) => {
    if (!mimeType) return false;
    return mimeType.startsWith("image/");
  };

  // 1. SIGN IN SCREEN (FORMAL THEME)
  if (!isLoggedIn) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authCard}>
          <div className={styles.authHeader}>
            <div className={styles.authLogo}>C</div>
            <h1 className={styles.authTitle}>Workspace Chat</h1>
            <p className={styles.authSubtitle}>Sign in to start messaging</p>
          </div>

          <form onSubmit={handleSignIn} className={styles.authForm}>
            {authError && <div className={styles.authErrorText}>{authError}</div>}
            
            <div className={styles.authFormGroup}>
              <label htmlFor="username" className={styles.authLabel}>Username</label>
              <div className={styles.authInputWrapper}>
                <input
                  id="username"
                  type={showUsername ? "text" : "password"}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username (min. 3 chars)"
                  className={styles.authInput}
                  autoComplete="username"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowUsername((prev) => !prev)}
                  className={styles.authInputToggle}
                  aria-label={showUsername ? "Hide username" : "Show username"}
                  aria-pressed={showUsername}
                  tabIndex={-1}
                >
                  {showUsername ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <div className={styles.authFormGroup}>
              <label htmlFor="password" className={styles.authLabel}>Password</label>
              <div className={styles.authInputWrapper}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password (min. 4 chars)"
                  className={styles.authInput}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className={styles.authInputToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.btnAuthSubmit}>
              Sign In / Register
            </button>
          </form>
          
          <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
            <button
              onClick={toggleTheme}
              className={styles.themeToggle}
              style={{ width: "auto", border: "none", background: "none", color: "var(--foreground-muted)" }}
              aria-label="Toggle theme"
            >
              <span className={styles.themeIcon}>{theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. MAIN CHAT WORKSPACE (FORMAL THEME)
  return (
    <div className={styles.container}>
      {/* Mobile overlay backdrop, closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarContent}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarLogo}>C</div>
            <h1 className={styles.sidebarTitle}>Workspace Chat</h1>
          </div>

          {/* Active Contact Options */}
          <div>
            <h3 className={styles.sectionTitle}>Assistant</h3>
            <button
              onClick={() => handleSelectRecipient("Assistant", "Assistant")}
              className={`${styles.contactItem} ${
                activeRecipient === "Assistant" ? styles.contactItemActive : ""
              }`}
            >
              <div className={styles.contactAvatar}>🤖</div>
              <span className={styles.contactName}>AI Assistant</span>
              {(() => {
                const assistantUnread = Math.max(0, assistantMsgCount - (lastViewedCounts["Assistant"] || 0));
                return assistantUnread > 0 && (
                  <span className={styles.unreadBadge}>{assistantUnread}</span>
                );
              })()}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            <h3 className={styles.sectionTitle}>Friends / Contacts</h3>
            {usersList.length === 0 ? (
              <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", color: "var(--sidebar-muted)" }}>
                No other users registered. Open a new window and sign up to see contacts!
              </div>
            ) : (
              <div className={styles.contactsList}>
                {usersList.map((user) => {
                  const unreadCount = Math.max(0, user.messageCount - (lastViewedCounts[user.usernameKey] || 0));
                  return (
                    <button
                      key={user.usernameKey}
                      onClick={() => handleSelectRecipient(user.usernameKey, user.username)}
                      className={`${styles.contactItem} ${
                        activeRecipient === user.usernameKey ? styles.contactItemActive : ""
                      }`}
                    >
                      <div className={styles.contactAvatar}>
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className={styles.contactName}>{user.username}</span>
                      {unreadCount > 0 && (
                        <span className={styles.unreadBadge}>{unreadCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: "1rem" }}>
            <h3 className={styles.sectionTitle}>Active Account</h3>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Logged in as</span>
              <span className={styles.infoValue}>{signedInUser}</span>
            </div>
          </div>

          <div>
            <h3 className={styles.sectionTitle}>Connection Status</h3>
            <div className={styles.infoCard}>
              <div className={styles.statusIndicator}>
                <span
                  className={`${styles.dot} ${
                    dbStatus === "connected" ? styles.dotConnected : styles.dotDisconnected
                  }`}
                />
                <span className={styles.infoValue}>
                  {dbStatus === "connected"
                    ? "MongoDB Online"
                    : dbStatus === "checking"
                    ? "Checking..."
                    : "Database Error"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <button
            onClick={toggleTheme}
            className={styles.themeToggle}
            aria-label="Toggle theme"
          >
            <span>Appearance</span>
            <span className={styles.themeIcon}>{theme === "light" ? "🌙 Dark" : "☀️ Light"}</span>
          </button>

          <button
            onClick={handleClearHistory}
            className={styles.btnSecondary}
            disabled={messages.length === 0}
            style={{ marginBottom: "0.5rem" }}
          >
            Clear Conversation
          </button>

          <button
            onClick={handleSignOut}
            className={styles.btnSecondary}
            style={{ color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}
          >
            Sign Out Account
          </button>
        </div>
      </aside>

      {/* CHAT MAIN PANEL */}
      <main className={styles.chatArea}>
        <header className={styles.chatHeader}>
          <div className={styles.chatHeaderLeft}>
            <button
              className={styles.menuToggle}
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Toggle contacts sidebar"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>
            <div>
              <h2 className={styles.chatHeaderTitle}>{activeRecipientName}</h2>
              <span className={styles.chatHeaderSub}>
                {activeRecipient === "Assistant"
                  ? `Chatting with Workspace Assistant Bot • ${messages.length} messages`
                  : `Private chat thread with ${activeRecipientName} • ${messages.length} messages`}
              </span>
            </div>
          </div>
        </header>

        <div className={styles.chatBody} ref={chatBodyRef}>
          {/* Connection diagnostics card */}
          {dbStatus === "disconnected" && (
            <div className={styles.dbWarningCard}>
              <div className={styles.dbWarningTitle}>
                ⚠️ Database Connection Error
              </div>
              <div className={styles.dbWarningDesc}>
                Your backend cannot reach your MongoDB database. Please verify Network Access IP whitelisting in your Atlas dashboard:
              </div>
              <div className={styles.dbWarningCode}>{dbErrorMsg}</div>
            </div>
          )}

          {/* Messages Feed */}
          {messages.length === 0 && !isLoadingMessages ? (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>
                {activeRecipient === "Assistant"
                  ? `Welcome, ${signedInUser}!`
                  : `Conversation with ${activeRecipientName}`}
              </h3>
              <p className={styles.emptyDesc}>
                {activeRecipient === "Assistant"
                  ? "This is your private assistant space. Start typing a question or choose an option below:"
                  : `This channel is fully private. All messages and file uploads are saved securely under chatbotDB in MongoDB Atlas.`}
              </p>
              
              {activeRecipient === "Assistant" && (
                <div className={styles.suggestionGrid}>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      className={styles.suggestionCard}
                      onClick={() => handleSendMessage(s.prompt)}
                    >
                      <div className={styles.suggestionPrompt}>"{s.prompt}"</div>
                      <div className={styles.suggestionLabel}>{s.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((msg, index) => {
              const isSelf = msg.senderName.toLowerCase() === signedInUser.toLowerCase();
              return (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${
                    isSelf ? styles.userRow : styles.botRow
                  }`}
                >
                  <div
                    className={`${styles.avatar} ${
                      isSelf ? styles.userAvatar : styles.botAvatar
                    }`}
                  >
                    {isSelf 
                      ? msg.senderName.charAt(0).toUpperCase() 
                      : (msg.senderName === "Assistant" ? "A" : msg.senderName.charAt(0).toUpperCase())}
                  </div>
                  <div className={styles.messageContent}>
                    <span className={styles.senderName}>
                      #{index + 1}. {isSelf ? `${msg.senderName} (You)` : msg.senderName}
                    </span>
                    
                    <div
                      className={`${styles.messageBubble} ${
                        isSelf ? styles.userBubble : styles.botBubble
                      }`}
                    >
                    {/* Render message text if present */}
                    {msg.content && <div>{msg.content}</div>}

                    {/* Render file attachments if present */}
                    {msg.fileData && (
                      <div style={{ marginTop: msg.content ? "0.5rem" : "0" }}>
                        {isImageFile(msg.fileType) ? (
                          <img
                            src={msg.fileData}
                            className={styles.bubbleImage}
                            alt={msg.fileName || "Uploaded image"}
                            onClick={() => {
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`<img src="${msg.fileData}" style="max-width:100%; height:auto;" />`);
                              }
                            }}
                          />
                        ) : (
                          <div className={styles.bubbleDocCard}>
                            <span className={styles.bubbleDocIcon}>📄</span>
                            <div className={styles.bubbleDocDetails}>
                              <span className={styles.bubbleDocName}>{msg.fileName}</span>
                              <span className={styles.bubbleDocSize}>{msg.fileType?.split("/")[1]?.toUpperCase() || "FILE"}</span>
                            </div>
                            <a
                              href={msg.fileData}
                              download={msg.fileName || "download"}
                              className={styles.bubbleDocDownloadBtn}
                            >
                              Download
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className={`${styles.messageRow} ${styles.botRow}`}>
              <div className={`${styles.avatar} ${styles.botAvatar}`}>
                {activeRecipient === "Assistant" ? "A" : activeRecipientName.charAt(0).toUpperCase()}
              </div>
              <div className={styles.messageContent}>
                <span className={styles.senderName}>{activeRecipientName}</span>
                <div className={`${styles.messageBubble} ${styles.botBubble}`}>
                  <div className={styles.typingIndicator}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Form with Attachment Stages */}
        <div className={styles.chatInputArea}>
          {/* File Staged Preview Panel */}
          {attachedFile && (
            <div className={styles.filePreviewContainer}>
              <div className={styles.filePreviewInfo}>
                <span>📎</span>
                <span className={styles.filePreviewName}>
                  {attachedFile.name} ({attachedFile.size})
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancelFile}
                className={styles.btnCancelFile}
                aria-label="Remove attachment"
              >
                Remove [x]
              </button>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className={styles.chatForm}>
            {/* Hidden HTML File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: "none" }}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            />
            
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={styles.btnClip}
              title="Attach an image or document (Max 4.5MB)"
              disabled={isTyping || isLoadingMessages}
            >
              📎
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                dbStatus === "disconnected"
                  ? "MongoDB is disconnected. Please check settings..."
                  : attachedFile 
                  ? "Press Send to upload attachment..." 
                  : "Type a message to chat..."
              }
              className={styles.chatInput}
              disabled={isTyping || isLoadingMessages}
            />
            
            <button
              type="submit"
              className={styles.sendButton}
              disabled={(!inputValue.trim() && !attachedFile) || isTyping || isLoadingMessages}
            >
              Send
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
