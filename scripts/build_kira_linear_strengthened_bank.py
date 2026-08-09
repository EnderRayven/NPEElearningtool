#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "题库校验数据" / "Kira线代强化"
QUESTION_PDF = SOURCE_ROOT / "Kira·27线性代数强化习题（去水印）.pdf"
ANSWER_ROOT = SOURCE_ROOT / "必刷习题集-答案解析"
WORKSPACE = ROOT / "数据/默认题库"
DESTINATION = WORKSPACE / "数学" / "线代" / "Kira线代强化"
MANIFEST_PATH = WORKSPACE / "题库数据.json"
TMP_ROOT = Path("/private/tmp/pdfs/kira-linear-strengthened")
RENDER_DPI = 200

BANK_ID = "default-kira-linear-strengthened"
BANK_NAME = "Kira线代强化"
BANK_FOLDER = Path("数学/线代") / BANK_NAME


@dataclass(frozen=True)
class SectionSpec:
    code: int
    name: str
    count: int


@dataclass(frozen=True)
class ChapterSpec:
    code: int
    name: str
    first_page: int
    last_page: int
    sections: tuple[SectionSpec, ...]
    answer_pdf: Path | None


CHAPTERS = (
    ChapterSpec(1, "行列式", 2, 9, (SectionSpec(1, "选择题", 4), SectionSpec(2, "填空题", 9), SectionSpec(3, "解答题", 7)), None),
    ChapterSpec(2, "矩阵", 10, 23, (SectionSpec(1, "选择题", 11), SectionSpec(2, "填空题", 13), SectionSpec(3, "解答题", 10)), None),
    ChapterSpec(3, "向量", 24, 33, (SectionSpec(1, "选择题", 12), SectionSpec(2, "填空题", 3), SectionSpec(3, "解答题", 8)), None),
    ChapterSpec(4, "线性方程组", 34, 49, (SectionSpec(1, "选择题", 18), SectionSpec(2, "填空题", 13), SectionSpec(3, "解答题", 12)), None),
    ChapterSpec(5, "特征值与特征向量", 50, 66, (SectionSpec(1, "选择题", 10), SectionSpec(2, "填空题", 13), SectionSpec(3, "解答题", 18)), None),
    ChapterSpec(6, "二次型", 67, 77, (SectionSpec(1, "选择题", 10), SectionSpec(2, "填空题", 4), SectionSpec(3, "解答题", 9)), None),
)

ANSWER_FILES = {
    1: "01 第一章 行列式（强化习题解析）【后续更新关注公众号：研网盘】.pdf",
    2: "02 第二讲 矩阵 （强化答案）【后续更新关注公众号：研网盘】.pdf",
    3: "03 第三讲  向量(强化答案）【后续更新关注公众号：研网盘】.pdf",
    4: "04 第四讲 线性方程组 （强化答案）【后续更新关注公众号：研网盘】.pdf",
    5: "05 第五讲 特征值与特征向量  (强化答案）【后续更新关注公众号：研网盘】.pdf",
    6: "06 第六讲  二次型 （强化答案）【后续更新关注公众号：研网盘】.pdf",
}

# 第 1 讲答案 PDF 的第 2 页中，第 2 题编号未被 OCR 识别；位置由页面复核得到。
MANUAL_ANSWER_STARTS = {
    1: [(2, 426, 2)],
    2: [(2, 1014, 8), (2, 1577, 11), (3, 374, 1), (4, 564, 5), (4, 1789, 9), (5, 635, 11), (10, 767, 10)],
    3: [(6, 1226, 6)],
    4: [(10, 1199, 7)],
    5: [(4, 2032, 10), (5, 353, 11), (7, 1779, 5)],
    6: [(5, 1023, 4), (7, 1019, 6), (8, 1935, 7), (10, 452, 8)],
}
EXCLUDED_OCR_ANSWER_STARTS = {(2, 1577, 1), (2, 464, 26)}
# 第六讲答案 PDF 只解析到解答题第 8 题；题目 PDF 另有第 9 题。
ANSWER_SECTION_COUNTS = {6: (10, 4, 8)}
# The source PDFs use SymbolMT's private-use codes for several bold/vector
# Greek symbols. Their embedded outlines render as solid black blobs in
# Poppler, while the normal Times New Roman math glyphs on the same pages
# render correctly.
BROKEN_VECTOR_SYMBOLS = {"\uf061": "alpha", "\uf062": "beta", "\uf078": "xi"}

QUESTION_START = re.compile(r"^(\d{1,2})[.．、,，。]")
ANSWER_START = re.compile(r"^(\d{1,2})[.．、,，。]")


