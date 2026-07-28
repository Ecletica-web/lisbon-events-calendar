# Terminus — Guia de Replicação 100%

**Documento:** 5 de 6 — Bootstrap completo  
**Objectivo:** outro operador/equipa conseguir levantar um clone funcional end-to-end.

---

## 0. Pré-requisitos

- Node.js 18+ (app) e 20+ recomendado (pipeline)
- Conta Google Cloud (Sheets API + service account)
- Conta Apify (token)
- Conta OpenAI (e opcionalmente NVIDIA NIM, Brave, Document AI)
- Projecto Supabase
- Máquina **sempre on** ou workstation para o worker (não Vercel)
- Conta Vercel (opcional, só app)

---

## 1. Clonar e instalar

```bash
git clone <repo>
cd lisbon-events-calendar-site
npm install
cd pipeline && npm install && cd ..
```

---

## 2. Google Sheet

Criar um spreadsheet com tabs:

1. `Fontes IG - Venues` — colunas mínimas: handle, name, active (e campos que o código `fontes-ig` / watchlist espera)
2. `Fontes IG - Promoters` — idem
3. `Venues` — alinhado a `docs/SCHEMA.md` / `venueColumns.ts`
4. `Promoters` — idem promoters
5. `Processed Events` — cabeçalhos do contrato Processed (ver pipeline types / `pipelineSheetColumns`)
6. `Events Clean New` — mesmos cabeçalhos de evento live
7. (Opcional) Event Tags / Venue Tags — coluna `tag`

Partilhar o Sheet com o email da **service account** (Editor).

Publicar CSV (Publish to web) para Clean, Venues, Promoters, tags → guardar URLs.

Copiar JSON da service account (ou path) para env.

---

## 3. Supabase

1. Criar project.
2. Correr SQL em `supabase/migrations/` **001 → 027** em ordem (ou script agregado se existir `SETUP_NEW_PROJECT.sql` / `docs/NEW_SUPABASE_PROJECT.md`).
3. Auth → Providers: activar Google/Facebook se desejado.
4. Auth → URL config: adicionar `http://localhost:3000/**` e URL de produção.
5. Copiar Project URL, anon key, service role key.
6. Confirmar buckets: profile, event-images, venue-images (migrations 007, 017, 020).
7. Após 025: `cd pipeline && npm run seed-catalog` (Sheets Venues/Promoters → Supabase).

---

## 4. Env — App (`.env.local`)

Mínimo:

```
NEXT_PUBLIC_EVENTS_CSV_URL=...
NEXT_PUBLIC_VENUES_CSV_URL=...
NEXT_PUBLIC_PROMOTERS_CSV_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_EMAILS=you@example.com
GOOGLE_SHEETS_ID=...
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON=...
EVENT_IMPORT_API_KEY=gerar-segredo
```

Opcional: tags CSVs, feature flags, NextAuth só se sem Supabase.

Ver `docs/SETUP.md` e `.env.example`.

---

## 5. Env — Pipeline (`pipeline/.env`)

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GOOGLE_SHEETS_ID=...
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON=...
APIFY_API_TOKEN=...
OPENAI_API_KEY=...
APP_BASE_URL=http://localhost:3000
EVENT_IMPORT_API_KEY=mesmo-da-app
PIPELINE_SHEETS_WRITE=1
CATALOG_SOURCE=auto
WATCHLIST_SOURCE=catalog
```

Opcional: `NVIDIA_NIM_API_KEY`, `PROCESSING_VISION_PROVIDER=nvidia`, `BRAVE_SEARCH_API_KEY`, `DOCUMENT_AI_*`, `PIPELINE_VIDEO_FRAMES=1`, `PIPELINE_VIDEO_WHISPER=1`.

Ver `pipeline/.env.example` e `docs/PIPELINE.md`.

---

## 6. Arranque local

Terminal A — app:

```bash
npm run dev
```

Terminal B — worker:

```bash
cd pipeline && npm run worker
```

Abrir `http://localhost:3000`, signup com email em `ADMIN_EMAILS`, visitar `/admin`.

---

## 7. Primeiro run de dados

1. Preencher **Venues** / **Promoters** (handles activos) e `seed-catalog` se ainda não.
2. Em `/admin/scrapers` (ou CLI):
   - `profile-images` (avatars)
   - `full` com `--limit=5 --max-age-days=14`
3. Ver `/admin/events-raw` (tiers) e `/admin/event-review` (pendentes); opcional `/admin/catalog-candidates`.
4. Aprovar itens necessários.
5. `cd pipeline && npm run publish`
6. Confirmar `/calendar` com eventos (aguardar cache ou hard refresh).

CLI equivalente:

```bash
cd pipeline
npm run seed-catalog
npm run profile-images -- --limit=20
npm run full -- --limit=5 --max-age-days=14
npm run publish
```

