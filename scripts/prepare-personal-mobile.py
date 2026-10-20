"""Create the independent personal Android app from maintained public sources.

No old APK, private seed, existing schedule or pairing is read or migrated.
The resulting project stays in .local; signing keys are separate and stable.
"""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
APP_ID='cn.banke.personal.mobile'
def prepare(destination):
    destination=Path(destination).resolve()
    if destination.exists():raise ValueError('Project already exists; preserve edits and reuse its build command')
    destination.mkdir(parents=True)
    for folder in ['android','web']:shutil.copytree(ROOT/'mobile'/folder,destination/folder)
    manifest=destination/'android/AndroidManifest.xml'
    text=manifest.read_text('utf8').replace('org.banke.community.mobile',APP_ID).replace('android:label="Banke Community"','android:label="半刻私有版·新"')
    manifest.write_bytes(text.encode('utf8'))
    old=destination/'android/src/org/banke/community/mobile/MainActivity.java'
    target=destination/'android/src/cn/banke/personal/mobile/MainActivity.java';target.parent.mkdir(parents=True)
    target.write_bytes(old.read_text('utf8').replace('package org.banke.community.mobile;','package '+APP_ID+';').replace('community-bundle.json','personal-bundle.json').encode('utf8'))
    old.unlink()
    html=destination/'web/index.html';text=html.read_text('utf8')
    text=text.replace('<title>半刻 · 周计划</title>','<title>半刻 · 私有版·新</title>')
    text=text.replace('把时间留给重要的事','私有版·新 · 把时间留给重要的事')
    text=text.replace('电脑端打开半刻，在','电脑端打开私有版半刻，在')
    text=text.replace('<nav class="day-strip"','<p class="info-banner">这是独立安装的私有新版。请在“电脑同步”连接私有电脑版获取日程；旧版和旧配对保留。</p>\n      <nav class="day-strip"',1)
    html.write_bytes(text.encode('utf8'))
    files={p.relative_to(destination).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.rglob('*') if p.is_file()}
    (destination/'source-manifest.json').write_text(json.dumps({'applicationId':APP_ID,'version':'1.3.4','emptyInitialSchedule':True,'automaticMigration':False,'files':files},indent=2),'utf8')
    return destination
if __name__=='__main__':
    path=prepare(ROOT/'.local/private-mobile/personal-app/mobile')
    print(json.dumps({'project':str(path),'applicationId':APP_ID,'oldApplicationUntouched':True},indent=2))
