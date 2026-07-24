# City Pager — Pipeline, Scrapers & Inteligência AI

**Documento:** 2 de 5 — Pipeline & Extracção  
**Pacote:** `pipeline/` (Node + tsx, `package.json` próprio)

---

## 1. Objectivo do pipeline

Transformar posts Instagram de venues/promoters numa fila de **eventos estruturados**, com:

- artefatos AI auditáveis (cada tier gravado),
- auto-publish só com alta confiança,
- verificação online (Tier 5) sem editar automaticamente,
- revisão humana (Tier 6) para o resto,
- publish final para o CSV que a app consome.

Jobs longos: **worker local** (`npm run worker`), não Vercel.

---

## 2. Modos de execução

| Modo | O que faz |
|------|-----------|
| `profile-images` | Fotos de perfil IG → bucket Supabase + Sheets `primary_image_url` |
| `scrape` | Posts IG → `pipeline_posts` (status=`new`) |
| `extract` | AI tiers em posts `new` + Tier 5 (salvo `--skip-verify`) |
| `verify` | Só Tier 5 |
| `full` | scrape → extract (+ Tier 5). **Não** inclui profile-images |
| `requeue` | Reset posts → `new` |
| `publish` | Processed Events → Events Clean New (só linhas novas) |

Flags úteis: `--dry-run`, `--handle=`, `--limit=`, `--max-age-days=`, `--force-vision`, `--skip-verify`, `--from-apify-run=`, `--sheets-only` (profile-images).

Admin `/admin/scrapers` enfileira em `pipeline_runs`; o worker faz claim e corre o mesmo CLI.

---

## 3. Scrapers (Apify)

| Uso | Actor | ID default |
|-----|-------|------------|
| Posts | `apify/instagram-post-scraper` | `nH2AHrwxeTRJoN5hX` |
| Profiles | `apify/instagram-profile-scraper` | `dSCLg0C3YEZ83HzYX` |

**Watchlist SoT:** tabs Sheets `Fontes IG - Venues` + `Fontes IG - Promoters` (fallback: `Fontes IG` / `Watchlist` combinado).

Fluxo scrape:

1. Ler handles activos da Fontes.
2. Cutoff incremental (último scrape) ou `--max-age-days`.
3. Correr Apify (batch ou per-account via `PIPELINE_RUN_MODE`).
4. Transformar → `EventsRawRow` (`scrapers/instagram-transform.ts`).
5. Arquivar imagens display via `/api/admin/events/persist-image`.
6. Upsert `pipeline_posts`.

---

## 4. Orquestração por post (`process-post.ts`)

```
Tier 0  Pre-filter (descartar não-eventos)
Tier 1  Caption LLM (sempre, se keep)
        └─ vision trigger? (faltam title / start / venue, ou --force-vision)
Tier 3  Carousel/image vision (+ OCR opcional)
   ou
Tier 4  Video frames + Whisper (flags)
Merge  caption ↔ vision
Venue resolve + validate + fingerprint
  → pass  → candidato Processed
  → review/fail → review queue
```

Nota: não existe módulo “Tier 2” separado; a numeração documentada salta 1→3/4. OCR e Whisper persistem como tiers `ocr` / `video_transcript`.

---

## 5. Inteligência por tier

### Tier 0 — Pre-filter (`intelligence/pre-filter.ts`)

- Heurística: caption &lt; 20 chars e não-carousel → discard.
- LLM (`PIPELINE_TEXT_MODEL`, default `gpt-4o-mini`): `is_event_post`, `post_pattern`, confidence.
- Patterns: `single_event` | `multi_event` | `monthly_program` | `announcement` | `recap` | `not_event`.
- Discard se `!is_event_post` ou pattern `recap`/`not_event`.
- Parse failure → **keep** (evitar falsos discards).

### Tier 1 — Caption (`intelligence/broad-event-extraction.ts`)

- Texto: caption + owner/location/posted_at/hashtags/links.
- Schema Zod: title, datetimes (Europe/Lisbon), venue, price, tags, `confidence_score` 0–1.
- Multi-event captions → vários eventos; `extraction_source: 'caption'`.

### Trigger de vision (`qualification/mandatory-fields.ts`)

Vision só se: `--force-vision`, ou zero eventos caption, ou algum evento sem **title**, **start_datetime** válido, ou **venue** (pode usar `location_name` do IG).

### Tier 3 — Vision carrossel (`carousel-event-vision.ts`)

- Até 10 slides; chunks de 2 imagens.
- Provider: NVIDIA NIM (`nemotron-nano-12b-v2-vl`) com fallback OpenAI `gpt-4o`.
- OCR Document AI opcional por slide → tier `ocr`.
- Campos: `source_slide_indices`, `on_slide_text_evidence`.

### Tier 4 — Video (`video-event-extraction.ts`)

- Se `media_type=video` e `PIPELINE_VIDEO_FRAMES` / `PIPELINE_VIDEO_WHISPER`.
- ffmpeg ~4 frames; Whisper → `video_transcript`; vision multimodal.

