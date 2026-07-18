#!/usr/bin/env python3
"""Audit English per-question PDF crops against their stored question stems."""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image


def words(text: str) -> list[str]:
    text = re.sub(r"^\s*\d{1,2}\s*[.．、]?\s*", "", text.lower())
    return re.findall(r"[a-z]+", text)


def ordered_overlap(needle: list[str], haystack: list[str]) -> int:
    cursor = 0
    for token in haystack:
        if cursor < len(needle) and token == needle[cursor]:
            cursor += 1
    return cursor


def resolve_asset(default_root: Path, url: str) -> Path:
    relative = parse_qs(urlparse(url).query).get("path", [""])[0]
    return default_root / relative


def number_set(specification: str) -> set[int]:
    output: set[int] = set()
    for part in specification.split(","):
        if "-" in part:
            first, last = map(int, part.split("-", 1))
            output.update(range(first, last + 1))
        else:
            output.add(int(part))
    return output


def inspect(item: tuple[int, int, str, str, Path]) -> dict[str, object]:
    year, number, stem, next_stem, path = item
    if not path.exists():
        return {"year": year, "number": number, "status": "missing", "path": str(path)}
    image = Image.open(path).convert("RGB")
    # The repaired image begins with the source paragraph and ends with the
    # question-specific explanation. OCR the lower portion so the two-column
    # paragraph panel does not dominate Tesseract's page segmentation.
    image = image.crop((0, int(image.height * 0.38), image.width, image.height))
    stream = io.BytesIO()
    image.save(stream, "PNG")
    result = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", "eng", "--psm", "11"],
        input=stream.getvalue(),
        capture_output=True,
        check=True,
    )
    expected = words(stem)[:8]
    recognized = words(result.stdout.decode("utf-8", errors="ignore"))
    overlap = ordered_overlap(expected, recognized)
    score = overlap / max(1, len(expected))
    following = words(next_stem)[:8]
    following_score = ordered_overlap(following, recognized) / max(1, len(following)) if following else 0.0
    return {
        "year": year,
        "number": number,
        "status": "ok" if score >= 0.5 and following_score < 0.75 else "review",
        "score": round(score, 3),
        "followingScore": round(following_score, 3),
        "expected": " ".join(expected),
        "recognized": " ".join(recognized[:40]),
        "width": image.width,
        "height": image.height,
        "path": str(path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("default_root", type=Path, nargs="?", default=Path("默认题库"))
    parser.add_argument("--years", default="2005-2024")
    parser.add_argument("--questions", default="21-40,46-50")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--report", type=Path, default=Path("tmp/pdfs/english-crop-audit.json"))
    args = parser.parse_args()

    first, last = map(int, args.years.split("-", 1))
    selected_questions = number_set(args.questions)
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    bank = next(bank for bank in payload["banks"] if bank["id"] == "english-exams")
    items: list[tuple[int, int, str, str, Path]] = []
    for chapter in bank["chapters"]:
        year = int(chapter["id"].rsplit("-", 1)[1])
        if not first <= year <= last:
            continue
        chapter_questions = {
            int(question["number"]): question
            for section in chapter["sections"]
            for question in section["questions"]
        }
        for section in chapter["sections"]:
            for question in section["questions"]:
                number = int(question["number"])
                if number not in selected_questions:
                    continue
                url = question.get("answerImageUrl")
                if url:
                    next_stem = chapter_questions.get(number + 1, {}).get("text", "")
                    items.append((year, number, question.get("text", ""), next_stem, resolve_asset(args.default_root, url)))

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        results = list(executor.map(inspect, items))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    review = [result for result in results if result["status"] != "ok"]
    print(json.dumps({"checked": len(results), "review": len(review)}, ensure_ascii=False))
    for result in review:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
