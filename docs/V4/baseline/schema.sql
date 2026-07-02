--
-- PostgreSQL database dump
--

\restrict RDrqN2CmrieTob7F6JDUQmeyXPdTdnfPNDsKPCIgcADh33o87h1LkmMy8eMj8IL

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    admin_user_id uuid NOT NULL,
    token_hash text NOT NULL,
    user_agent text,
    ip text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    token_hash text NOT NULL,
    prefix text NOT NULL,
    scopes text NOT NULL,
    last_used_at timestamp(3) without time zone,
    expires_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_tokens_id_seq OWNED BY public.api_tokens.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id integer NOT NULL,
    user_id integer,
    action text NOT NULL,
    target text,
    detail text,
    ip text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    prev_hash text,
    hash text,
    request_id text
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: audit_log_v4; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_v4 (
    id integer NOT NULL,
    organisation_id uuid NOT NULL,
    admin_user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    detail text,
    ip text,
    request_id text,
    prev_hash text,
    hash text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_log_v4_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_v4_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_v4_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_v4_id_seq OWNED BY public.audit_log_v4.id;


--
-- Name: backup_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_records (
    id integer NOT NULL,
    stamp text NOT NULL,
    backend text DEFAULT 'local'::text NOT NULL,
    location text NOT NULL,
    size_bytes bigint,
    manifest text,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: backup_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_records_id_seq OWNED BY public.backup_records.id;


--
-- Name: deploy_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deploy_history (
    id integer NOT NULL,
    project_id integer NOT NULL,
    image_id text,
    container_id text,
    deployed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata text
);


--
-- Name: deploy_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deploy_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deploy_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deploy_history_id_seq OWNED BY public.deploy_history.id;


--
-- Name: ip_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_bans (
    id integer NOT NULL,
    ip text NOT NULL,
    reason text,
    expires_at text,
    created_by integer,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ip_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ip_bans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ip_bans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ip_bans_id_seq OWNED BY public.ip_bans.id;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id integer NOT NULL,
    job_type text NOT NULL,
    payload text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    next_run_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    locked_at timestamp(3) without time zone,
    locked_by text,
    last_error text,
    completed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;


--
-- Name: nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nodes (
    id integer NOT NULL,
    name text NOT NULL,
    endpoint text NOT NULL,
    role text DEFAULT 'worker'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    last_health_at timestamp(3) without time zone,
    capacity text,
    metadata text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nodes_id_seq OWNED BY public.nodes.id;


--
-- Name: organisations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_by integer,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    container_id text,
    image_id text,
    port integer,
    status text DEFAULT 'building'::text NOT NULL,
    env_vars text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    previous_image_id text,
    previous_container_id text,
    visibility text DEFAULT 'public'::text NOT NULL,
    deploy_type text,
    basic_user text,
    basic_hash text,
    health_state text,
    health_status integer,
    health_response_ms integer,
    health_checked_at text,
    health_failures integer DEFAULT 0 NOT NULL,
    health_path text DEFAULT '/'::text NOT NULL,
    route_published boolean DEFAULT false NOT NULL,
    attestation_state text,
    attestation_checked_at text,
    last_error text,
    last_error_stage text,
    last_error_hint text,
    last_error_excerpt text,
    repo text,
    deploy_branch text DEFAULT 'main'::text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    limit_memory_mb integer,
    limit_cpu double precision,
    limit_pids integer,
    limit_restart_policy text,
    limit_log_max_size text,
    limit_log_max_file integer,
    github_deploy_status text,
    github_deploy_detail text,
    github_deploy_at text,
    active_slot text DEFAULT 'blue'::text NOT NULL,
    port_blue integer,
    port_green integer,
    is_preview boolean DEFAULT false NOT NULL,
    source_branch text,
    pull_request_number integer,
    preview_expires_at timestamp(3) without time zone,
    runtime text,
    node_id integer
);


--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secrets (
    id integer NOT NULL,
    project_id integer NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    rotated_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: secrets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.secrets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: secrets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.secrets_id_seq OWNED BY public.secrets.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    jti text NOT NULL,
    user_agent text,
    ip text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: stats_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stats_history (
    id integer NOT NULL,
    project_id integer NOT NULL,
    cpu_percent double precision,
    memory_mb double precision,
    memory_limit_mb double precision,
    rx_bytes bigint,
    tx_bytes bigint,
    recorded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: stats_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stats_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stats_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stats_history_id_seq OWNED BY public.stats_history.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: api_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens ALTER COLUMN id SET DEFAULT nextval('public.api_tokens_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: audit_log_v4 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_v4 ALTER COLUMN id SET DEFAULT nextval('public.audit_log_v4_id_seq'::regclass);


--
-- Name: backup_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records ALTER COLUMN id SET DEFAULT nextval('public.backup_records_id_seq'::regclass);


--
-- Name: deploy_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history ALTER COLUMN id SET DEFAULT nextval('public.deploy_history_id_seq'::regclass);


--
-- Name: ip_bans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_bans ALTER COLUMN id SET DEFAULT nextval('public.ip_bans_id_seq'::regclass);


--
-- Name: jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);


--
-- Name: nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes ALTER COLUMN id SET DEFAULT nextval('public.nodes_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: secrets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secrets ALTER COLUMN id SET DEFAULT nextval('public.secrets_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: stats_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_history ALTER COLUMN id SET DEFAULT nextval('public.stats_history_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: audit_log_v4 audit_log_v4_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_v4
    ADD CONSTRAINT audit_log_v4_pkey PRIMARY KEY (id);


--
-- Name: backup_records backup_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_records
    ADD CONSTRAINT backup_records_pkey PRIMARY KEY (id);


--
-- Name: deploy_history deploy_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history
    ADD CONSTRAINT deploy_history_pkey PRIMARY KEY (id);


--
-- Name: ip_bans ip_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_bans
    ADD CONSTRAINT ip_bans_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: nodes nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id);


--
-- Name: organisations organisations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: secrets secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: stats_history stats_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_history
    ADD CONSTRAINT stats_history_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions_admin_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_sessions_admin_user_id_created_at_idx ON public.admin_sessions USING btree (admin_user_id, created_at DESC);


--
-- Name: admin_sessions_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX admin_sessions_token_hash_key ON public.admin_sessions USING btree (token_hash);


--
-- Name: admin_users_organisation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_users_organisation_id_idx ON public.admin_users USING btree (organisation_id);


--
-- Name: admin_users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX admin_users_username_key ON public.admin_users USING btree (username);


--
-- Name: api_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX api_tokens_token_hash_key ON public.api_tokens USING btree (token_hash);


--
-- Name: api_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_tokens_user_id_idx ON public.api_tokens USING btree (user_id);


--
-- Name: audit_log_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at);


--
-- Name: audit_log_v4_admin_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_v4_admin_user_id_created_at_idx ON public.audit_log_v4 USING btree (admin_user_id, created_at DESC);


--
-- Name: audit_log_v4_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_v4_entity_type_entity_id_created_at_idx ON public.audit_log_v4 USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: audit_log_v4_organisation_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_v4_organisation_id_created_at_idx ON public.audit_log_v4 USING btree (organisation_id, created_at DESC);


--
-- Name: backup_records_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX backup_records_created_at_idx ON public.backup_records USING btree (created_at);


--
-- Name: backup_records_stamp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX backup_records_stamp_key ON public.backup_records USING btree (stamp);


--
-- Name: deploy_history_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deploy_history_project_id_idx ON public.deploy_history USING btree (project_id);


--
-- Name: ip_bans_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ip_bans_ip_idx ON public.ip_bans USING btree (ip);


--
-- Name: ip_bans_ip_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ip_bans_ip_key ON public.ip_bans USING btree (ip);


--
-- Name: jobs_status_job_type_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_status_job_type_created_at_idx ON public.jobs USING btree (status, job_type, created_at);


--
-- Name: jobs_status_next_run_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_status_next_run_at_idx ON public.jobs USING btree (status, next_run_at);


--
-- Name: nodes_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX nodes_name_key ON public.nodes USING btree (name);


--
-- Name: organisations_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organisations_slug_key ON public.organisations USING btree (slug);


--
-- Name: projects_is_preview_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_is_preview_idx ON public.projects USING btree (is_preview);


--
-- Name: projects_is_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_is_primary_idx ON public.projects USING btree (is_primary);


--
-- Name: projects_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_name_key ON public.projects USING btree (name);


--
-- Name: projects_node_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_node_id_idx ON public.projects USING btree (node_id);


--
-- Name: projects_repo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_repo_idx ON public.projects USING btree (repo);


--
-- Name: projects_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_slug_key ON public.projects USING btree (slug);


--
-- Name: secrets_project_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX secrets_project_id_idx ON public.secrets USING btree (project_id);


--
-- Name: secrets_project_id_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX secrets_project_id_key_key ON public.secrets USING btree (project_id, key);


--
-- Name: sessions_jti_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_jti_key ON public.sessions USING btree (jti);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: stats_history_project_id_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stats_history_project_id_recorded_at_idx ON public.stats_history USING btree (project_id, recorded_at);


--
-- Name: users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);


--
-- Name: admin_sessions admin_sessions_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.admin_users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: admin_sessions admin_sessions_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: admin_users admin_users_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: api_tokens api_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: deploy_history deploy_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deploy_history
    ADD CONSTRAINT deploy_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ip_bans ip_bans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_bans
    ADD CONSTRAINT ip_bans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: projects projects_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.nodes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: secrets secrets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secrets
    ADD CONSTRAINT secrets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stats_history stats_history_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_history
    ADD CONSTRAINT stats_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict RDrqN2CmrieTob7F6JDUQmeyXPdTdnfPNDsKPCIgcADh33o87h1LkmMy8eMj8IL

