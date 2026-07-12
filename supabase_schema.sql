-- DaveX Supabase Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Configuration Table
CREATE TABLE IF NOT EXISTS public.config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Providers Table
CREATE TABLE IF NOT EXISTS public.providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id TEXT PRIMARY KEY,
    goal TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Messages Table (Session History)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES public.sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Memory Table (Long-term)
CREATE TABLE IF NOT EXISTS public.memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Optional: requires pgvector extension
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Skills Table
CREATE TABLE IF NOT EXISTS public.skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    code TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. MCP Servers Table
CREATE TABLE IF NOT EXISTS public.mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Kanban Table
CREATE TABLE IF NOT EXISTS public.kanban (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES public.sessions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'todo', -- 'todo', 'doing', 'done'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Usage Table
CREATE TABLE IF NOT EXISTS public.usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id TEXT,
    model TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Approved Users (for Telegram bot security)
CREATE TABLE IF NOT EXISTS public.approved_users (
    chat_id TEXT PRIMARY KEY,
    username TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Pairing Codes
CREATE TABLE IF NOT EXISTS public.pairing_codes (
    code TEXT PRIMARY KEY,
    chat_id TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Extensions
CREATE TABLE IF NOT EXISTS public.extensions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Tool Results
CREATE TABLE IF NOT EXISTS public.tool_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT REFERENCES public.sessions(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    input JSONB,
    output TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) - Optional but recommended
-- For DaveX, since it uses the service_role key, RLS is usually bypassed.
-- But we'll ensure the tables exist in the public schema.

ALTER TABLE public.config OWNER TO postgres;
ALTER TABLE public.providers OWNER TO postgres;
ALTER TABLE public.sessions OWNER TO postgres;
ALTER TABLE public.messages OWNER TO postgres;
ALTER TABLE public.memory OWNER TO postgres;
ALTER TABLE public.skills OWNER TO postgres;
ALTER TABLE public.mcp_servers OWNER TO postgres;
ALTER TABLE public.kanban OWNER TO postgres;
ALTER TABLE public.usage OWNER TO postgres;
ALTER TABLE public.approved_users OWNER TO postgres;
ALTER TABLE public.pairing_codes OWNER TO postgres;
ALTER TABLE public.extensions OWNER TO postgres;
ALTER TABLE public.tool_results OWNER TO postgres;
