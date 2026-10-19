#!/usr/bin/env python3
"""Public Apple preview source, with the same complete repository layout."""
from pathlib import Path
import argparse,hashlib,zipfile
from audit_public import ROOT,audit
NAME='Banke-Community-Apple-Source-1.3.2-preview.1.zip'
def package(destination):
    destination.mkdir(parents=True,exist_ok=True);target=destination/NAME;files=audit();stamp=(2026,10,19,0,0,0)
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        sums=[]
        for p in files:
            rel=p.relative_to(ROOT).as_posix();data=p.read_bytes();sums.append(hashlib.sha256(data).hexdigest()+'  '+rel)
            info=zipfile.ZipInfo('banke/'+rel,stamp);info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16;z.writestr(info,data)
        info=zipfile.ZipInfo('banke/SOURCE_SHA256SUMS.txt',stamp);info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,'\n'.join(sums)+'\n')
    with zipfile.ZipFile(target) as z:assert z.testzip() is None
    print('Apple source packaged:',len(files),'public files; signing and runtime data excluded')
    return target
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,default=ROOT/'dist/apple-preview');args=p.parse_args();package(args.out)
