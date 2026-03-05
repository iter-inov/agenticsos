import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ReactMarkdown from "react-markdown";
import {
  Plus,
  Instagram,
  Facebook,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Edit3,
  BarChart3,
  Sparkles,
  Loader2,
  Filter,
  CheckCheck,
  RefreshCw,
  MessageSquare,
  Calendar,
  ThumbsUp,
  MessageCircle,
} from "lucide-react";

/* ───── Types ───── */
type SocialPost = {
  id: string;
  org_id: string;
  platform: string;
  content: string;
  hashtags: string[];
  image_url: string | null;
  image_description: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  engagement_json: Record<string, unknown>;
  created_by_agent: boolean;
  created_at: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/* ───── Configs ───── */
const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Brouillon", color: "bg-muted text-muted-foreground", icon: Edit3 },
  pending: { label: "En attente", color: "bg-yellow-500/15 text-yellow-600", icon: Clock },
  approved: { label: "Approuvé", color: "bg-blue-500/15 text-blue-600", icon: CheckCircle2 },
  scheduled: { label: "Planifié", color: "bg-purple-500/15 text-purple-600", icon: Calendar },
  published: { label: "Publié", color: "bg-green-500/15 text-green-600", icon: Send },
  rejected: { label: "Rejeté", color: "bg-destructive/15 text-destructive", icon: XCircle },
};

const platformIcon = (p: string) =>
  p === "instagram" ? <Instagram className="h-4 w-4" /> : <Facebook className="h-4 w-4" />;

const SOCIAL_SYSTEM_PROMPT = `Tu es un expert en social media pour PME. Tu crées des posts engageants pour Instagram et Facebook. Quand l'utilisateur décrit un post, tu génères :
- Le texte du post (adapté au réseau)
- Les hashtags recommandés (Instagram : 10-15)
- Le meilleur moment pour publier
- Une suggestion d'image (description détaillée)

Tu utilises le tool create_post_draft pour sauvegarder chaque post généré.
Format Instagram : émojis + hashtags + appel à l'action
Format Facebook : plus long, conversationnel, 1-2 hashtags

Quand tu génères un post, appelle TOUJOURS create_post_draft avec les bons paramètres.`;

const QUICK_CHIPS = [
  { emoji: "📸", label: "5 posts Instagram cette semaine", prompt: "Génère 5 posts Instagram variés et engageants pour cette semaine, avec des thématiques différentes chaque jour." },
  { emoji: "📣", label: "Post Facebook annonce", prompt: "Crée un post Facebook pour annoncer un nouveau produit/service. Le post doit être conversationnel et engageant." },
  { emoji: "🔄", label: "Recycler le meilleur contenu", prompt: "Recycle mon meilleur contenu du mois dernier en créant de nouvelles versions optimisées." },
  { emoji: "📅", label: "Planifier 7 jours", prompt: "Planifie mes posts pour les 7 prochains jours avec un calendrier éditorial varié (Instagram + Facebook)." },
];

