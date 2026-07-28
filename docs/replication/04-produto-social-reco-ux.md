# Terminus — Produto, Social, Recomendações & UX

**Documento:** 4 de 6 — Features da plataforma

---

## 1. Features do produto (mapa)

| Área | Features |
|------|----------|
| Descoberta | Calendário month/week/day/list, search, filtros (tags OR, venues, categories, free…), URL sync |
| For You | Feed swipe; scoring por follows/likes/persona/friends; cold-start random |
| Catálogo | Venues/promoters grids + detail + follow |
| Evento | Modal: detalhes, galeria, going/saved/like/reminder/share, Google Calendar, counts, friend avatars |
| Identidade | Perfil (avatar, cover, username, bio, `display_name`), onboarding, personas, saved views partilháveis |
| Social | Friend requests, chat DM/grupo, visibility going/saved |
| Ops | Admin scrapers / raw / review / processed / venues / promoters / catalog-candidates / bugs |
| PWA | Manifest + Serwist SW + `/offline` |
| Auth | Signup/login email + OAuth; password reset |

Feature flags: `NEXT_PUBLIC_ENABLE_PROFILE`, `_PERSONAS`, `_SHARED_VIEWS`.

---

## 2. Friends vs follows (crítico)

| | Friends | Follow venue/promoter |
|--|---------|------------------------|
| Modelo | Pedido → accept (mútuo) | One-way, privado |
| Storage | `friend_requests` | `user_interactions` |
| Visível a outros? | Sim (relação + eventos conforme visibility) | Não |
| Uso | Social proof, chat, For You +5 | Discovery For You +10/+8 |

**Não há** followers/following entre users (removido). Ver `docs/FRIENDS_VS_FOLLOWS.md`.

---

## 3. Acções de evento

Facades: `lib/eventActions.ts`, `lib/userActions.ts`, contexto `UserActionsContext`.

| Acção | Efeito |
|-------|--------|
| Going | Marca presença; amigos podem ver |
| Interested | Interesse soft |
| Saved / wishlist | Guardar para depois |
| Like | Sinal de gosto (+ categorias para reco) |
| Reminder | 1h / 6h / 24h |
| Share | `event_shares` / botões UI |

Logged-out: `AuthGate` + `pendingIntents` rejogam a acção após login.

---

## 4. Algoritmo For You (`recommendationEngine.ts`)

### Inputs (`UserFeedContext`)

- Venues/promoters seguidos
- Likes → categorias derivadas
- Persona weights (`?personaRules=` / persona activa)
- Friends going (accepted friends × going)
- Tags da persona (`savedTagSet`)
- Preferência free (wishlist / `prefer_free`)

### Cold start

Sem sinais → amostra aleatória Fisher–Yates de upcoming (limit 50). Idem logged-out.

### Pesos (`SCORE`)

| Sinal | Pontos |
|-------|--------|
| Followed venue | +10 |
| Followed promoter | +8 |
| Persona match (após hard filter includes) | +6 |
| Energy high boost (club/techno/…) | +2 |
| Friend going | +5 |
| Saved tag | +4 |
| Liked category | +3 |
| Free pref | +2 |

Ordenação: score desc, depois start asc. Cap 50.

**Defined but unused in score today:** `budget_range`, `neighborhoods`, `time_preference`.

### Explainability (chips)

`Followed venue`, `Followed promoter`, `Matches your vibe`, `N friend(s) going`, `Free event`, `Because you liked similar events`.

API: `GET /api/foryou` (Bearer Supabase). UI: `app/foryou/page.tsx` (swipe threshold 80px).

---

## 5. Personas & saved views

**ViewState** (`lib/viewState.ts`): viewMode, date, query, categories/tags/venues, toggles. Sync URL.

**Saved views:** localStorage + sync DB; público em `/v/[slug]`.

**Personas:** regras de filtro + campos de peso For You; CRUD `PersonaManager`; público `/p/[slug]`; predefined vibes em `data/predefinedPersonas.ts`.