def find_binary(name: str, fallback: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    if Path(fallback).exists():
        return fallback
    raise RuntimeError(f"找不到必要程序：{name}")


PDFTOPPM = find_binary(
    "pdftoppm",
    "/Users/enderrayven/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm",
)
TESSERACT = find_binary("tesseract", "/opt/homebrew/bin/tesseract")


def render_pdf(source: Path, destination: Path) -> dict[int, Path]:
    destination.mkdir(parents=True, exist_ok=True)
    prefix = destination / "page"
    subprocess.run(
        [PDFTOPPM, "-png", "-r", str(RENDER_DPI), str(source), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    pages = {}
    for path in sorted(destination.glob("page-*.png")):
        match = re.search(r"-(\d+)\.png$", path.name)
        if match:
            pages[int(match.group(1))] = path
    if not pages:
        raise RuntimeError(f"PDF 未渲染出图片：{source}")
    return pages


def char_pixel_box(page: pdfplumber.page.Page, image: Image.Image, char: dict) -> tuple[int, int, int, int]:
    """Map a pdfplumber character box onto its rendered page image."""
    scale_x = image.width / page.width
    scale_y = image.height / page.height
    x0 = round((char["x0"] - page.bbox[0]) * scale_x)
    x1 = round((char["x1"] - page.bbox[0]) * scale_x)
    y0 = round(char["top"] * scale_y)
    y1 = round(char["bottom"] * scale_y)
    return x0, y0, x1, y1


def malformed_symbol_pixels(image: Image.Image, box: tuple[int, int, int, int]) -> list[tuple[int, int]]:
    """Find the dark connected component produced by a malformed glyph."""
    gray = np.asarray(image.convert("L"))
    x0, y0, x1, y1 = box
    left = max(0, x0 - 10)
    top = max(0, y0 - 10)
    right = min(image.width, x1 + 10)
    bottom = min(image.height, y1 + 14)
    patch = gray[top:bottom, left:right] < 245
    visited = np.zeros(patch.shape, dtype=bool)
    candidates: list[list[tuple[int, int]]] = []
    for start_y, start_x in zip(*np.where(patch)):
        if visited[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        visited[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while stack:
            current_y, current_x = stack.pop()
            component.append((current_x + left, current_y + top))
            for delta_y in (-1, 0, 1):
                for delta_x in (-1, 0, 1):
                    next_y = current_y + delta_y
                    next_x = current_x + delta_x
                    if (
                        0 <= next_y < patch.shape[0]
                        and 0 <= next_x < patch.shape[1]
                        and patch[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        stack.append((next_y, next_x))
        if len(component) >= 8:
            component_x = [point[0] for point in component]
            component_y = [point[1] for point in component]
            if max(component_x) >= x0 and min(component_x) < x1 and max(component_y) >= y0 and min(component_y) < y1:
                candidates.append(component)
    return max(candidates, key=len, default=[])


def make_vector_symbol_templates(rendered_pages: dict[int, Path], pdf_pages: list[pdfplumber.page.Page]) -> dict[str, Image.Image]:
    """Extract clean alpha/beta glyphs from the main PDF for reuse."""
    page_number = 29
    page = pdf_pages[page_number - 1]
    image = Image.open(rendered_pages[page_number]).convert("RGB")
    normal_beta = next(
        char
        for char in page.chars
        if char["text"] == "β" and char["top"] < 110 and "BoldItalic" in char.get("fontname", "")
    )

    # On page 29 every early alpha is immediately followed by a subscript.
    # Its PDF character box overlaps the subscript's top serif, so cropping
    # that alpha box would permanently bake a black triangular fragment into
    # the replacement template.  Find an isolated alpha of the same math font
    # elsewhere in the question PDF instead.
    alpha_candidates: list[tuple[float, int, dict, pdfplumber.page.Page]] = []
    for candidate_page_number, candidate_page in enumerate(pdf_pages, 1):
        for candidate in candidate_page.chars:
            if candidate["text"] != "α" or "BoldItalic" not in candidate.get("fontname", ""):
                continue
            has_overlapping_lower = any(
                other is not candidate
                and other["top"] > candidate["top"] + 2
                and other["top"] < candidate["bottom"] + 8
                and other["x0"] < candidate["x1"] + 1
                and other["x1"] > candidate["x0"] - 1
                for other in candidate_page.chars
            )
            has_touching_neighbor = any(
                other is not candidate
                and abs(other["top"] - candidate["top"]) < 2
                and other["x0"] < candidate["x1"] + 1
                and other["x1"] > candidate["x0"] - 1
                for other in candidate_page.chars
            )
            if has_overlapping_lower or has_touching_neighbor:
                continue
            alpha_candidates.append((abs(candidate["height"] - 12), candidate_page_number, candidate, candidate_page))
    if not alpha_candidates:
        raise RuntimeError("找不到不带相邻下标的干净 α 字形")
    _, alpha_page_number, normal_alpha, alpha_page = min(alpha_candidates, key=lambda item: item[0])
    alpha_image = Image.open(rendered_pages[alpha_page_number]).convert("RGB")
    alpha_x0, alpha_y0, alpha_x1, alpha_y1 = char_pixel_box(alpha_page, alpha_image, normal_alpha)
    beta_x0, beta_y0, beta_x1, beta_y1 = char_pixel_box(page, image, normal_beta)
    # The isolated alpha box contains only the base glyph.  Keep its native
    # vertical metrics; the placement offset below aligns it with the broken
    # SymbolMT box.
    alpha = alpha_image.crop((alpha_x0, alpha_y0, alpha_x1, alpha_y1))
    # This beta is standalone, so retain its italic left overhang and full base.
    beta = image.crop((beta_x0 - 3, beta_y0 + 1, beta_x1 + 2, max(beta_y0 + 3, beta_y1 - 1)))

    # Page 39 question 18 contains isolated, correctly rendered ξ glyphs at
    # exactly the size used by the malformed ξ symbols in question 16.
    xi_page_number = 39
    xi_page = pdf_pages[xi_page_number - 1]
    normal_xi = next(
        char
        for char in xi_page.chars
        if char["text"] == "ξ" and 500 < char["top"] < 550 and "BoldItalic" in char.get("fontname", "")
    )
    xi_image = Image.open(rendered_pages[xi_page_number]).convert("RGB")
    xi_x0, xi_y0, xi_x1, xi_y1 = char_pixel_box(xi_page, xi_image, normal_xi)
    xi = xi_image.crop((xi_x0, xi_y0, xi_x1, xi_y1))
    return {"alpha": alpha, "beta": beta, "xi": xi}


def candidate_is_clean(
    page_number: int,
    char: dict,
    broken_by_page: dict[int, list[dict]],
) -> bool:
    """Reject a candidate glyph that lies under another broken symbol."""
    for broken in broken_by_page.get(page_number, []):
        if char["x1"] >= broken["x0"] - 0.5 and char["x0"] <= broken["x1"] + 0.5:
            if char["bottom"] >= broken["top"] - 0.5 and char["top"] <= broken["bottom"] + 0.5:
                return False
    return True


def find_clean_char_template(
    target: dict,
    pages: list[pdfplumber.page.Page],
    rendered_pages: dict[int, Path],
    broken_by_page: dict[int, list[dict]],
) -> Image.Image | None:
    """Find a same-size clean raster glyph for a subscript character."""
    candidates: list[tuple[float, int, dict, pdfplumber.page.Page]] = []
    for page_number, page in enumerate(pages, 1):
        for char in page.chars:
            if char["text"] != target["text"] or char["text"] in BROKEN_VECTOR_SYMBOLS:
                continue
            if not candidate_is_clean(page_number, char, broken_by_page):
                continue
            height_difference = abs(char["height"] - target["height"])
            if height_difference <= 0.6:
                candidates.append((height_difference, page_number, char, page))
    if not candidates:
        return None
    _, page_number, candidate, page = min(candidates, key=lambda item: item[0])
    image = Image.open(rendered_pages[page_number]).convert("RGB")
    x0, y0, x1, y1 = char_pixel_box(page, image, candidate)
    # Do not pad this crop: the PDF subscript box can overlap the neighboring
    # alpha/beta box, and padding would reintroduce a fragment of that glyph.
    return image.crop((max(0, x0), max(0, y0), min(image.width, x1), min(image.height, y1)))


def repair_broken_vector_symbols(
    source: Path,
    rendered_pages: dict[int, Path],
    templates: dict[str, Image.Image],
) -> int:
    """Replace malformed SymbolMT alpha/beta glyphs before vertical cropping."""
    repaired = 0
    with pdfplumber.open(source) as pdf:
        pages = list(pdf.pages)
        broken_by_page = {
            page_number: [char for char in page.chars if char["text"] in BROKEN_VECTOR_SYMBOLS]
            for page_number, page in enumerate(pages, 1)
        }
        for page_number, broken_chars in broken_by_page.items():
            if not broken_chars or page_number not in rendered_pages:
                continue
            image = Image.open(rendered_pages[page_number]).convert("RGB")
            original = image.copy()
            page = pages[page_number - 1]
            draw = ImageDraw.Draw(image)
            for broken in broken_chars:
                x0, y0, x1, y1 = char_pixel_box(page, image, broken)
                # The malformed SymbolMT outline can extend beyond its PDF
                # character box.  Remove that connected component from the
                # original raster as well; otherwise a black tail remains
                # beneath an otherwise repaired alpha/beta.
                for pixel_x, pixel_y in malformed_symbol_pixels(original, (x0, y0, x1, y1)):
                    draw.point((pixel_x, pixel_y), fill="white")
                # Lower-positioned characters in this small x-window are the
                # subscripts belonging to the vector symbol.
                subscripts = [
                    char
                    for char in page.chars
                    if char["text"] not in BROKEN_VECTOR_SYMBOLS
                    and char["top"] > broken["top"] + 2
                    and char["top"] < broken["top"] + 18
                    and char["height"] < broken["height"] * 0.8
                    and broken["x0"] - 0.5 <= char["x0"] <= broken["x1"] + 1.5
                ]
                boxes = [char_pixel_box(page, image, char) for char in subscripts]
                draw.rectangle((max(0, x0 - 2), max(0, y0 - 2), min(image.width - 1, x1 + 2), min(image.height - 1, y1 + 2)), fill="white")
                for sx0, sy0, sx1, sy1 in boxes:
                    draw.rectangle((max(0, sx0 - 2), max(0, sy0 - 2), min(image.width - 1, sx1 + 2), min(image.height - 1, sy1 + 2)), fill="white")

                symbol_kind = BROKEN_VECTOR_SYMBOLS[broken["text"]]
                base = templates[symbol_kind]
                base_y = y0 + (2 if symbol_kind == "alpha" else 1)
                image.paste(base, (x0, base_y))
                for subscript in subscripts:
                    template = find_clean_char_template(subscript, pages, rendered_pages, broken_by_page)
                    if template is None:
                        # The malformed base is already removed; leave a
                        # readable blank only if no clean source glyph exists.
                        continue
                    sx0, sy0, sx1, sy1 = char_pixel_box(page, image, subscript)
                    target_size = (max(1, sx1 - sx0), max(1, sy1 - sy0))
                    if template.size != target_size:
                        template = template.resize(target_size, Image.Resampling.LANCZOS)
                    image.paste(template, (max(0, sx0), max(0, sy0)))
                repaired += 1
            image.save(rendered_pages[page_number], optimize=True)
    return repaired


def page_words(page: pdfplumber.page.Page) -> list[dict]:
    return page.extract_words(x_tolerance=2, y_tolerance=3, keep_blank_chars=False)


def main_question_starts() -> dict[int, list[tuple[float, int]]]:
    starts: dict[int, list[tuple[float, int]]] = {}
    with pdfplumber.open(QUESTION_PDF) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            if page_number == 1:
                continue
            words = page_words(page)
            page_starts: list[tuple[float, int]] = []
            for index, word in enumerate(words):
                text = word["text"].strip()
                match = QUESTION_START.match(text)
                if not match or not (80 <= word["x0"] <= 105) or not (50 <= word["top"] <= 800):
                    continue
                page_starts.append((word["top"], int(match.group(1))))
            for index, word in enumerate(words[:-1]):
                text = word["text"].strip()
                if not text.isdigit() or not (80 <= word["x0"] <= 105) or not (50 <= word["top"] <= 800):
                    continue
                next_word = words[index + 1]
                if next_word["text"].strip() not in {".", "．", "、", "。"}:
                    continue
                if next_word["x0"] - word["x0"] > 18 or abs(next_word["top"] - word["top"]) > 4:
                    continue
                page_starts.append((word["top"], int(text)))
            starts[page_number] = sorted(set(page_starts))
    return starts


def chapter_starts(starts_by_page: dict[int, list[tuple[float, int]]], chapter: ChapterSpec) -> list[tuple[int, float, int]]:
    starts: list[tuple[int, float, int]] = []
    for page in range(chapter.first_page, chapter.last_page + 1):
        starts.extend((page, top, number) for top, number in starts_by_page.get(page, []))
    expected = sum(section.count for section in chapter.sections)
    if len(starts) != expected:
        raise RuntimeError(f"第{chapter.code}讲题目起点数量异常：{len(starts)} != {expected}，实际起点：{starts}")
    cursor = 0
    for section in chapter.sections:
        section_starts = starts[cursor : cursor + section.count]
        expected_numbers = list(range(1, section.count + 1))
        actual_numbers = [item[2] for item in section_starts]
        if actual_numbers != expected_numbers:
            raise RuntimeError(f"第{chapter.code}讲{section.name}编号异常：{actual_numbers} != {expected_numbers}")
        cursor += section.count
    return starts


def ocr_answer_starts(image_path: Path) -> list[tuple[int, int]]:
    result = subprocess.run(
        [TESSERACT, str(image_path), "stdout", "-l", "chi_sim+eng", "--psm", "6", "tsv"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    rows = list(csv.DictReader(result.stdout.splitlines(), delimiter="\t"))
    candidates: list[tuple[int, int]] = []
    for index, row in enumerate(rows):
        if row.get("level") != "5":
            continue
        text = (row.get("text") or "").strip()
        try:
            left, top = int(row["left"]), int(row["top"])
            width, height = int(row["width"]), int(row["height"])
        except (KeyError, ValueError):
            continue
        if left > 300 or top < 150 or top > 2200:
            continue
        match = ANSWER_START.match(text)
        if match:
            number = int(match.group(1))
            if number <= 30:
                candidates.append((top, number))
            continue
        if text.isdigit() and index + 1 < len(rows):
            next_row = rows[index + 1]
            if next_row.get("level") != "5":
                continue
            next_text = (next_row.get("text") or "").strip()
            try:
                next_left, next_top = int(next_row["left"]), int(next_row["top"])
            except (KeyError, ValueError):
                continue
            if next_text in {".", "．", "、", "。"} and next_left - (left + width) < 30 and abs(next_top - top) < 12:
                number = int(text)
                if number <= 30:
                    candidates.append((top, number))
    return sorted(set(candidates))


def answer_starts(answer_pdf: Path, rendered_pages: dict[int, Path], chapter: ChapterSpec) -> list[tuple[int, int, int]]:
    starts: list[tuple[int, int, int]] = []
    for page_number in sorted(rendered_pages):
        starts.extend(
            (page_number, top, number)
            for top, number in ocr_answer_starts(rendered_pages[page_number])
            if (page_number, top, number) not in EXCLUDED_OCR_ANSWER_STARTS
        )
    starts.extend(MANUAL_ANSWER_STARTS.get(chapter.code, []))
    starts.sort()
    expected_counts = ANSWER_SECTION_COUNTS.get(chapter.code, tuple(section.count for section in chapter.sections))
    expected = sum(expected_counts)
    if len(starts) != expected:
        raise RuntimeError(f"第{chapter.code}讲答案起点数量异常：{len(starts)} != {expected}，实际起点：{starts}")
    cursor = 0
    for section_count in expected_counts:
        actual_numbers = [item[2] for item in starts[cursor : cursor + section_count]]
        expected_numbers = list(range(1, section_count + 1))
        if actual_numbers != expected_numbers:
            raise RuntimeError(f"第{chapter.code}讲答案编号异常：{actual_numbers} != {expected_numbers}")
        cursor += section_count
    return starts


def ink_groups(image: Image.Image, threshold: int = 150) -> list[tuple[int, int, int]]:
    """Return vertically grouped dark content as (top, bottom, max row ink)."""
    array = np.asarray(image.convert("L"))
    height = array.shape[0]
    row_ink = (array < threshold).sum(axis=1)
    rows = np.where(
        (row_ink >= 5)
        & (np.arange(height) >= int(height * 0.07))
        & (np.arange(height) < int(height * 0.94))
    )[0]
    groups: list[list[int]] = []
    for row in rows.tolist():
        if not groups or row - groups[-1][-1] > 3:
            groups.append([row])
        else:
            groups[-1].append(row)
    return [(group[0], group[-1], int(row_ink[group[0] : group[-1] + 1].max())) for group in groups]


def dark_row_bounds(image: Image.Image) -> tuple[int, int]:
    groups = ink_groups(image)
    if not groups:
        height = image.height
        return int(height * 0.08), int(height * 0.92)
    return max(0, groups[0][0] - 18), min(image.height, groups[-1][1] + 24)


def looks_like_section_heading(image: Image.Image, group: tuple[int, int, int]) -> bool:
    """Identify a left-aligned section label while extending a formula block."""
    start, end, max_ink = group
    if end - start < 25 or max_ink < 70:
        return False
    array = np.asarray(image.convert("L"))[start : end + 1]
    xs = np.where(array < 150)[1]
    if not len(xs):
        return False
    return int(xs.min()) < 50 and int(xs.max() - xs.min()) < 250


def content_bottom(image: Image.Image, limit: int | None = None, drop_heading: bool = False) -> int:
    """Find the end of answer content, omitting a trailing section heading when present."""
    groups = ink_groups(image)
    if limit is not None:
        groups = [group for group in groups if group[0] < limit - 4]
    if not groups:
        return max(2, int(image.height * 0.08))

    # Section labels such as “二、填空题” are short, isolated black text blocks.
    # They are not part of the preceding answer and otherwise look like a final
    # answer line to a simple ink-bound detector.
    if drop_heading and len(groups) >= 2:
        start, end, max_ink = groups[-1]
        previous_end = groups[-2][1]
        if end - start <= 70 and max_ink < 150 and start - previous_end >= 35:
            groups.pop()
    return min(image.height, groups[-1][1] + 24)


def gray_heading_top(image: Image.Image, top: int, bottom: int) -> int | None:
    """Find the gray “答题空间/反思总结” row between two question bounds."""
    array = np.asarray(image.convert("L"))
    gray_rows = ((array >= 150) & (array < 230)).sum(axis=1)
    black_rows = (array < 150).sum(axis=1)
    candidate_rows = np.where((gray_rows >= 20) & (black_rows <= 5))[0]
    groups: list[list[int]] = []
    for row in candidate_rows.tolist():
        if not groups or row - groups[-1][-1] > 3:
            groups.append([row])
        else:
            groups[-1].append(row)
    for group in groups:
        # Isolated one-row gray anti-aliasing from a matrix/formula is common;
        # the printed answer-space labels form a real multi-row text block.
        if len(group) >= 8 and group[0] > top + 20 and group[0] < bottom:
            return group[0]
    return None


def ink_top_near(image: Image.Image, start: int, extend_block: bool = False) -> int:
    """Find the actual ink top of a question whose number may sit beside a tall formula."""
    groups = ink_groups(image)
    candidates = [group for group in groups if group[0] <= start + 30 and group[1] >= start - 100]
    if not candidates:
        return start
    selected = min(candidates, key=lambda group: abs((group[0] + group[1]) / 2 - start))
    if not extend_block:
        return selected[0]

    selected_index = groups.index(selected)
    while selected_index > 0:
        previous = groups[selected_index - 1]
        gap = selected[0] - previous[1]
        previous_array = np.asarray(image.convert("L"))[previous[0] : previous[1] + 1]
        previous_x = np.where(previous_array < 150)[1]
        previous_is_formula_only = bool(len(previous_x) and int(previous_x.min()) >= 100)
        if gap > 80 or previous[0] < start - 220 or not previous_is_formula_only:
            break
        selected_index -= 1
        selected = groups[selected_index]
    return selected[0]


def crop_question_parts(
    rendered_pages: dict[int, Path],
    starts: list[tuple[int, float | int, int]],
    start_index: int,
    stop_at_gray_heading: bool = False,
) -> list[Image.Image]:
    page_number, start_top, _ = starts[start_index]
    next_boundary = starts[start_index + 1] if start_index + 1 < len(starts) else None
    parts: list[Image.Image] = []
    for page in range(page_number, (next_boundary[0] if next_boundary else page_number) + 1):
        image = Image.open(rendered_pages[page]).convert("RGB")
        width, height = image.size
        scale = RENDER_DPI / 72 if isinstance(start_top, float) else 1
        if page == page_number:
            top = ink_top_near(image, int(float(start_top) * scale), extend_block=True) - 15
        else:
            top, _ = dark_row_bounds(image)
        hard_bottom = (
            ink_top_near(image, int(float(next_boundary[1]) * scale)) - 15
            if next_boundary and page == next_boundary[0]
            # Gray answer-space labels are intentionally not part of the dark
            # ink bounds, so leave enough room to find them before falling
            # back to the page's dark-content end.
            else int(height * 0.93)
        )
        heading_top = gray_heading_top(image, top, hard_bottom) if stop_at_gray_heading else None
        if heading_top is not None:
            bottom = heading_top - 15
        elif next_boundary and page == next_boundary[0]:
            next_top = ink_top_near(image, int(float(next_boundary[1]) * scale))
            previous_groups = [group for group in ink_groups(image) if group[0] < next_top - 3]
            bottom = previous_groups[-1][1] + 24 if previous_groups else hard_bottom
        else:
            bottom = hard_bottom
        top = max(0, min(height - 1, top))
        bottom = max(top + 2, min(height, bottom))
        # Deliberately keep x=0..width: only the vertical bounds are cropped.
        if bottom - top >= 12:
            parts.append(image.crop((0, top, width, bottom)))
        if heading_top is not None:
            break
    return parts


def crop_answer_parts(
    rendered_pages: dict[int, Path],
    start: tuple[int, int, int],
    next_question: tuple[int, int, int] | None,
    next_section: tuple[int, int, int] | None,
) -> list[Image.Image]:
    """Crop one answer using only same-section boundaries.

    A section transition on the next page is not automatically a continuation:
    the next page may simply start the next section. We include that page only
    when there is visible ink before the next section's first answer.
    """
    page_number, start_top, _ = start
    boundary = next_question or next_section
    boundary_is_section = next_question is None and next_section is not None
    end_page = page_number
    if boundary and boundary[0] > page_number:
        next_image = Image.open(rendered_pages[boundary[0]]).convert("RGB")
        next_top, _ = dark_row_bounds(next_image)
        if next_top + 30 < boundary[1]:
            end_page = boundary[0]

    parts: list[Image.Image] = []
    for page in range(page_number, end_page + 1):
        image = Image.open(rendered_pages[page]).convert("RGB")
        width, height = image.size
        top = ink_top_near(image, start_top) - 15 if page == page_number else dark_row_bounds(image)[0]
        if boundary and page == boundary[0]:
            boundary_top = ink_top_near(image, boundary[1])
            if boundary_is_section:
                bottom = content_bottom(image, limit=boundary_top, drop_heading=True)
            else:
                bottom = boundary_top - 15
        else:
            bottom = content_bottom(image, drop_heading=boundary_is_section)
        top = max(0, min(height - 1, top))
        bottom = max(top + 2, min(height, bottom))
        if bottom - top >= 12:
            # Deliberately keep x=0..width: only the vertical bounds are cropped.
            parts.append(image.crop((0, top, width, bottom)))
    return parts


def write_parts(parts: list[Image.Image], folder: Path, prefix: str) -> list[Path]:
    output: list[Path] = []
    for index, image in enumerate(parts, 1):
        path = folder / f"{prefix}.{index}.png"
        image.save(path, optimize=True)
        output.append(path)
    return output


def asset_keys(question_id: str, kind: str, paths: list[Path]) -> list[str]:
    return [f"{question_id}/{kind}/{index}-{path.name}" for index, path in enumerate(paths, 1)]


def run(dry_run: bool, replace: bool) -> None:
    if not QUESTION_PDF.exists():
        raise RuntimeError(f"找不到题目 PDF：{QUESTION_PDF}")
    if not dry_run and DESTINATION.exists() and not replace:
        raise RuntimeError(f"目标题库已存在，未覆盖：{DESTINATION}")
    manifest_before_build = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    has_existing_bank = any(
        bank.get("id") == BANK_ID or bank.get("name") == BANK_NAME
        for bank in manifest_before_build["banks"]
    )
    if not dry_run and has_existing_bank and not replace:
        raise RuntimeError("清单中已存在 Kira线代强化，未重复写入")

    if TMP_ROOT.exists():
        shutil.rmtree(TMP_ROOT)
    main_rendered = render_pdf(QUESTION_PDF, TMP_ROOT / "questions")
    with pdfplumber.open(QUESTION_PDF) as question_pdf:
        vector_symbol_templates = make_vector_symbol_templates(main_rendered, list(question_pdf.pages))
    repaired_question_symbols = repair_broken_vector_symbols(QUESTION_PDF, main_rendered, vector_symbol_templates)
    main_starts_by_page = main_question_starts()
    main_starts_by_chapter = {chapter.code: chapter_starts(main_starts_by_page, chapter) for chapter in CHAPTERS}

    answer_rendered: dict[int, dict[int, Path]] = {}
    answer_starts_by_chapter: dict[int, list[tuple[int, int, int]]] = {}
    answer_sections_by_chapter: dict[int, list[list[tuple[int, int, int]]]] = {}
    for chapter in CHAPTERS:
        if chapter.code not in ANSWER_FILES:
            continue
        answer_pdf = ANSWER_ROOT / ANSWER_FILES[chapter.code]
        rendered = render_pdf(answer_pdf, TMP_ROOT / f"answers-{chapter.code:02d}")
        answer_rendered[chapter.code] = rendered
        answer_starts_by_chapter[chapter.code] = answer_starts(answer_pdf, rendered, chapter)
        repair_broken_vector_symbols(answer_pdf, rendered, vector_symbol_templates)
        answer_counts = ANSWER_SECTION_COUNTS.get(chapter.code, tuple(section.count for section in chapter.sections))
        answer_sections: list[list[tuple[int, int, int]]] = []
        cursor = 0
        for count in answer_counts:
            answer_sections.append(answer_starts_by_chapter[chapter.code][cursor : cursor + count])
            cursor += count
        answer_sections_by_chapter[chapter.code] = answer_sections

    print("章节题数：")
    for chapter in CHAPTERS:
        counts = ", ".join(f"{section.name}{section.count}" for section in chapter.sections)
        answer_note = "，无答案 PDF" if chapter.code not in ANSWER_FILES else ""
        print(f"  第{chapter.code}讲 {chapter.name}：{counts}{answer_note}")
    if dry_run:
        return

    # Build into a staging directory first. This lets --replace keep the old
    # generated bank recoverable until all new pages and manifest data are ready.
    destination = TMP_ROOT / "output"
    destination.mkdir(parents=True)
    bank = {
        "id": BANK_ID,
        "name": BANK_NAME,
        "description": "Kira·27考研数学线性代数强化习题",
        "source": "local",
        "subject": "math",
        "chapters": [],
    }

    for chapter in CHAPTERS:
        chapter_id = f"{BANK_ID}-chapter-{chapter.code:02d}"
        chapter_record = {"id": chapter_id, "name": f"{chapter.code:02d} {chapter.name}", "sections": []}
        main_starts = main_starts_by_chapter[chapter.code]
        answer_sections = answer_sections_by_chapter.get(chapter.code, [])
        main_cursor = 0
        for section in chapter.sections:
            section_id = f"{chapter_id}-section-{section.code}"
            section_folder = destination / f"{chapter.code:02d} {chapter.name} {section.code:02d}-{section.name}"
            section_folder.mkdir()
            questions = []
            section_answer_starts = answer_sections[section.code - 1] if section.code <= len(answer_sections) else []
            for number in range(1, section.count + 1):
                question_id = f"{BANK_ID}-{chapter.code:02d}-{section.code}-{number:02d}"
                main_parts = crop_question_parts(main_rendered, main_starts, main_cursor, stop_at_gray_heading=True)
                question_paths = write_parts(main_parts, section_folder, f"Q-{chapter.code:02d}-{section.code}-{number:02d}")
                main_cursor += 1

                answer_paths: list[Path] = []
                if number <= len(section_answer_starts):
                    answer_start = section_answer_starts[number - 1]
                    next_question = section_answer_starts[number] if number < len(section_answer_starts) else None
                    next_section = (
                        answer_sections[section.code][0]
                        if section.code < len(answer_sections) and answer_sections[section.code]
                        else None
                    )
                    answer_parts = crop_answer_parts(
                        answer_rendered[chapter.code],
                        answer_start,
                        next_question,
                        next_section,
                    )
                    answer_paths = write_parts(answer_parts, section_folder, f"A-{chapter.code:02d}-{section.code}-{number:02d}")

                has_answer = bool(answer_paths)
                questions.append({
                    "id": question_id,
                    "number": number,
                    "type": "图片题",
                    "text": "",
                    "answer": "见答案图片" if has_answer else "暂无答案解析",
                    "analysis": "暂无文字解析" if has_answer else "当前题库未提供对应答案解析",
                    "imageKeys": asset_keys(question_id, "question", question_paths),
                    **({"answerImageKeys": asset_keys(question_id, "answer", answer_paths)} if has_answer else {}),
                })
            chapter_record["sections"].append({"id": section_id, "name": section.name, "questions": questions})
        bank["chapters"].append(chapter_record)

    manifest = manifest_before_build
    if replace:
        manifest["banks"] = [
            item for item in manifest["banks"]
            if item.get("id") != BANK_ID and item.get("name") != BANK_NAME
        ]
    manifest["banks"].append(bank)
    manifest.setdefault("folders", {})[BANK_ID] = BANK_FOLDER.as_posix()
    manifest["updatedAt"] = datetime.now(timezone.utc).isoformat()
    backup = Path("/private/tmp/default-question-bank-manifest-before-kira-strengthened.json")
    shutil.copy2(MANIFEST_PATH, backup)
    destination_backup: Path | None = None
    if DESTINATION.exists():
        destination_backup = Path("/private/tmp/kira-linear-strengthened-before-rebuild")
        if destination_backup.exists():
            raise RuntimeError(f"旧题库备份已存在，未覆盖：{destination_backup}")
        shutil.move(str(DESTINATION), str(destination_backup))
    shutil.move(str(destination), str(DESTINATION))
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    question_count = sum(section.count for chapter in CHAPTERS for section in chapter.sections)
    image_count = sum(1 for path in DESTINATION.rglob("*.png"))
    result = {"bank": BANK_NAME, "questions": question_count, "images": image_count, "backup": str(backup)}
    if destination_backup:
        result["old_output_backup"] = str(destination_backup)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        run("--dry-run" in sys.argv, "--replace" in sys.argv)
    except Exception as error:
        print(f"构建失败：{error}", file=sys.stderr)
        raise SystemExit(1)
