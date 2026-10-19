#!/usr/bin/env python3
"""Package only public sources. Keep large complete installers in dist/Releases."""
from pathlib import Path
import argparse,hashlib,json,shutil,zipfile
from audit_public import audit,ROOT
STAMP=(2026,10,20,0,0,0)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out',type=Path,default=ROOT/'dist')
    parser.add_argument('--desktop-only',action='store_true',help='Release Windows only; keep the existing Android version and signing identity')
    args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    version=json.loads((ROOT/'package.json').read_text('utf-8'))['version']
    files=audit();archive=out/'Banke-Source.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        sums=[]
        for f in files:
            rel=f.relative_to(ROOT).as_posix();data=f.read_bytes();sums.append(hashlib.sha256(data).hexdigest()+'  '+rel)
            info=zipfile.ZipInfo('banke/'+rel,STAMP);info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=(0o100755 if f.suffix in {'.py','.sh'} else 0o100644)<<16;z.writestr(info,data)
        z.writestr('banke/SOURCE_SHA256SUMS.txt','\n'.join(sums)+'\n')
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    shutil.copy2(archive,ROOT/'Banke-Source.zip')
    apk=out/'Banke-Community-Android-1.3.2.apk'
    if apk.exists():shutil.copy2(apk,ROOT/'Banke-Android.apk')
    names=[f'Banke-Community-Setup-{version}-x64.exe',f'Banke-Community-{version}-Windows-x64.zip','Banke-Source.zip']
    if not args.desktop_only:names.insert(2,'Banke-Community-Android-1.3.2.apk')
    products=[out/n for n in names]
    video=out/'Banke-Community-Demo-1.3.2.mp4'
    if video.is_file() and not args.desktop_only:products.append(video)
    if not all(p.is_file() for p in products):raise SystemExit('A complete release requires all selected actual products')
    rootfiles=[ROOT/'Banke-Android.apk',ROOT/'Banke-Source.zip']
    (ROOT/'SHA256SUMS.txt').write_text(''.join(sha(p)+'  '+p.name+'\n' for p in rootfiles),encoding='utf-8',newline='\n')
    manifest={'version':version,'scope':'windows-desktop' if args.desktop_only else 'windows-and-android','desktopApplicationId':'org.banke.community.desktop','androidApplicationId':'org.banke.community.mobile','androidVersion':'1.3.2','androidUnchanged':args.desktop_only,'defaultEvents':0,'electron':'44.9.0','artifacts':[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in products]}
    (out/'release-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    (out/'SHA256SUMS.txt').write_text(''.join(sha(p)+'  '+p.name+'\n' for p in products+[out/'release-manifest.json']),encoding='utf-8',newline='\n')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
