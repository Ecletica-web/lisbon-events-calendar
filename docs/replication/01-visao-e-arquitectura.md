# Terminus — Visão do Produto & Arquitectura

**Produto (UI):** Terminus / Terminus  
**Repo:** `lisbon-events-calendar-site`  
**Documento:** 1 de 6 — Visão e Arquitectura  
**Audiência:** quem quiser replicar o sistema a 100%

---

## 1. O que é

Terminus é uma plataforma de descoberta de eventos culturais em Lisboa com três pilares:

1. **Ingestão automática** — scrapers Instagram (Apify) + extracção AI em camadas → Google Sheets + Supabase.
2. **Calendário e catálogo** — eventos publicados via CSV (Events Clean New), venues e promoters.
3. **Camada social leve** — amigos (mútuos), follows de venues/promoters (privados), likes/going/saved, For You, personas, chat.

A metáfora de marca é o **terminus** (terminal retro, alto contraste B&W, tipografia mono + pixel), não um dashboard genérico de eventos.

---

## 2. Visão de produto

| Princípio | Tradução |
|-----------|----------|
| Spotify for events | Descoberta por gosto (For You, personas, follows) |
| Light social | Amigos + “N friends going”, sem feed global tipo Instagram |
| Identity-driven | Personas, onboarding por tags/vibes, saved views partilháveis |
| Ops-first ingestion | Pipeline CAF: scrape → AI tiers → verify → human review → publish |

O calendário público pode funcionar só com CSV (read-only). Auth + social + admin + pipeline store exigem Supabase.

---

## 3. Stack

| Camada | Tecnologia |
|--------|------------|
| App web | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Calendário | FullCalendar (month / week / day / list) |
| Auth | Supabase Auth (primário); NextAuth (fallback se Supabase ausente) |
| Social / users | Supabase (Postgres + RLS + Storage) |
| Eventos públicos | Google Sheets → CSV publicado (`NEXT_PUBLIC_EVENTS_CSV_URL`) |
| Pipeline | Pacote Node separado em `pipeline/` (tsx), worker local |
| Scraping | Apify (Instagram post + profile scrapers) |
| AI | OpenAI (texto, Whisper, verify); NVIDIA NIM Nemotron VL (vision); Document AI (OCR opcional) |
| PWA | Serwist (`src/app/sw.ts`), `/offline`, icons em `public/icons/` |
| Deploy app | Vercel (jobs longos **não** correm no Vercel) |

---

## 4. Mapa de pastas (contrato do repo)

```
lisbon-events-calendar-site/
├── src/
│   ├── app/           # Rotas + API handlers finos
│   ├── components/    # UI partilhada
│   ├── lib/           # Lógica (adapter, auth, reco, admin…)
│   ├── data/          # Loaders CSV, schema, venue index
│   ├── models/        # Tipos de domínio
│   └── contexts/      # UserActions, etc.
├── pipeline/          # Scrape + AI + sinks (package próprio)
├── supabase/migrations/
├── docs/              # Runbooks e contratos
└── AGENTS.md          # Entrypoint para humanos e agentes AI
```

**Regra:** páginas/API não contêm business logic pesada — chamam `lib/` ou `data/`.

---

## 5. Fluxo de dados de ponta a ponta

```
Venues + Promoters catalog (Supabase SoT pós-mig 025; Sheets até seed)
  handles activos (instagram_handle + is_active) ──► Apify ──► pipeline_posts
                                              │
                         Tiers 0–4 (evidence) → merge → reconcile → repair
                         → venue resolve → calculated conf → hard validate
                                              │
                         ┌────────────────────┼────────────────────┐
                         ▼                    ▼                    ▼
                  Processed Events     pipeline_review_queue   discard
                  (staging; auth='')   (Tier 6 human)
                         │                    │
                         │◄── approve (publish_auth=human_approved)
                         │◄── Tier 5 clean verified (lookup)
                         ▼
                  npm run publish (isPublishSafe + authorized only)
                         ▼
                  Events Clean New (CSV live)
                         ▼
                  Next.js: loaders → eventsAdapter → Calendar / For You
```

