# City Pager — Dados: Google Sheets & Supabase

**Documento:** 3 de 5 — Storage & Contratos de Dados

---

## 1. Filosofia de storage

| Sistema | Papel |
|---------|-------|
| **Google Sheets** | Calendário (Processed / Clean) + catálogo Venues/Promoters até seed Supabase; Fontes IG só fallback |
| **Supabase** | Utilizadores, social, artefatos do pipeline, e (mig 025) tabelas **`venues` / `promoters`** como SoT de scrape + catálogo |
| **CSV publicado** | Contrato estável da app pública enquanto Clean/Venues CSV existirem |

Pipeline **escreve** Processed (staging) e, via `publish`, Clean (live). App **lê** Clean via CSV; Venues/Promoters via Supabase (`CATALOG_SOURCE=auto`) com fallback CSV.

---

## 2. Google Sheets — tabs

| Tab | SoT? | Escrita | Leitura |
|-----|------|---------|---------|
| **Venues** | Sim (handles + catalog; `instagram_handle` + `is_active`) | Humano + profile-images | Scrape + resolve + app |
| **Promoters** | Sim (handles + catalog) | Idem | Scrape + app |
| Fontes IG - Venues / Promoters | Fallback legado | — | Só se catálogo sem handles (`WATCHLIST_SOURCE=auto`) |
| Fontes IG / Watchlist | Fallback combinado | — | Idem |
| **Processed Events** | Staging | Pipeline auto-pass + review approve | `publish` (gated), admin |
| **Events Clean New** | Live calendar | `npm run publish` (safe + verified\|human_approved) **or** Tier 6 approve append | CSV → app |
| Events Clean Quarantine | Archive | `quarantine-publish-unsafe --apply` | Ops |

Admin transparency: `/admin/venues` + `/admin/promoters` (Supabase após seed). Scrapers mostra a watchlist derived (read-only).

### Setup Sheets

1. Criar spreadsheet; partilhar com service account (Editor).
2. Preencher **Venues** / **Promoters** (ids, aliases, address, `instagram_handle`, `is_active`).
3. Opcional: manter Fontes IG até `npm run diff-watchlist` passar.
4. **File → Share → Publish to web → CSV** para Clean, Venues, Promoters, tags.
5. Copiar URLs CSV (não a URL `/edit`) para `.env.local`.
6. Aplicar migração `025_catalog_venues_promoters.sql`; `cd pipeline && npm run seed-catalog`.

---

## 3. Contrato CSV de eventos (`docs/SCHEMA.md`)

**Obrigatórios (mínimo):** `event_id` (ou legacy `id`), `title`, `start_datetime`.

Campos importantes: `end_datetime`, `timezone` (default Europe/Lisbon), `status`, `venue_id`/`venue_name`, geo, `category`, `tags` (pipe, max 5), promoter, preço, `is_free` (**tri-state**: true/false/empty unknown), `ticket_url`, `primary_image_url`, `source_name`/`source_url`, `confidence_score` (calculado), `publish_auth`.

**Status:** `scheduled` | `cancelled` | `postponed` | `sold_out` | `draft` | `archived`.  
Legacy: `needs_review` → **draft** (nunca público).

### Colunas de rastreio do pipeline (ignoradas pelo loader UI)

| Coluna | Significado |
|--------|-------------|
| `post_pattern` | Classificação Tier 0 |
| `extraction_source` | `caption` / `vision` / `merged` |
| `on_slide_text_evidence` | Texto lido no slide |
| `_raw_model_text` | Debug de prompts |
| `fingerprint` | Dedupe (source-scoped quando possível) |
| `publish_auth` | `human_approved` ou vazio; publish também aceita clean Tier 5 verified |

Venues CSV: `venue_id`, `name`, `aliases`, `instagram_handle`, `is_active`, `primary_image_url`, tags, geo…  
Promoters CSV: `promoter_id`, `name`, handle, images, `is_active`.

Schema code: `src/data/schema/eventColumns.ts`, `venueColumns.ts`.

---

## 4. Caminho de leitura na app

```
CSV URL → PapaParse (loaders) → Event[] / Venue[]
       → VenueIndex resolve
       → eventsAdapter (NormalizedEvent, filter, night collapse)
       → /api/events | UI Calendar / For You
```

- Cache server: ~5 min (`unstable_cache`) em `fetchEvents`.
- Cap listagem: max 15 eventos por venue após collapse “night”.
- `collapseSameVenueDayEvents`: ≥2 no mesmo venue+dia → card de noite com lineup.

---

## 5. Supabase — domínio utilizador / social

Migrations em `supabase/migrations/` (correr **em ordem**).

| Mig | Conteúdo |
|-----|----------|
| 001 | profiles, follow venues/promoters (legado), wishlist, likes |
| 002 | `event_user_actions` (going, interested, saved, reminder) |
| 003–010 | perfil extend, cover/username, storage, notifications, onboarding |
| 011–013 | friend_requests + visibility + policies |
| 012 | `user_interactions` (modelo unificado de actividade) |
| 014 | drop user-to-user follows |
| 015–017 | event_shares, chats, event-images bucket |
| 018 | `event_review_feedback` |
| 019 | **pipeline store** |
| 020–022 | venue-images bucket, `venue_profile_images`, mode profile-images |