---

## 8. Deploy app (Vercel)

1. Ligar repo; set mesmas env vars (Production).
2. **Não** correr o worker na Vercel.
3. Manter worker numa VM/PC com rede estável.
4. Redirect URLs Supabase = domínio Vercel.
5. `APP_BASE_URL` no pipeline = URL de produção (para persist-image).

---

## 9. Checklist de aceitação (réplica 100%)

### Infra

- [ ] Migrations 001–027 aplicadas
- [ ] Catalog seed (`seed-catalog`) + `/admin/venues` mostra handles
- [ ] Buckets existem e são públicos onde o código espera
- [ ] Sheet partilhado com SA; CSV publish URLs OK (não `/edit`)
- [ ] Worker heartbeat verde em `/admin`

### Pipeline

- [ ] Scrape cria linhas em `pipeline_posts`
- [ ] Extract grava `pipeline_extractions` (pre_filter, caption, …)
- [ ] Soft fails → `pipeline_review_queue` (past, unresolved venue, conflicts, …)
- [ ] Auto-pass only with canonical `venue_id` + calculated conf ≥ threshold
- [ ] Tier 5 escreve `pipeline_verifications`
- [ ] Approve → Processed with `publish_auth=human_approved` (and Clean when Sheets write on)
- [ ] `publish` skips unsafe / unverified; only safe + verified|human_approved → Clean
- [ ] Calendário actualiza; Free badge só com `is_free=true` explícito
- [ ] Ops: `quarantine-publish-unsafe` / `unresolved-venues-report` / `re-resolve-review-queue` disponíveis
- [ ] Catalog candidates aparecem em `/admin/catalog-candidates` quando há venue unresolved / @mentions

### Produto

- [ ] Login/signup Supabase (`display_name` preenchido no perfil)
- [ ] Follow venue; like; going; aparece no perfil
- [ ] Friend request accept → chat possível
- [ ] For You: cold start random; após follows, reasons não vazios
- [ ] Persona / saved view create + share slug
- [ ] Onboarding completa e grava prefs
- [ ] PWA installável; `/offline` responde sem rede
- [ ] Feedback button → `/admin/bugs`

### UX

- [ ] Tema day/night
- [ ] Calendar desktop + mobile usáveis
- [ ] Event modal com acções e imagem

---

## 10. Ordem mental do sistema (para onboarding de engineers)

1. **Catálogo Venues/Promoters** define o que scrapar (handles activos).
2. **Apify** traz posts crus.
3. **Tiers AI** estruturam eventos + confidence.
4. **Validate/resolve/dedupe** decidem pass vs review.
5. **Tier 5** audita online sem auto-edit.
6. **Humanos** fecham a fila (eventos + catalog candidates).
7. **Publish** promove staging → live CSV.
8. **App** normaliza CSV e faz discovery/social em cima.
9. **For You** reordena com sinais Supabase.

---

## 11. Ficheiros canónicos a ler primeiro

| Ficheiro | Porquê |
|----------|--------|
| `AGENTS.md` | Mapa do repo |
| `docs/PIPELINE.md` | Runbook scrape/AI |
| `docs/SCHEMA.md` | Contrato CSV |
| `docs/SETUP.md` | Env + migrations |
| `docs/FRIENDS_VS_FOLLOWS.md` | Modelo social |
| `pipeline/process-post.ts` | Extracção |
| `src/lib/eventsAdapter.ts` | Facade dados UI |
| `docs/replication/06-inteligencia-infraestrutura.md` | Deep dive AI / gates |

PDFs irmãos: 01 Arquitectura, 02 Pipeline, 03 Dados, 04 Produto/UX, 06 Inteligência.

---

## 12. Armadilhas comuns

| Sintoma | Causa típica |
|---------|----------------|
| Calendário vazio | CSV URL é `/edit` ou Clean sem `publish` |
| Jobs forever queued | Worker não está a correr |
| Vision nunca corre | Caption já tem title+date+venue |
| Sem imagens venue | Sheets write falhou; ver bucket / `--sheets-only` |
| Admin 403 | Email fora de `ADMIN_EMAILS` |
| OAuth falha em prod | Redirect URL em falta no Supabase |
| Duplicados | Fingerprint / publish a re-importar mal |
| Watchlist vazia | Catálogo sem `instagram_handle`/`is_active`; correr `seed-catalog` ou `diff-watchlist` |

---

## 13. Extensões naturais (após clone estável)

- Activar video frames + Whisper
- Document AI OCR para flyers densos
- Afinar prompts / thresholds (`PIPELINE_PUBLISH_CONFIDENCE_THRESHOLD`)
- Expandir score For You (neighborhoods, budget)
- Mais cidades: novo Sheet + timezone + catálogo venues/promoters

Fim do pacote de replicação (ver também PDF 06 para deep dive de inteligência).
