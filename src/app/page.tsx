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

interface Contact {
  username: string;
  usernameKey: string;
  messageCount: number;
  isBot: boolean;
  phone: string;
  email: string;
  dateCreated: string;
  avatar: string;
}

interface Note {
  id: string;
  content: string;
  date: string;
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
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Contacts list
  const [usersList, setUsersList] = useState<Friend[]>([]);
  const [assistantMsgCount, setAssistantMsgCount] = useState<number>(0);
  const [activeRecipient, setActiveRecipient] = useState<string>("Assistant");
  const [activeRecipientName, setActiveRecipientName] = useState<string>("AI Assistant");

  // Mobile drawer visibility
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Interactive UI States
  const [activeFilter, setActiveFilter] = useState<string>("All"); // "All", "Assigned to Me", "Unassigned", "Live Chat", "Blocked", "Trash"
  const [activeTab, setActiveTab] = useState<string>("Chat"); // "Chat", "Contacts", "Templates", "My Projects"
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [accordions, setAccordions] = useState({
    info: true,
    notes: true,
    additional: false,
    files: false,
    links: false,
    docs: false
  });

  // Sticky Notes State (context-aware per contact)
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState("");

  // Unread message tracking (last viewed message count for each recipient)
  const [lastViewedCounts, setLastViewedCounts] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chattera_last_viewed_counts");
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

