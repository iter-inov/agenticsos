import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import {
  Mail,
  RefreshCw,
  Loader2,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Send,
  Inbox as InboxIcon,
  Archive,
  Star,
  Users,
} from "lucide-react";

type EmailRecord = {
  id: string;
  org_id: string;
  gmail_message_id: string | null;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  received_at: string | null;
  ai_label: string | null;
  ai_summary: string | null;
  ai_reply: string | null;
  ai_priority: number | null;
  status: string;
  replied_at: string | null;
  created_at: string;
};

const labelConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  urgent: { label: "Urgent", color: "bg-red-500/15 text-red-600", icon: AlertTriangle },
  action: { label: "Action", color: "bg-yellow-500/15 text-yellow-600", icon: Clock },
  fyi: { label: "FYI", color: "bg-blue-500/15 text-blue-600", icon: FileText },
  spam: { label: "Spam", color: "bg-muted text-muted-foreground", icon: Archive },
  lead: { label: "Lead", color: "bg-purple-500/15 text-purple-600", icon: Star },
};

const statusLabels: Record<string, string> = {
  unread: "Non lu",
  reviewed: "Analysé",
  replied: "Répondu",
  archived: "Archivé",
};

async function callToolProxy(session: any, toolSlug: string, args: any) {
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tool-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ tool_slug: toolSlug, args }),
  });
  return resp.json();
}

