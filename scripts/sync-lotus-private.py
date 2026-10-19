"""Apply only the shared lotus feature delta to the explicitly named private source.

Backups and reports stay in the community workspace .local, never in real data.
The private seed, identity, synchronization protocol and native desktop layer
are deliberately outside the file list.
"""
from pathlib import Path
import argparse, difflib, hashlib, json, subprocess, datetime

ROOT=Path(__file__).resolve().parents[1]
NEW=['lib/lotus-reminders.cjs','lib/lotus-preload.cjs','lib/lotus-window.cjs',
     'renderer/lotus.html','renderer/lotus.css','renderer/lotus.js','renderer/lotus-ui.js','tests/lotus-reminders.test.cjs']
EXISTING=['main.cjs','preload.cjs','renderer/index.html','renderer/styles.css']

def shared_delta(relative, private):
    before=subprocess.check_output(['git','show','HEAD:desktop/'+relative],cwd=ROOT).decode('utf-8').splitlines(keepends=True)
    after=(ROOT/'desktop'/relative).read_text('utf-8').splitlines(keepends=True)
    # Normalize line endings so native Windows checkouts are equivalent.
    before=[s.replace('\r\n','\n') for s in before]
    private=private.replace('\r\n','\n')
    changes=difflib.SequenceMatcher(a=before,b=after,autojunk=False).get_opcodes()
    for tag,i,j,k,l in changes:
        if tag=='equal':continue
        old=''.join(before[i:j]);new=''.join(after[k:l])
        if not old:
            anchor=''.join(before[max(0,i-1):i+1])
            replacement=''.join(before[max(0,i-1):i])+new+''.join(before[i:i+1])
        else:anchor=old;replacement=new
        if private.count(anchor)!=1:
            raise ValueError('Private source diverged; cannot uniquely apply '+relative+' '+str((tag,i,j)))
        private=private.replace(anchor,replacement,1)
    return private.encode('utf-8')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--destination',type=Path,required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    destination=args.destination.resolve()
    expected=Path('D:/Banke-Codex-Handoff/source/banke-repair/app').resolve()
    if destination!=expected:raise ValueError('Only the user-named private development source is allowed')
    changes={}
    for relative in EXISTING:changes[relative]=shared_delta(relative,(destination/relative).read_text('utf-8'))
    for relative in NEW:
        if (destination/relative).exists():raise ValueError('Refuse replacing an existing private feature file: '+relative)
        changes[relative]=(ROOT/'desktop'/relative).read_bytes()
    if args.apply:
        backup=ROOT/'.local'/'lotus-private-source-backup'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S');backup.mkdir(parents=True)
        for relative,data in changes.items():
            target=destination/relative
            if target.exists():
                original=backup/relative;original.parent.mkdir(parents=True,exist_ok=True);original.write_bytes(target.read_bytes())
            target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
        (backup/'changes.json').write_text(json.dumps({k:hashlib.sha256(v).hexdigest() for k,v in changes.items()},indent=2),'utf-8')
    print(json.dumps({'applied':args.apply,'files':list(changes)},indent=2))
if __name__=='__main__':main()
