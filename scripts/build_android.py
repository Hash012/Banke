#!/usr/bin/env python3
"""Build community Android from Java + the public mobile UI using official SDK tools.
Signing identities stay outside the source archive. Never silently rotate a key.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,os,shutil,subprocess,sys,tempfile,zipfile
ROOT=Path(__file__).resolve().parents[1]
def run(args):
    subprocess.run([str(a) for a in args],cwd=ROOT,check=True)
def generate(key,cert):
    if key.exists() or cert.exists():raise SystemExit('Signing files already exist; refusing to overwrite them')
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes,serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID
    private=rsa.generate_private_key(public_exponent=65537,key_size=3072)
    now=datetime.datetime.now(datetime.timezone.utc)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Banke Community Android')])
    public=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(private.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(days=1)).not_valid_after(now+datetime.timedelta(days=365*20)).sign(private,hashes.SHA256())
    key.parent.mkdir(parents=True,exist_ok=True);cert.parent.mkdir(parents=True,exist_ok=True)
    with key.open('xb') as f:f.write(private.private_bytes(serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    with cert.open('xb') as f:f.write(public.public_bytes(serialization.Encoding.PEM))
    os.chmod(key,0o600)
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--sdk',type=Path,default=Path(os.getenv('ANDROID_HOME') or os.getenv('ANDROID_SDK_ROOT') or ROOT/'.local/android-sdk'))
    p.add_argument('--key',type=Path,required=True);p.add_argument('--cert',type=Path,required=True)
    p.add_argument('--generate-key',action='store_true');p.add_argument('--out',type=Path)
    a=p.parse_args();sdk=a.sdk.resolve();tools=sdk/'build-tools/35.0.0';android=sdk/'platforms/android-35/android.jar';suffix='.exe' if os.name=='nt' else ''
    if a.out is None:
        import xml.etree.ElementTree as ET
        version=ET.parse(ROOT/'mobile/android/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
        a.out=ROOT/'dist'/f'Banke-Community-Android-{version}.apk'
    for f in [android,tools/('aapt2'+suffix),tools/('zipalign'+suffix),tools/'lib/d8.jar',tools/'lib/apksigner.jar']:
        if not f.is_file():raise SystemExit('Missing official Android SDK file: '+str(f))
    if a.generate_key:generate(a.key,a.cert)
    if not a.key.is_file() or not a.cert.is_file():raise SystemExit('A stable PKCS8 DER key and certificate are required; see docs/BUILD.md')
    (ROOT/'build').mkdir(exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='android-',dir=ROOT/'build'))
    classes=work/'classes';classes.mkdir(exist_ok=True);dex=work/'dex';dex.mkdir(exist_ok=True)
    sources=sorted((ROOT/'mobile/android/src').rglob('*.java'))
    run(['javac','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',android,'-d',classes,*sources])
    jar=work/'classes.jar';run(['jar','cf',jar,'-C',classes,'.'])
    run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--min-api','26','--lib',android,'--output',dex,jar])
    resources=work/'compiled.zip';run([tools/('aapt2'+suffix),'compile','--dir',ROOT/'mobile/android/res','-o',resources])
    unsigned=work/'unsigned.apk'
    run([tools/('aapt2'+suffix),'link','-I',android,'--manifest',ROOT/'mobile/android/AndroidManifest.xml','--min-sdk-version','26','--target-sdk-version','34','-o',unsigned,resources])
    with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as z:
        z.write(dex/'classes.dex','classes.dex')
        for f in sorted((ROOT/'mobile/web').rglob('*')):
            if f.is_file():z.write(f,'assets/web/'+f.relative_to(ROOT/'mobile/web').as_posix())
    aligned=work/'aligned.apk';run([tools/('zipalign'+suffix),'-f','-p','4',unsigned,aligned])
    a.out.parent.mkdir(parents=True,exist_ok=True)
    run(['java','-jar',tools/'lib/apksigner.jar','sign','--key',a.key,'--cert',a.cert,'--v1-signing-enabled','false','--v2-signing-enabled','true','--out',a.out,aligned])
    run(['java','-jar',tools/'lib/apksigner.jar','verify','--verbose','--print-certs',a.out])
    run([tools/('aapt'+suffix),'dump','badging',a.out])
    with zipfile.ZipFile(a.out) as z:
        assert z.testzip() is None
        for f in (ROOT/'mobile/web').rglob('*'):
            if f.is_file():assert z.read('assets/web/'+f.relative_to(ROOT/'mobile/web').as_posix())==f.read_bytes()
    print(json.dumps({'apk':a.out.name,'sha256':hashlib.sha256(a.out.read_bytes()).hexdigest(),'sourceAssetsMatch':True,'officialApksignerPassed':True},indent=2))
if __name__=='__main__':main()