export default function Inbox() {
  const { orgId } = useOrgId();
  const { toast } = useToast();

  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [processingAll, setProcessingAll] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [generatingReply, setGeneratingReply] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Reply modal state
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const selectedEmail = emails.find((e) => e.id === selectedId);

  /* ───── Load emails from DB ───── */
  const loadEmails = async () => {
    if (!orgId) return;
    const { data, error } = await (supabase as any)
      .from("email_inbox")
      .select("*")
      .eq("org_id", orgId)
      .order("received_at", { ascending: false })
      .limit(100);
    if (data) setEmails(data);
    if (error) console.error(error);
  };

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    loadEmails().finally(() => setLoading(false));
  }, [orgId]);

  /* ───── Sync via tool-proxy ───── */
  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Non connecté");
      const result = await callToolProxy(session, "sync_inbox", { limit: 20 });
      if (result.ok) {
        toast({ title: `${result.data.synced} email(s) synchronisés ✅` });
        setLastSync(new Date());
        await loadEmails();
      } else {
        toast({ title: "Erreur sync", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  /* ───── Analyze single email ───── */
  const handleAnalyze = async (emailId: string) => {
    setAnalyzingId(emailId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Non connecté");
      const result = await callToolProxy(session, "analyze_email", { email_id: emailId });
      if (result.ok) {
        setEmails((prev) =>
          prev.map((e) =>
            e.id === emailId
              ? {
                  ...e,
                  ai_label: result.data.label,
                  ai_priority: result.data.priority,
                  ai_summary: result.data.summary,
                  ai_reply: result.data.suggested_reply,
                  status: "reviewed",
                }
              : e
          )
        );
        if (result.data.label === "lead") {
          toast({ title: "🔥 Lead détecté !", description: `${result.data.summary}` });
        }
      }
    } catch {} finally {
      setAnalyzingId(null);
    }
  };

  /* ───── Analyze ALL ───── */
  const handleProcessAll = async () => {
    setProcessingAll(true);
    const unanalyzed = emails.filter((e) => !e.ai_label);
    for (const email of unanalyzed) {
      await handleAnalyze(email.id);
    }
    setProcessingAll(false);
    toast({ title: `${unanalyzed.length} email(s) analysés ✅` });
  };

  /* ───── Generate reply ───── */
  const handleGenerateReply = async () => {
    if (!selectedEmail) return;
    setGeneratingReply(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Non connecté");
      const result = await callToolProxy(session, "suggest_reply", { email_id: selectedEmail.id });
      if (result.ok && result.data.reply) {
        setReplyDraft(result.data.reply);
        setEmails((prev) =>
          prev.map((e) => (e.id === selectedEmail.id ? { ...e, ai_reply: result.data.reply } : e))
        );
      }
    } catch {} finally {
      setGeneratingReply(false);
    }
  };

  /* ───── Open reply modal ───── */
  const openReplyModal = () => {
    if (!selectedEmail) return;
    setReplyTo(selectedEmail.from_email || "");
    setReplySubject(selectedEmail.subject || "");
    setReplyBody(replyDraft || selectedEmail.ai_reply || "");
    setReplyModalOpen(true);
  };

  /* ───── Send reply ───── */
  const handleSendReply = async () => {
    if (!selectedEmail) return;
    setSending(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Non connecté");
      const result = await callToolProxy(session, "send_reply", {
        to: replyTo,
        subject: replySubject,
        body: replyBody,
        thread_id: selectedEmail.thread_id,
        message_id: selectedEmail.gmail_message_id,
      });
      if (result.ok) {
        toast({ title: "Réponse envoyée ✅" });
        setReplyModalOpen(false);
        setEmails((prev) =>
          prev.map((e) =>
            e.id === selectedEmail.id ? { ...e, status: "replied", replied_at: new Date().toISOString() } : e
          )
        );
      } else {
        toast({ title: "Erreur envoi", description: result.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  /* ───── Status changes ───── */
  const markStatus = async (id: string, status: string) => {
    await (supabase as any).from("email_inbox").update({ status }).eq("id", id);
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  /* ───── Filters ───── */
  const filteredEmails = emails.filter((e) => {
    if (filter === "all") return true;
    if (["urgent", "action", "fyi", "spam", "lead"].includes(filter)) return e.ai_label === filter;
    if (filter === "unread") return e.status === "unread";
    return true;
  });

  const stats = {
    total: emails.length,
    unread: emails.filter((e) => e.status === "unread").length,
    urgent: emails.filter((e) => e.ai_label === "urgent").length,
    action: emails.filter((e) => e.ai_label === "action").length,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            {lastSync
              ? `Dernière sync : ${lastSync.toLocaleTimeString("fr-FR")}`
              : emails.length > 0
              ? `${emails.length} email(s) en base`
              : "Non synchronisé"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> Sync Gmail
          </Button>
          <Button
            size="sm"
            onClick={handleProcessAll}
            disabled={processingAll || emails.filter((e) => !e.ai_label).length === 0}
            className="gap-2"
          >
            {processingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tout analyser ({emails.filter((e) => !e.ai_label).length})
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Filters sidebar */}
        <div className="w-48 shrink-0 border-r border-border p-4 space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtres</h3>
          <div className="space-y-1">
            {[
              { key: "all", label: "Tous", icon: InboxIcon, count: emails.length },
              { key: "unread", label: "Non lus", icon: Mail, count: stats.unread },
              { key: "urgent", label: "Urgent", icon: AlertTriangle, count: stats.urgent },
              { key: "action", label: "Action", icon: Clock, count: stats.action },
              { key: "fyi", label: "FYI", icon: FileText, count: emails.filter((e) => e.ai_label === "fyi").length },
              { key: "lead", label: "Leads", icon: Users, count: emails.filter((e) => e.ai_label === "lead").length },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  filter === f.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <f.icon className="h-4 w-4" />
                <span className="flex-1 text-left">{f.label}</span>
                <span className="text-xs">{f.count}</span>
              </button>
            ))}
          </div>

          <Separator />

          <div className="space-y-2 text-xs text-muted-foreground">
            <p><span className="font-medium text-foreground">{stats.total}</span> emails</p>
            <p><span className="font-medium text-foreground">{stats.urgent + stats.action}</span> action requise</p>
          </div>
        </div>

        {/* Email list */}
        <div className="w-96 shrink-0 border-r border-border flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <InboxIcon className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {emails.length === 0 ? 'Cliquez "Sync Gmail" pour synchroniser' : "Aucun email dans ce filtre"}
                  </p>
                </div>
              ) : (
                filteredEmails.map((email) => {
                  const lc = email.ai_label ? labelConfig[email.ai_label] : null;
                  const LIcon = lc?.icon;
                  const isAnalyzing = analyzingId === email.id;
                  return (
                    <button
                      key={email.id}
                      onClick={() => {
                        setSelectedId(email.id);
                        setReplyDraft(email.ai_reply || "");
                      }}
                      className={`w-full text-left rounded-lg p-3 transition-colors hover:bg-accent/10 ${
                        selectedId === email.id ? "bg-accent/15 ring-1 ring-primary/30" : ""
                      } ${email.status === "unread" ? "font-medium" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-foreground truncate flex-1">
                          {email.from_name || email.from_email || "Inconnu"}
                        </span>
                        {lc && LIcon && (
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${lc.color}`}>
                            <LIcon className="h-3 w-3 mr-1" />
                            {lc.label}
                          </Badge>
                        )}
                        {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      </div>
                      <p className="text-sm text-foreground truncate">{email.subject || "(sans sujet)"}</p>
                      {email.ai_summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                          {email.ai_summary.slice(0, 120)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {email.received_at
                          ? new Date(email.received_at).toLocaleDateString("fr-FR", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })
                          : ""}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Email detail */}
        <div className="flex-1 flex flex-col">
          {selectedEmail ? (
            <>
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-foreground flex-1">{selectedEmail.subject}</h2>
                  {selectedEmail.ai_label && labelConfig[selectedEmail.ai_label] && (
                    <Badge variant="outline" className={labelConfig[selectedEmail.ai_label].color}>
                      {labelConfig[selectedEmail.ai_label].label}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {statusLabels[selectedEmail.status] || selectedEmail.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  De : {selectedEmail.from_name || ""} &lt;{selectedEmail.from_email}&gt; ·{" "}
                  {selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString("fr-FR") : ""}
                </p>
              </div>
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6 max-w-2xl">
                  {/* Body preview */}
                  {selectedEmail.body_preview && (
                    <Card className="p-4 bg-muted/30">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{selectedEmail.body_preview}</p>
                    </Card>
                  )}

                  {/* AI Summary */}
                  {selectedEmail.ai_summary ? (
                    <Card className="p-4 bg-primary/5 border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">Résumé IA</span>
                        {selectedEmail.ai_priority && (
                          <Badge variant="outline" className="text-[10px]">Priorité {selectedEmail.ai_priority}/5</Badge>
                        )}
                        {selectedEmail.ai_label === "lead" && (
                          <Badge className="bg-purple-500/15 text-purple-600 text-[10px]">
                            <Star className="h-3 w-3 mr-1" /> Lead
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{selectedEmail.ai_summary}</p>
                    </Card>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleAnalyze(selectedEmail.id)}
                      disabled={analyzingId === selectedEmail.id} className="gap-2">
                      {analyzingId === selectedEmail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Analyser avec l'IA
                    </Button>
                  )}

                  {/* Reply section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Réponse</h3>
                      <Button variant="outline" size="sm" onClick={handleGenerateReply} disabled={generatingReply} className="gap-2">
                        {generatingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Générer réponse
                      </Button>
                    </div>
                    <Textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      placeholder="Réponse suggérée par l'IA…"
                      className="min-h-[120px]"
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="gap-2" onClick={openReplyModal}
                        disabled={!replyDraft.trim() && !selectedEmail.ai_reply}>
                        <Send className="h-3.5 w-3.5" /> Approuver & Envoyer
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => markStatus(selectedEmail.id, "archived")}>
                        <Archive className="h-3.5 w-3.5" /> Archiver
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => markStatus(selectedEmail.id, "replied")}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Marquer répondu
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <InboxIcon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground">Inbox Zéro</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Synchronisez vos emails Gmail, puis l'IA analyse, résume et suggère des réponses.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reply approval modal */}
      <Dialog open={replyModalOpen} onOpenChange={setReplyModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer la réponse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Destinataire</label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Sujet</label>
              <Input value={`Re: ${replySubject}`} onChange={(e) => setReplySubject(e.target.value.replace(/^Re:\s*/i, ""))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Corps du message</label>
              <Textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} className="mt-1 min-h-[200px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyModalOpen(false)}>Annuler</Button>
            <Button onClick={handleSendReply} disabled={sending || !replyTo || !replyBody.trim()} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
