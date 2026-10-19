#!/usr/bin/env python3
"""Manual CI upload only. Never publishes or modifies existing stable releases."""
from pathlib import Path
import hashlib,json,os,re,shutil,subprocess,sys,zipfile,plistlib
from package_apple_source import ROOT,package
TAG='v1.3.2-apple-preview.1'
REPO=os.environ.get('GITHUB_REPOSITORY','Hash012/Banke')
def gh(*args):
    p=subprocess.run(['gh',*args],cwd=ROOT,capture_output=True,text=True)
    if p.returncode:raise RuntimeError('GitHub CLI operation failed: '+args[0])
    return p.stdout
def api(path):return json.loads(gh('api','repos/'+REPO+path))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def numeric(name):
    value=os.environ.get(name,'')
    if not re.fullmatch(r'[0-9]{1,20}',value):raise RuntimeError('Invalid '+name)
    return value
def main():
    if os.environ.get('APPLE_TAG')!=TAG:raise RuntimeError('This uploader only accepts the explicit Apple preview tag')
    release_id=numeric('APPLE_RELEASE_ID');mac_run=numeric('APPLE_MAC_RUN');ios_run=numeric('APPLE_IOS_RUN')
    release=api('/releases/'+release_id)
    if release['tag_name']!=TAG or not release['draft'] or not release['prerelease']:raise RuntimeError('Only the new Apple preview draft may receive assets')
    head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    ref=api('/git/ref/tags/'+TAG)['object'];target=api('/git/tags/'+ref['sha'])['object']['sha'] if ref['type']=='tag' else ref['sha']
    if target!=head:raise RuntimeError('Checked-out source is not the exact preview tag')
    for run_id in [mac_run,ios_run]:
        if api('/actions/runs/'+run_id)['conclusion']!='success':raise RuntimeError('Source build/smoke run did not pass')
    tested_ios=api('/actions/runs/'+ios_run)['head_sha']
    comparison=api('/compare/'+tested_ios+'...'+head)
    guarded=('mobile/ios/','mobile/web/','scripts/build_ios.py','scripts/apple-sync-fixture.cjs','scripts/generate_ios_project.py')
    if comparison['status'] not in ['identical','ahead'] or comparison.get('total_commits',0)>200 or any(f['filename'].startswith(guarded) for f in comparison.get('files',[])):
        raise RuntimeError('Final iOS application/test source differs from the successful native run')
    jobs=api('/actions/runs/'+mac_run+'/jobs')['jobs'];native=[j for j in jobs if j['name'].startswith('mac (')]
    if len(native)!=2 or any(j['conclusion']!='success' for j in native):raise RuntimeError('Both native Mac architectures must pass')
    for job in native:
        names={s['name']:s['conclusion'] for s in job['steps']}
        for name in ['Verify ad-hoc bundle seal (not Apple Developer ID or notarization)','Run actual packaged app and inspect native window levels']:
            if names.get(name)!='success':raise RuntimeError('Missing native Mac verification')
    inputs=ROOT/'.local/apple-upload-input';inputs.mkdir(parents=True,exist_ok=True)
    gh('run','download',mac_run,'--repo',REPO,'--dir',str(inputs/'mac'))
    gh('run','download',ios_run,'--repo',REPO,'--dir',str(inputs/'ios'))
    output=ROOT/'dist/apple-preview';output.mkdir(parents=True,exist_ok=True);products=[];mac_results=[]
    for arch in ['arm64','x64']:
        facts=list((inputs/'mac').rglob(arch+'/mac-results.json'))
        if len(facts)!=1:raise RuntimeError('Missing Mac runtime evidence: '+arch)
        result=json.loads(facts[0].read_text('utf-8'))
        if not result['packaged'] or not result['blankFirstRun'] or not result['actualUiSave'] or not result['dataSurvivesNormalRestart'] or len(result['cycles'])!=5 or any(not c['actualNativeDesktopLevel'] or not c['returnOrdinary'] for c in result['cycles']):raise RuntimeError('Mac runtime proof did not pass')
        mac_results.append(result)
        for suffix in ['dmg','zip']:
            name='Banke-Community-1.3.2-macOS-'+arch+'-preview.'+suffix
            found=list((inputs/'mac').rglob(name))
            if len(found)!=1:raise RuntimeError('Expected one Mac product: '+name)
            dest=output/name;shutil.copy2(found[0],dest);products.append(dest)
            if suffix=='zip':
                with zipfile.ZipFile(dest) as z:
                    if z.testzip() is not None:raise RuntimeError('Corrupt Mac ZIP')
                    info=plistlib.loads(z.read('Banke Community.app/Contents/Info.plist'))
                    if info['CFBundleIdentifier']!='org.banke.community.desktop':raise RuntimeError('Unexpected application ID')
                    asar=ROOT/'.local'/('apple-'+arch+'.asar');asar.write_bytes(z.read('Banke Community.app/Contents/Resources/app.asar'))
                subprocess.run(['node','scripts/verify_desktop.cjs',str(asar)],cwd=ROOT,check=True)
    iphone=list((inputs/'ios').rglob('ios-results.json'));server=list((inputs/'ios').rglob('sync-summary.json'))
    if len(iphone)!=1 or len(server)!=1:raise RuntimeError('Missing actual iOS simulator proof')
    ios=json.loads(iphone[0].read_text('utf-8'));sync=json.loads(server[0].read_text('utf-8'))
    if not ios['actualEncryptedDesktopRoundtrip'] or not sync['phoneEventArrived'] or not sync['desktopRenameWritten'] or sync['pairedDevices']!=1:raise RuntimeError('Real iOS encrypted roundtrip did not pass')
    products.append(package(output))
    validation={'tag':TAG,'sourceCommit':head,'macRun':int(mac_run),'iosRun':int(ios_run),'mac':mac_results,'ios':ios,'sync':sync,'macSigning':'ad-hoc only; no Apple Developer ID/notarization','iphoneDistribution':'self-signable Xcode source only; no installable IPA','notTested':['physical Mac','Mission Control/physical gestures','Gatekeeper on downloaded app','macOS login startup','Mac native import/print dialogs','physical iPhone','physical local-network permission prompts','TestFlight/App Store']}
    proof=output/'Apple-Preview-Validation.json';proof.write_text(json.dumps(validation,indent=2)+'\n',encoding='utf-8',newline='\n');products.append(proof)
    sums=output/'Apple-SHA256SUMS.txt';sums.write_text(''.join(sha(p)+'  '+p.name+'\n' for p in products),encoding='utf-8',newline='\n');products.append(sums)
    names={p.name for p in products};existing={a['name']:a for a in api('/releases/'+release_id+'/assets?per_page=100')}
    if set(existing)-names:raise RuntimeError('Unexpected asset in target draft')
    for p in products:
        if p.name in existing:
            if existing[p.name].get('digest')!='sha256:'+sha(p):raise RuntimeError('Existing asset differs; refusing to overwrite')
            continue
        gh('release','upload',TAG,str(p),'--repo',REPO)
        print('Uploaded '+p.name,flush=True)
    assets={a['name']:a for a in api('/releases/'+release_id+'/assets?per_page=100')}
    if set(assets)!=names:raise RuntimeError('Asset set incomplete')
    for p in products:
        if assets[p.name]['size']!=p.stat().st_size or assets[p.name].get('digest')!='sha256:'+sha(p):raise RuntimeError('Server asset differs: '+p.name)
    print('Seven Apple assets match server SHA-256; draft remains unpublished',flush=True)
if __name__=='__main__':main()
