import json
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / '数学真题题库-可访问数据.json'
MANIFEST_PATH = ROOT / '默认题库' / '题库数据.json'
BANK_ID = 'default-1784554026524-19'
WORKSPACE_FOLDER = '数学/真题/数学二真题'


def local_url(relative_path: str) -> str:
    return '/api/default-workspace/file?path=' + quote(relative_path, safe='')


def build_bank(catalog: dict) -> dict:
    chapters = []
    for paper in catalog['papers']:
        year = int(paper['year'])
        questions = []
        for item in paper['questions']:
            number = int(item['number'])
            question_path = f'{WORKSPACE_FOLDER}/题目/{year}/Q{number:02d}.png'
            analysis_path = f'{WORKSPACE_FOLDER}/解析/{year}/A{number:02d}.png'
            question_file = ROOT / '默认题库' / question_path
            analysis_file = ROOT / '默认题库' / analysis_path
            question = {
                'id': f'math-exams-2-{year}-{number:02d}',
                'number': number,
                'type': item['type'],
                'text': '' if question_file.exists() else '题目图片暂未收录',
                'answer': '见解析图片',
                'analysis': '原版解析图片',
                'score': item['score'],
                'keyPoint': item['keyPoint'],
            }
            if question_file.exists():
                question['imageUrl'] = local_url(question_path)
            if analysis_file.exists():
                question['answerImageUrl'] = local_url(analysis_path)
            else:
                raise FileNotFoundError(analysis_file)
            questions.append(question)
        chapters.append({
            'id': f'math-exams-2-{year}',
            'name': f'{year}年真题',
            'sections': [{
                'id': f'math-exams-2-{year}-paper',
                'name': '整卷',
                'questions': questions,
            }],
        })
    return {
        'id': BANK_ID,
        'name': '数学二真题',
        'description': '2009—2026年考研数学二真题（题目图、解析图、考点、题型与分值）',
        'subject': 'math',
        'workspaceFolder': WORKSPACE_FOLDER,
        'source': 'local',
        'chapters': chapters,
    }


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    manifest_text = MANIFEST_PATH.read_text(encoding='utf-8')
    manifest = json.loads(manifest_text)
    bank = build_bank(catalog)
    for index, existing in enumerate(manifest['banks']):
        if existing.get('id') == BANK_ID:
            manifest['banks'][index] = bank
            break
    else:
        manifest['banks'].append(bank)
    manifest.setdefault('folders', {})[BANK_ID] = WORKSPACE_FOLDER
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    total = sum(len(paper['questions']) for paper in catalog['papers'])
    missing_question_images = sum(
        not (ROOT / '默认题库' / WORKSPACE_FOLDER / '题目' / str(paper['year']) / f"Q{int(item['number']):02d}.png").exists()
        for paper in catalog['papers'] for item in paper['questions']
    )
    print(json.dumps({'papers': len(catalog['papers']), 'questions': total, 'missingQuestionImages': missing_question_images}, ensure_ascii=False))


if __name__ == '__main__':
    main()
