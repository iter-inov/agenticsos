import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, X, Send, Loader2, SquarePen, History, Check, AlertCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgId } from "@/hooks/useOrgId";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCost?: number;
  tokens?: number;
  status?: "sending" | "sent" | "error";
  created_at?: string;
  toolCall?: { name: string; status: "running" | "success" | "error"; result_summary?: string };
  meta?: Record<string, unknown>;
}

interface AgentRow {
  id: string;
  name: string;
  role_prompt: string | null;
  default_model_id: string | null;
  status: string;
}

interface ConversationRow {
  id: string;
  title: string | null;
  updated_at: string;
  agent_id: string | null;
}

const RUN_AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`;

const TOOL_LABELS: Record<string, string> = {
  gmail_read_inbox: "Lecture Gmail",
  gmail_send_email: "Envoi email",
  slack_list_channels: "Lecture Slack",
  slack_send_message: "Envoi Slack",
  gdrive_search: "Recherche Drive",
  calendar_list_events: "Lecture Calendar",
  instagram_post: "Publication Instagram",
  facebook_post: "Publication Facebook",
};

const TOOL_ICONS: Record<string, string> = {
  gmail: "📧", slack: "💬", gdrive: "📁", calendar: "📅",
  instagram: "📸", facebook: "📘", default: "🔧",
};

function getToolIcon(name: string) {
  const key = Object.keys(TOOL_ICONS).find((k) => name.includes(k));
  return TOOL_ICONS[key || "default"];
}

function getAgentColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 50%)`;
}

