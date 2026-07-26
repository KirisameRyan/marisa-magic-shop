# =============================================
#  角色 AI 标注脚本
# =============================================

import json
import os
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

ROOT = Path(__file__).parent.parent
DATA = ROOT / 'data'
CHARS_FILE = DATA / 'anilist-characters.json'
TAGS_FILE = DATA / 'waifu-tags.json'
PROMPTS_FILE = DATA / 'tagging-prompts.jsonl'
DB_FILE = DATA / 'waifu-db.json'

def load_tags():
    with open(TAGS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_characters():
    with open(CHARS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def build_system_prompt(taxonomy):
    dims = taxonomy['dimensions']
    lines = ['你是一个专业的二次元角色标签系统。请根据角色信息，为该角色打上标签。',
              '',
              '## 标签维度与可选值：']
    for d in dims:
        tag_list = ', '.join(f"{t['name']}({t['id']})" for t in d['tags'])
        lines.append(f"\n### {d['name']}（必选: {d['name']} 至少1个）" if 'mandatory' in d.get('note','') else f"\n### {d['name']}")
        lines.append(f"可选值: {tag_list}")
    lines.extend(['',
                   '## 标注规则',
                   '1. 从每个维度中选择 0-N 个标签（性格/外表年龄/身份至少1个）',
                   '2. 性格维度可选 level 字段（0-1，表示显著程度）',
                   '3. 标签需严格使用上述 id 值',
                   '4. 不要编造标签 id',
                   '5. 角色信息不足的维度可以留空',
                   '',
                   '## 输出格式',
                   '直接输出纯 JSON（不要 markdown 代码块）：',
                   '{',
                   '  "personality": [{"id":"tsundere","level":0.8}],',
                   '  "age_visual": [{"id":"age_v_teen"}],',
                   '  ...',
                   '}'])
    return '\n'.join(lines)

def build_user_prompt(char):
    return f"""角色名称: {char['name']}
日文名: {char['name_native']}
出处: {char['source_anime']}
类型: {char['source_type']}
简介: {char['description']}
"""

def generate_prompts():
    """生成标注提示词文件（供外部 AI 使用）"""
    taxonomy = load_tags()
    chars = load_characters()
    system = build_system_prompt(taxonomy)

    lines = []
    for i, char in enumerate(chars):
        user = build_user_prompt(char)
        lines.append(json.dumps({
            'index': i,
            'id': char['id'],
            'name': char['name'],
            'system': system,
            'user': user
        }, ensure_ascii=False))
    
    with open(PROMPTS_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    print(f'Generated {len(lines)} prompts -> {PROMPTS_FILE}')


CHUNK = 10

def build_chunk_prompt(taxonomy, chars, start, end):
    dims = taxonomy['dimensions']
    dims_text = []
    for d in dims:
        tag_list = ', '.join(f"{t['name']}({t['id']})" for t in d['tags'])
        dims_text.append(f"{d['name']}: {tag_list}")

    chars_lines = []
    for i, c in enumerate(chars[start:end]):
        chars_lines.append(f"[{start + i + 1}] {c['name']} ({c['name_native']}) — {c['source_anime']}\n   {c['description'][:300]}")

    system = f"""你是二次元角色标签系统。给以下每个角色打标签。
输出格式（每行一个角色，纯 JSON 数组，不要 markdown）：
[
  {{"id":{chars[start]['id']},"personality":[{{"id":"tsundere","level":0.8}}],...}},
  ...
]"""
    user = "## 维度\n" + "\n".join(f"- {d}" for d in dims_text) + "\n\n## 角色\n" + "\n\n".join(chars_lines)
    return system, user


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['prompts', 'tag'], help='prompts:生成提示词文件 / tag:自动标注(需API)')
    p.add_argument('--api', choices=['openai','anthropic'], default='openai')
    p.add_argument('--key', help='API key')
    p.add_argument('--model', default='gpt-4o-mini', help='模型名')
    args = p.parse_args()

    if args.action == 'prompts':
        generate_prompts()
    elif args.action == 'tag':
        if not args.key:
            print('ERROR: 需要 --key 参数提供 API key')
            sys.exit(1)
        auto_tag(args)
    else:
        p.print_help()


if __name__ == '__main__':
    main()
