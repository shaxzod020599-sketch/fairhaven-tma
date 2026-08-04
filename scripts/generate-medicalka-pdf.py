#!/usr/bin/env python3
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


SOURCE = Path("docs/integrations/fairhaven-test-access.ru.md")
OUTPUT = Path("output/pdf/FairHaven-test-dostup.pdf")

NAVY = colors.HexColor("#14324A")
TEAL = colors.HexColor("#138A8A")
INK = colors.HexColor("#1B2733")
MUTED = colors.HexColor("#5A6A77")
LINE = colors.HexColor("#D8E2E8")
PALE = colors.HexColor("#F4F8FA")
CALLOUT = colors.HexColor("#FFF7DE")
CODE_BG = colors.HexColor("#EEF3F6")


def register_fonts() -> None:
    root = Path("/System/Library/Fonts/Supplemental")
    fonts = {
        "Arial": root / "Arial.ttf",
        "Arial-Bold": root / "Arial Bold.ttf",
        "Arial-Italic": root / "Arial Italic.ttf",
        "CourierNew": root / "Courier New.ttf",
        "CourierNew-Bold": root / "Courier New Bold.ttf",
    }
    for name, path in fonts.items():
        if not path.exists():
            raise FileNotFoundError(path)
        pdfmetrics.registerFont(TTFont(name, str(path)))
    pdfmetrics.registerFontFamily(
        "Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic"
    )


def ascii_dashes(value: str) -> str:
    return value.replace("—", "-").replace("–", "-").replace("−", "-")


def inline_markup(value: str) -> str:
    value = ascii_dashes(value)
    tokens: list[str] = []

    def stash_code(match: re.Match[str]) -> str:
        code = html.escape(match.group(1), quote=False)
        tokens.append(f'<font name="CourierNew" size="8.2">{code}</font>')
        return f"\x00{len(tokens) - 1}\x00"

    value = re.sub(r"`([^`]+)`", stash_code, value)
    value = html.escape(value, quote=False)
    value = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"\x00(\d+)\x00", lambda m: tokens[int(m.group(1))], value)
    return value


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Arial-Bold",
            fontSize=23,
            leading=27,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=5 * mm,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Arial-Bold",
            fontSize=14.5,
            leading=18,
            textColor=NAVY,
            spaceBefore=3.5 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Arial",
            fontSize=9.3,
            leading=13.3,
            textColor=INK,
            spaceAfter=2.4 * mm,
            allowWidows=0,
            allowOrphans=0,
            splitLongWords=True,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName="Arial",
            fontSize=9.2,
            leading=13.1,
            textColor=INK,
            spaceAfter=0,
            splitLongWords=True,
        ),
        "table": ParagraphStyle(
            "Table",
            parent=base["BodyText"],
            fontName="Arial",
            fontSize=8.25,
            leading=11.2,
            textColor=INK,
            splitLongWords=True,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Arial-Bold",
            fontSize=8.2,
            leading=10.8,
            textColor=colors.white,
            splitLongWords=True,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="CourierNew",
            fontSize=7.15,
            leading=9.5,
            textColor=INK,
            leftIndent=0,
            rightIndent=0,
            splitLongWords=True,
            wordWrap="LTR",
        ),
        "list": ParagraphStyle(
            "List",
            parent=base["BodyText"],
            fontName="Arial",
            fontSize=9.2,
            leading=13,
            textColor=INK,
            leftIndent=0,
            spaceAfter=0,
            splitLongWords=True,
        ),
    }


def parse_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def code_block(lines: list[str], styles: dict[str, ParagraphStyle], width: float) -> Table:
    rows = []
    for raw in lines or [""]:
        raw = ascii_dashes(raw).replace("\t", "    ")
        leading = len(raw) - len(raw.lstrip(" "))
        rendered = "&nbsp;" * leading + html.escape(raw[leading:], quote=False)
        rows.append([Paragraph(rendered or "&nbsp;", styles["code"])])
    table = Table(rows, colWidths=[width], hAlign="LEFT", splitByRow=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
    ]
    table.setStyle(TableStyle(commands))
    return table


