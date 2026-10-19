"""Scan tracked source and staged files without printing credential values."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET_NAME = r'(?:[A-Z_]*(?:API[_-]?KEY|APP[_-]?SECRET|CLIENT[_-]?SECRET|BOT[_-]?TOKEN|ACCESS[_-]?TOKEN|SECRET[_-]?KEY|PASSWORD|PASSWD|SMTP[_-]?PASS|AUTH[_-]?TOKEN)[A-Z_]*)'
RULES = [
    ('private-key', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
    ('provider-token', re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|sk-[A-Za-z0-9_-]{24,})\b')),
    ('zhipu-key', re.compile(r'\b[a-fA-F0-9]{32}\.[A-Za-z0-9]{12,}\b')),
    ('literal-secret', re.compile(r'''["']?('''+SECRET_NAME+r''')["']?\s*(?:=>|:|=|,)\s*["']([^"'\r\n]{8,})["']''', re.I)),
]
SKIP_VALUES = re.compile(r'^(?:your[_ -]|example|placeholder|change[_ -]|replace[_ -]|\$|<|getenv|process\.|os\.|window\.|undefined|null|password[_ -]?hash|api/|https?://)', re.I)
TEXT_EXT = {'.php','.js','.mjs','.json','.html','.md','.txt','.yml','.yaml','.toml','.ini','.xml','.gradle','.properties','.ps1','.py','.sh','.env','.conf'}

def scan_text(text, name):
    findings=[]
    for line_number,line in enumerate(text.splitlines(),1):
        for kind,pattern in RULES:
            for match in pattern.finditer(line):
                if kind=='literal-secret':
                    value=match.group(2)
                    if SKIP_VALUES.search(value) or any(x in value for x in ['(',')','{','}',';','===','==','\\s','[A-Z','[a-z']):
                        continue
                    if name.endswith('.example.php') or '.example.' in name:
                        continue
                    # Browser password fields and descriptive prose are not credentials.
                    if '<input' in line or 'type=' in line or value.lower() in ('password','api_key','app_secret','client_secret','authorization','application/json','content-type'):
                        continue
                findings.append({'file':name,'line':line_number,'rule':kind,'value':'[REDACTED]'})
    return findings

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--staged',action='store_true');parser.add_argument('--json',action='store_true');args=parser.parse_args()
    names=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=ACMR','-z'] if args.staged else ['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
    findings=[]
    for name in names:
        if not name or Path(name).suffix.lower() not in TEXT_EXT or name=='scripts/security-scan.py':continue
        try:
            data=subprocess.check_output(['git','show',':'+name],cwd=ROOT,stderr=subprocess.DEVNULL) if args.staged else (ROOT/name).read_bytes()
            if len(data)>5_000_000:continue
            findings.extend(scan_text(data.decode('utf-8',errors='replace'),name))
        except (OSError,subprocess.CalledProcessError):continue
    if args.json:print(json.dumps(findings,ensure_ascii=True,indent=2))
    else:
        for item in findings:print(f"{item['file']}:{item['line']}: {item['rule']} [REDACTED]")
        print(f'{len(findings)} potential credential findings; values are never displayed.')
    return bool(findings)

if __name__=='__main__':raise SystemExit(main())
