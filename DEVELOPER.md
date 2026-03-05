# Agentic OS — Documentation Développeur

> **Dernière mise à jour :** Mars 2026  
> **Stack :** React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Lovable Cloud)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Structure du projet](#3-structure-du-projet)
4. [Base de données](#4-base-de-données)
5. [Authentification & Organisations](#5-authentification--organisations)
6. [Edge Functions (Backend)](#6-edge-functions-backend)
7. [Pipeline MCP](#7-pipeline-mcp)
8. [Système de Tools & Connexions](#8-système-de-tools--connexions)
9. [Google OAuth Flow](#9-google-oauth-flow)
10. [Slack Integration](#10-slack-integration)
11. [Dashboard de Test MCP](#11-dashboard-de-test-mcp)
12. [Design System](#12-design-system)
13. [Variables d'environnement & Secrets](#13-variables-denvironnement--secrets)
14. [Développement local](#14-développement-local)
15. [Conventions & Standards](#15-conventions--standards)

---

## 1. Vue d'ensemble

**Agentic OS** est une plateforme de gestion d'agents IA qui orchestre des outils externes (Gmail, Slack, Drive, Calendar, Notion, etc.) via le protocole **MCP (Model Context Protocol)**.

### Fonctionnalités principales

| Module | Description |
|---|---|
| **Dashboard** | Vue d'ensemble : agents actifs, runs récents, usage quotidien |
| **Agents** | Création/configuration d'agents IA avec prompts, modèles, outils assignés |
| **Tools** | Catalogue de 13+ intégrations (Slack, Gmail, Drive, Calendar, Notion, n8n, Airtable, WhatsApp, Telegram, X, Instagram, Facebook, TradingView) |
| **Workflows** | Orchestration multi-étapes avec triggers (cron, webhook, event, manual) |
| **MCP Builder** | Éditeur JSON pour la configuration MCP avec compilation vers les tables runtime |
| **MCP Test Dashboard** | Validation end-to-end du pipeline MCP avec appels API réels et mock |
| **Settings** | Workspace, modèles LLM, connexions, approbations, billing, notifications, API/webhooks, audit logs |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vite)                 │
│  Pages: Dashboard, Agents, Tools, Workflows, Settings   │
│  MCP Test Dashboard (/mcp-test)                         │
└──────────────┬──────────────────────────────┬───────────┘
               │ supabase-js SDK              │
               ▼                              ▼
┌──────────────────────┐    ┌──────────────────────────────┐
│   Supabase Postgres  │    │      Edge Functions (Deno)    │
│   (25+ tables, RLS)  │    │                              │
│                      │    │  • run-agent      (stub)     │
│  • orgs              │    │  • tool-proxy     (stub)     │
│  • org_members       │    │  • mcp-server     (live)     │
│  • agents            │    │  • mcp-test-runner(live)     │
│  • tools             │    │  • scheduler-tick (stub)     │
│  • mcp_servers       │    │  • stripe-webhook (stub)     │
│  • mcp_tools         │    │  • google-oauth-start (live) │
│  • mcp_configs       │    │  • google-oauth-callback(live│
│  • oauth_tokens      │    │                              │
│  • ...               │    └──────────┬───────────────────┘
└──────────────────────┘               │
                                       ▼
                          ┌────────────────────────┐
                          │    External APIs        │
                          │  • Slack (connector)    │
                          │  • Google APIs (OAuth)  │
                          │  • Notion, n8n, etc.    │
                          └────────────────────────┘
```

### Flux d'exécution d'un agent

```
User prompt → run-agent → Policy check → LLM call → Tool calls → tool-proxy → External API
                                                          ↓
                                                    mcp-server (MCP protocol)
                                                          ↓
                                                    tool-proxy (API execution)
```

> **Note :** `run-agent` et `tool-proxy` sont actuellement des **stubs** qui retournent des réponses mock. Le pipeline MCP (`mcp-server` → `mcp-test-runner`) est fonctionnel avec des appels réels pour Slack et Google.

---

## 3. Structure du projet

```
src/
├── App.tsx                      # Routes principales + AuthProvider
├── contexts/
│   └── AuthContext.tsx           # Session Supabase + signOut
├── hooks/
│   ├── useOrgId.ts              # Récupère l'org_id du user connecté
│   ├── use-mobile.tsx           # Détection mobile
│   └── use-toast.ts             # Hook toast notifications
├── pages/
│   ├── Dashboard.tsx            # Vue d'ensemble
│   ├── Agents.tsx               # CRUD agents
│   ├── Tools.tsx                # Catalogue outils
│   ├── Workflows.tsx            # Gestion workflows
│   ├── Settings.tsx             # 8 onglets de settings
│   ├── McpTestDashboard.tsx     # Dashboard de test MCP
│   ├── Auth.tsx                 # Login/Signup
│   └── ResetPassword.tsx        # Reset mot de passe
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx        # Layout principal avec sidebar
│   │   ├── AppSidebar.tsx       # Navigation latérale
│   │   └── ChatPanel.tsx        # Panel de chat
│   ├── settings/
│   │   ├── WorkspaceTab.tsx     # Config organisation
│   │   ├── ModelsTab.tsx        # Gestion modèles LLM
│   │   ├── ToolsConnectionsTab.tsx # Connexions outils
│   │   ├── McpBuilder.tsx       # Éditeur MCP JSON
│   │   ├── ApprovalsTab.tsx     # Règles d'approbation
│   │   ├── BillingTab.tsx       # Facturation
│   │   ├── NotificationsTab.tsx # Préférences notifications
│   │   ├── ApiWebhooksTab.tsx   # API & MCP config
│   │   └── AuditLogsTab.tsx     # Logs d'audit
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── mcpSchema.ts             # Types MCP + validation + template
│   ├── mcpTestPayloads.ts       # Payloads de test par outil
│   ├── toolSchemas.ts           # Mapping slug → tools MCP
│   └── utils.ts                 # Utilitaires (cn, etc.)
├── integrations/
│   └── supabase/
│       ├── client.ts            # Client Supabase (auto-généré, NE PAS MODIFIER)
│       └── types.ts             # Types DB (auto-généré, NE PAS MODIFIER)
└── data/
    └── mockData.ts              # Données mock pour le dev

supabase/
├── config.toml                  # Config Edge Functions (auto-géré)
├── migrations/                  # Migrations SQL (read-only)
└── functions/
    ├── run-agent/index.ts       # Orchestrateur d'agents (STUB)
    ├── tool-proxy/index.ts      # Proxy d'exécution d'outils (STUB)
    ├── mcp-server/index.ts      # Serveur MCP (mcp-lite + Hono)
    ├── mcp-test-runner/index.ts  # Exécuteur de tests MCP (LIVE)
    ├── scheduler-tick/index.ts   # Scheduler cron (STUB)
    ├── stripe-webhook/index.ts   # Webhook Stripe (STUB)
    ├── google-oauth-start/index.ts    # Initie le flow OAuth Google
    └── google-oauth-callback/index.ts # Callback OAuth Google
```

---

## 4. Base de données

### Schéma des tables principales

#### Organisation & Utilisateurs

| Table | Description | RLS |
|---|---|---|
| `orgs` | Organisations (workspace) | Members can view, admins can update |
| `org_members` | Liens user ↔ org avec rôle (`owner`/`admin`/`member`) | Members can view, owners can manage |
| `profiles` | Infos utilisateur (display_name, avatar, email) | Users own their profile |

#### Agents & Exécution

| Table | Description |
|---|---|
| `agents` | Agents IA (name, role_prompt, config_json, status, default_model_id) |
| `agent_tools` | Outils assignés à un agent (M:N) |
| `agent_model_overrides` | Override de modèle par agent |
| `runs` | Exécutions d'agents (status, cost, tokens, source) |
| `run_events` | Événements d'une run (policy_check, llm_call, tool_call, log, error) |
| `conversations` | Conversations utilisateur-agent |
| `messages` | Messages d'une conversation |

#### Outils & Connexions

| Table | Description |
|---|---|
| `tools` | Catalogue d'outils (name, slug, type, category) |
| `tool_connections` | Connexions actives par org (status: connected/disconnected/error) |
| `secrets` | Secrets chiffrés par org/tool |
| `oauth_tokens` | Tokens OAuth (Google, Slack, etc.) avec refresh_token et expires_at |

#### MCP (Model Context Protocol)

| Table | Description |
|---|---|
| `mcp_configs` | Configuration MCP JSON source-of-truth par org |
| `mcp_servers` | Serveurs MCP compilés (server_id, label, type, base_url) |
| `mcp_tools` | Outils MCP compilés (name, input_schema, risk_level, requires_approval) |
| `mcp_policies` | Politiques MCP compilées |
| `mcp_test_results` | Résultats de tests MCP (status, duration_ms, response_preview) |

#### Workflows & Scheduling

| Table | Description |
|---|---|
| `workflows` | Workflows avec trigger_type (manual/cron/webhook/event) |
| `workflow_steps` | Étapes d'un workflow (action_type, step_order) |
| `scheduled_runs` | Runs planifiées (next_run_at, last_run_at) |

#### Billing & Usage

| Table | Description |
|---|---|
| `budgets` | Limites de budget par org (monthly_limit, hard_stop) |
| `usage_daily` | Usage quotidien agrégé (tokens_in, tokens_out, cost) |
| `usage_by_agent_daily` | Usage quotidien par agent |
| `models` | Modèles LLM disponibles (provider, model_name, pricing_json) |
| `policies` | Politiques de sécurité par org (mode: low/medium/high) |
| `approvals` | Approbations requises pour les runs |

### Enums

```sql
agent_status:     'active' | 'paused' | 'archived'
connection_status: 'connected' | 'disconnected' | 'error'
org_role:          'owner' | 'admin' | 'member'
run_event_type:    'policy_check' | 'llm_call' | 'tool_call' | 'log' | 'error' | 'approval_required' | 'approval_granted'
run_source:        'chat' | 'schedule' | 'webhook' | 'manual'
run_status:        'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
security_mode:     'low' | 'medium' | 'high'
tool_type:         'oauth' | 'api_key' | 'webhook'
trigger_type:      'manual' | 'cron' | 'webhook' | 'event'
```

### Fonctions SQL

| Fonction | Description |
|---|---|
| `is_org_member(_org_id, _user_id)` | Vérifie si un user est membre d'une org |
| `get_user_org_role(_org_id, _user_id)` | Retourne le rôle d'un user dans une org |

### Row-Level Security (RLS)

Toutes les tables ont des politiques RLS activées. Le pattern général :
- **SELECT** : `is_org_member(auth.uid(), org_id)` — tout membre peut lire
- **INSERT/UPDATE/DELETE** : `get_user_org_role(auth.uid(), org_id) IN ('owner', 'admin')` — seuls les admins peuvent modifier
- **Exception** : `tools` et `models` sont en lecture seule pour tout utilisateur authentifié

---

## 5. Authentification & Organisations

### Flow d'auth

```
Auth.tsx → supabase.auth.signUp() / signInWithPassword()
                    ↓
           AuthContext.tsx (onAuthStateChange)
                    ↓
           session stockée dans le state React
                    ↓
           ProtectedRoutes vérifie session != null
```

### Hook `useOrgId()`

```typescript
// Récupère automatiquement l'org_id de l'utilisateur connecté
const { orgId, loading } = useOrgId();
```

Ce hook query `org_members` pour trouver l'org du user connecté. **Chaque requête Supabase nécessitant un filtre org doit utiliser ce hook.**

### Rôles

| Rôle | Permissions |
|---|---|
| `owner` | Tout (CRUD org, membres, agents, tools, configs) |
| `admin` | CRUD agents, tools, configs, approbations |
| `member` | Lecture seule sur la plupart des tables, peut créer des conversations |

---

## 6. Edge Functions (Backend)

Toutes les Edge Functions sont déployées automatiquement. Elles utilisent Deno et sont configurées dans `supabase/config.toml`.

### `mcp-server` — Serveur MCP (LIVE)

**Technologie :** mcp-lite + Hono

Le serveur MCP charge dynamiquement les outils depuis `mcp_tools` au démarrage (cold start) et les expose via le protocole MCP standard (JSON-RPC sur HTTP).

```
Client → POST /functions/v1/mcp-server
         Body: { jsonrpc: "2.0", method: "tools/call", params: { name: "slack_list_channels", arguments: {...} } }
         Auth: Bearer MCP_AUTH_TOKEN
```

**Outils built-in :**
- `query_data` : lecture de données depuis les tables autorisées (agents, tools, workflows, runs, conversations, mcp_servers, mcp_tools)

**Outils dynamiques :**
Chaque entrée dans `mcp_tools` est enregistrée comme un outil MCP. L'exécution est routée vers `tool-proxy`.

### `mcp-test-runner` — Exécuteur de tests (LIVE)

Gère deux modes d'exécution :

1. **Real API** : Pour les outils avec un handler dans `REAL_API_TOOLS` (Slack, Gmail, Drive, Calendar)
2. **Mock/MCP Pipeline** : Pour les autres outils, appelle `mcp-server` via JSON-RPC

**Flow :**
```
Frontend → mcp-test-runner
    ├── Auth check (Bearer token → getUser)
    ├── Org membership check
    ├── Si REAL_API_TOOLS[tool_name] existe :
    │   ├── Récupère credentials (env vars ou oauth_tokens)
    │   ├── Appelle l'API externe
    │   └── Sauvegarde résultat dans mcp_test_results
    └── Sinon (fallback MCP) :
        ├── Vérifie que le tool existe dans mcp_tools
        ├── Appelle mcp-server via JSON-RPC
        └── Sauvegarde résultat dans mcp_test_results
```

### `google-oauth-start` — Initie OAuth Google

Génère l'URL d'autorisation Google avec les scopes :
- `gmail.modify`
- `drive.readonly`
- `calendar.readonly`
- `userinfo.email`

L'état (org_id, user_id) est encodé en base64 dans le paramètre `state`.

### `google-oauth-callback` — Callback OAuth Google

1. Échange le code contre `access_token` + `refresh_token`
2. Récupère l'email de l'utilisateur Google
3. Upsert dans `oauth_tokens` (clé unique : org_id + provider)
4. **Auto-compile** 4 outils Google dans `mcp_tools`/`mcp_servers` :
   - `gmail_read_inbox`, `gmail_send_email`, `gdrive_search`, `calendar_list_events`
5. Redirige vers `/mcp-test?google_auth=success`

### `run-agent` — Orchestrateur (STUB)

**Status :** Non implémenté — retourne une réponse mock.

**TODO :**
- Charger la config de l'agent depuis la DB
- Appliquer les guardrails / policy check
- Router vers le provider LLM avec streaming
- Exécuter les tool calls via tool-proxy
- Logger les run_events

### `tool-proxy` — Proxy d'outils (STUB)

**Status :** Non implémenté — retourne une réponse mock.

**TODO :**
- Vérifier les policies (approbations, rate limits)
- Récupérer les secrets (OAuth tokens, API keys)
- Appeler l'API réelle de l'outil
- Logger input/output avec redaction PII

### `scheduler-tick` — Scheduler (STUB)

**Status :** Non implémenté — destiné à être appelé par pg_cron.

**TODO :**
- Query `scheduled_runs` WHERE `next_run_at <= now()` AND `status = 'pending'`
- Pour chaque run due : appeler `run-agent`, calculer le prochain `next_run_at`

---

## 7. Pipeline MCP

### Qu'est-ce que MCP ?

Le **Model Context Protocol** est un standard pour connecter des agents IA à des outils externes de manière structurée et sécurisée.

### Architecture MCP dans Agentic OS

```
                    Source of Truth
                         │
                    mcp_configs (JSON)
                         │
                    ┌────┴────┐
                    │ Compile │  (McpBuilder / auto-compile)
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         mcp_servers  mcp_tools  mcp_policies
              │          │
              └────┬─────┘
                   ▼
             mcp-server (Edge Function)
                   │
                   ▼
             tool-proxy → External APIs
```

### MCP Config JSON Schema

```typescript
interface McpConfig {
  version: string;                    // "1.0"
  workspace?: {
    timezone?: string;                // "UTC"
    default_model?: string;           // "openai:gpt-4.1-mini"
  };
  servers: McpServer[];               // Groupes d'outils
  policies?: McpPolicies;             // Règles de sécurité
}

interface McpServer {
  id: string;                         // "google-workspace"
  label: string;                      // "Google Workspace"
  type: "native" | "webhook" | "mcp"; // Type de serveur
  base_url?: string;                  // URL pour webhook/mcp
  tools: McpTool[];                   // Outils du serveur
}

interface McpTool {
  name: string;                       // "gmail_send_email"
  description: string;
  risk_level: "low" | "medium" | "high";
  requires_approval: boolean;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

interface McpPolicies {
  pii_protection?: { enabled: boolean; redact_in_logs: boolean };
  budget?: { monthly_limit_usd: number; hard_stop: boolean };
  approvals?: {
    default_requires_approval: boolean;
    roles_allowed_to_approve: string[];
  };
}
```

### Compilation

Le processus de **compilation** transforme le JSON MCP en tables normalisées pour des lookups rapides au runtime.

**Deux méthodes de compilation :**

1. **Manuelle** : Via le MCP Builder (Settings → API & MCP), l'utilisateur édite le JSON puis clique "Save & Compile"
2. **Automatique** : Bouton "From Connected Tools" dans le MCP Builder — détecte les outils connectés via `tool_connections` et génère le JSON + compile

### Validation

La fonction `validateMcpConfig()` dans `mcpSchema.ts` vérifie :
- Version présente
- Servers non vide
- Pas de server_id ou tool_name dupliqués
- risk_level valide (low/medium/high)
- requires_approval est boolean
- ⚠️ Warning si un outil high-risk n'a pas requires_approval
- Budget cohérent (hard_stop nécessite monthly_limit > 0)

---

## 8. Système de Tools & Connexions

### Catalogue de Tools

Les outils sont définis dans deux endroits :
1. **Table `tools`** : Catalogue global (name, slug, type, category)
2. **`toolSchemas.ts`** : Définitions MCP détaillées par slug

### Tools disponibles (20 actions sur 13 intégrations)

| Slug | Catégorie | Actions |
|---|---|---|
| `slack` | Messaging | `slack_list_channels`, `slack_send_message` |
| `gmail` | Google Workspace | `gmail_send_email`, `gmail_read_inbox` |
| `google-drive` | Google Workspace | `gdrive_search`, `gdrive_upload` |
| `google-calendar` | Google Workspace | `calendar_create_event`, `calendar_list_events` |
| `notion` | Productivity | `notion_query_db`, `notion_create_page` |
| `n8n` | Automation | `n8n_trigger_webhook` |
| `airtable` | Productivity | `airtable_query`, `airtable_create_record` |
| `whatsapp` | Messaging | `whatsapp_send_message` |
| `telegram` | Messaging | `telegram_send_message` |
| `x` | Social Media | `x_post_tweet`, `x_read_mentions` |
| `instagram` | Social Media | `instagram_post` |
| `facebook` | Social Media | `facebook_post` |
| `tradingview` | Finance | `tradingview_get_alerts` |

### Risk Levels

| Niveau | Description | Approbation |
|---|---|---|
| `low` | Lecture seule (list channels, read inbox) | Non requise |
| `medium` | Création de contenu (create event, create page) | Requise |
| `high` | Actions destructives/externes (send email, post tweet) | Requise |

### Connexion d'un outil

```
1. Admin connecte un outil via Settings → Tools & Connections
2. tool_connections.status = 'connected'
3. (Optionnel) Bouton "From Connected Tools" dans MCP Builder
4. Auto-génération du JSON MCP via generateMcpFromTools()
5. Compilation vers mcp_servers + mcp_tools
6. L'outil est maintenant disponible pour les agents
```

---

## 9. Google OAuth Flow

### Prérequis

1. Projet Google Cloud Console créé
2. APIs activées : Gmail API, Drive API, Calendar API
3. Credentials OAuth 2.0 (Web application) créées
4. Redirect URI ajouté : `https://aimxmxldndrlgfgpxxzh.supabase.co/functions/v1/google-oauth-callback`
5. Secrets configurés : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Flow complet

```
┌──────────┐     1. startGoogleOAuth()      ┌────────────────────┐
│ Frontend │ ──────────────────────────────► │ google-oauth-start │
│ /mcp-test│                                │ (Edge Function)    │
└──────────┘                                └────────┬───────────┘
                                                     │ 2. Retourne auth_url
                                                     ▼
                                            ┌────────────────────┐
                                            │ Google Consent     │
                                            │ Screen             │
                                            └────────┬───────────┘
                                                     │ 3. User autorise
                                                     ▼
┌──────────┐     5. Redirect /mcp-test       ┌────────────────────────┐
│ Frontend │ ◄─────────────────────────────  │ google-oauth-callback  │
│ /mcp-test│    ?google_auth=success         │ (Edge Function)        │
└──────────┘                                 │                        │
                                             │ 4. Échange code →      │
                                             │    access_token +      │
                                             │    refresh_token       │
                                             │    → Upsert oauth_tokens│
                                             │    → Auto-compile tools │
                                             └────────────────────────┘
```

### Token Refresh automatique

Avant chaque appel API Google, `mcp-test-runner` vérifie `expires_at` :
- Si le token expire dans < 60 secondes → appel `https://oauth2.googleapis.com/token` avec le `refresh_token`
- Mise à jour de `oauth_tokens` avec le nouveau `access_token` et `expires_at`

### Scopes demandés

| Scope | Utilisation |
|---|---|
| `gmail.modify` | Lire et envoyer des emails |
| `drive.readonly` | Lister et rechercher des fichiers |
| `calendar.readonly` | Lister les événements |
| `userinfo.email` | Récupérer l'email du compte Google |

---

## 10. Slack Integration

### Mécanisme

Slack est connecté via le **Connector Gateway** de Lovable, pas via OAuth direct.

```
mcp-test-runner → https://connector-gateway.lovable.dev/slack/api/{method}
                  Headers:
                    Authorization: Bearer LOVABLE_API_KEY
                    X-Connection-Api-Key: SLACK_API_KEY
```

### Méthodes supportées

| Méthode Slack | Action MCP | Description |
|---|---|---|
| `conversations.list` | `slack_list_channels` | Liste les channels (id, name, is_member, num_members) |
| `chat.postMessage` | `slack_send_message` | Envoie un message (résolution automatique du channel name → ID) |

### Diagnostic en temps réel

Le dashboard `/mcp-test` inclut un panel "Slack Diagnostic" qui :
1. Appelle `slack_list_channels` via `mcp-test-runner`
2. Affiche la liste réelle des channels avec nombre de membres
3. Affiche le timestamp du dernier test réussi
4. Affiche les erreurs Slack API détaillées en cas d'échec

---

## 11. Dashboard de Test MCP

**Route :** `/mcp-test`

### Fonctionnalités

| Feature | Description |
|---|---|
| **Test All** | Lance tous les tests séquentiellement avec barre de progression |
| **Test individuel** | Bouton "Test" par outil |
| **Badges de status** | 🟢 Real API, 🟡 Mock, ⚪ Config Missing, 🔴 Error, 🟠 Auth Missing |
| **Response summary** | Résumé intelligent (ex: "3 channels found: #general, #dev, #random") |
| **Panel expandable** | JSON brut de la réponse |
| **Slack Diagnostic** | Test Slack en temps réel avec liste des channels |
| **Google OAuth** | Connexion Google + statut + email connecté |
| **Historique** | 50 derniers résultats depuis `mcp_test_results` |
| **Gap Analysis** | Section "Unconnected Tools" listant les outils sans credentials |

### Payloads de test

Définis dans `mcpTestPayloads.ts`. Chaque payload est safe :
- Les actions destructives (send_email, post_tweet) sont en **dry-run**
- Les actions de lecture utilisent des paramètres minimalistes

### Statuts de test

| Status | Signification |
|---|---|
| `success` | L'appel API a réussi |
| `error` | Erreur API (rate limit, permission, etc.) |
| `config_missing` | L'outil n'existe pas dans `mcp_tools` |
| `auth_missing` | Credentials manquants (OAuth non connecté, API key absente) |
| `config_ok` | Configuration valide mais pas d'API réelle |

---

## 12. Design System

### Stack UI

- **shadcn/ui** : Composants de base (Button, Card, Badge, Dialog, etc.)
- **Tailwind CSS** : Classes utilitaires avec tokens sémantiques
- **Lucide React** : Icônes
- **Framer Motion** : Animations (disponible mais peu utilisé)
- **Recharts** : Graphiques

### Tokens CSS

Les couleurs sont définies en HSL dans `index.css` et référencées via les variables CSS :

```css
/* Utiliser les tokens, JAMAIS les couleurs directes */
✅ text-foreground, bg-background, text-muted-foreground, bg-primary
❌ text-white, bg-black, text-gray-500
```

### Conventions de composants

- Utiliser les variantes shadcn (`<Button variant="outline">`)
- Préférer les `Badge` pour les statuts
- Utiliser `Card` + `CardHeader` + `CardContent` pour les sections
- Utiliser `toast()` pour les notifications

---

## 13. Variables d'environnement & Secrets

### Variables auto-générées (NE PAS MODIFIER)

| Variable | Source |
|---|---|
| `VITE_SUPABASE_URL` | .env (auto) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | .env (auto) |
| `VITE_SUPABASE_PROJECT_ID` | .env (auto) |

### Secrets Edge Functions

| Secret | Utilisation | Status |
|---|---|---|
| `SUPABASE_URL` | Auto-injecté par Supabase | ✅ Auto |
| `SUPABASE_ANON_KEY` | Auto-injecté par Supabase | ✅ Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injecté par Supabase | ✅ Auto |
| `LOVABLE_API_KEY` | Connector Gateway auth | ✅ Configuré |
| `SLACK_API_KEY` | Slack connector | ✅ Configuré |
| `GOOGLE_CLIENT_ID` | Google OAuth | ✅ Configuré |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | ✅ Configuré |
| `MCP_AUTH_TOKEN` | Auth pour le serveur MCP | ⚠️ À configurer |
| `SLACK_TEST_CHANNEL_ID` | Channel de test Slack | ⚠️ Optionnel |

---

## 14. Développement local

### Installation

```bash
git clone <REPO_URL>
cd <PROJECT_NAME>
npm install
npm run dev
```

### Fichiers à ne JAMAIS modifier

| Fichier | Raison |
|---|---|
| `src/integrations/supabase/client.ts` | Auto-généré |
| `src/integrations/supabase/types.ts` | Auto-généré depuis le schéma DB |
| `supabase/config.toml` | Auto-géré |
| `.env` | Auto-généré |
| `supabase/migrations/` | Read-only, géré par l'outil de migration |

### Tests

```bash
npm test              # ou bunx vitest
```

Les tests sont dans `src/test/`. Configuration dans `vitest.config.ts`.

---

## 15. Conventions & Standards

### Nommage

| Type | Convention | Exemple |
|---|---|---|
| Composants React | PascalCase | `McpTestDashboard.tsx` |
| Hooks | camelCase avec `use` prefix | `useOrgId.ts` |
| Edge Functions | kebab-case (dossier) | `mcp-test-runner/` |
| Tables DB | snake_case | `mcp_test_results` |
| Enums DB | snake_case | `agent_status` |
| Tool names | snake_case | `slack_list_channels` |
| Tool slugs | kebab-case | `google-drive` |

### Patterns

- **Toute requête DB** doit filtrer par `org_id` (via `useOrgId()`)
- **Pas de données en dur** dans les composants — utiliser les tables DB
- **Edge Functions** : toujours valider l'auth + membership avant de traiter
- **RLS** : ne jamais contourner — utiliser `service_role` uniquement dans les Edge Functions
- **Imports** : utiliser les alias `@/` (configuré dans `tsconfig.app.json`)

### Status des modules

| Module | Status | Notes |
|---|---|---|
| Auth & Orgs | ✅ Live | Login, signup, session management |
| MCP Server | ✅ Live | Dynamic tool loading, mcp-lite |
| MCP Test Runner | ✅ Live | Real API (Slack, Google), mock fallback |
| Google OAuth | ✅ Live | Full flow + auto-refresh + auto-compile |
| Slack Integration | ✅ Live | Via connector gateway |
| Run Agent | ⚠️ Stub | Retourne mock responses |
| Tool Proxy | ⚠️ Stub | Retourne mock responses |
| Scheduler | ⚠️ Stub | pg_cron non configuré |
| Stripe Webhook | ⚠️ Stub | Non implémenté |

---

## Annexe : Diagramme de relations DB

```
orgs ──────────────┬───── org_members ──── (auth.users)
  │                │
  ├── agents ──────┼── agent_tools ── tools
  │    │           │                    │
  │    └── runs    │              tool_connections
  │         │      │
  │    run_events   ├── mcp_configs
  │                │
  ├── workflows    ├── mcp_servers ── mcp_tools
  │    │           │
  │  workflow_steps ├── mcp_policies
  │    │           │
  │  scheduled_runs ├── mcp_test_results
  │                │
  ├── conversations ├── oauth_tokens
  │    │           │
  │  messages      ├── secrets
  │                │
  ├── budgets      ├── usage_daily
  │                │
  ├── policies     └── usage_by_agent_daily
  │
  └── approvals
```
