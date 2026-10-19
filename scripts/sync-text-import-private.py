"""Apply only the text import feature to the user-named private desktop source.

Run before committing the feature: HEAD supplies the common pre-feature base.
Backups belong to .local in this workspace, never to the private source/data.
"""
from pathlib import Path
import argparse,datetime,hashlib,json
from importlib.util import spec_from_file_location,module_from_spec
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('lotus_delta',ROOT/'scripts/sync-lotus-private.py');delta=module_from_spec(spec);spec.loader.exec_module(delta)
EXISTING=['main.cjs','preload.cjs','renderer/index.html','renderer/app.js']
NEW=['lib/text-import-drafts.cjs']+['renderer/'+n for n in ['text-import.js','text-import-drafts.js','text-import-ui.js','text-import.css']]
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');args=p.parse_args()
 target=Path('D:/Banke-Codex-Handoff/source/banke-repair/app').resolve()
 changes={n:delta.shared_delta(n,(target/n).read_text('utf-8')) for n in EXISTING}
 for n in NEW:changes[n]=(ROOT/'desktop'/n).read_bytes()
 if args.apply:
  backup=ROOT/'.local/text-import-private-source-backup'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S');backup.mkdir(parents=True)
  for n,data in changes.items():
   dest=target/n
   if dest.exists():old=backup/n;old.parent.mkdir(parents=True,exist_ok=True);old.write_bytes(dest.read_bytes())
   dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  (backup/'changes.json').write_text(json.dumps({n:hashlib.sha256(v).hexdigest() for n,v in changes.items()},indent=2),'utf-8')
 print(json.dumps({'applied':args.apply,'files':list(changes)},indent=2))
if __name__=='__main__':main()
