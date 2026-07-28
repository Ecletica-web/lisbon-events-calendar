"""Convert replication markdown docs to PDF (UTF-8 via DejaVu or Windows fonts)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "replication"
OUT = ROOT / "docs" / "replication" / "pdf"

FILES = [
    ("01-visao-e-arquitectura.md", "01-Visao-e-Arquitectura.pdf", "Visão & Arquitectura"),
    ("02-pipeline-e-inteligencia.md", "02-Pipeline-e-Inteligencia.pdf", "Pipeline & Inteligência"),
    ("03-dados-sheets-supabase.md", "03-Dados-Sheets-Supabase.pdf", "Dados Sheets & Supabase"),
    ("04-produto-social-reco-ux.md", "04-Produto-Social-Reco-UX.pdf", "Produto, Social, Reco & UX"),
    ("05-guia-replicacao.md", "05-Guia-Replicacao.pdf", "Guia de Replicação 100%"),
    (
        "06-inteligencia-infraestrutura.md",
        "06-Inteligencia-Infraestrutura.pdf",
        "Inteligência — Infraestrutura Deep Dive",
    ),
]


def find_font() -> tuple[str, str | None]:
    candidates = [
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\calibri.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    ]
    for p in candidates:
        if p.exists():
            return "Body", str(p)
    return "Helvetica", None


class DocPDF(FPDF):
    def __init__(self, title: str, font_family: str, font_path: str | None):
        super().__init__(format="A4")
        self.doc_title = title
        self.font_family = font_family
        if font_path:
            self.add_font(font_family, "", font_path)
            # Try bold variant
            bold = Path(font_path).with_name(Path(font_path).stem + "bd.ttf")
            if not bold.exists():
                bold = Path(font_path).with_name("arialbd.ttf")
            if bold.exists():
                self.add_font(font_family, "B", str(bold))
            else:
                self.add_font(font_family, "B", font_path)
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(16, 16, 16)

    def header(self):
        self.set_x(self.l_margin)
        self.set_font(self.font_family, "B", 9)
        self.set_text_color(80, 80, 80)
        self.cell(0, 6, f"City Pager - {self.doc_title}", align="L", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.3)
        y = self.get_y() + 2
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.set_y(y + 4)

    def footer(self):
        self.set_y(-14)
        self.set_font(self.font_family, "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Pagina {self.page_no()}/{{nb}}", align="C")

    def content_width(self) -> float:
        return self.w - self.l_margin - self.r_margin


def strip_md_inline(text: str) -> str:
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return text


def parse_table_row(line: str) -> list[str] | None:
    if not line.strip().startswith("|"):
        return None
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if cells and all(re.fullmatch(r":?-{3,}:?", c.replace(" ", "")) for c in cells):
        return None  # separator
    return [strip_md_inline(c) for c in cells]


def render_md(pdf: DocPDF, md: str) -> None:
    lines = md.replace("\r\n", "\n").split("\n")
    i = 0
    in_code = False
    code_buf: list[str] = []

    def flush_code():
        nonlocal code_buf
        if not code_buf:
            return
        pdf.set_x(pdf.l_margin)
        pdf.set_font(pdf.font_family, "", 8)
        pdf.set_fill_color(245, 245, 245)
        pdf.set_text_color(20, 20, 20)
        block = "\n".join(code_buf)
        pdf.multi_cell(pdf.content_width(), 4.2, block, fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        code_buf = []

    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("```"):
            if in_code:
                flush_code()
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # Tables: collect contiguous rows
        if line.strip().startswith("|"):
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                parsed = parse_table_row(lines[i])
                if parsed is not None:
                    rows.append(parsed)
                i += 1
            if rows:
                render_table(pdf, rows)
                pdf.ln(2)
            continue

        w = pdf.content_width()
        pdf.set_x(pdf.l_margin)
        if line.startswith("# "):
            pdf.set_font(pdf.font_family, "B", 16)
            pdf.set_text_color(0, 0, 0)
            pdf.multi_cell(w, 8, strip_md_inline(line[2:]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(2)
        elif line.startswith("## "):
            pdf.ln(2)
            pdf.set_font(pdf.font_family, "B", 13)
            pdf.set_text_color(0, 0, 0)
            pdf.multi_cell(w, 7, strip_md_inline(line[3:]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
        elif line.startswith("### "):
            pdf.ln(1)
            pdf.set_font(pdf.font_family, "B", 11)
            pdf.multi_cell(w, 6, strip_md_inline(line[4:]), new_x="LMARGIN", new_y="NEXT")
            pdf.ln(0.5)
        elif line.startswith("---"):
            pdf.ln(1)
            y = pdf.get_y()
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(3)
        elif line.startswith("- ") or line.startswith("* "):
            pdf.set_font(pdf.font_family, "", 10)
            pdf.set_text_color(20, 20, 20)
            pdf.multi_cell(w, 5, "-  " + strip_md_inline(line[2:]), new_x="LMARGIN", new_y="NEXT")
        elif re.match(r"^\d+\.\s", line):
            pdf.set_font(pdf.font_family, "", 10)
            pdf.multi_cell(w, 5, strip_md_inline(line), new_x="LMARGIN", new_y="NEXT")
        elif line.startswith("|"):
            pass
        elif line.strip() == "":
            pdf.ln(2)
        else:
            pdf.set_font(pdf.font_family, "", 10)
            pdf.set_text_color(20, 20, 20)
            pdf.multi_cell(w, 5, strip_md_inline(line), new_x="LMARGIN", new_y="NEXT")
        i += 1

    if in_code:
        flush_code()


def render_table(pdf: DocPDF, rows: list[list[str]]) -> None:
    """Render tables as plain text rows (reliable with long cells)."""
    if not rows:
        return
    pdf.set_x(pdf.l_margin)
    w = pdf.content_width()
    for r_idx, row in enumerate(rows):
        text = " | ".join(c for c in row if c is not None)
        if r_idx == 0:
            pdf.set_font(pdf.font_family, "B", 8)
            pdf.set_fill_color(230, 230, 230)
            pdf.multi_cell(w, 4.5, text[:1200], fill=True, new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_font(pdf.font_family, "", 8)
            pdf.set_text_color(20, 20, 20)
            pdf.multi_cell(w, 4.5, text[:1200], new_x="LMARGIN", new_y="NEXT")
        pdf.ln(0.5)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    family, path = find_font()
    print(f"Font: {family} ({path})")
    for md_name, pdf_name, title in FILES:
        md_path = SRC / md_name
        if not md_path.exists():
            print(f"MISSING {md_path}", file=sys.stderr)
            return 1
        pdf = DocPDF(title, family, path)
        pdf.alias_nb_pages()
        pdf.add_page()
        w = pdf.content_width()
        pdf.set_x(pdf.l_margin)
        pdf.set_font(family, "B", 18)
        pdf.multi_cell(w, 10, "City Pager / Lisbon Events Calendar", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font(family, "", 11)
        pdf.multi_cell(w, 6, f"Pacote de replicacao - {title}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        render_md(pdf, md_path.read_text(encoding="utf-8"))
        out_path = OUT / pdf_name
        pdf.output(str(out_path))
        print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