Onboarding: intro → tags ou vibe → prefs → deep-link calendar (`lib/onboarding.ts`).

---

## 6. Chat

- Só amigos.
- DMs e grupos; `?with=` abre/cria DM.
- APIs `/api/chats`, `.../messages`, `.../members`.

---

## 7. UX / UI system

### Design tokens

- CSS vars `--terminus-bg`, `--terminus-fg`, `--terminus-border`, `--terminus-accent`, day/night.
- Font body: **IBM Plex Mono**; headings pixel: **Press Start 2P**.
- Textura: dots + scanlines (CRT/papel).
- Botões/sombras hard-edge (`terminus-shadow: 4px 4px 0`).

### Superfícies

| Página | Padrão UX |
|--------|-----------|
| Landing | Brand hero TERMINUS, 1 pitch, 3 CTAs |
| Calendar | FullCalendar + sidebar filtros; modal evento; mobile day/list |
| For You | Stack de cards, reasons, empty → follow/onboarding |
| Venues/Promoters | Grid searchable; detail + follow + upcoming |
| Profile | Secções sliders (going/saved/liked/followed); friends inbox |
| Admin | Slate ops UI (não misturar com terminus aesthetic) |

### Acessibilidade / produto

- Timezone fixa Europe/Lisbon nos eventos.
- Tags com famílias (`tagFamilies.ts`, `TagFamilyFilter`).
- Night collapse no adapter (vários actos = uma “noite”).
- PWA: `public/manifest.json`, icons em `public/icons/` (any + maskable), Serwist (`src/app/sw.ts`), fallback `/offline`. Regenerar icons: `npm run icons:pwa`.

---

## 8. Admin (ops UX)

Gate: Supabase login + email em `ADMIN_EMAILS`.

| Rota | Job |
|------|-----|
| `/admin` | Contagens, heartbeat worker |
| `/admin/scrapers` | Watchlist derived, queue modes, config, abort, logs |
| `/admin/events-raw` | Posts + drawer de tiers |
| `/admin/event-review` | Editar campos, approve/reject, feedback ML |
| `/admin/processed` | Vista Processed + link Sheets |
| `/admin/venues` | CRUD catálogo venues (Supabase SoT) |
| `/admin/promoters` | CRUD catálogo promoters |
| `/admin/catalog-candidates` | Aprovar venues/promoters propostos pelo extract |
| `/admin/bugs` | Feedback de bugs dos users |

Human review é o **Tier 6** do pipeline: última porta antes do calendário live (além do `publish`).

---

## 9. Auth

**Primário:** Supabase Auth (`lib/auth/supabaseAuth.tsx`) — email/password, Google/Facebook OAuth via Dashboard, callback `/auth/callback`.

**Fallback:** NextAuth se env Supabase ausente — Google/Facebook/Credentials (incl. guest).

`resolveUserId`: Bearer Supabase → NextAuth (guest → null).

---

## 10. Camadas de código a conhecer

| Need | Path |
|------|------|
| Fetch/filter events | `lib/eventsAdapter.ts` |
| For You | `lib/recommendationEngine.ts`, `app/api/foryou` |
| Interactions | `lib/interactions.ts` |
| Friends | `lib/friendRequests.ts` |
| Calendar UI | `app/calendar/` |
| Design | `app/globals.css`, `tailwind.config.ts` |
| Admin | `lib/adminPipeline.ts`, `lib/adminAuth.ts` |

---

## 11. O que está planeado vs as-built

`docs/MASTER_TASK_LIST_ARCHITECTURE.md` e `SOCIAL_LAYER_TECHNICAL_PLAN.md` misturam roadmap. **As-built** priorizar:

- Friends mútuos (não user follows)
- `user_interactions` unificado
- For You weighted + cold start
- Pipeline Supabase + Sheets Clean

Não assumir subscriptions/notification queue completas só porque estão no plano técnico.