### Merge (`merge-extractions.ts`)

- Preferir vision para datetime se caption sem data ou confidence caption &lt; `PIPELINE_MERGE_CAPTION_DATETIME_THRESHOLD` (0.8).
- Program split: se vision tem mais eventos e caption 1 → vision wins.
- Confidence final = **min(caption, vision) − conflict penalties** (nunca `max`). Conflitos de date/venue/price/`is_free` → `tier_conflict` na validação.
- Pós-merge: `reconcile-post-events.ts` colapsa lineup/slides do mesmo occurrence.

### Validação (`validate-event.ts`) + auto-repair

Threshold publish: `PIPELINE_PUBLISH_CONFIDENCE_THRESHOLD` (default **0.7**), mas o score é **calculado** (`calculated-confidence.ts`), não o self-report do modelo.

Auto-repair (antes da validação): overnight end rollover, `24:00`→dia seguinte, limpar ticket URLs placeholder, limpar `is_free`+price conflict.

| Código | Destino |
|--------|---------|
| `missing_title`, `missing_or_invalid_start_datetime` | **fail** |
| `past_event`, `venue_unresolved`, `source_as_venue`, `end_before_start`, `bad_ticket_url`, `tier_conflict`, `implausible_duration`, `critical_field_inferred`, `low_confidence`, `program_undersplit`, … | **review** |

### Tier 5 — Verify online (`event-verification.ts`)

- Brave Search + LLM, ou OpenAI Responses + `web_search_preview`.
- Verdicts: `verified` | `disputed` | `not_found` | `inconclusive`.
- **Nunca** aplica correcções automaticamente a Processed.
- Unclean / suggested_corrections → fila humana (`online_verification_*`).
- **Publish** só aceita clean `verified` (sem suggested_corrections) **ou** `publish_auth=human_approved`.

### Tier 6 — Human review

- UI `/admin/event-review` sobre `pipeline_review_queue` (ordenado por start; Apply suggestions & approve).
- Approve → append Processed com `publish_auth=human_approved`; reject → fecha item.
- Feedback de qualidade → `event_review_feedback` (migration 018).
- Scripts: `expire-review-queue`, `re-resolve-review-queue`, `unresolved-venues-report`, `quarantine-publish-unsafe`.

---

## 6. Venue resolve & dedupe

**Resolve** (`venue-resolve.ts`): Fontes IG Venues (SoT handles/names) + catálogo Venues. Ordem: extracted name → location → owner **só** se source type=`venue` e não há venue extraído. Promoter/editorial **nunca** vira venue via owner fallback. `venue_unresolved` bloqueia auto-pass.

**Dedupe** (`dedupe.ts`): fingerprint djb2 de  
`title_norm | YYYY-MM-DD | HH:mm(bucket 30min UTC) | venueId`  
(igual ao loader da app). Batch: fica o de maior confidence; drop se já existe em Processed.

---

## 7. Modelos e env AI

| Pass | Modelo / serviço |
|------|------------------|
| Texto (0, 1, parts of verify) | `PIPELINE_TEXT_MODEL` → `gpt-4o-mini` |
| Vision | Nemotron VL / `gpt-4o` |
| Whisper | `whisper-1` |
| Verify | `PIPELINE_VERIFY_MODEL` → `gpt-4o` + Brave opcional |
| OCR | Google Document AI |

Credenciais mínimas: `APIFY_API_TOKEN`, `OPENAI_API_KEY`, `SUPABASE_URL` + service role, `GOOGLE_SHEETS_ID` + SA JSON. Vision NVIDIA: `NVIDIA_NIM_API_KEY`.

---

## 8. Worker

`cli/worker.ts` a cada ~10s:

1. Heartbeat em `pipeline_config.worker_heartbeat_at`.
2. Claim oldest `pipeline_runs` com `status=queued` → `running`.
3. Executar modo + params.
4. `success` / `error` / `aborted`; log capped ~200k chars.
5. Abort cooperativo entre posts se `abort_requested`.

---

## 9. Módulos-chave

| Path | Papel |
|------|-------|
| `process-post.ts` | Orquestração por post |
| `cli/run.ts` | Comandos CLI |
| `cli/worker.ts` | Fila |
| `scrapers/*` | Apify + transform |
| `intelligence/*` | Tiers AI |
| `qualification/*` | Mandatory fields, validate, venue, dedupe |
| `sinks/supabase-store.ts` | Persistência pipeline |
| `sinks/sheets-writer.ts` | Fontes + Processed + Clean |
| `media/*` | Archive imagens evento + profile pics |

---

## 10. Como operar no dia-a-dia

```bash
cd pipeline && npm install
# configurar pipeline/.env
npm run worker          # terminal dedicado
npm run full -- --limit=10 --max-age-days=14
npm run publish
```

Ou via `/admin/scrapers` com worker online. Monitorizar heartbeat no hub `/admin`.

Runbook vivo no repo: `docs/PIPELINE.md`.