### Conceitos sociais (as-built)

| Conceito | Tabela / API | Natureza |
|----------|--------------|----------|
| Friends | `friend_requests` (accepted) | Mútuo; vê going/saved conforme visibility |
| Follow venue/promoter | `user_interactions` (e legado follow tables) | Preferência **privada** de discovery |
| Like / save / going / interested / reminder | `user_interactions` (+ facades) | Sinais para UI e For You |
| Chat | `016_chats` | Só entre amigos |

**Não existe** grafo de followers entre users (removido na 014).

---

## 6. Supabase — pipeline store (019+)

| Tabela | Conteúdo |
|--------|----------|
| `pipeline_posts` | Posts scrapados; `processing_status`: new / discarded / needs_review / processed |
| `pipeline_extractions` | Artefacto por tier: pre_filter, caption, vision, ocr, video_transcript, merge, validation |
| `pipeline_review_queue` | Fila Tier 6; `review_status` pending/approved/rejected |
| `pipeline_verifications` | Auditoria Tier 5 (nunca auto-apply) |
| `pipeline_runs` | Fila de jobs: queued → running → success/error/aborted |
| `pipeline_config` | JSON config + `worker_heartbeat_at` |
| `venue_profile_images` | Mapa handle → URL (backup se Sheets falhar) |

### Storage buckets

| Bucket | Uso |
|--------|-----|
| `event-images` | Imagens de posts/eventos persistidas |
| `venue-images` | Avatars venue/promoter + `_index.json` |
| Profile assets | Avatars/covers de users (007) |

---

## 7. Quem escreve o quê

| Actor | Sheets | Supabase |
|-------|--------|----------|
| `scrape` | — | posts + images |
| `extract` | Processed (pass) | extractions, post status, review queue |
| `verify` | — | verifications (+ review se unclean) |
| Tier 6 approve | Processed | review_status |
| `publish` | Events Clean New | — |
| `profile-images` | Venues/Promoters URLs | bucket + venue_profile_images |
| App user | — | profiles, interactions, friends, chats |
| Admin UI | Fontes watchlist (API) | runs, review, config |

Gate Sheets write: `PIPELINE_SHEETS_WRITE` (default on) + SA com acesso. Se write off, passes vão para review com hint de paste manual.

---

## 8. Imagens

1. **Eventos:** CDN IG → archive via `EVENT_IMPORT_API_KEY` + `APP_BASE_URL` → bucket → URL estável no row.
2. **Venues/promoters:** Apify profile → `venue-images` → Sheets `primary_image_url`; UI também faz merge do `_index.json` se a sheet tiver placeholder.
3. Repair sem Apify: `npm run profile-images -- --sheets-only`.

---

## 9. Env vars de dados (resumo)

**App**

- `NEXT_PUBLIC_EVENTS_CSV_URL` (obrigatório para calendário)
- `NEXT_PUBLIC_VENUES_CSV_URL`, `NEXT_PUBLIC_PROMOTERS_CSV_URL`, tags CSVs
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`
- `GOOGLE_SHEETS_ID`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`

**Pipeline**

- Mesmo Sheets + Supabase service role
- `APIFY_*`, `OPENAI_API_KEY`, vision/OCR opcionais
- `EVENT_IMPORT_API_KEY`, `APP_BASE_URL`

Checklist completo: `docs/SETUP.md`, `pipeline/.env.example`, `.env.example`.

---

## 10. Dedupe e identidade de venue

- Fingerprint partilhado pipeline ↔ `eventsLoader`.
- `VenueIndex` (`src/data/venueIndex.ts`): venue_id → IG handle → exact name → alias.
- Venues catalog (`instagram_handle` + `is_active`) é SoT de scrape + resolve; Fontes só fallback. Ver `docs/PIPELINE.md` cutover.

---

## 11. Publicação para produção

Depois de extract / Tier 5 / approve:

```bash
cd pipeline && npm run publish
```

`publish` **não** copia tudo o que está em Processed: só linhas mecanicamente
seguras (`isPublishSafe`) **e** autorizadas (`publish_auth=human_approved` ou
verificação Tier 5 limpa). Auto-pass fica em staging até verify ou humano.

Confirmar que o CSV publicado (gid da tab Clean) reflecte as novas linhas. A app refresca no próximo cache miss (~5 min) ou restart.

Para limpar Clean legado inseguro:

```bash
npx tsx scripts/quarantine-publish-unsafe.ts          # dry-run
npx tsx scripts/quarantine-publish-unsafe.ts --apply
```

Nunca apontar `NEXT_PUBLIC_EVENTS_CSV_URL` para a URL de edição do Sheet — tem de ser **Publish to web → CSV**.
