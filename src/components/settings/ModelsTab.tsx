import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Key, Eye, EyeOff, Check, Shield } from "lucide-react";

interface Model {
  id: string;
  model_name: string;
  provider: string;
  display_name: string | null;
  is_active: boolean | null;
  pricing_json: any;
}

const API_KEY_PROVIDERS = [
  { key: "CUSTOM_OPENAI_KEY", label: "OpenAI", placeholder: "sk-..." },
  { key: "CUSTOM_GOOGLE_KEY", label: "Google AI", placeholder: "AIza..." },
  { key: "CUSTOM_ANTHROPIC_KEY", label: "Anthropic", placeholder: "sk-ant-..." },
];

export function ModelsTab() {
  const { orgId, loading: orgLoading } = useOrgId();
  const { toast } = useToast();
  const [models, setModels] = useState<Model[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string; default_model_id: string | null }[]>([]);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);

  // Custom API keys state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("models").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setModels(data);
    });
  }, []);

  useEffect(() => {
    if (!orgId) return;
    // Load agents
    supabase.from("agents").select("id, name, default_model_id").eq("org_id", orgId).then(({ data }) => {
      if (data) setAgents(data);
    });
    // Load existing custom API key names from secrets
    supabase
      .from("secrets")
      .select("name")
      .eq("org_id", orgId)
      .in("name", API_KEY_PROVIDERS.map((p) => p.key))
      .then(({ data }) => {
        if (data) {
          setSavedKeys(new Set(data.map((s) => s.name)));
        }
      });
  }, [orgId]);

  const handleSaveKey = async (providerKey: string) => {
    if (!orgId) return;
    const value = apiKeys[providerKey]?.trim();
    if (!value) return;

    setSavingKey(providerKey);
    try {
      // Upsert: delete old then insert new
      await supabase.from("secrets").delete().eq("org_id", orgId).eq("name", providerKey);
      const { error } = await supabase.from("secrets").insert({
        org_id: orgId,
        name: providerKey,
        encrypted_payload: value,
      });
      if (error) throw error;
      setSavedKeys((prev) => new Set([...prev, providerKey]));
      setApiKeys((prev) => ({ ...prev, [providerKey]: "" }));
      toast({ title: "Clé API sauvegardée", description: "La clé sera utilisée à la place du gateway par défaut." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const handleRemoveKey = async (providerKey: string) => {
    if (!orgId) return;
    setSavingKey(providerKey);
    try {
      await supabase.from("secrets").delete().eq("org_id", orgId).eq("name", providerKey);
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(providerKey);
        return next;
      });
      toast({ title: "Clé API supprimée", description: "Le gateway Lovable AI sera utilisé par défaut." });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (orgLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {/* Custom API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle>Custom API Keys</CardTitle>
          </div>
          <CardDescription>
            Optionnel — utilisez vos propres clés API au lieu du gateway Lovable AI intégré.
            Les clés sont stockées de façon sécurisée et utilisées côté serveur uniquement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>Sans clé personnalisée, le gateway Lovable AI est utilisé automatiquement — aucune configuration requise.</span>
          </div>

          {API_KEY_PROVIDERS.map((provider) => {
            const isSaved = savedKeys.has(provider.key);
            const isVisible = visibleKeys.has(provider.key);
            const currentValue = apiKeys[provider.key] || "";

            return (
              <div key={provider.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{provider.label}</Label>
                  {isSaved && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Check className="h-3 w-3" /> Configurée
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isVisible ? "text" : "password"}
                      placeholder={isSaved ? "••••••••••••••••" : provider.placeholder}
                      value={currentValue}
                      onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider.key]: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisibility(provider.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {currentValue.trim() ? (
                    <Button
                      size="sm"
                      onClick={() => handleSaveKey(provider.key)}
                      disabled={savingKey === provider.key}
                    >
                      {savingKey === provider.key ? "..." : "Save"}
                    </Button>
                  ) : isSaved ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRemoveKey(provider.key)}
                      disabled={savingKey === provider.key}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Default Model */}
      <Card>
        <CardHeader>
          <CardTitle>Default Model</CardTitle>
          <CardDescription>Set the global default model and parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Model</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name || m.model_name} <span className="text-muted-foreground ml-1">({m.provider})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Temperature: {temperature}</Label>
            <Slider value={[temperature]} onValueChange={([v]) => setTemperature(v)} min={0} max={2} step={0.1} />
          </div>

          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      {/* Per-Agent Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Agent Overrides</CardTitle>
          <CardDescription>Allow agents to use different models</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm font-medium text-foreground">{agent.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {models.find(m => m.id === agent.default_model_id)?.display_name || "Default"}
                </span>
                <Switch />
              </div>
            </div>
          ))}
          {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents configured yet.</p>}
        </CardContent>
      </Card>

      {/* Pricing Info */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing Info</CardTitle>
          <CardDescription>Estimated cost per model</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{m.display_name || m.model_name}</span>
                <span className="text-muted-foreground">
                  {m.pricing_json ? `$${(m.pricing_json as any).input_per_1k || "?"}/1k in` : "N/A"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