  // Voice Recording & Sticker Picker States & Refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  // Initialize Auth Session & Theme
  useEffect(() => {
    // Theme initialization
    const savedTheme = localStorage.getItem("chattera_theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    }

    // Auth initialization
    const savedUser = localStorage.getItem("chattera_username");
    if (savedUser) {
      setSignedInUser(savedUser);
      setIsLoggedIn(true);
      fetchUsersList(savedUser);
    }
  }, []);

  // Handle active contact changes, message polling and notes loading
  useEffect(() => {
    if (!isLoggedIn || !signedInUser) return;
    
    // Stage 1: Load chat history immediately
    loadMessageHistory(signedInUser, activeRecipient);
    
    // Stage 2: Load users list to see any new accounts
    fetchUsersList(signedInUser);
    
    // Stage 3: Load context-aware sticky notes for the contact
    const savedNotes = localStorage.getItem(`chattera_notes_${activeRecipient}`);
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    } else {
      // Default note if none exists
      if (activeRecipient === "Assistant") {
        setNotes([
          {
            id: "default-1",
            content: "You can ask the AI Assistant anything about Chattera features.",
            date: "Jul 6, 2026"
          }
        ]);
      } else {
        setNotes([]);
      }
    }
    
    // Stage 4: Setup polling every 3 seconds ONLY for private user chats
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
          localStorage.setItem("chattera_last_viewed_counts", JSON.stringify(next));
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

  // Fetch list of all registered users in database
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

  // Background polling for messages (smooth real-time chat updates)
  const pollMessages = async (sender: string, recipient: string) => {
    try {
      const response = await fetch(
        `/api/messages?sender=${encodeURIComponent(sender)}&recipient=${encodeURIComponent(recipient)}`
      );
      if (response.ok) {
        const data = await response.json();
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
        setShowAuthModal(false);
        localStorage.setItem("chattera_username", data.username);
        
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
    setActiveRecipientName("AI Assistant");
    setSidebarOpen(false);
    setShowAuthModal(false);
    localStorage.removeItem("chattera_username");
  };

  // Toggle Theme
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("chattera_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  // Select a contact/thread
  const handleSelectRecipient = (usernameKey: string, displayName: string) => {
    setActiveRecipient(usernameKey);
    setActiveRecipientName(displayName);
    setSidebarOpen(false);
    // Switch to active chat tab if templates or projects was loaded
    setActiveTab("Chat");
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

    // Optimistically insert user message in UI
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

  // Voice recording core handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      let options = { mimeType: "audio/webm" };
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/ogg" };
      }
      
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
    } catch (err) {
      alert("Failed to access microphone. Please enable microphone permissions in your browser to record voice messages.");
      console.warn("Microphone access failed:", err);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    setIsRecording(false);
    setRecordingTime(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    
    mediaRecorderRef.current.onstop = async () => {
      const stream = mediaRecorderRef.current?.stream;
      stream?.getTracks().forEach(track => track.stop());
      
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: mediaRecorderRef.current?.mimeType || "audio/webm" 
      });
      
      if (audioBlob.size < 100) return; // ignore empty audio files

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result as string;
        sendRecordedVoice(base64Audio, audioBlob.size, mediaRecorderRef.current?.mimeType || "audio/webm");
      };
      reader.readAsDataURL(audioBlob);
    };
    
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    setRecordingTime(0);
  };

  const sendRecordedVoice = async (base64Data: string, sizeBytes: number, mimeType: string) => {
    if (!signedInUser) return;
    setIsTyping(true);

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      senderName: signedInUser,
      content: "",
      fileData: base64Data,
      fileName: "voice-message.webm",
      fileType: mimeType,
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          sender: signedInUser,
          recipient: activeRecipient,
          content: "",
          fileData: base64Data,
          fileName: "voice-message.webm",
          fileType: mimeType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev.filter((m) => !m.id.startsWith("temp-")),
          ...data,
        ]);
        setDbStatus("connected");
        fetchUsersList(signedInUser);
      } else {
        setDbStatus("disconnected");
        setDbErrorMsg(data.error || "Failed to save voice message.");
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      }
    } catch (err) {
      setDbStatus("disconnected");
      setDbErrorMsg("Could not connect to database to upload voice recording.");
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      console.warn(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendSticker = async (emoji: string) => {
    if (!signedInUser) return;
    setShowStickerPicker(false);
    setIsTyping(true);

    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      senderName: signedInUser,
      content: emoji,
      fileData: null,
      fileName: "sticker",
      fileType: "sticker",
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          sender: signedInUser,
          recipient: activeRecipient,
          content: emoji,
          fileData: null,
          fileName: "sticker",
          fileType: "sticker",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [
          ...prev.filter((m) => !m.id.startsWith("temp-")),
          ...data,
        ]);
        setDbStatus("connected");
        fetchUsersList(signedInUser);
      } else {
        setDbStatus("disconnected");
        setDbErrorMsg(data.error || "Failed to send sticker.");
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      }
    } catch (err) {
      setDbStatus("disconnected");
      setDbErrorMsg("Could not connect to database to send sticker.");
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      console.warn(err);
    } finally {
      setIsTyping(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Helper to check if file is an image
  const isImageFile = (mimeType?: string | null) => {
    if (!mimeType) return false;
    return mimeType.startsWith("image/");
  };

  // Interactive Sticky Notes logic
  const handleAddNote = (e: FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;

    const newNote: Note = {
      id: Date.now().toString(),
      content: noteInput.trim(),
      date: new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    };

    const updated = [newNote, ...notes];
    setNotes(updated);
    localStorage.setItem(`chattera_notes_${activeRecipient}`, JSON.stringify(updated));
    setNoteInput("");
  };

  const handleDeleteNote = (noteId: string) => {
    const updated = notes.filter(n => n.id !== noteId);
    setNotes(updated);
    localStorage.setItem(`chattera_notes_${activeRecipient}`, JSON.stringify(updated));
  };

  // Unified contacts filter & creation logic
  const getFilteredContacts = (): Contact[] => {
    const assistantContact: Contact = {
      username: "AI Assistant",
      usernameKey: "Assistant",
      messageCount: assistantMsgCount,
      isBot: true,
      phone: "+1 800-555-CHAT",
      email: "assistant@chattera.ai",
      dateCreated: "Oct 12, 2022 - 11:43",
      avatar: "🤖"
    };

    // Construct unified list
    let list: Contact[] = [
      assistantContact,
      ...usersList.map((user) => {
        // Deterministic mock properties based on username key
        const charCodeSum = user.usernameKey.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const phoneMiddle = 100 + (charCodeSum % 900);
        const phoneLast = 1000 + (charCodeSum * 7 % 9000);
        
        return {
          username: user.username,
          usernameKey: user.usernameKey,
          messageCount: user.messageCount,
          isBot: false,
          phone: `+1 234-${phoneMiddle}-${phoneLast}`,
          email: `${user.usernameKey.toLowerCase()}@gmail.com`,
          dateCreated: `Oct 12, 2022 - 11:43`,
          avatar: user.username.charAt(0).toUpperCase()
        };
      })
    ];

    // Filter by search bar query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter(u => u.username.toLowerCase().includes(query));
    }

    // Filter by Sidebar Categories
    if (activeFilter === "Assigned to Me") {
      // Mock: show only AI Assistant and contacts with an even charCodeSum
      list = list.filter(u => u.isBot || u.usernameKey.charCodeAt(0) % 2 === 0);
    } else if (activeFilter === "Unassigned") {
      // Mock: show other contacts (odd charCodeSum)
      list = list.filter(u => !u.isBot && u.usernameKey.charCodeAt(0) % 2 !== 0);
    } else if (activeFilter === "Live Chat") {
      // Show contacts that have at least one message exchange
      list = list.filter(u => u.isBot || u.messageCount > 0);
    } else if (activeFilter === "Blocked") {
      list = []; // Mock: no blocked users
    } else if (activeFilter === "Trash") {
      list = []; // Mock: trash is empty
    }

    return list;
  };

  // Find currently active contact item
  const filteredContacts = getFilteredContacts();
  const currentActiveContact = filteredContacts.find(u => u.usernameKey === activeRecipient) || {
    username: activeRecipientName,
    usernameKey: activeRecipient,
    phone: "+1 234-543-4321",
    email: `${activeRecipient.toLowerCase()}@gmail.com`,
    dateCreated: "Oct 12, 2022 - 11:43",
    isBot: activeRecipient === "Assistant",
    avatar: activeRecipient === "Assistant" ? "🤖" : activeRecipientName.charAt(0).toUpperCase()
  };

  // Mock list of files shared dynamically extracted from messages
  const getSharedFiles = () => {
    return messages.filter(m => m.fileData).map(m => ({
      name: m.fileName || "attachment",
      type: m.fileType || "application/octet-stream",
      data: m.fileData
    }));
  };
  const sharedFilesList = getSharedFiles();

  // Mock templates list
  const templates = [
    { text: "Hello! How can I help you today?", title: "Greetings Support" },
    { text: "Can I try the software first?", title: "Trial Request" },
    { text: "Sure, here is the demo unit. You can use it as long as you want.", title: "Demo Offer" },
    { text: "We have many types of subscription in this showcase. Please look at this presentation.", title: "Subscription Info" },
    { text: "Thank you for the quick update. I will review it shortly.", title: "Standard Acknowledgment" },
    { text: "Please let us know if you need additional assistance.", title: "Support Closing" }
  ];

  // Mock projects list
  const mockProjects = [
    { name: "Customer Acquisition", status: "Active", desc: "Pipeline tracker for incoming leads", date: "June 2026" },
    { name: "Support Queue Alpha", status: "Active", desc: "Automated routing configurations", date: "May 2026" },
    { name: "Integrations Dashboard", status: "Archived", desc: "Vercel & Slack webhook setups", date: "Jan 2026" }
  ];

  // Helper to render double-wave SVG logo matching mockup
  const renderLogo = () => (
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={styles.logoIcon}>
      <path d="M20 80V20L50 55L80 20V80" stroke="url(#logoGrad)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#9f67ff" />
        </linearGradient>
      </defs>
    </svg>
  );

  // 1. LANDING PAGE & AUTH MODAL SCREEN (when not logged in)
  if (!isLoggedIn) {
    return (
      <div className={styles.landingPage}>
        {/* LANDING PAGE NAVBAR */}
        <header className={styles.landingHeader}>
          <div className={styles.landingLogo}>
            {renderLogo()}
            <span>Chattera</span>
          </div>
          <button 
            onClick={() => setShowAuthModal(true)} 
            className={styles.btnLandingSignIn}
          >
            Sign In
          </button>
        </header>

        {/* HERO SECTION */}
        <section className={styles.landingHero}>
          <div className={styles.landingTag}>
            <span>✨</span> Smart Chat Management Platform
          </div>
          
          <h1 className={styles.landingTitle}>
            Manage Your Chats with <br />
            <span className={styles.heroAccent}>Intelligence</span>
          </h1>
          
          <p className={styles.landingDesc}>
            A comprehensive team chat and AI assistant platform designed for modern workspaces, customer support, and personal projects. Track threads, manage contacts, and discover powerful insights.
          </p>

          <div className={styles.landingActions}>
            <button 
              onClick={() => setShowAuthModal(true)} 
              className={styles.btnLandingPrimary}
            >
              <span>⚡</span> Get Started Free
            </button>
            <button 
              onClick={() => setShowAuthModal(true)} 
              className={styles.btnLandingSecondary}
            >
              Sign In
            </button>
          </div>
        </section>

        {/* FEATURE CARDS GRID (4 columns) */}
        <section className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>💬</span>
            <h3 className={styles.featureTitle}>Smart Chat Management</h3>
            <p className={styles.featureDesc}>
              Efficiently organize your entire conversation history with intelligent search, filters, and real-time MongoDB synchronization.
            </p>
          </div>

          <div className={styles.featureCard}>
             <span className={styles.featureIcon}>👤</span>
             <h3 className={styles.featureTitle}>User & Team Routing</h3>
             <p className={styles.featureDesc}>
               Role-based support threads with admin controls, assigned chats, and secure private member communication channels.
             </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>📈</span>
            <h3 className={styles.featureTitle}>Analytics & Reports</h3>
            <p className={styles.featureDesc}>
              Comprehensive insights into message volume, active support durations, popular templates, and user engagement metrics.
            </p>
          </div>

          <div className={styles.featureCard}>
            <span className={styles.featureIcon}>🛡️</span>
            <h3 className={styles.featureTitle}>Secure & Reliable</h3>
            <p className={styles.featureDesc}>
              Enterprise-grade security with MongoDB Atlas protection, secure user sessions, and automated data encryption.
            </p>
          </div>
        </section>

        {/* FOOTER BADGES */}
        <footer className={styles.landingFooter}>
          <div className={styles.footerBadge}>
            <span>👥</span> Multi-user access
          </div>
          <div className={styles.footerBadge}>
             <span>🔒</span> Secure authentication
          </div>
          <div className={styles.footerBadge}>
            <span>📊</span> Advanced analytics
          </div>
        </footer>

        {/* AUTH MODAL DIALOG OVERLAY */}
        {showAuthModal && (
          <div 
            className={styles.modalBackdrop} 
            onClick={() => setShowAuthModal(false)}
          >
            <div 
              className={styles.modalWrapper}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.authCard}>
                <div className={styles.authHeader}>
                  <div className={styles.authLogo}>C</div>
                  <h1 className={styles.authTitle}>Chattera</h1>
                  <p className={styles.authSubtitle}>Sign in to access your dashboard</p>
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
                      >
                        {showPassword ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className={styles.btnAuthSubmit}>
                    Sign In / Register
                  </button>
                </form>
                
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={toggleTheme}
                    style={{ background: "none", border: "none", color: "#8e8a9f", fontSize: "0.85rem", cursor: "pointer" }}
                  >
                    Toggle Light/Dark Theme
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. MAIN DASHBOARD WORKSPACE (FLOATING GLASS LAYOUT)
  return (
    <div className={styles.container}>
      {/* Mobile drawer overlay background */}
      <div 
        className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.sidebarOverlayOpen : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className={styles.appWindow}>
        {/* LEFT SIDEBAR COLUMN */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div>
            <div className={styles.sidebarHeader}>
              {renderLogo()}
              <span className={styles.sidebarTitle}>Chattera</span>
            </div>

            {/* Sidebar categories mapping */}
            <nav className={styles.sidebarMenu}>
              {[
                { name: "All", icon: "🌐" },
                { name: "Assigned to Me", icon: "👤" },
                { name: "Unassigned", icon: "👥" },
                { name: "Live Chat", icon: "💬" },
                { name: "Blocked", icon: "🚫", pro: true },
                { name: "Trash", icon: "🗑️" }
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    setActiveFilter(item.name);
                    setSidebarOpen(false);
                  }}
                  className={`${styles.menuItem} ${
                    activeFilter === item.name ? styles.menuItemActive : ""
                  }`}
                >
                  <span className={styles.menuIcon}>{item.icon}</span>
                  <span>{item.name}</span>
                  {item.pro && <span className={styles.proBadge}>PRO</span>}
                </button>
              ))}
            </nav>
          </div>

          {/* Premium Pro Plan Banner */}
          <div className={styles.proPlanCard}>
            <div className={styles.proPlanHeader}>
              <span className={styles.proPlanTitle}>Pro Plan</span>
              <span className={styles.proPlanPrice}>$189<sub>/mo</sub></span>
            </div>
            <p className={styles.proPlanDesc}>
              Open a lot of cool features with our Premium Pro Plan.
            </p>
            <button className={styles.btnGetPro}>Get Pro Plan</button>
          </div>
        </aside>

        {/* RIGHT MAIN PANEL */}
        <div className={styles.mainContent}>
          {/* TOP HEADER */}
          <header className={styles.mainHeader}>
            <div className={styles.headerLeft}>
              {/* Mobile hamburger menu toggle */}
              <button 
                className={styles.mobileMenuBtn}
                onClick={() => setSidebarOpen(true)}
              >
                ☰
              </button>

              {/* Navigation Tabs */}
              <div className={styles.tabList}>
                {["Chat", "Contacts", "Templates", "My Projects"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`${styles.tabBtn} ${
                      activeTab === tab ? styles.tabBtnActive : ""
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Profile and Settings icons */}
            <div className={styles.headerRight}>
              <button 
                onClick={toggleTheme} 
                className={styles.iconBtn}
                title="Toggle Theme"
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>

              <button 
                className={styles.iconBtn}
                title="Clear Chat History"
                onClick={handleClearHistory}
                disabled={messages.length === 0}
              >
                🗑️
              </button>

              <div className={styles.userProfile} onClick={handleSignOut} title="Sign Out">
                <div className={styles.profilePic}>
                  {signedInUser.charAt(0).toUpperCase()}
                </div>
                <span className={styles.profileName}>{signedInUser}</span>
              </div>
            </div>
          </header>

          {/* THREE-COLUMN WORKSPACE AREA */}
          <div className={styles.workspaceBody}>
            
            {/* COLUMN 1: CONTACTS COLUMN (Hides on mobile if a recipient is selected and tab is Chat) */}
            <div className={`${styles.contactsColumn} ${
              activeRecipient && activeTab === "Chat" ? styles.contactsColumnHidden : ""
            }`}>
              <div className={styles.searchBarWrapper}>
                <div className={styles.searchBox}>
                  <span className={styles.searchIcon}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search contact..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              </div>

              {/* Contact list mapping */}
              <div className={styles.contactsList}>
                {filteredContacts.length === 0 ? (
                  <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8rem", color: "var(--foreground-muted)" }}>
                    No threads found.
                  </div>
                ) : (
                  filteredContacts.map((contact) => {
                    const unread = Math.max(0, contact.messageCount - (lastViewedCounts[contact.usernameKey] || 0));
                    return (
                      <button
                        key={contact.usernameKey}
                        onClick={() => handleSelectRecipient(contact.usernameKey, contact.username)}
                        className={`${styles.contactCard} ${
                          activeRecipient === contact.usernameKey ? styles.contactCardActive : ""
                        }`}
                      >
                        <div className={styles.contactAvatarWrapper}>
                          <div className={`${styles.contactAvatar} ${
                            activeRecipient === contact.usernameKey ? styles.contactAvatarActive : ""
                          }`}>
                            {contact.avatar}
                          </div>
                          {contact.isBot || <div className={styles.statusDot} />}
                        </div>
                        
                        <div className={styles.contactInfo}>
                          <div className={styles.contactHeader}>
                            <span className={styles.contactName}>{contact.username}</span>
                            <span className={styles.contactTime}>12:38</span>
                          </div>
                          <div className={styles.contactMeta}>
                            <span className={styles.contactSubtext}>
                              {contact.isBot ? "Ready to help you" : contact.phone}
                            </span>
                            {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMN 2: ACTIVE WORKSPACE (CHAT / CONTACTS / TEMPLATES / PROJECTS) */}
            
            {/* CHAT TAB WORKSPACE */}
            {activeTab === "Chat" && (
              <div className={`${styles.chatColumn} ${
                !activeRecipient ? styles.chatColumnHidden : ""
              }`}>
                {/* Active Chat Header */}
                <div className={styles.chatColumnHeader}>
                  <div className={styles.activeContactMeta}>
                    <span className={styles.activeContactName}>{activeRecipientName}</span>
                    <span className={styles.activeContactStatus}>
                      {activeRecipient === "Assistant" 
                        ? "Chatting with AI Assistant Bot" 
                        : "Private Conversation (Atlas Verified)"}
                    </span>
                  </div>
                  {/* Back button for mobile */}
                  <button 
                    onClick={() => setActiveRecipient("")}
                    className={styles.iconBtn}
                    style={{ display: "none" }} /* Styled under @media in css */
                  >
                    ◀
                  </button>
                </div>

                {/* Message display feed */}
                <div className={styles.chatBody} ref={chatBodyRef}>
                  {dbStatus === "disconnected" && (
                    <div className={styles.dbWarningCard}>
                      <span className={styles.dbWarningTitle}>⚠️ Atlas Connection Status</span>
                      <p className={styles.dbWarningDesc}>
                        Connection to MongoDB could not be initialized. Whitelist your IP in MongoDB Atlas:
                      </p>
                      <span className={styles.dbWarningCode}>{dbErrorMsg}</span>
                    </div>
                  )}

                  {messages.length === 0 && !isLoadingMessages ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyLogo}>C</div>
                      <h3 className={styles.emptyTitle}>Welcome to Chattera</h3>
                      <p className={styles.emptyDesc}>
                        Start a conversation with {activeRecipientName}! Type a message or choose a preset prompt below to begin.
                      </p>
                      
                      {activeRecipient === "Assistant" && (
                        <div className={styles.suggestionGrid}>
                          {[
                            { prompt: "hi", label: "Say hello to start" },
                            { prompt: "How do I setup database?", label: "Ask about database" },
                            { prompt: "Tell me a joke", label: "Request a funny joke" },
                            { prompt: "What is Chattera?", label: "Ask about this app" }
                          ].map((item, index) => (
                            <button
                              key={index}
                              onClick={() => handleSendMessage(item.prompt)}
                              className={styles.suggestionCard}
                            >
                              <span className={styles.suggestionPrompt}>"{item.prompt}"</span>
                              <span className={styles.suggestionLabel}>{item.label}</span>
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
                          <div className={styles.bubbleAvatar}>
                            {isSelf 
                              ? msg.senderName.charAt(0).toUpperCase()
                              : (msg.senderName === "Assistant" ? "🤖" : msg.senderName.charAt(0).toUpperCase())}
                          </div>

                          <div className={styles.messageContent}>
                            <div className={styles.bubbleHeader}>
                              <span className={styles.bubbleSender}>
                                {isSelf ? `${msg.senderName} (You)` : msg.senderName}
                              </span>
                              <span className={styles.bubbleTime}>12:38</span>
                            </div>

                            {/* Responsive Bubble Container styling */}
                            <div className={
                              msg.fileType === "sticker"
                                ? styles.stickerBubble 
                                : `${styles.messageBubble} ${isSelf ? styles.userBubble : styles.botBubble}`
                            }>
                              {msg.fileType === "sticker" ? (
                                msg.content?.startsWith("/") ? (
                                  <img 
                                    src={msg.content} 
                                    className={styles.customStickerImg} 
                                    alt="sticker" 
                                  />
                                ) : (
                                  <span style={{ fontSize: "3.8rem", lineHeight: "1", display: "block" }}>{msg.content}</span>
                                )
                              ) : (
                                msg.content && <div>{msg.content}</div>
                              )}

                              {/* Render base64 image, audio messages, or documents inside the bubble */}
                              {msg.fileData && (
                                <div style={{ marginTop: msg.content ? "0.4rem" : "0" }}>
                                  {isImageFile(msg.fileType) ? (
                                    <img
                                      src={msg.fileData}
                                      className={styles.bubbleImage}
                                      alt={msg.fileName || "Shared image"}
                                      onClick={() => {
                                        const newTab = window.open();
                                        if (newTab) {
                                          newTab.document.write(`<img src="${msg.fileData}" style="max-width:100%; max-height:100vh; object-fit:contain; margin:auto; display:block;" />`);
                                        }
                                      }}
                                    />
                                  ) : msg.fileType?.startsWith("audio/") ? (
                                    <audio
                                      src={msg.fileData}
                                      controls
                                      className={styles.bubbleAudioPlayer}
                                    />
                                  ) : (
                                    <div className={styles.bubbleDocCard}>
                                      <span className={styles.bubbleDocIcon}>📄</span>
                                      <div className={styles.bubbleDocDetails}>
                                        <span className={styles.bubbleDocName}>{msg.fileName}</span>
                                        <span className={styles.bubbleDocSize}>DOCUMENT</span>
                                      </div>
                                      <a
                                        href={msg.fileData}
                                        download={msg.fileName || "shared_doc"}
                                        className={styles.bubbleDocDownload}
                                      >
                                        Download
                                      </a>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <span className={styles.channelIndicator}>
                              via {isSelf ? "Web" : (msg.senderName === "Assistant" ? "App" : "SMS")}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className={`${styles.messageRow} ${styles.botRow}`}>
                      <div className={styles.bubbleAvatar}>
                        {activeRecipient === "Assistant" ? "🤖" : activeRecipientName.charAt(0).toUpperCase()}
                      </div>
                      <div className={styles.messageContent}>
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

                {/* Staged file attachment preview panel */}
                <div className={styles.chatInputArea}>
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
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Message submission form or Audio Recording bar */}
                  {isRecording ? (
                    <div className={styles.voiceRecordBar}>
                      <div className={styles.recordInfo}>
                        <span className={styles.pulsingDot} />
                        <span>Recording Voice Memo...</span>
                        <span className={styles.recordingTimer}>{formatTime(recordingTime)}</span>
                      </div>
                      <div className={styles.recordActions}>
                        <button
                          type="button"
                          onClick={cancelRecording}
                          className={styles.inputIconBtn}
                          style={{ color: "#ef4444" }}
                          title="Discard Recording"
                        >
                          ❌
                        </button>
                        <button
                          type="button"
                          onClick={stopAndSendRecording}
                          className={styles.sendBtn}
                          title="Send voice message"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M1.946 9.315c-.522-.174-.527-.455.01-.634L21.075.061c.538-.18.793.076.613.614L15.32 19.805c-.179.537-.46.533-.634.01l-3.238-9.714L1.946 9.315z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Sticker picker popup */}
                      {showStickerPicker && (
                        <div className={styles.stickerPicker}>
                          <div className={styles.pickerSectionTitle}>Emoji Stickers</div>
                          <div className={styles.stickerGrid}>
                            {["❤️", "👍", "🔥", "🎉", "🚀", "🤖", "🤯", "😎", "🦄", "🐱", "🐶", "🍕", "🌟", "🎈", "👀", "👋"].map((st) => (
                              <button
                                key={st}
                                type="button"
                                className={styles.stickerCard}
                                onClick={() => handleSendSticker(st)}
                              >
                                {st}
                              </button>
                            ))}
                          </div>

                          <div className={styles.customStickersSection}>
                            <div className={styles.pickerSectionTitle}>Custom Stickers</div>
                            <div className={styles.customStickersGrid}>
                              {[
                                { id: "maro_dikro", path: "/stickers/maro_dikro.png", name: "Maro Dikro" }
                              ].map((sticker) => (
                                <button
                                  key={sticker.id}
                                  type="button"
                                  className={styles.customStickerCard}
                                  title={sticker.name}
                                  onClick={() => handleSendSticker(sticker.path)}
                                >
                                  <img 
                                    src={sticker.path} 
                                    className={styles.customStickerCardImg} 
                                    alt={sticker.name} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleFormSubmit} className={styles.chatForm}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          style={{ display: "none" }}
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                        />

                        <div className={styles.chatInputWrapper}>
                          <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Type a message to chat..."
                            className={styles.chatInput}
                            disabled={isTyping || isLoadingMessages}
                          />
                          
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={styles.inputIconBtn}
                            title="Attach a file (Max 4.5MB)"
                            disabled={isTyping || isLoadingMessages}
                          >
                            📎
                          </button>

                          <button
                            type="button"
                            className={styles.inputIconBtn}
                            title="Send Sticker"
                            onClick={() => setShowStickerPicker(prev => !prev)}
                            style={{ color: showStickerPicker ? "var(--primary)" : "inherit" }}
                          >
                            😊
                          </button>

                          <button
                            type="button"
                            className={styles.inputIconBtn}
                            title="Record Voice Memo"
                            onClick={startRecording}
                          >
                            🎤
                          </button>
                        </div>

                        <button
                          type="submit"
                          className={styles.sendBtn}
                          disabled={(!inputValue.trim() && !attachedFile) || isTyping || isLoadingMessages}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M1.946 9.315c-.522-.174-.527-.455.01-.634L21.075.061c.538-.18.793.076.613.614L15.32 19.805c-.179.537-.46.533-.634.01l-3.238-9.714L1.946 9.315z"/>
                          </svg>
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CONTACTS LIST TAB WORKSPACE */}
            {activeTab === "Contacts" && (
              <div style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
                <h2 style={{ marginBottom: "1rem" }}>Contact Directory</h2>
                <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem" }}>
                  View all registered team members inside Chattera. Click any contact to open a private message thread.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
                  {filteredContacts.map(c => (
                    <div 
                      key={c.usernameKey}
                      onClick={() => handleSelectRecipient(c.usernameKey, c.username)}
                      style={{ 
                        padding: "1.25rem", 
                        borderRadius: "16px", 
                        border: "1px solid var(--border-color)", 
                        background: "var(--card-bg)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "1rem"
                      }}
                    >
                      <div style={{ 
                        width: "44px", 
                        height: "44px", 
                        borderRadius: "50%", 
                        background: "var(--primary-light)",
                        color: "var(--primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700
                      }}>
                        {c.avatar}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.username}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>{c.email}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TEMPLATES TAB WORKSPACE */}
            {activeTab === "Templates" && (
              <div style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
                <h2 style={{ marginBottom: "1rem" }}>Quick Templates</h2>
                <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem" }}>
                  Select a pre-configured template snippet below. Clicking a template will copy its content directly into the message input field.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                  {templates.map((tpl, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setInputValue(tpl.text);
                        setActiveTab("Chat");
                      }}
                      style={{
                        padding: "1.25rem",
                        borderRadius: "16px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg)",
                        cursor: "pointer",
                        transition: "all var(--transition-fast)"
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--primary)", marginBottom: "0.5rem" }}>
                        {tpl.title}
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--foreground)", lineHeight: "1.4" }}>
                        "{tpl.text}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MY PROJECTS TAB WORKSPACE */}
            {activeTab === "My Projects" && (
              <div style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
                <h2 style={{ marginBottom: "1rem" }}>My Projects</h2>
                <p style={{ color: "var(--foreground-muted)", marginBottom: "2rem" }}>
                  Active workspaces and webhook configurations linked to this Chattera organization.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {mockProjects.map((proj, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "1.5rem",
                        borderRadius: "16px",
                        border: "1px solid var(--border-color)",
                        background: "var(--card-bg)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <h4 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{proj.name}</h4>
                        <p style={{ fontSize: "0.85rem", color: "var(--foreground-muted)", marginTop: "0.25rem" }}>{proj.desc}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ 
                          fontSize: "0.7rem", 
                          fontWeight: 700, 
                          padding: "0.2rem 0.6rem", 
                          borderRadius: "12px", 
                          background: proj.status === "Active" ? "#d1fae5" : "#f3f4f6",
                          color: proj.status === "Active" ? "#065f46" : "#374151"
                        }}>
                          {proj.status}
                        </span>
                        <div style={{ fontSize: "0.75rem", color: "var(--foreground-muted)", marginTop: "0.5rem" }}>{proj.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* COLUMN 3: RIGHT ACCORDION INFO PANEL (Only shows on chat tab) */}
            {activeTab === "Chat" && (
              <aside className={styles.infoColumn}>
                
                {/* 3.1 GENERAL INFO ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, info: !prev.info }))}
                    className={styles.accordionHeader}
                  >
                    <span>General Info</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.info ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.info && (
                    <div className={styles.accordionContent}>
                      <div className={styles.infoAvatarWrapper}>
                        <div className={styles.infoAvatar}>
                          {currentActiveContact.avatar}
                        </div>
                        <span className={styles.infoName}>{currentActiveContact.username}</span>
                      </div>
                      
                      <div className={styles.infoDetailRow}>
                        <span className={styles.infoDetailLabel}>Phone Number</span>
                        <span className={styles.infoDetailVal}>{currentActiveContact.phone}</span>
                      </div>

                      <div className={styles.infoDetailRow}>
                        <span className={styles.infoDetailLabel}>Email Address</span>
                        <span className={styles.infoDetailVal}>{currentActiveContact.email}</span>
                      </div>

                      <div className={styles.infoDetailRow}>
                        <span className={styles.infoDetailLabel}>Date Created</span>
                        <span className={styles.infoDetailVal}>{currentActiveContact.dateCreated}</span>
                      </div>

                      <div className={styles.infoDetailRow}>
                        <span className={styles.infoDetailLabel}>Status</span>
                        <span className={styles.statusPill}>Active User</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3.2 PERSISTENT STICKY NOTES ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, notes: !prev.notes }))}
                    className={styles.accordionHeader}
                  >
                    <span>Sticky Notes</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.notes ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.notes && (
                    <div className={styles.accordionContent}>
                      <form onSubmit={handleAddNote} className={styles.addNoteForm}>
                        <input
                          type="text"
                          placeholder="Add sticky note..."
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          className={styles.noteInput}
                        />
                        <button type="submit" className={styles.addNoteBtn}>+</button>
                      </form>

                      <div className={styles.notesList}>
                        {notes.length === 0 ? (
                          <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)", fontStyle: "italic" }}>
                            No notes added yet for this contact.
                          </span>
                        ) : (
                          notes.map(note => (
                            <div key={note.id} className={styles.noteCard}>
                              <div className={styles.noteHeader}>
                                <span className={styles.noteDate}>{note.date}</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(note.id)}
                                  className={styles.deleteNoteBtn}
                                >
                                  ×
                                </button>
                              </div>
                              <p>{note.content}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3.3 ADDITIONAL INFO ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, additional: !prev.additional }))}
                    className={styles.accordionHeader}
                  >
                    <span>Additional Info</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.additional ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.additional && (
                    <div className={styles.accordionContent}>
                      <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)" }}>
                        User Role: Customer support agent.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3.4 SHARED FILES ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, files: !prev.files }))}
                    className={styles.accordionHeader}
                  >
                    <span>Shared Files ({sharedFilesList.length})</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.files ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.files && (
                    <div className={styles.accordionContent}>
                      {sharedFilesList.length === 0 ? (
                        <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)", fontStyle: "italic" }}>
                          No files shared in this chat.
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {sharedFilesList.map((file, fIdx) => (
                            <a
                              key={fIdx}
                              href={file.data || "#"}
                              download={file.name}
                              style={{ 
                                display: "block", 
                                fontSize: "0.75rem", 
                                color: "var(--primary)", 
                                textDecoration: "none",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                whiteSpace: "nowrap"
                              }}
                            >
                              📄 {file.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3.5 SHARED LINKS ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, links: !prev.links }))}
                    className={styles.accordionHeader}
                  >
                    <span>Shared Links</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.links ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.links && (
                    <div className={styles.accordionContent}>
                      <span style={{ fontSize: "0.75rem", color: "var(--foreground-muted)", fontStyle: "italic" }}>
                        No shared links detected.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3.6 DOCUMENTATIONS ACCORDION */}
                <div className={styles.accordionSection}>
                  <button
                    onClick={() => setAccordions(prev => ({ ...prev, docs: !prev.docs }))}
                    className={styles.accordionHeader}
                  >
                    <span>Documentations</span>
                    <span className={`${styles.accordionChevron} ${
                      accordions.docs ? styles.accordionChevronOpen : ""
                    }`}>▼</span>
                  </button>
                  {accordions.docs && (
                    <div className={styles.accordionContent}>
                      <a href="#help" style={{ fontSize: "0.75rem", color: "var(--primary)" }}>Chattera User Manual.pdf</a>
                      <a href="#quickstart" style={{ fontSize: "0.75rem", color: "var(--primary)" }}>API Integration Guide.pdf</a>
                    </div>
                  )}
                </div>

              </aside>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