def data_table(
    rows: list[list[str]], styles: dict[str, ParagraphStyle], width: float
) -> Table:
    has_header = any(cell.strip() for cell in rows[0])
    cells = []
    for row_index, row in enumerate(rows):
        style = styles["table_header"] if has_header and row_index == 0 else styles["table"]
        cells.append([Paragraph(inline_markup(cell) or "&nbsp;", style) for cell in row])

    first_column_ratio = 0.42
    if rows and rows[0] and rows[0][0] in {"Код", "Вы отправили"}:
        first_column_ratio = 0.36
    widths = [width * first_column_ratio, width * (1 - first_column_ratio)]
    table = Table(
        cells,
        colWidths=widths,
        hAlign="LEFT",
        repeatRows=1 if has_header else 0,
        splitByRow=1,
    )
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if has_header:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
        first_body_row = 1
    else:
        first_body_row = 0
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#E7F3F3")),
                ("FONTNAME", (0, 0), (0, -1), "Arial-Bold"),
            ]
        )
    for index in range(first_body_row, len(rows)):
        if (index - first_body_row) % 2 == 1:
            commands.append(("BACKGROUND", (0, index), (-1, index), PALE))
    table.setStyle(TableStyle(commands))
    return table


def markdown_story(text: str, styles: dict[str, ParagraphStyle], width: float) -> list:
    lines = text.splitlines()
    story: list = []
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue
        if stripped.startswith("```"):
            index += 1
            block: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                block.append(lines[index])
                index += 1
            index += 1
            story.extend([code_block(block, styles, width), Spacer(1, 2.5 * mm)])
            continue
        if stripped.startswith("# "):
            story.extend(
                [
                    Spacer(1, 7 * mm),
                    Paragraph(inline_markup(stripped[2:]), styles["title"]),
                    HRFlowable(width="100%", thickness=2.2, color=TEAL, spaceAfter=5 * mm),
                ]
            )
            index += 1
            continue
        if stripped.startswith("## "):
            story.append(Paragraph(inline_markup(stripped[3:]), styles["h2"]))
            index += 1
            continue
        if stripped == "---":
            story.append(HRFlowable(width="100%", thickness=0.55, color=LINE, spaceBefore=2 * mm, spaceAfter=2 * mm))
            index += 1
            continue
        if stripped.startswith("|") and index + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-+", lines[index + 1]):
            rows = [parse_table_row(line)]
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                rows.append(parse_table_row(lines[index]))
                index += 1
            story.extend([data_table(rows, styles, width), Spacer(1, 3 * mm)])
            continue
        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while index < len(lines):
                match = re.match(r"^(\d+)\.\s+(.+)", lines[index].strip())
                if not match:
                    break
                items.append(
                    ListItem(
                        Paragraph(inline_markup(match.group(2)), styles["list"]),
                        leftIndent=5 * mm,
                    )
                )
                index += 1
            story.extend(
                [
                    ListFlowable(
                        items,
                        bulletType="1",
                        start="1",
                        leftIndent=6 * mm,
                        bulletFontName="Arial-Bold",
                        bulletFontSize=9,
                        bulletColor=TEAL,
                        spaceAfter=2.5 * mm,
                    )
                ]
            )
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate or candidate.startswith(("#", "```", "|")) or candidate == "---" or re.match(r"^\d+\.\s+", candidate):
                break
            paragraph_lines.append(candidate)
            index += 1
        paragraph = " ".join(paragraph_lines)
        if paragraph.startswith("**TEST MODE."):
            box = Table(
                [[Paragraph(inline_markup(paragraph), styles["callout"])]],
                colWidths=[width],
                hAlign="LEFT",
            )
            box.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), CALLOUT),
                        ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#E8C75A")),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            story.extend([box, Spacer(1, 3 * mm)])
        else:
            story.append(Paragraph(inline_markup(paragraph), styles["body"]))
    return story


def page_decoration(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setFillColor(MUTED)
        canvas.setFont("Arial", 7.5)
        canvas.drawString(doc.leftMargin, height - 13 * mm, "FAIRHAVEN HEALTH  /  MEDICALKA")
        canvas.setFillColor(TEAL)
        canvas.rect(doc.leftMargin, height - 15.2 * mm, 19 * mm, 0.8 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(doc.leftMargin, 13.5 * mm, width - doc.rightMargin, 13.5 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Arial", 7.5)
    canvas.drawString(doc.leftMargin, 9.2 * mm, "Тестовый доступ к API  •  api.fairhaven.uz")
    canvas.drawRightString(width - doc.rightMargin, 9.2 * mm, f"{doc.page}")
    canvas.restoreState()


def main() -> int:
    rl_config.invariant = 1
    register_fonts()
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=17 * mm,
        leftMargin=17 * mm,
        topMargin=21 * mm,
        bottomMargin=18 * mm,
        title="FairHaven Health - тестовый доступ к API",
        author="FairHaven Health",
        creator="FairHaven Health",
        subject="Интеграция Medicalka",
        pageCompression=1,
    )
    styles = make_styles()
    story = markdown_story(SOURCE.read_text(encoding="utf-8"), styles, doc.width)
    doc.build(story, onFirstPage=page_decoration, onLaterPages=page_decoration)
    print(OUTPUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())