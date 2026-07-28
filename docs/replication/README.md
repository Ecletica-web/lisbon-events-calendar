# Pacote de replicação — Terminus

Documentação para partilhar com alguém que queira **replicar o sistema a 100%**.

**No repo:** este pacote é a descrição canónica profunda do projecto. Agentes Cursor
devem consultá-lo (regra always-on `.cursor/rules/project-knowledge.mdc`) em conjunto
com [`AGENTS.md`](../../AGENTS.md). Runbooks vivos (`PIPELINE.md`, `SETUP.md`, …)
permanecem a fonte operacional do dia-a-dia.

## PDFs (partilhar estes)

Pasta: [`pdf/`](./pdf/)

| # | Ficheiro | Conteúdo |
|---|----------|----------|
| 1 | `01-Visao-e-Arquitectura.pdf` | Visão do produto, stack, camadas, fluxo E2E, UX principles |
| 2 | `02-Pipeline-e-Inteligencia.pdf` | Scrapers Apify, tiers AI 0–6, modelos, worker, confiança |
| 3 | `03-Dados-Sheets-Supabase.pdf` | Tabs Sheets, CSV schema, tabelas Supabase, imagens |
| 4 | `04-Produto-Social-Reco-UX.pdf` | Features, friends vs follows, For You, UI/UX |
| 5 | `05-Guia-Replicacao.pdf` | Checklist bootstrap end-to-end + aceitação |
| 6 | `06-Inteligencia-Infraestrutura.pdf` | Deep dive: tiers AI, venue/promoter select, gates, For You |

## Fontes Markdown

Os `.md` nesta pasta são a fonte editável. Regenerar PDFs:

```bash
python scripts/md-to-replication-pdfs.py
```

## Entrypoint curto

Ver também [`AGENTS.md`](../../AGENTS.md) na raiz do repo (mapa para humanos e agentes AI).

Runbooks vivos no repo: `docs/PIPELINE.md`, `docs/SETUP.md`, `docs/SCHEMA.md`.
