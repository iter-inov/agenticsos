import { useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Building2,
  Brain,
  Plug,
  ShieldCheck,
  CreditCard,
  Bell,
  Webhook,
  ScrollText,
  MessageCircle,
  Share2,
} from "lucide-react";
import { WorkspaceTab } from "@/components/settings/WorkspaceTab";
import { ModelsTab } from "@/components/settings/ModelsTab";
import { ToolsConnectionsTab } from "@/components/settings/ToolsConnectionsTab";
import { ApprovalsTab } from "@/components/settings/ApprovalsTab";
import { BillingTab } from "@/components/settings/BillingTab";
import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { ApiWebhooksTab } from "@/components/settings/ApiWebhooksTab";
import { AuditLogsTab } from "@/components/settings/AuditLogsTab";
import { MessagingTab } from "@/components/settings/MessagingTab";
import { SocialMediaTab } from "@/components/settings/SocialMediaTab";

const tabs = [
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "models", label: "Models & LLM", icon: Brain },
  { id: "tools", label: "Tools & Connections", icon: Plug },
  { id: "messaging", label: "Messaging", icon: MessageCircle },
  { id: "social", label: "Social Media", icon: Share2 },
  { id: "approvals", label: "Approvals & Guardrails", icon: ShieldCheck },
  { id: "billing", label: "Billing & Usage", icon: CreditCard },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api", label: "API & MCP", icon: Webhook },
  { id: "audit", label: "Audit & Logs", icon: ScrollText },
] as const;

type TabId = (typeof tabs)[number]["id"];

const tabComponents: Record<TabId, React.FC> = {
  workspace: WorkspaceTab,
  models: ModelsTab,
  tools: ToolsConnectionsTab,
  messaging: MessagingTab,
  social: SocialMediaTab,
  approvals: ApprovalsTab,
  billing: BillingTab,
  notifications: NotificationsTab,
  api: ApiWebhooksTab,
  audit: AuditLogsTab,
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    paramTab && tabs.some((t) => t.id === paramTab) ? paramTab : "workspace"
  );

  useEffect(() => {
    if (paramTab && paramTab !== activeTab && tabs.some((t) => t.id === paramTab)) {
      setActiveTab(paramTab);
    }
  }, [paramTab]);

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    setSearchParams({ tab: id });
  };

  const ActiveComponent = tabComponents[activeTab];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace configuration</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Vertical tab nav */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible lg:w-56 shrink-0 rounded-lg border border-border bg-card p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
