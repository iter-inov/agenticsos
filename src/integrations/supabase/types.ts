export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_model_overrides: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          max_tokens: number | null
          model_id: string
          temperature: number | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_id: string
          temperature?: number | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_id?: string
          temperature?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_model_overrides_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_model_overrides_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          mcp_tool_id: string | null
          permissions_json: Json | null
          tool_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          mcp_tool_id?: string | null
          permissions_json?: Json | null
          tool_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          mcp_tool_id?: string | null
          permissions_json?: Json | null
          tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_mcp_tool_id_fkey"
            columns: ["mcp_tool_id"]
            isOneToOne: false
            referencedRelation: "mcp_tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          config_json: Json | null
          created_at: string
          default_model_id: string | null
          id: string
          name: string
          org_id: string
          role_prompt: string | null
          status: Database["public"]["Enums"]["agent_status"]
          updated_at: string
        }
        Insert: {
          config_json?: Json | null
          created_at?: string
          default_model_id?: string | null
          id?: string
          name: string
          org_id: string
          role_prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
        }
        Update: {
          config_json?: Json | null
          created_at?: string
          default_model_id?: string | null
          id?: string
          name?: string
          org_id?: string
          role_prompt?: string | null
          status?: Database["public"]["Enums"]["agent_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_default_model_id_fkey"
            columns: ["default_model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          org_id: string
          reason: string | null
          required: boolean | null
          run_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          org_id: string
          reason?: string | null
          required?: boolean | null
          run_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          org_id?: string
          reason?: string | null
          required?: boolean | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          created_at: string
          details_json: Json | null
          event_type: string
          id: string
          org_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details_json?: Json | null
          event_type: string
          id?: string
          org_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details_json?: Json | null
          event_type?: string
          id?: string
          org_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          alert_thresholds: Json | null
          created_at: string
          hard_stop: boolean | null
          id: string
          monthly_limit: number | null
          org_id: string
          updated_at: string
        }
        Insert: {
          alert_thresholds?: Json | null
          created_at?: string
          hard_stop?: boolean | null
          id?: string
          monthly_limit?: number | null
          org_id: string
          updated_at?: string
        }
        Update: {
          alert_thresholds?: Json | null
          created_at?: string
          hard_stop?: boolean | null
          id?: string
          monthly_limit?: number | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          first_contact: string | null
          id: string
          name: string | null
          notes: string | null
          org_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_contact?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          org_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_contact?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          org_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          org_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbox: {
        Row: {
          ai_label: string | null
          ai_priority: number | null
          ai_reply: string | null
          ai_summary: string | null
          body_preview: string | null
          created_at: string
          from_email: string | null
          from_name: string | null
          gmail_message_id: string | null
          id: string
          org_id: string
          received_at: string | null
          replied_at: string | null
          status: string
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          ai_label?: string | null
          ai_priority?: number | null
          ai_reply?: string | null
          ai_summary?: string | null
          body_preview?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          org_id: string
          received_at?: string | null
          replied_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          ai_label?: string | null
          ai_priority?: number | null
          ai_reply?: string | null
          ai_summary?: string | null
          body_preview?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          org_id?: string
          received_at?: string | null
          replied_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_inbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_configs: {
        Row: {
          config_json: Json
          created_at: string
          id: string
          org_id: string
          updated_at: string
          version: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          id?: string
          org_id: string
          updated_at?: string
          version?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          id?: string
          org_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_policies: {
        Row: {
          config_json: Json
          created_at: string
          id: string
          org_id: string
          policy_type: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          id?: string
          org_id: string
          policy_type: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          id?: string
          org_id?: string
          policy_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_servers: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          label: string
          org_id: string
          server_id: string
          type: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          label: string
          org_id: string
          server_id: string
          type?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          server_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_servers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_test_results: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          id: string
          org_id: string
          request_payload: Json | null
          response_preview: Json | null
          status: string
          tested_at: string
          tool_name: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          org_id: string
          request_payload?: Json | null
          response_preview?: Json | null
          status?: string
          tested_at?: string
          tool_name: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          org_id?: string
          request_payload?: Json | null
          response_preview?: Json | null
          status?: string
          tested_at?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_test_results_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tools: {
        Row: {
          created_at: string
          description: string | null
          id: string
          input_schema: Json | null
          name: string
          org_id: string
          requires_approval: boolean
          risk_level: string
          server_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          input_schema?: Json | null
          name: string
          org_id: string
          requires_approval?: boolean
          risk_level?: string
          server_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          input_schema?: Json | null
          name?: string
          org_id?: string
          requires_approval?: boolean
          risk_level?: string
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tools_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tools_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "mcp_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          cost_estimate: number | null
          created_at: string
          id: string
          metadata_json: Json | null
          role: string
          token_count: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          cost_estimate?: number | null
          created_at?: string
          id?: string
          metadata_json?: Json | null
          role: string
          token_count?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          cost_estimate?: number | null
          created_at?: string
          id?: string
          metadata_json?: Json | null
          role?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          caps_json: Json | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean | null
          model_name: string
          pricing_json: Json | null
          provider: string
        }
        Insert: {
          caps_json?: Json | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          model_name: string
          pricing_json?: Json | null
          provider: string
        }
        Update: {
          caps_json?: Json | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          model_name?: string
          pricing_json?: Json | null
          provider?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          id: string
          org_id: string
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          token_type: string | null
          updated_at: string
          user_email: string | null
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id: string
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_type?: string | null
          updated_at?: string
          user_email?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_type?: string | null
          updated_at?: string
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          notification_prefs: Json | null
          onboarding_completed: boolean | null
          slug: string | null
          timezone: string | null
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notification_prefs?: Json | null
          onboarding_completed?: boolean | null
          slug?: string | null
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notification_prefs?: Json | null
          onboarding_completed?: boolean | null
          slug?: string | null
          timezone?: string | null
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      policies: {
        Row: {
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["security_mode"]
          org_id: string
          rules_json: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["security_mode"]
          org_id: string
          rules_json?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["security_mode"]
          org_id?: string
          rules_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          id: string
          org_id: string
          window_key: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          org_id: string
          window_key: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: string
          org_id?: string
          window_key?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_events: {
        Row: {
          cost: number | null
          created_at: string
          duration_ms: number | null
          id: string
          payload_json: Json | null
          run_id: string
          tokens_used: number | null
          type: Database["public"]["Enums"]["run_event_type"]
        }
        Insert: {
          cost?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          payload_json?: Json | null
          run_id: string
          tokens_used?: number | null
          type: Database["public"]["Enums"]["run_event_type"]
        }
        Update: {
          cost?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          payload_json?: Json | null
          run_id?: string
          tokens_used?: number | null
          type?: Database["public"]["Enums"]["run_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          org_id: string
          source: Database["public"]["Enums"]["run_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          total_cost: number | null
          total_tokens: number | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          org_id: string
          source?: Database["public"]["Enums"]["run_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_cost?: number | null
          total_tokens?: number | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          org_id?: string
          source?: Database["public"]["Enums"]["run_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          total_cost?: number | null
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_runs: {
        Row: {
          created_at: string
          id: string
          last_run_at: string | null
          next_run_at: string
          status: Database["public"]["Enums"]["run_status"]
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_run_at?: string | null
          next_run_at: string
          status?: Database["public"]["Enums"]["run_status"]
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      secrets: {
        Row: {
          created_at: string
          encrypted_payload: string
          id: string
          name: string
          org_id: string
          tool_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_payload: string
          id?: string
          name: string
          org_id: string
          tool_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_payload?: string
          id?: string
          name?: string
          org_id?: string
          tool_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "secrets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secrets_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          created_by_agent: boolean | null
          engagement_json: Json | null
          external_post_id: string | null
          hashtags: string[] | null
          id: string
          image_description: string | null
          image_url: string | null
          org_id: string
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          created_by_agent?: boolean | null
          engagement_json?: Json | null
          external_post_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_description?: string | null
          image_url?: string | null
          org_id: string
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          created_by_agent?: boolean | null
          engagement_json?: Json | null
          external_post_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_description?: string | null
          image_url?: string | null
          org_id?: string
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      social_stats: {
        Row: {
          created_at: string | null
          followers_count: number | null
          id: string
          org_id: string
          period_date: string
          platform: string
          posts_count: number | null
          total_engagement: number | null
          total_reach: number | null
        }
        Insert: {
          created_at?: string | null
          followers_count?: number | null
          id?: string
          org_id: string
          period_date: string
          platform?: string
          posts_count?: number | null
          total_engagement?: number | null
          total_reach?: number | null
        }
        Update: {
          created_at?: string | null
          followers_count?: number | null
          id?: string
          org_id?: string
          period_date?: string
          platform?: string
          posts_count?: number | null
          total_engagement?: number | null
          total_reach?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_connections: {
        Row: {
          config_json: Json | null
          connected_at: string | null
          created_at: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["connection_status"]
          tool_id: string
        }
        Insert: {
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["connection_status"]
          tool_id: string
        }
        Update: {
          config_json?: Json | null
          connected_at?: string | null
          created_at?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["connection_status"]
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_connections_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          type: Database["public"]["Enums"]["tool_type"]
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          type?: Database["public"]["Enums"]["tool_type"]
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          type?: Database["public"]["Enums"]["tool_type"]
        }
        Relationships: []
      }
      usage_by_agent_daily: {
        Row: {
          agent_id: string
          cost: number | null
          created_at: string
          date: string
          id: string
          org_id: string
          tokens: number | null
        }
        Insert: {
          agent_id: string
          cost?: number | null
          created_at?: string
          date: string
          id?: string
          org_id: string
          tokens?: number | null
        }
        Update: {
          agent_id?: string
          cost?: number | null
          created_at?: string
          date?: string
          id?: string
          org_id?: string
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_by_agent_daily_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_by_agent_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_daily: {
        Row: {
          cost: number | null
          created_at: string
          date: string
          id: string
          org_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          date: string
          id?: string
          org_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          date?: string
          id?: string
          org_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reports: {
        Row: {
          generated_at: string | null
          id: string
          insights: string | null
          metrics: Json
          org_id: string
          week_start: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          insights?: string | null
          metrics?: Json
          org_id: string
          week_start: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          insights?: string | null
          metrics?: Json
          org_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action_config_json: Json | null
          action_type: string
          created_at: string
          id: string
          step_order: number
          workflow_id: string
        }
        Insert: {
          action_config_json?: Json | null
          action_type: string
          created_at?: string
          id?: string
          step_order: number
          workflow_id: string
        }
        Update: {
          action_config_json?: Json | null
          action_type?: string
          created_at?: string
          id?: string
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          agent_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          trigger_config_json: Json | null
          trigger_type: Database["public"]["Enums"]["trigger_type"]
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          trigger_config_json?: Json | null
          trigger_type?: Database["public"]["Enums"]["trigger_type"]
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          trigger_config_json?: Json | null
          trigger_type?: Database["public"]["Enums"]["trigger_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_status: "active" | "paused" | "archived"
      connection_status: "connected" | "disconnected" | "error"
      org_role: "owner" | "admin" | "member"
      run_event_type:
        | "policy_check"
        | "llm_call"
        | "tool_call"
        | "log"
        | "error"
        | "approval_required"
        | "approval_granted"
      run_source: "chat" | "schedule" | "webhook" | "manual"
      run_status: "pending" | "running" | "completed" | "failed" | "cancelled"
      security_mode: "low" | "medium" | "high"
      tool_type: "oauth" | "api_key" | "webhook"
      trigger_type: "manual" | "cron" | "webhook" | "event"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_status: ["active", "paused", "archived"],
      connection_status: ["connected", "disconnected", "error"],
      org_role: ["owner", "admin", "member"],
      run_event_type: [
        "policy_check",
        "llm_call",
        "tool_call",
        "log",
        "error",
        "approval_required",
        "approval_granted",
      ],
      run_source: ["chat", "schedule", "webhook", "manual"],
      run_status: ["pending", "running", "completed", "failed", "cancelled"],
      security_mode: ["low", "medium", "high"],
      tool_type: ["oauth", "api_key", "webhook"],
      trigger_type: ["manual", "cron", "webhook", "event"],
    },
  },
} as const
