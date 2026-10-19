#!/usr/bin/env python3
"""Explicit source allowlist. Runtime profiles and signing materials never ship."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
DIRS=('desktop','mobile','scripts','tests','docs','third_party','.github')
ROOT_FILES=('README.md','LICENSE','SECURITY.md','VERSION','WORKLOG.md','CHANGELOG.md','CONTRIBUTING.md','AGENTS.md','package.json','package-lock.json','.gitignore','.gitattributes')
SKIP={'.local','node_modules','build','dist','.git','__pycache__','.gradle','DerivedData','xcuserdata','project.xcworkspace'}
BINARY={'.png','.ico','.icns','.gif'}
FORBIDDEN={'.pem','.pk8','.key','.jks','.keystore','.p12','.asar','.exe','.apk','.zip','.pyc','.p8','.pfx','.mobileprovision','.provisionprofile','.xcuserstate','.ipa'}
RUNTIME={'schedule.json','schedule.previous.json','schedule-sync.json','sync-state.json','sync-config.json','window-preferences.json','lotus-preferences.json','text-import-drafts.json','server-info.json','community-bundle.json'}
def source_files(root=ROOT):
    files=[root/name for name in ROOT_FILES if (root/name).is_file()]
    for folder in DIRS:
        base=root/folder
        if base.exists():files.extend(p for p in base.rglob('*') if p.is_file() and not any(x in SKIP for x in p.relative_to(root).parts))
    return sorted(files)
def audit(root=ROOT):
    files=source_files(root)
    for name in ['desktop/main.cjs','desktop/renderer/seed.js','mobile/web/seed.js','mobile/android/src/org/banke/community/mobile/MainActivity.java','package-lock.json','LICENSE']:
        if not (root/name).is_file():raise ValueError('Missing public source: '+name)
    for p in files:
        rel=p.relative_to(root)
        if p.is_symlink() or p.suffix.lower() in FORBIDDEN or p.name in RUNTIME:raise ValueError('Forbidden source path: '+str(rel))
        if p.suffix.lower() in BINARY:continue
        text=p.read_text('utf-8-sig')
        if re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE'+r' KEY-----',text):raise ValueError('Private key in '+str(rel))
        if re.search(r'gh[pousr]_[A-Za-z0-9]{30,}',text):raise ValueError('Credential in '+str(rel))
    return files
if __name__=='__main__':print('Public source audit passed:',len(audit()),'explicitly selected files')