Paralelamente: utilizadores autenticados escrevem em Supabase (`user_interactions`, `friend_requests`, chats, profiles). O motor For You combina CSV de eventos + sinais Supabase.

---

## 6. Separação de responsabilidades de storage

| Store | Responsabilidade |
|-------|------------------|
| **Google Sheets** | Staging Processed + live Clean; catálogo Venues/Promoters até seed; Fontes IG só fallback de watchlist |
| **Supabase** | Auth, perfis, social, chat, artefatos pipeline, buckets; após mig 025 **`venues`/`promoters`** = catalog SoT (`CATALOG_SOURCE`) |
| **CSV publicado** | Contrato de leitura da app (sem depender da Sheets API em runtime para o calendário) |

A app **não** lê a fila de review em runtime público; só o admin e o pipeline usam essas tabelas.

---

## 7. Superfície da aplicação (rotas)

| Rota | Função |
|------|--------|
| `/` | Landing Terminus |
| `/calendar` | Descoberta principal (FullCalendar + filtros + modal) |
| `/foryou` | Feed swipe personalizado |
| `/venues`, `/venues/[slug]` | Catálogo e detalhe |
| `/promoters`, `/promoters/[slug]` | Idem promoters |
| `/profile`, `/u/[id]` | Perfil próprio / público |
| `/chat` | DMs / grupos entre amigos |
| `/onboarding` | Preferências iniciais |
| `/v/[slug]`, `/p/[slug]` | Saved view / persona partilhados |
| `/admin/*` | Ops: scrapers, raw, review, processed, venues, promoters, catalog-candidates, bugs |
| `/offline` | Fallback PWA (Serwist) |

---

## 8. Princípios de UX / UI

- **Marca first:** tipografia IBM Plex Mono + Press Start 2P; tokens `--terminus-*`.
- **Tema day/night:** alto contraste B&W, textura CRT/scanline subtil.
- **Calendário = composição principal** da descoberta; filtros laterais, não dashboard de widgets.
- **For You:** stack de cards com swipe (like/pass) e chips de “porquê”.
- **Admin:** visual slate/ops separado do look consumer.
- **Mobile:** list/day sliders; PWA installable (Serwist + `public/icons/` + `/offline`).

---

## 9. Ambientes e workers

| Processo | Onde corre |
|----------|------------|
| Next.js (UI + API) | Local / Vercel |
| `pipeline` CLI | Workstation com credenciais |
| `npm run worker` | **Sempre local** — faz poll a `pipeline_runs` (Apify + OpenAI + ffmpeg) |
| Publish Clean CSV | CLI `npm run publish` após extract/approve |

Sem worker a correr, a UI admin pode enfileirar jobs mas estes ficam em `queued`.

---

## 10. Documentos irmãos

| PDF / doc | Conteúdo |
|-----------|----------|
| 02 — Pipeline & Inteligência | Scrapers, tiers 0–6, modelos, confiança |
| 03 — Dados Sheets & Supabase | Tabs, tabelas, schema CSV, imagens |
| 04 — Produto, Social, Reco, UX | Features, For You, amigos, UI |
| 05 — Replicação 100% | Checklist env, migrations, ordem de boot |
| 06 — Inteligência Infraestrutura | Deep dive AI, venue/promoter, gates, For You |
| `AGENTS.md` | Mapa curto + “where to find X” para agentes |

---

## 11. Critérios de “réplica completa”

Para considerar o sistema replicado:

1. Sheets com tabs Venues / Promoters / Processed / Events Clean New (Fontes IG opcional até cutover).
2. Supabase com migrations 001→027 (+ buckets); seed catalog (`npm run seed-catalog`).
3. Pipeline `.env` com Apify + OpenAI (+ vision opcional) + SA Google + `CATALOG_SOURCE` / `WATCHLIST_SOURCE`.
4. App `.env.local` com CSV Clean + Supabase + `ADMIN_EMAILS`.
5. Worker a correr; pelo menos um `full` bem-sucedido; `publish` → calendário com eventos.
6. Auth signup/login; follow venue; like; For You com score ≠ random (após sinais).
7. Admin review: aprovar um item da fila → aparece em Processed.

Este documento descreve o **porquê** e o **desenho**. Os detalhes operacionais estão nos PDFs 02–06.