export default function Social() {
  const { orgId } = useOrgId();
  const { toast } = useToast();

  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch posts
  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    supabase
      .from("social_posts")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (error) console.error(error);
        setPosts((data as SocialPost[]) ?? []);
        setLoading(false);
      });
  }, [orgId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshPosts = async () => {
    if (!orgId) return;
    const { data } = await (supabase as any).from("social_posts").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
    if (data) setPosts(data);
  };

  /* ───── Chat with Social Media Agent ───── */
  const handleChat = async (prompt: string) => {
    if (!orgId || !prompt.trim() || streaming) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          org_id: orgId,
          system_prompt: SOCIAL_SYSTEM_PROMPT,
          prompt,
          conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const text = await resp.text();
      let generated = "";
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "token" && evt.content) generated += evt.content;
        } catch {}
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: generated || "Je n'ai pas pu générer de réponse." } : m))
      );

      // Refresh posts in case agent created drafts
      setTimeout(refreshPosts, 1500);
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `❌ Erreur : ${e.message}` } : m))
      );
    } finally {
      setStreaming(false);
    }
  };

  /* ───── Post actions ───── */
  const handleStatusChange = async (id: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "published") updates.published_at = new Date().toISOString();
    const { error } = await (supabase as any).from("social_posts").update(updates).eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    toast({ title: `Statut → ${statusConfig[newStatus]?.label ?? newStatus}` });
  };

  const handleBatchApprove = async () => {
    const drafts = filteredPosts.filter((p) => p.status === "draft" || p.status === "pending");
    if (!drafts.length) return;
    const ids = drafts.map((p) => p.id);
    await (supabase as any).from("social_posts").update({ status: "approved" }).in("id", ids);
    setPosts((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, status: "approved" } : p)));
    toast({ title: `${ids.length} post(s) approuvés ✅` });
  };

  const handleRegenerate = (post: SocialPost) => {
    handleChat(`Régénère ce post ${post.platform} : "${post.content.slice(0, 100)}…" en l'améliorant.`);
  };

  /* ───── Filters ───── */
  const filteredPosts = posts.filter((p) => {
    if (filter === "all") return true;
    if (filter === "instagram" || filter === "facebook") return p.platform === filter;
    if (filter === "week") {
      const d = new Date(p.created_at);
      const now = new Date();
      return now.getTime() - d.getTime() < 7 * 86400000;
    }
    return true;
  });

  const publishedCount = posts.filter((p) => p.status === "published").length;
  const pendingCount = posts.filter((p) => ["pending", "approved", "scheduled"].includes(p.status)).length;
  const draftCount = posts.filter((p) => p.status === "draft").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Social Media</h1>
          <p className="text-sm text-muted-foreground">Autopilot Instagram & Facebook</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleBatchApprove} className="gap-2">
            <CheckCheck className="h-4 w-4" /> Tout approuver
          </Button>
          <Button variant="outline" size="sm" onClick={refreshPosts} className="gap-2">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Queue sidebar */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <h2 className="text-sm font-semibold text-foreground">File d'attente</h2>
            {/* Filters */}
            <div className="flex flex-wrap gap-1">
              {[
                { key: "all", label: "Tous" },
                { key: "instagram", label: "IG" },
                { key: "facebook", label: "FB" },
                { key: "week", label: "7j" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPosts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-12">Aucun post</p>
              ) : (
                filteredPosts.map((post) => {
                  const sc = statusConfig[post.status] ?? statusConfig.draft;
                  const StatusIcon = sc.icon;
                  const engagement = post.engagement_json as any;
                  return (
                    <div
                      key={post.id}
                      className="rounded-lg p-3 transition-colors hover:bg-accent/10 border border-transparent hover:border-border"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {platformIcon(post.platform)}
                        <span className="text-xs font-medium capitalize text-foreground">{post.platform}</span>
                        <Badge variant="outline" className={`ml-auto text-[10px] ${sc.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {sc.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{post.content || "Pas de contenu…"}</p>
                      {post.scheduled_at && (
                        <p className="text-[10px] text-purple-500 mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(post.scheduled_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                      {post.status === "published" && engagement && (
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          {engagement.likes != null && (
                            <span className="flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{engagement.likes}</span>
                          )}
                          {engagement.comments != null && (
                            <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{engagement.comments}</span>
                          )}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 mt-2">
                        {(post.status === "draft" || post.status === "pending") && (
                          <>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleStatusChange(post.id, "approved")}>
                              <CheckCircle2 className="h-3 w-3" /> Approuver
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-destructive" onClick={() => handleStatusChange(post.id, "rejected")}>
                              <XCircle className="h-3 w-3" /> Rejeter
                            </Button>
                          </>
                        )}
                        {post.status === "approved" && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1 text-green-600" onClick={() => handleStatusChange(post.id, "published")}>
                            <Send className="h-3 w-3" /> Publier
                          </Button>
                        )}
                        {post.status === "rejected" && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleRegenerate(post)}>
                            <RefreshCw className="h-3 w-3" /> Régénérer
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col">
          {/* Chat messages */}
          <ScrollArea className="flex-1 p-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-display text-lg font-semibold text-foreground">Social Media Manager</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Décris le post que tu veux et l'IA le génère pour Instagram ou Facebook, avec hashtags et suggestions.
                  </p>
                </div>
                {/* Quick chips */}
                <div className="flex flex-wrap gap-2 max-w-lg justify-center">
                  {QUICK_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => handleChat(chip.prompt)}
                      disabled={streaming}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-sm text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
                    >
                      <span>{chip.emoji}</span>
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        msg.content ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground">Génération en cours…</span>
                          </div>
                        )
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleChat(chatInput);
              }}
              className="flex items-center gap-2 max-w-3xl mx-auto"
            >
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Décris le post que tu veux créer…"
                disabled={streaming}
                className="flex-1"
              />
              <Button type="submit" disabled={streaming || !chatInput.trim()} size="icon">
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-t border-border px-6 py-3 flex items-center gap-6 bg-card/50">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{publishedCount}</span>
          <span className="text-xs text-muted-foreground">publiés</span>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-medium text-foreground">{pendingCount}</span>
          <span className="text-xs text-muted-foreground">en attente</span>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{draftCount}</span>
          <span className="text-xs text-muted-foreground">brouillons</span>
        </div>
      </div>
    </div>
  );
}
