#!/usr/bin/env python3
"""Native Xcode builds only. Never creates an unsigned IPA for end users."""
from pathlib import Path
import argparse,json,os,plistlib,shutil,subprocess,sys,tempfile,time
ROOT=Path(__file__).resolve().parents[1];PROJECT=ROOT/'mobile/ios/BankeCommunity.xcodeproj'
def command(args,log=None):
    if log:
        with log.open('w',encoding='utf-8') as out:p=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,text=True)
        if p.returncode:
            lines=log.read_text('utf-8',errors='replace').splitlines();errors=[x for x in lines if 'error:' in x.lower() or 'failed' in x.lower()]
            print('\n'.join((errors or lines[-30:])[-25:]));raise RuntimeError('Native Xcode operation failed; full log stays local')
        return ''
    return subprocess.check_output(args,cwd=ROOT,text=True).strip()
def main():
    p=argparse.ArgumentParser();p.add_argument('--simulator',action='store_true');p.add_argument('--device',action='store_true');p.add_argument('--test',action='store_true');a=p.parse_args()
    if sys.platform!='darwin':raise SystemExit('Use native macOS with Xcode; Windows cannot build or validate this target.')
    if not(a.simulator or a.device or a.test):p.error('Choose --simulator, --device, or --test')
    local=ROOT/'.local';local.mkdir(exist_ok=True);(ROOT/'build').mkdir(exist_ok=True)
    derived=Path(tempfile.mkdtemp(prefix='ios-derived-',dir=ROOT/'build'))
    runtime=local/'apple-test-config.json'
    if not a.test:runtime.write_text('{}\n',encoding='utf-8')
    base=['xcodebuild','-project',str(PROJECT),'-scheme','BankeCommunity','-derivedDataPath',str(derived)]
    if a.device:
        command(base+['-configuration','Release','-sdk','iphoneos','-destination','generic/platform=iOS','CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','build'],local/'ios-device-build.log')
        app=derived/'Build/Products/Release-iphoneos/BankeCommunity.app';info=plistlib.loads((app/'Info.plist').read_bytes());assert info['CFBundleIdentifier']=='org.banke.community.ios'
        assert (app/'web/seed.js').read_bytes()==(ROOT/'mobile/web/seed.js').read_bytes()
        print('Unsigned device target compiled from source; no installable IPA produced',flush=True)
    if a.simulator or a.test:
        command(base+['-configuration','Debug','-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','CODE_SIGNING_ALLOWED=NO','build'],local/'ios-simulator-build.log')
        print('Native iOS Simulator target built',flush=True)
    if a.test:
        sdk=tuple(map(int,command(['xcrun','--sdk','iphonesimulator','--show-sdk-version']).split('.')))
        runtimes=json.loads(command(['xcrun','simctl','list','runtimes','-j']))['runtimes']
        candidates=[r for r in runtimes if r.get('isAvailable') and '.iOS-' in r['identifier'] and int(r['version'].split('.')[0])<=sdk[0]]
        if not candidates:raise RuntimeError('No matching installed iOS Simulator runtime; no tests claimed')
        selected=max(candidates,key=lambda x:tuple(map(int,x['version'].split('.'))))
        types=json.loads(command(['xcrun','simctl','list','devicetypes','-j']))['devicetypes']
        version=[int(x) for x in selected['version'].split('.')];version+=(3-len(version))*[0];packed=(version[0]<<16)+(version[1]<<8)+version[2]
        compatible=[t for t in types if t['name'].startswith('iPhone') and t.get('minRuntimeVersion',0)<=packed<=t.get('maxRuntimeVersion',0xFFFFFFFF)]
        available=json.loads(command(['xcrun','simctl','list','devices','available','-j']))['devices'].get(selected['identifier'],[])
        configured={d.get('deviceTypeIdentifier') for d in available if d.get('isAvailable')}
        known=[t for t in compatible if t['identifier'] in configured]
        if not (known or compatible):raise RuntimeError('No compatible iPhone type for the selected runtime')
        device=max(known or compatible,key=lambda t:(t.get('minRuntimeVersion',0),t['name']))
        udid=command(['xcrun','simctl','create','BankeCommunitySmoke-'+str(int(time.time())),device['identifier'],selected['identifier']]);(local/'ios-owned-simulator.txt').write_text(udid,encoding='utf-8')
        ready=local/'apple-sync-ready.json'
        if ready.exists():ready.unlink()
        fixtureLog=(local/'apple-sync-fixture.log').open('w',encoding='utf-8');fixture=subprocess.Popen(['node','scripts/apple-sync-fixture.cjs'],cwd=ROOT,stdout=fixtureLog,stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if ready.exists():break
                if fixture.poll() is not None:raise RuntimeError('Controlled sync fixture failed')
                time.sleep(.1)
            if not ready.exists():raise RuntimeError('Controlled sync fixture never became ready')
            command(['xcrun','simctl','boot',udid]);command(['xcrun','simctl','bootstatus',udid,'-b'],local/'ios-simulator-boot.log')
            result=local/('ios-smoke-'+str(int(time.time()))+'.xcresult')
            command(base+['-configuration','Debug','-sdk','iphonesimulator','-destination','platform=iOS Simulator,id='+udid,'-parallel-testing-enabled','NO','-maximum-concurrent-test-simulator-destinations','1','-resultBundlePath',str(result),'CODE_SIGNING_ALLOWED=NO','test'],local/'ios-test.log')
            container=Path(command(['xcrun','simctl','get_app_container',udid,'org.banke.community.ios','data']))
            proof=container/'Documents/AppleSmokeProof';dest=local/'apple-evidence/ios';dest.mkdir(parents=True,exist_ok=True)
            for name in ['ios-results.json','ios-initial-blank.png','ios-offline-saved.png']:
                if not (proof/name).is_file():raise RuntimeError('Missing actual simulator evidence: '+name)
                shutil.copy2(proof/name,dest/name)
            facts=json.loads((dest/'ios-results.json').read_text('utf-8'));assert facts['actualEncryptedDesktopRoundtrip']
            summary=json.loads((dest/'sync-summary.json').read_text('utf-8'));assert summary['pairedDevices']==1 and summary['phoneEventArrived'] and summary['desktopRenameWritten']
            print(json.dumps(facts,indent=2),flush=True)
        finally:
            if fixture.poll() is None:fixture.terminate();fixture.wait(timeout=15)
            fixtureLog.close();subprocess.run(['xcrun','simctl','shutdown',udid],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if __name__=='__main__':main()
