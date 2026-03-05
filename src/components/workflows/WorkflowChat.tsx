import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokenCost?: number;
  created_at?: string;
  toolCall?: { name: string; status: "running" | "success" | "error"; label: string };
}

interface WorkflowChatProps {
  orgId: string;
  workflowCount: number;
  onWorkflowChange?: () => void;
  injectedMessage?: string | null;
  onInjectedConsumed?: () => void;
}

const SUGGESTIONS = [
  { emoji: "📧", label: "Résumer mes emails chaque matin" },
  { emoji: "💬", label: "Rapport Slack hebdomadaire" },
  { emoji: "🔔", label: "M'alerter si mot-clé dans mes emails" },
];

const TOOL_LABELS: Record<string, string> = {
  create_workflow: "Création du workflow",
  update_workflow: "Modification du workflow",
  activate_workflow: "Activation",
  list_workflows: "Chargement des workflows",
  list_agents: "Chargement des agents",
  list_connected_tools: "Vérification des outils",
  run_workflow_now: "Lancement",
};

const TOOL_ICONS: Record<string, string> = {
  create_workflow: "🔨", update_workflow: "✏️", activate_workflow: "⚡",
  list_workflows: "📋", list_agents: "🤖", list_connected_tools: "🔗",
  run_workflow_now: "▶️",
};

const RUN_AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`;

function formatTime(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function WorkflowChat({ orgId, workflowCount, onWorkflowChange, injectedMessage, onInjectedConsumed }: WorkflowChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [thinkingLabel, setThinkingLabel] = useState("L'agent réfléchit...");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const welcome = workflowCount === 0
      ? "Bonjour ! 👋 Décris-moi une tâche répétitive que tu veux automatiser et je crée le workflow pour toi."
      : `Tu as **${workflowCount} workflow${workflowCount > 1 ? "s" : ""}** actif${workflowCount > 1 ? "s" : ""}. Veux-tu en créer un nouveau ou modifier un existant ?`;
    setMessages([{ id: "welcome", role: "assistant", content: welcome, created_at: new Date().toISOString() }]);
  }, [workflowCount]);

  useEffect(() => {
    if (injectedMessage) {
      sendMessage(injectedMessage);
      onInjectedConsumed?.();
    }
  }, [injectedMessage]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  }, [input]);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId;
    if (!user || !orgId) return null;
    const { data } = await supabase.from("conversations").insert({
      org_id: orgId, user_id: user.id, title: "Workflow Builder",
    }).select("id").single();
    if (data) setConversationId(data.id);
    return data?.id ?? null;
  }, [conversationId, user, orgId]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userInput = text.trim();
    setInput("");
    setLastAction(null);

    const now = new Date().toISOString();
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: userInput, created_at: now };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setThinkingLabel("L'agent réfléchit...");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Non authentifié");

      const convId = await ensureConversation();
      const resp = await fetch(RUN_AGENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agent_id: "workflow-builder",
          prompt: userInput,
          conversation_id: convId,
          context: "workflow_builder",
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Limite atteinte, réessayez plus tard.");
        throw new Error(`Erreur ${resp.status}`);
      }
      if (!resp.body) throw new Error("Pas de réponse");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      const assistantMsgId = `a-${Date.now()}`;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "token") {
              assistantContent += event.content;
              setMessages(prev => {
                const exists = prev.find(m => m.id === assistantMsgId);
                if (exists) return prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m);
                return [...prev, { id: assistantMsgId, role: "assistant", content: assistantContent, created_at: new Date().toISOString() }];
              });
            } else if (event.type === "tool_call") {
              const label = TOOL_LABELS[event.name] ?? event.name;
              setThinkingLabel(`${label}...`);
              setMessages(prev => [...prev, {
                id: `tc-${Date.now()}-${event.name}`, role: "system", content: "",
                toolCall: { name: event.name, status: "running", label },
              }]);
            } else if (event.type === "tool_result") {
              if (["create_workflow", "update_workflow", "activate_workflow", "run_workflow_now"].includes(event.name)) {
                onWorkflowChange?.();
                const actionLabels: Record<string, string> = {
                  create_workflow: "Workflow créé et activé",
                  update_workflow: "Workflow mis à jour",
                  activate_workflow: "Workflow activé",
                  run_workflow_now: "Workflow lancé",
                };
                setLastAction(actionLabels[event.name] || "Action effectuée");
              }
              setMessages(prev => prev.map(m =>
                m.toolCall && m.toolCall.name === event.name && m.toolCall.status === "running"
                  ? { ...m, toolCall: { ...m.toolCall, status: "success" } }
                  : m
              ));
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "system", content: `❌ ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <span className="font-display text-sm font-semibold">Workflow Builder</span>
        <div className={`w-2 h-2 rounded-full ml-1 ${loading ? "bg-blue-500 animate-pulse" : "bg-green-500"}`} />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
        <div className="space-y-1">
          {messages.map(msg => {
            // Tool call inline
            if (msg.toolCall) {
              return (
                <div key={msg.id} className="flex gap-2 mb-2 ml-9">
                  <div className={`flex-1 rounded-xl px-3 py-2 text-xs border ${
                    msg.toolCall.status === "running"
                      ? "bg-yellow-500/10 border-yellow-500/30"
                      : msg.toolCall.status === "success"
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-destructive/10 border-destructive/30"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span>{TOOL_ICONS[msg.toolCall.name] || "🔧"}</span>
                      <span className="font-medium">{msg.toolCall.label}</span>
                      {msg.toolCall.status === "running" && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                      {msg.toolCall.status === "success" && <Check className="w-3 h-3 text-green-600 ml-auto" />}
                      {msg.toolCall.status === "error" && <X className="w-3 h-3 text-destructive ml-auto" />}
                    </div>
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
                    <div className="flex items-center justify-end mt-1">
                      <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            }

            // System message (errors etc)
            if (msg.role === "system" && !msg.toolCall) {
              return (
                <div key={msg.id} className="text-center my-2">
                  <span className="inline-block text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
                    {msg.content}
                  </span>
                </div>
              );
            }

            // Assistant bubble
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 mb-3">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-primary/10 mt-1">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="max-w-[85%]">
                  <span className="text-xs font-semibold mb-1 block">Workflow Builder</span>
                  <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 block">{formatTime(msg.created_at)}</span>
                </div>
              </motion.div>
            );
          })}

          {/* Thinking indicator */}
          {loading && (
            <div className="flex gap-2 mb-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground ml-1">{thinkingLabel}</span>
                </div>
              </div>
            </div>
          )}

          {/* Last workflow action banner */}
          {lastAction && !loading && (
            <div className="mx-4 mb-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-700 dark:text-green-300">
              ✅ {lastAction}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggestions */}
      {messages.length <= 1 && !loading && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s.label}
              onClick={() => sendMessage(s.label)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 bg-muted rounded-2xl px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décris ce que tu veux automatiser..."
            disabled={loading}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm max-h-32 min-h-[24px] disabled:opacity-50"
          />
          <Button
            size="icon"
            className="w-8 h-8 rounded-xl flex-shrink-0"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Entrée pour envoyer · Maj+Entrée pour nouvelle ligne
        </p>
      </div>
    </div>
  );
}
