import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgId } from "@/hooks/useOrgId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Zap, ArrowRight, MessageSquare, Mail, Send as SendIcon, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

const RUN_AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`;

const STEPS = [
  { num: 1, label: "Workspace" },
  { num: 2, label: "Outil" },
  { num: 3, label: "Agent" },
  { num: 4, label: "Test" },
];

const TOOL_OPTIONS = [
  { id: "slack", icon: "🟢", name: "Slack", desc: "Envoyer des messages et lire les channels", type: "connector" },
  { id: "gmail", icon: "📧", name: "Gmail", desc: "Lire et envoyer des emails", type: "oauth" },
  { id: "telegram", icon: "📱", name: "Telegram", desc: "Envoyer des notifications", type: "secret" },
  { id: "notion", icon: "📋", name: "Notion", desc: "Lire et créer des pages", type: "oauth" },
];

const AGENT_TEMPLATES: Record<string, { name: string; prompt: string; suggestedMsg: string }> = {
  slack: {
    name: "Assistant Slack",
    prompt: "Tu es un assistant qui gère les communications Slack. Tu peux lister les channels, envoyer des messages et résumer les discussions.",
    suggestedMsg: "Liste mes channels Slack disponibles",
  },
  gmail: {
    name: "Assistant Email",
    prompt: "Tu es un assistant email. Tu peux lire les emails importants, rédiger des réponses et envoyer des messages au nom de l'utilisateur.",
    suggestedMsg: "Montre-moi mes 5 derniers emails",
  },
  telegram: {
    name: "Bot de notifications",
    prompt: "Tu es un bot de notifications. Tu envoies des alertes et mises à jour importantes via Telegram.",
    suggestedMsg: "Envoie un message de test sur Telegram",
  },
  default: {
    name: "Assistant IA général",
    prompt: "Tu es un assistant IA polyvalent. Tu aides l'utilisateur dans ses tâches quotidiennes avec efficacité et précision.",
    suggestedMsg: "Bonjour ! Que peux-tu faire pour moi ?",
  },
};

function StepIndicator({ current, completed }: { current: number; completed: number[] }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isDone = completed.includes(step.num);
        const isActive = step.num === current;
        return (
          <div key={step.num} className="flex items-center gap-2">
            {i > 0 && <div className={`h-px w-6 sm:w-10 ${isDone || isActive ? "bg-primary" : "bg-border"}`} />}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isDone ? "bg-primary text-primary-foreground" : isActive ? "border-2 border-primary text-primary" : "border border-border text-muted-foreground"
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : step.num}
              </div>
              <span className={`hidden sm:inline text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId } = useOrgId();
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState<number[]>([]);

  // Step 1
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("");

  // Step 2
  const [connectedTool, setConnectedTool] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  // Step 3
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  // Step 4
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [agentReplied, setAgentReplied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pre-fill org name
  useEffect(() => {
    if (!orgId) return;
    supabase.from("orgs").select("name").eq("id", orgId).single().then(({ data }) => {
      if (data?.name) setOrgName(data.name);
    });
  }, [orgId]);

  // Pre-fill role from user metadata
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      // default role
    }
  }, [user]);

  // When connected tool changes, update agent template
  useEffect(() => {
    const tpl = AGENT_TEMPLATES[connectedTool ?? "default"];
    setAgentName(tpl.name);
    setAgentPrompt(tpl.prompt);
  }, [connectedTool]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chatMessages]);

  const goNext = (s: number) => {
    setCompleted((prev) => [...new Set([...prev, s])]);
    setStep(s + 1);
  };

  // Step 1 — Save workspace
  const handleStep1 = async () => {
    if (!orgName.trim() || !orgId) return;
    await supabase.from("orgs").update({ name: orgName.trim() }).eq("id", orgId);
    goNext(1);
  };

  // Step 2 — Check existing tool connections
  useEffect(() => {
    if (!orgId) return;
    supabase.from("tool_connections").select("tool_id, tools(slug)").eq("org_id", orgId).eq("status", "connected").then(({ data }) => {
      if (data && data.length > 0) {
        const slugs = data.map((d: any) => d.tools?.slug).filter(Boolean);
        if (slugs.includes("slack")) setConnectedTool("slack");
        else if (slugs.includes("gmail") || slugs.includes("google-workspace")) setConnectedTool("gmail");
        else if (slugs.some((s: string) => s.includes("telegram"))) setConnectedTool("telegram");
      }
    });
  }, [orgId]);

  const handleConnectTool = async (toolId: string) => {
    setConnecting(toolId);
    // For Slack/Gmail, would trigger OAuth. For now, mark as connected if already configured.
    setTimeout(() => {
      setConnectedTool(toolId);
      setConnecting(null);
      goNext(2);
    }, 1500);
  };

  // Step 3 — Create agent
  const handleCreateAgent = async () => {
    if (!agentName.trim() || !orgId) return;
    const { data, error } = await supabase.from("agents").insert({
      name: agentName.trim(),
      org_id: orgId,
      role_prompt: agentPrompt,
      status: "active",
    }).select("id").single();

    if (error || !data) {
      console.error("Failed to create agent:", error);
      return;
    }
    setCreatedAgentId(data.id);

    // Auto-assign connected tools
    if (connectedTool) {
      const { data: mcpTools } = await supabase
        .from("mcp_tools")
        .select("id, name")
        .eq("org_id", orgId);
      
      if (mcpTools) {
        const toolPrefix = connectedTool === "gmail" ? "gmail" : connectedTool === "slack" ? "slack" : connectedTool;
        const matching = mcpTools.filter((t) => t.name.startsWith(toolPrefix));
        for (const tool of matching) {
          await supabase.from("agent_tools").insert({ agent_id: data.id, mcp_tool_id: tool.id } as any);
        }
      }
    }

    goNext(3);
  };

  // Step 4 — Send test message
  const handleSendTest = async () => {
    if (chatLoading || !orgId || !user) return;
    const tpl = AGENT_TEMPLATES[connectedTool ?? "default"];
    const msg = tpl.suggestedMsg;

    setChatMessages([{ role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // Create conversation
      let cId = conversationId;
      if (!cId) {
        const { data: conv } = await supabase.from("conversations").insert({
          org_id: orgId,
          user_id: user.id,
          title: "Onboarding test",
          agent_id: createdAgentId,
        }).select("id").single();
        cId = conv?.id ?? null;
        setConversationId(cId);
      }

      const resp = await fetch(RUN_AGENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agent_id: createdAgentId,
          conversation_id: cId,
          message: msg,
          org_id: orgId,
        }),
      });

      if (!resp.ok) throw new Error("Agent error");

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");

      let assistantContent = "";
      const decoder = new TextDecoder();
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === "token") {
              assistantContent += payload.content;
              setChatMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantContent };
                return copy;
              });
            } else if (payload.type === "tool_call") {
              setChatMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: `🔧 Calling ${payload.tool}...` };
                return copy;
              });
            }
          } catch {}
        }
      }

      if (assistantContent) {
        setChatMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantContent };
          return copy;
        });
      }
      setAgentReplied(true);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `❌ Erreur: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!orgId) return;
    await supabase.from("orgs").update({ onboarding_completed: true } as any).eq("id", orgId);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold font-heading text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Agentic OS
          </span>
        </div>
        <StepIndicator current={step} completed={completed} />
        <div className="w-24" />
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Bienvenue sur Agentic OS
                </h1>
                <p className="text-muted-foreground">Configurons votre workspace en quelques secondes</p>
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-card p-6">
                <div className="space-y-2">
                  <Label>Nom de votre organisation</Label>
                  <Input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Mon entreprise"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Votre rôle</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Sélectionner votre rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="founder">Founder</SelectItem>
                      <SelectItem value="developer">Developer</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="operations">Operations</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleStep1} className="w-full" disabled={!orgName.trim()}>
                  Continuer <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Connectez votre premier outil
                </h1>
                <p className="text-muted-foreground">Votre agent pourra interagir avec ces services</p>
              </div>

              <div className="grid gap-3">
                {TOOL_OPTIONS.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{tool.icon}</span>
                      <div>
                        <p className="font-medium text-foreground">{tool.name}</p>
                        <p className="text-xs text-muted-foreground">{tool.desc}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={connectedTool === tool.id ? "default" : "outline"}
                      disabled={connecting !== null}
                      onClick={() => handleConnectTool(tool.id)}
                    >
                      {connecting === tool.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : connectedTool === tool.id ? (
                        <>
                          <Check className="mr-1 h-3 w-3" /> Connecté
                        </>
                      ) : (
                        "Connecter"
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => goNext(2)}
                className="block w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Passer cette étape →
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Créez votre premier agent IA
                </h1>
                <p className="text-muted-foreground">Il sera prêt à travailler pour vous en quelques secondes</p>
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-card p-6">
                <div className="space-y-2">
                  <Label>Nom de l'agent</Label>
                  <Input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instructions de l'agent (role prompt)</Label>
                  <Textarea
                    value={agentPrompt}
                    onChange={(e) => setAgentPrompt(e.target.value)}
                    rows={4}
                    className="bg-background text-sm"
                  />
                </div>
                {connectedTool && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    <span className="text-primary">
                      Les outils {TOOL_OPTIONS.find((t) => t.id === connectedTool)?.name} seront auto-assignés
                    </span>
                  </div>
                )}
                <Button onClick={handleCreateAgent} className="w-full" disabled={!agentName.trim()}>
                  Créer mon agent <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Votre agent est prêt — dites-lui bonjour
                </h1>
                <p className="text-muted-foreground">Testez votre agent avec un premier message</p>
              </div>

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Chat area */}
                <ScrollArea className="h-64 p-4" ref={scrollRef}>
                  <div className="space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {msg.role === "assistant" ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:m-0">
                              <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                            </div>
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && chatMessages.length === 1 && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-xl px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Agent is thinking...
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Action */}
                <div className="border-t border-border p-4">
                  {chatMessages.length === 0 ? (
                    <Button onClick={handleSendTest} className="w-full" disabled={chatLoading}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      {AGENT_TEMPLATES[connectedTool ?? "default"].suggestedMsg}
                    </Button>
                  ) : agentReplied ? (
                    <Button onClick={handleFinish} className="w-full gradient-blue text-primary-foreground border-0">
                      Accéder au dashboard <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground">
                      <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                      En attente de la réponse...
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
