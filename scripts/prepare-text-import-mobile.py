"""Keep the supplied private APK and prepare its updated web assets locally.

This is an asset handoff, not a signed APK or recovered Android Java source.
Private assets and seeds stay ignored. Test copies always use the public seed.
"""
from pathlib import Path
import zipfile,shutil,json
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/'.local/private-mobile';apk=base/'original/BankePlanner-Mobile-1.3.0.apk';web=base/'text-import-assets/web'
web.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(apk) as z:
 for name in ['seed.js','adapter.js']:(web/name).write_bytes(z.read('assets/web/'+name))
# Shared UI and schema are current; preserve the original private seed and adapter.
for source in (ROOT/'mobile/web').iterdir():
 if source.is_file() and source.name not in ['seed.js','adapter.js']:shutil.copyfile(source,web/source.name)
for edition,source in [('community',ROOT/'mobile/web'),('private',web)]:
 test=ROOT/'.local/text-mobile-fixtures'/edition
 shutil.copytree(source,test,dirs_exist_ok=True);shutil.copyfile(ROOT/'mobile/web/seed.js',test/'seed.js')
print(json.dumps({'privateAssets':str(web),'signedUpgrade':False,'testSeeds':'public blank only'},indent=2))
