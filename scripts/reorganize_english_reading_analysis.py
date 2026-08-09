#!/usr/bin/env python3
"""Split reading analysis into focused question crops and passage composites.

The supplied analysis images are faithful scans from the three source PDFs:
the 2007-2013 basic edition, the 2014-2021 collector's edition, and the
2022-2026 condensed edition.  This script only crops and reorders those scans;
it does not read other per-year analysis PDFs or rewrite explanation text.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
import json
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote

from PIL import Image, ImageChops


READING_GROUPS = [(21, 1), (26, 2), (31, 3), (36, 4)]
SOURCE_BACKED_YEARS = range(2007, 2026)

# Three 2020 scans have no reliable OCR stem boundary.  These boundaries are
# placed immediately before the blue question-analysis heading after visual
# inspection of the supplied scan, so the focused image starts with that
# question's card and its explanation.
MANUAL_TOPS = {
    (2020, 28): 2895,
    (2020, 30): 1635,
    (2020, 36): 2220,
}


def asset_url(year: int, filename: str) -> str:
    folder = f"{year}年考研英语一真题" if year >= 2010 else f"{year}年考研英语真题"
    relative = f"英语/英语一真题/{folder}/资源/{filename}"
    return f"/api/default-workspace/file?path={quote(relative, safe='')}"


def command_path(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    candidates = [
        Path("/opt/homebrew/bin") / name,
        Path("/usr/local/bin") / name,
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    raise RuntimeError(f"Missing required command: {name}")


def normalize_words(value: str) -> list[str]:
    return re.findall(r"[a-z]+", value.lower())


def question_words(question: dict) -> list[str]:
    words = normalize_words(question.get("text", ""))
    return words[:6]


def trim_vertical(image: Image.Image, padding: int = 18) -> Image.Image:
    rgb = image.convert("RGB")
    background = Image.new("RGB", rgb.size, "white")
    difference = ImageChops.difference(rgb, background).convert("L")
    difference = difference.point(lambda value: 255 if value > 12 else 0)
    box = difference.getbbox()
    if not box:
        return rgb
    top = max(0, box[1] - padding)
    bottom = min(rgb.height, box[3] + padding)
    return rgb.crop((0, top, rgb.width, bottom))


def tsv_lines(image: Path, psm: str = "11") -> list[tuple[int, int, str]]:
    completed = subprocess.run(
        [command_path("tesseract"), str(image), "stdout", "-l", "eng", "--psm", psm, "tsv"],
        check=True,
        capture_output=True,
        text=True,
    )
    # Tesseract's TSV writer is intentionally unquoted.  On these scanned
    # pages a recognized tab/newline can therefore make csv.DictReader absorb
    # several physical rows into one text field.  Parse the fixed coordinate
    # columns line-by-line instead.
    rows: list[dict[str, str]] = []
    for raw_line in completed.stdout.splitlines()[1:]:
        fields = raw_line.split("\t")
        if len(fields) < 12:
            continue
        rows.append({
            "page_num": fields[1],
            "block_num": fields[2],
            "par_num": fields[3],
            "line_num": fields[4],
            "left": fields[6],
            "top": fields[7],
            "text": fields[11],
        })
    grouped: dict[tuple[str, str, str, str], list[dict[str, str]]] = {}
    for row in rows:
        text = (row.get("text") or "").strip()
        if text:
            key = (row.get("page_num", "1"), row.get("block_num", ""), row.get("par_num", ""), row.get("line_num", ""))
            grouped.setdefault(key, []).append(row)
    output: list[tuple[int, int, str]] = []
    for words in grouped.values():
        words.sort(key=lambda row: int(row.get("left") or 0))
        line = " ".join((row.get("text") or "").strip() for row in words)
        top = min(int(row.get("top") or 0) for row in words)
        left = min(int(row.get("left") or 0) for row in words)
        output.append((top, left, line))
    return sorted(output)


def sequence_score(line: str, needle: list[str]) -> int:
    haystack = normalize_words(line)
    if not haystack or not needle:
        return 0
    best = 0
    def close(value: str, word: str) -> bool:
        prefix = word[: max(3, min(len(word), 7))]
        threshold = 0.48 if len(word) <= 2 else 0.62
        return value.startswith(prefix) or SequenceMatcher(None, value, word).ratio() >= threshold

    for start, value in enumerate(haystack):
        if not close(value, needle[0]):
            continue
        matched = 1
        cursor = start + 1
        for word in needle[1:]:
            while cursor < len(haystack) and not close(haystack[cursor], word):
                cursor += 1
            if cursor == len(haystack):
                break
            matched += 1
            cursor += 1
        best = max(best, matched)
    return best


def question_top(image: Path, question: dict, minimum_fraction: float = 0.18) -> tuple[int | None, str]:
    with Image.open(image) as opened:
        height = opened.height
    needle = question_words(question)
    for psm in ("11", "3", "6"):
        lines = tsv_lines(image, psm)
        scored = [(sequence_score(line, needle), top, line) for top, _left, line in lines if top >= height * minimum_fraction]
        strong = [item for item in scored if item[0] >= min(4, len(needle))]
        if strong:
            # The overview table repeats every stem.  The detailed explanation is
            # the later occurrence in the composite/crop.
            score = max(item[0] for item in strong)
            candidates = [item for item in strong if item[0] == score]
            selected = max(candidates, key=lambda item: item[1])
            return max(0, selected[1] - 55), f"psm{psm}:stem:{selected[1]}:{selected[2][:100]}"

        number = str(question.get("number", ""))
        numbered = []
        for top, left, line in lines:
            if top < height * minimum_fraction or left > 260:
                continue
            first = re.match(rf"^{re.escape(number)}[.,、)]?\s*$", line.strip())
            inline = re.match(rf"^{re.escape(number)}[.,、)]\s+", line.strip())
            if first or inline:
                numbered.append((top, line))
        if numbered:
            top, line = max(numbered)
            return max(0, top - 55), f"psm{psm}:number:{top}:{line[:100]}"
    if height <= 1200:
        return 0, "short-focused-source"
    return None, "missing"


def crop_from_top(image: Path, top: int) -> Image.Image:
    with Image.open(image) as opened:
        cropped = opened.convert("RGB").crop((0, top, opened.width, opened.height))
    return trim_vertical(cropped)


def stack(images: list[Image.Image], gap: int = 12) -> Image.Image:
    converted = [image.convert("RGB") for image in images if image.height > 0]
    width = max(image.width for image in converted)
    canvas = Image.new("RGB", (width, sum(image.height for image in converted) + gap * (len(converted) - 1)), "white")
    y = 0
    for image in converted:
        canvas.paste(image, (0, y))
        y += image.height + gap
    return canvas


def relative_resource(root: Path, year: int, filename: str) -> Path:
    folder = f"{year}年考研英语一真题" if year >= 2010 else f"{year}年考研英语真题"
    return root / "英语" / "英语一真题" / folder / "资源" / filename


def section_has_reorganized_analysis(chapter: dict, text_index: int, questions: list[dict], resource_dir: Path) -> bool:
    section = next((section for section in chapter["sections"] if f"Text {text_index}" in section.get("name", "")), None)
    if not section or not section.get("passageAnalysisImageUrls"):
        return False
    year = int(chapter["id"].rsplit("-", 1)[1])
    if any((year, int(question["number"])) in MANUAL_TOPS for question in questions):
        return False
    for question in questions:
        url = question.get("answerImageUrl", "")
        if not url.endswith("-focused.webp"):
            return False
    return True


def process_year(chapter: dict, default_root: Path, year: int, report: list[dict[str, object]], write: bool) -> None:
    resource_dir = relative_resource(default_root, year, "placeholder.webp").parent
    for first, text_index in READING_GROUPS:
        questions = [
            question
            for section in chapter["sections"]
            if f"Text {text_index}" in section.get("name", "")
            for question in section["questions"]
        ]
        questions.sort(key=lambda question: int(question["number"]))
        if len(questions) != 5:
            report.append({"year": year, "text": text_index, "status": "skip", "reason": f"expected 5 questions, found {len(questions)}"})
            continue
        if section_has_reorganized_analysis(chapter, text_index, questions, resource_dir):
            continue

        focused_images: list[Image.Image] = []
        starts: list[dict[str, object]] = []
        first_full: Image.Image | None = None
        sources = [(question, resource_dir / f"analysis-{year}-q{int(question['number']):02d}.webp") for question in questions]
        existing = [(question, source_path) for question, source_path in sources if source_path.exists()]
        missing = [(question, source_path) for question, source_path in sources if not source_path.exists()]
        for question, source_path in missing:
            report.append({"year": year, "text": text_index, "question": int(question["number"]), "status": "missing-source", "source": str(source_path)})
        if existing:
            with Image.open(existing[0][1]) as opened:
                first_full = opened.convert("RGB").copy()
        with ThreadPoolExecutor(max_workers=4) as executor:
            detected = list(executor.map(lambda item: (item[0], item[1], question_top(item[1], item[0])), existing))
        for question, source_path, (top, method) in detected:
            number = int(question["number"])
            if (year, number) in MANUAL_TOPS:
                top = MANUAL_TOPS[(year, number)]
                method = f"manual:{top}"
            starts.append({"question": number, "top": top, "method": method, "source": source_path.name})
            if top is not None:
                focused_images.append(crop_from_top(source_path, top))
                if write:
                    focused_name = f"analysis-{year}-q{number:02d}-focused.webp"
                    focused_images[-1].save(resource_dir / focused_name, "WEBP", quality=88, method=6)
                    question["answerImageUrl"] = asset_url(year, focused_name)
        if len(focused_images) != 5 or first_full is None:
            report.append({"year": year, "text": text_index, "status": "incomplete", "starts": starts})
            continue
        if write:
            full_name = f"analysis-{year}-text-{text_index}-full.webp"
            full_image = stack([first_full, *focused_images[1:]])
            full_image.save(resource_dir / full_name, "WEBP", quality=86, method=6)
            for section in chapter["sections"]:
                if f"Text {text_index}" in section.get("name", ""):
                    section["passageAnalysisImageUrls"] = [asset_url(year, full_name)]
        report.append({"year": year, "text": text_index, "status": "ok", "starts": starts})


def process_2025(chapter: dict, default_root: Path, report: list[dict[str, object]], write: bool) -> None:
    resource_dir = relative_resource(default_root, 2025, "placeholder.webp").parent
    for first, text_index in READING_GROUPS:
        section = next((section for section in chapter["sections"] if f"Text {text_index}" in section.get("name", "")), None)
        if section is None:
            report.append({"year": 2025, "text": text_index, "status": "missing-section"})
            continue
        source_path = resource_dir / f"analysis-2025-text-{text_index}.webp"
        questions = sorted(section["questions"], key=lambda question: int(question["number"]))
        lines: list[tuple[int, int, str]] = tsv_lines(source_path)
        positions: list[tuple[dict, int, str]] = []
        with Image.open(source_path) as opened:
            height = opened.height
        for question in questions:
            needle = question_words(question)
            candidates = [(sequence_score(line, needle), top, line) for top, _left, line in lines if top >= height * 0.12]
            strong = [item for item in candidates if item[0] >= min(4, len(needle))]
            if not strong:
                positions.append((question, -1, "missing"))
                continue
            score = max(item[0] for item in strong)
            top, line = max((item[1], item[2]) for item in strong if item[0] == score)
            positions.append((question, max(0, top - 55), f"stem:{top}:{line[:100]}"))
        valid = [(question, top, method) for question, top, method in positions if top >= 0]
        if len(valid) != 5:
            report.append({"year": 2025, "text": text_index, "status": "incomplete", "positions": [(q["number"], top, method) for q, top, method in positions]})
            continue
        if write:
            focused_names: list[str] = []
            for index, (question, top, _method) in enumerate(valid):
                end = valid[index + 1][1] if index + 1 < len(valid) else height
                with Image.open(source_path) as opened:
                    cropped = trim_vertical(opened.convert("RGB").crop((0, top, opened.width, end)))
                name = f"analysis-2025-q{int(question['number']):02d}-focused.webp"
                cropped.save(resource_dir / name, "WEBP", quality=88, method=6)
                question["answerImageUrl"] = asset_url(2025, name)
                focused_names.append(name)
            section["passageAnalysisImageUrls"] = [asset_url(2025, f"analysis-2025-text-{text_index}.webp")]
        report.append({"year": 2025, "text": text_index, "status": "ok", "positions": [(q["number"], top, method) for q, top, method in positions]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--default-root", type=Path, default=Path("数据/默认题库"))
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--years", default="2007-2025")
    args = parser.parse_args()
    start, end = (int(value) for value in args.years.split("-", 1))
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    bank = next(bank for bank in payload["banks"] if bank.get("id") == "english-exams")
    chapters = {int(chapter["id"].rsplit("-", 1)[1]): chapter for chapter in bank["chapters"]}
    report: list[dict[str, object]] = []
    for year in range(start, end + 1):
        chapter = chapters.get(year)
        if chapter is None:
            continue
        if year == 2025:
            process_2025(chapter, args.default_root, report, args.write)
        else:
            process_year(chapter, args.default_root, year, report, args.write)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.write:
        args.manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
