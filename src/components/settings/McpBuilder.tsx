import { useState, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { validateMcpConfig, MCP_TEMPLATE, type ValidationError } from "@/lib/mcpSchema";
import { generateMcpFromTools } from "@/lib/toolSchemas";
import { CheckCircle, AlertTriangle, XCircle, Download, FileJson, ShieldAlert, Server, Wrench, Plug, Loader2 } from "lucide-react";

export function McpBuilder() {
  const { orgId, loading: orgLoading } = useOrgId();
  const [jsonText, setJsonText] = useState("");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [preview, setPreview] = useState<{ servers: number; tools: number; highRisk: number } | null>(null);

  // Load existing config
  useEffect(() => {
    if (!orgId) return;
    supabase.from("mcp_configs" as any).select("config_json").eq("org_id", orgId).single().then(({ data, error }) => {
      if (data && (data as any).config_json) {
        setJsonText(JSON.stringify((data as any).config_json, null, 2));
      }
    });
  }, [orgId]);

  const handleValidate = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      const errs = validateMcpConfig(parsed);
      setErrors(errs);
      setValidated(true);

      const servers = parsed.servers?.length ?? 0;
      let tools = 0;
      let highRisk = 0;
      (parsed.servers ?? []).forEach((s: any) => {
        (s.tools ?? []).forEach((t: any) => {
          tools++;
          if (t.risk_level === "high") highRisk++;
        });
      });
      setPreview({ servers, tools, highRisk });

      if (errs.filter(e => e.severity === "error").length === 0) {
        toast({ title: "Validation passed", description: `${errs.length} warning(s)` });
      } else {
        toast({ title: "Validation failed", description: `${errs.filter(e => e.severity === "error").length} error(s)`, variant: "destructive" });
      }
    } catch (e: any) {
      setErrors([{ path: "$", message: `Invalid JSON: ${e.message}`, severity: "error" }]);
      setValidated(true);
      setPreview(null);
    }
  }, [jsonText]);

  const compileToDB = async (parsed: any) => {
    if (!orgId) return { servers: 0, tools: 0 };

    // Delete old compiled data
    await supabase.from("mcp_tools" as any).delete().eq("org_id", orgId);
    await supabase.from("mcp_servers" as any).delete().eq("org_id", orgId);
    await supabase.from("mcp_policies" as any).delete().eq("org_id", orgId);

    let serverCount = 0;
    let toolCount = 0;

    for (const server of parsed.servers ?? []) {
      const { data: srvData } = await supabase.from("mcp_servers" as any).insert({
        org_id: orgId,
        server_id: server.id,
        label: server.label,
        type: server.type ?? "native",
        base_url: server.base_url ?? null,
      } as any).select("id").single();

      if (srvData) {
        serverCount++;
        for (const tool of server.tools ?? []) {
          await supabase.from("mcp_tools" as any).insert({
            org_id: orgId,
            server_id: (srvData as any).id,
            name: tool.name,
            description: tool.description ?? null,
            risk_level: tool.risk_level ?? "low",
            requires_approval: tool.requires_approval ?? false,
            input_schema: tool.input_schema ?? {},
          } as any);
          toolCount++;
        }
      }
    }

    // Insert policies
    if (parsed.policies) {
      for (const [policyType, config] of Object.entries(parsed.policies)) {
        await supabase.from("mcp_policies" as any).insert({
          org_id: orgId,
          policy_type: policyType,
          config_json: config,
        } as any);
      }
    }

    return { servers: serverCount, tools: toolCount };
  };

  const handleSave = async () => {
    if (!orgId) return;
    try {
      const parsed = JSON.parse(jsonText);
      const errs = validateMcpConfig(parsed);
      if (errs.filter(e => e.severity === "error").length > 0) {
        toast({ title: "Fix errors before saving", variant: "destructive" });
        return;
      }

      setSaving(true);

      const { data: existing } = await supabase.from("mcp_configs" as any).select("id").eq("org_id", orgId).single();
      if (existing) {
        await supabase.from("mcp_configs" as any).update({ config_json: parsed, version: parsed.version ?? "1.0" } as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("mcp_configs" as any).insert({ org_id: orgId, config_json: parsed, version: parsed.version ?? "1.0" } as any);
      }

      const { servers, tools } = await compileToDB(parsed);

      setSaving(false);
      toast({ title: "MCP Config saved", description: `${tools} tools compiled across ${servers} server(s).` });
    } catch (e: any) {
      setSaving(false);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mcp-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateTemplate = () => {
    setJsonText(JSON.stringify(MCP_TEMPLATE, null, 2));
    setValidated(false);
    setErrors([]);
    setPreview(null);
  };

  /** Generate config from connected tools AND auto-save + compile in one click */
  const handleGenerateAndCompile = async () => {
    if (!orgId) return;
    setCompiling(true);

    try {
      // Fetch connected tools
      const { data: connections } = await supabase
        .from("tool_connections")
        .select("tool_id, tools(slug)")
        .eq("org_id", orgId)
        .eq("status", "connected") as any;

      if (!connections || connections.length === 0) {
        toast({ title: "No connected tools", description: "Connect tools first in the Tools & Connections tab.", variant: "destructive" });
        setCompiling(false);
        return;
      }

      const slugs: string[] = connections.map((c: any) => c.tools?.slug).filter(Boolean);
      const config = generateMcpFromTools(slugs);
      const configJson = JSON.stringify(config, null, 2);

      // Update editor
      setJsonText(configJson);

      // Auto-save config
      const { data: existing } = await supabase.from("mcp_configs" as any).select("id").eq("org_id", orgId).single();
      if (existing) {
        await supabase.from("mcp_configs" as any).update({ config_json: config, version: config.version ?? "1.0" } as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("mcp_configs" as any).insert({ org_id: orgId, config_json: config, version: config.version ?? "1.0" } as any);
      }

      // Auto-compile to DB
      const { servers, tools } = await compileToDB(config);

      setValidated(false);
      setErrors([]);
      setPreview(null);

      toast({
        title: `✅ ${tools} outils compilés avec succès`,
        description: `${slugs.length} connexion(s) → ${servers} serveur(s) → ${tools} outil(s) dans la base.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCompiling(false);
    }
  };

  if (orgLoading) return <Skeleton className="h-96 w-full" />;

  const errorCount = errors.filter(e => e.severity === "error").length;
  const warningCount = errors.filter(e => e.severity === "warning").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                MCP Builder (JSON)
              </CardTitle>
              <CardDescription>Define servers, tools, and policies in a single config</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerateAndCompile} disabled={compiling}>
                {compiling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Compiling…
                  </>
                ) : (
                  <>
                    <Plug className="h-4 w-4 mr-1.5" />
                    From Connected Tools
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerateTemplate}>
                Generate Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Editor */}
          <div className="rounded-md border border-border overflow-hidden">
            <Editor
              height="400px"
              defaultLanguage="json"
              value={jsonText}
              onChange={(v) => { setJsonText(v ?? ""); setValidated(false); }}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                formatOnPaste: true,
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleValidate}>
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Validate
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" />
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {(validated || preview) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview && (
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground font-medium">{preview.servers}</span>
                  <span className="text-muted-foreground">server(s)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground font-medium">{preview.tools}</span>
                  <span className="text-muted-foreground">tool(s)</span>
                </div>
                {preview.highRisk > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
                    <span className="text-foreground font-medium">{preview.highRisk}</span>
                    <span className="text-muted-foreground">high-risk (approval required)</span>
                  </div>
                )}
              </div>
            )}

            {validated && errors.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                <CheckCircle className="h-4 w-4" />
                No errors — ready to save
              </div>
            )}

            {errors.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-3 text-sm mb-2">
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" /> {errorCount} error(s)
                    </Badge>
                  )}
                  {warningCount > 0 && (
                    <Badge variant="secondary" className="gap-1 text-[hsl(var(--warning))]">
                      <AlertTriangle className="h-3 w-3" /> {warningCount} warning(s)
                    </Badge>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs rounded-md bg-muted p-2">
                      {err.severity === "error" ? (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-mono text-muted-foreground">{err.path}</span>
                        <span className="ml-1.5 text-foreground">{err.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