function getAgentSuggestions(agent: AgentRow): string[] {
  const prompt = agent.role_prompt?.toLowerCase() || "";
  const suggestions: string[] = [];
  if (prompt.includes("gmail") || prompt.includes("email"))
    suggestions.push("📧 Montre-moi mes 5 derniers emails");
  if (prompt.includes("slack"))
    suggestions.push("💬 Liste mes channels Slack");
  if (prompt.includes("calendar") || prompt.includes("agenda"))
    suggestions.push("📅 Quels sont mes events cette semaine ?");
  if (prompt.includes("instagram"))
    suggestions.push("📸 Génère un post Instagram pour aujourd'hui");
  if (suggestions.length === 0)
    suggestions.push("👋 Que peux-tu faire pour moi ?", "📋 Donne-moi un résumé de mon activité");
  return suggestions.slice(0, 3);
}

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatPanel() {
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [agentStatus, setAgentStatus] = useState<"idle" | "thinking" | "calling" | "streaming">("idle");
  const [thinkingLabel, setThinkingLabel] = useState("Réfléchit...");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  // Load agents
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("agents")
      .select("id, name, role_prompt, default_model_id, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAgents(data);
          if (!selectedAgentId) setSelectedAgentId(data[0].id);
        }
      });
  }, [orgId]);

  // Load conversations
  useEffect(() => {
    if (!orgId || !user) return;
    supabase
      .from("conversations")
      .select("id, title, updated_at, agent_id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setConversations(data);
      });
  }, [orgId, user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  }, [input]);

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
  };

  const loadConversation = async (convId: string) => {
    setConversationId(convId);
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, token_count, cost_estimate, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (data) {
      setMessages(
        data.map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          tokens: m.token_count ?? undefined,
          tokenCost: m.cost_estimate ?? undefined,
          status: "sent" as const,
          created_at: m.created_at,
        }))
      );
    }
    // Set agent from conversation
    const conv = conversations.find((c) => c.id === convId);
    if (conv?.agent_id) setSelectedAgentId(conv.agent_id);
  };

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!user || !orgId) return null;
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        org_id: orgId,
        user_id: user.id,
        title: "Chat session",
        agent_id: selectedAgentId || null,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    setConversationId(data.id);
    return data.id;
  }, [conversationId, user, orgId, selectedAgentId]);

  const sendMessage = async (text: string) => {
    const userInput = (text || input).trim();
    if (!userInput || loading || !selectedAgentId) return;
    setInput("");

    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userInput,
      status: "sending",
      created_at: now,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setAgentStatus("thinking");
    setThinkingLabel("Réfléchit...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Non authentifié.");

      // Mark user msg as sent
      setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, status: "sent" } : m)));

      const convId = await ensureConversation();
      const resp = await fetch(RUN_AGENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          prompt: userInput,
          conversation_id: convId,
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Limite atteinte. Réessayez plus tard.");
        if (resp.status === 402) throw new Error("Crédits requis.");
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur ${resp.status}`);
      }
      if (!resp.body) throw new Error("Pas de réponse");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let runMeta: any = null;
      const assistantMsgId = `a-${Date.now()}`;

      setAgentStatus("streaming");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "token") {
              assistantContent += event.content;
              setMessages((prev) => {
                const existing = prev.find((m) => m.id === assistantMsgId);
                if (existing)
                  return prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: assistantContent } : m
                  );
                return [
                  ...prev,
                  {
                    id: assistantMsgId,
                    role: "assistant",
                    content: assistantContent,
                    created_at: new Date().toISOString(),
                  },
                ];
              });
            } else if (event.type === "tool_call") {
              setAgentStatus("calling");
              const label = TOOL_LABELS[event.name] || event.name;
              setThinkingLabel(`Appelle ${label}...`);
              setMessages((prev) => [
                ...prev,
                {
                  id: `tc-${Date.now()}-${event.name}`,
                  role: "system",
                  content: "",
                  toolCall: { name: event.name, status: "running" },
                },
              ]);
            } else if (event.type === "tool_result") {
              setAgentStatus("streaming");
              setMessages((prev) =>
                prev.map((m) =>
                  m.toolCall && m.toolCall.name === event.name && m.toolCall.status === "running"
                    ? { ...m, toolCall: { ...m.toolCall, status: "success", result_summary: "Terminé ✓" } }
                    : m
                )
              );
              assistantContent = "";
            } else if (event.type === "awaiting_approval") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `ap-${Date.now()}`,
                  role: "system",
                  content: `⏳ **Approbation requise** — ${event.message}`,
                },
              ]);
            } else if (event.type === "done") {
              runMeta = event;
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      if (runMeta) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, tokenCost: runMeta.cost, tokens: runMeta.total_tokens, meta: runMeta }
              : m
          )
        );
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "system", content: `❌ ${err.message || "Erreur"}` },
      ]);
      // Mark user msg as error
      setMessages((prev) =>
        prev.map((m) => (m.id === userMsg.id && m.status === "sending" ? { ...m, status: "error" } : m))
      );
    } finally {
      setLoading(false);
      setAgentStatus("idle");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed right-0 top-1/2 z-50 -translate-y-1/2 rounded-l-lg bg-primary p-2 shadow-lg transition-transform hover:scale-105"
        >
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-border bg-card shadow-2xl"
          >
            {/* Header with agent selector */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Select value={selectedAgentId} onValueChange={(v) => { setSelectedAgentId(v); startNewConversation(); }}>
                  <SelectTrigger className="w-[180px] h-8 text-xs border-none bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: selectedAgent ? getAgentColor(selectedAgent.id) : "hsl(var(--muted-foreground))" }}
                      >
                        {selectedAgent?.name[0] || "?"}
                      </div>
                      <SelectValue placeholder="Choisir un agent" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <span>{agent.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    agentStatus === "idle"
                      ? "bg-green-500"
                      : agentStatus === "thinking"
                      ? "bg-blue-500 animate-pulse"
                      : agentStatus === "calling"
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-blue-400 animate-pulse"
                  }`}
                />
              </div>

              <div className="flex items-center gap-1">
                {/* History */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <div className="p-3 border-b border-border">
                      <h4 className="font-medium text-sm">Conversations récentes</h4>
                    </div>
                    <ScrollArea className="h-64">
                      {conversations.length === 0 && (
                        <p className="p-3 text-xs text-muted-foreground">Aucune conversation</p>
                      )}
                      {conversations.map((conv) => (
                        <button
                          key={conv.id}
                          onClick={() => loadConversation(conv.id)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
                        >
                          <p className="text-sm font-medium truncate">
                            {conv.title || "Conversation"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(conv.updated_at), {
                              addSuffix: true,
                              locale: fr,
                            })}
                          </p>
                        </button>
                      ))}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                {/* New chat */}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startNewConversation} title="Nouvelle conversation">
                  <SquarePen className="h-3.5 w-3.5" />
                </Button>

                {/* Close */}
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages area */}
            <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
              {/* Empty state */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-5 py-12 px-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
                    style={{ backgroundColor: selectedAgent ? getAgentColor(selectedAgent.id) : "hsl(var(--muted))" }}
                  >
                    {selectedAgent?.name[0] || "🤖"}
                  </div>
                  <div className="text-center">
                    <h3 className="font-semibold text-sm">{selectedAgent?.name || "Choisis un agent"}</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
                      {selectedAgent?.role_prompt?.slice(0, 100) || "Sélectionne un agent pour commencer"}
                    </p>
                  </div>
                  {selectedAgent && (
                    <div className="flex flex-col gap-2 w-full">
                      {getAgentSuggestions(selectedAgent).map((s) => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          className="text-left px-4 py-3 rounded-xl border border-border hover:bg-muted transition-colors text-sm"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Messages */}
              {messages.length > 0 && (
                <div className="space-y-1">
                  {messages.map((msg) => {
                    // Tool call inline
                    if (msg.toolCall) {
                      return (
                        <div key={msg.id} className="flex gap-2 mb-2 ml-9">
                          <div
                            className={`flex-1 rounded-xl px-3 py-2 text-xs border ${
                              msg.toolCall.status === "running"
                                ? "bg-yellow-500/10 border-yellow-500/30"
                                : msg.toolCall.status === "success"
                                ? "bg-green-500/10 border-green-500/30"
                                : "bg-destructive/10 border-destructive/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span>{getToolIcon(msg.toolCall.name)}</span>
                              <span className="font-medium">
                                {TOOL_LABELS[msg.toolCall.name] || msg.toolCall.name}
                              </span>
                              {msg.toolCall.status === "running" && (
                                <Loader2 className="w-3 h-3 animate-spin ml-auto" />
                              )}
                              {msg.toolCall.status === "success" && (
                                <Check className="w-3 h-3 text-green-600 ml-auto" />
                              )}
                              {msg.toolCall.status === "error" && (
                                <X className="w-3 h-3 text-destructive ml-auto" />
                              )}
                            </div>
                            {msg.toolCall.result_summary && (
                              <p className="mt-1 text-muted-foreground">{msg.toolCall.result_summary}</p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // User bubble
                    if (msg.role === "user") {
                      return (
                        <div key={msg.id} className="flex justify-end gap-2 mb-3">
                          <div className="max-w-[80%]">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
                              {msg.content}
                            </div>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                              {msg.status === "sending" && <Clock className="w-3 h-3 text-muted-foreground" />}
                              {msg.status === "sent" && <Check className="w-3 h-3 text-muted-foreground" />}
                              {msg.status === "error" && <AlertCircle className="w-3 h-3 text-destructive" />}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // System message
                    if (msg.role === "system" && !msg.toolCall) {
                      return (
                        <motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                          <div className="text-center my-2">
                            <span className="inline-block text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
                              {msg.content}
                            </span>
                          </div>
                        </motion.div>
                      );
                    }

                    // Agent bubble
                    return (
                      <div key={msg.id} className="flex gap-2 mb-3">
                        <div
                          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-1"
                          style={{ backgroundColor: selectedAgent ? getAgentColor(selectedAgent.id) : "hsl(var(--muted-foreground))" }}
                        >
                          {selectedAgent?.name[0] || "A"}
                        </div>
                        <div className="max-w-[80%]">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold">{selectedAgent?.name || "Agent"}</span>
                          </div>
                          <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                            {msg.tokens != null && msg.tokens > 0 && (
                              <span className="text-[10px] text-muted-foreground">· {msg.tokens} tokens</span>
                            )}
                            {msg.tokenCost != null && msg.tokenCost > 0 && (
                              <span className="text-[10px] text-muted-foreground">· ${msg.tokenCost.toFixed(4)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Thinking indicator */}
                  {loading && agentStatus !== "idle" && (
                    <div className="flex gap-2 mb-3">
                      <div
                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: selectedAgent ? getAgentColor(selectedAgent.id) : "hsl(var(--muted-foreground))" }}
                      >
                        {selectedAgent?.name[0] || "A"}
                      </div>
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex gap-1">
                            {[0, 1, 2].map((i) => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce"
                                style={{ animationDelay: `${i * 150}ms` }}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground ml-1">{thinkingLabel}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input bar */}
            <div className="p-3 border-t border-border">
              <div className="flex items-end gap-2 bg-muted rounded-2xl px-3 py-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedAgent
                      ? `Message à ${selectedAgent.name}...`
                      : "Choisis un agent pour commencer..."
                  }
                  disabled={!selectedAgentId || loading}
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none text-sm max-h-32 min-h-[24px] disabled:opacity-50"
                />
                <Button
                  size="icon"
                  className="w-8 h-8 rounded-xl flex-shrink-0"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || !selectedAgentId || loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
