#!/usr/bin/env python3
"""Deterministic public Xcode project; no XcodeGen or signing material needed."""
from pathlib import Path
import hashlib,plistlib,json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];IOS=ROOT/'mobile/ios'
def ident(s):return hashlib.sha256(s.encode()).hexdigest()[:24].upper()
def serialize(value,level=0):
    if isinstance(value,dict):return '{\n'+''.join('\t'*(level+1)+json.dumps(str(k))+' = '+serialize(v,level+1)+';\n' for k,v in value.items())+'\t'*level+'}'
    if isinstance(value,list):return '('+''.join('\n'+'\t'*(level+1)+serialize(x,level+1)+',' for x in value)+'\n'+'\t'*level+')'
    return json.dumps(str(value),ensure_ascii=False)
def generate():
    objects={}
    def obj(keyname,isa,**kw):key=ident(keyname);objects[key]={'isa':isa,**kw};return key
    swift=['Sources/AppDelegate.swift','Sources/BundleStore.swift','Sources/LANTransport.swift','Sources/PlannerViewController.swift']
    resources=[('Sources/bridge.js','sourcecode.javascript'),('../web','folder'),('Assets.xcassets','folder.assetcatalog'),('PrivacyInfo.xcprivacy','text.xml')]
    sourceBuild=[];resourceBuild=[];children=[]
    for filename in swift:
        ref=obj('file:'+filename,'PBXFileReference',lastKnownFileType='sourcecode.swift',path=filename,sourceTree='SOURCE_ROOT');children.append(ref)
        sourceBuild.append(obj('build:'+filename,'PBXBuildFile',fileRef=ref))
    for filename,kind in resources:
        ref=obj('file:'+filename,'PBXFileReference',lastKnownFileType=kind,path=filename,sourceTree='SOURCE_ROOT');children.append(ref)
        resourceBuild.append(obj('build:'+filename,'PBXBuildFile',fileRef=ref))
    testRef=obj('file:Tests/IOSAppSmokeTests.swift','PBXFileReference',lastKnownFileType='sourcecode.swift',path='Tests/IOSAppSmokeTests.swift',sourceTree='SOURCE_ROOT');children.append(testRef)
    configRef=obj('test-runtime','PBXFileReference',lastKnownFileType='text.json',name='apple-test-config.json',path='../../.local/apple-test-config.json',sourceTree='SOURCE_ROOT');children.append(configRef)
    infoRef=obj('info','PBXFileReference',lastKnownFileType='text.plist.xml',path='Info.plist',sourceTree='SOURCE_ROOT');children.append(infoRef)
    appProduct=obj('app-product','PBXFileReference',explicitFileType='wrapper.application',includeInIndex='0',path='BankeCommunity.app',sourceTree='BUILT_PRODUCTS_DIR')
    testProduct=obj('test-product','PBXFileReference',explicitFileType='wrapper.cfbundle',includeInIndex='0',path='BankeCommunityTests.xctest',sourceTree='BUILT_PRODUCTS_DIR')
    products=obj('products','PBXGroup',children=[appProduct,testProduct],name='Products',sourceTree='<group>')
    group=obj('main-group','PBXGroup',children=children+[products],sourceTree='<group>')
    appSources=obj('app-sources','PBXSourcesBuildPhase',buildActionMask='2147483647',files=sourceBuild,runOnlyForDeploymentPostprocessing='0')
    appResources=obj('app-resources','PBXResourcesBuildPhase',buildActionMask='2147483647',files=resourceBuild,runOnlyForDeploymentPostprocessing='0')
    appFrameworks=obj('app-frameworks','PBXFrameworksBuildPhase',buildActionMask='2147483647',files=[],runOnlyForDeploymentPostprocessing='0')
    testSources=obj('test-sources','PBXSourcesBuildPhase',buildActionMask='2147483647',files=[obj('test-source-build','PBXBuildFile',fileRef=testRef)],runOnlyForDeploymentPostprocessing='0')
    testResources=obj('test-resources','PBXResourcesBuildPhase',buildActionMask='2147483647',files=[obj('test-config-build','PBXBuildFile',fileRef=configRef)],runOnlyForDeploymentPostprocessing='0')
    testFrameworks=obj('test-frameworks','PBXFrameworksBuildPhase',buildActionMask='2147483647',files=[],runOnlyForDeploymentPostprocessing='0')
    general={'SDKROOT':'iphoneos','IPHONEOS_DEPLOYMENT_TARGET':'15.0','SWIFT_VERSION':'5.0','CLANG_ENABLE_MODULES':'YES','ENABLE_USER_SCRIPT_SANDBOXING':'YES','CODE_SIGN_STYLE':'Automatic','TARGETED_DEVICE_FAMILY':'1','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator'}
    def configs(name,settings):
        ids=[]
        for variant in ['Debug','Release']:
            values={**settings,'SWIFT_OPTIMIZATION_LEVEL':'-Onone' if variant=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf' if variant=='Debug' else 'dwarf-with-dsym'}
            if variant=='Debug':values.update({'ENABLE_TESTABILITY':'YES','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG'})
            ids.append(obj(name+variant,'XCBuildConfiguration',buildSettings=values,name=variant))
        return obj(name+'-configs','XCConfigurationList',buildConfigurations=ids,defaultConfigurationIsVisible='0',defaultConfigurationName='Release')
    projectConfigs=configs('project',general)
    appConfigs=configs('app',{'PRODUCT_NAME':'BankeCommunity','PRODUCT_BUNDLE_IDENTIFIER':'org.banke.community.ios','INFOPLIST_FILE':'Info.plist','GENERATE_INFOPLIST_FILE':'NO','MARKETING_VERSION':'1.3.2','CURRENT_PROJECT_VERSION':'132','ASSETCATALOG_COMPILER_APPICON_NAME':'AppIcon','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/Frameworks']})
    testConfigs=configs('tests',{'PRODUCT_NAME':'BankeCommunityTests','PRODUCT_BUNDLE_IDENTIFIER':'org.banke.community.ios.tests','GENERATE_INFOPLIST_FILE':'YES','TEST_HOST':'$(BUILT_PRODUCTS_DIR)/BankeCommunity.app/BankeCommunity','BUNDLE_LOADER':'$(TEST_HOST)','FRAMEWORK_SEARCH_PATHS':['$(inherited)','$(PLATFORM_DIR)/Developer/Library/Frameworks'],'LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/Frameworks','@loader_path/Frameworks'],'SKIP_INSTALL':'YES'})
    appTarget=obj('app-target','PBXNativeTarget',buildConfigurationList=appConfigs,buildPhases=[appSources,appFrameworks,appResources],buildRules=[],dependencies=[],name='BankeCommunity',productName='BankeCommunity',productReference=appProduct,productType='com.apple.product-type.application')
    proxy=obj('test-proxy','PBXContainerItemProxy',containerPortal=ident('project'),proxyType='1',remoteGlobalIDString=appTarget,remoteInfo='BankeCommunity')
    dependency=obj('test-dependency','PBXTargetDependency',target=appTarget,targetProxy=proxy)
    testTarget=obj('test-target','PBXNativeTarget',buildConfigurationList=testConfigs,buildPhases=[testSources,testFrameworks,testResources],buildRules=[],dependencies=[dependency],name='BankeCommunityTests',productName='BankeCommunityTests',productReference=testProduct,productType='com.apple.product-type.bundle.unit-test')
    project=obj('project','PBXProject',attributes={'LastUpgradeCheck':'1600','TargetAttributes':{appTarget:{'CreatedOnToolsVersion':'16.0'},testTarget:{'CreatedOnToolsVersion':'16.0','TestTargetID':appTarget}}},buildConfigurationList=projectConfigs,compatibilityVersion='Xcode 14.0',developmentRegion='en',hasScannedForEncodings='0',knownRegions=['en','Base','zh-Hans'],mainGroup=group,productRefGroup=products,projectDirPath='',projectRoot='',targets=[appTarget,testTarget])
    folder=IOS/'BankeCommunity.xcodeproj';folder.mkdir(exist_ok=True)
    (folder/'project.pbxproj').write_text('// !$*UTF8*$!\n'+serialize({'archiveVersion':'1','classes':{},'objectVersion':'56','objects':objects,'rootObject':project})+'\n',encoding='utf-8',newline='\n')
    scheme=ET.Element('Scheme',LastUpgradeVersion='1600',version='1.3')
    action=ET.SubElement(scheme,'BuildAction',parallelizeBuildables='YES',buildImplicitDependencies='YES');entries=ET.SubElement(action,'BuildActionEntries')
    def reference(parent,target,product):ET.SubElement(parent,'BuildableReference',BuildableIdentifier='primary',BlueprintIdentifier=target,BuildableName=product,BlueprintName='BankeCommunity' if target==appTarget else 'BankeCommunityTests',ReferencedContainer='container:BankeCommunity.xcodeproj')
    for target,product,run in [(appTarget,'BankeCommunity.app','YES'),(testTarget,'BankeCommunityTests.xctest','NO')]:
        ref=ET.SubElement(entries,'BuildActionEntry',buildForTesting='YES',buildForRunning=run,buildForProfiling=run,buildForArchiving=run,buildForAnalyzing='YES');reference(ref,target,product)
    test=ET.SubElement(scheme,'TestAction',buildConfiguration='Debug',selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB',selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB',shouldUseLaunchSchemeArgsEnv='YES')
    testables=ET.SubElement(test,'Testables');testable=ET.SubElement(testables,'TestableReference',skipped='NO');reference(testable,testTarget,'BankeCommunityTests.xctest')
    launch=ET.SubElement(scheme,'LaunchAction',buildConfiguration='Debug',selectedDebuggerIdentifier='Xcode.DebuggerFoundation.Debugger.LLDB',selectedLauncherIdentifier='Xcode.IDEFoundation.Launcher.LLDB',launchStyle='0',useCustomWorkingDirectory='NO',ignoresPersistentStateOnLaunch='NO',debugDocumentVersioning='YES',debugServiceExtension='internal',allowLocationSimulation='YES');reference(ET.SubElement(launch,'BuildableProductRunnable',runnableDebuggingMode='0'),appTarget,'BankeCommunity.app')
    ET.SubElement(scheme,'AnalyzeAction',buildConfiguration='Debug');ET.SubElement(scheme,'ArchiveAction',buildConfiguration='Release',revealArchiveInOrganizer='YES')
    schemes=folder/'xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True);ET.indent(scheme)
    ET.ElementTree(scheme).write(schemes/'BankeCommunity.xcscheme',encoding='utf-8',xml_declaration=True)
    info={'CFBundleDevelopmentRegion':'$(DEVELOPMENT_LANGUAGE)','CFBundleDisplayName':'Banke Community','CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)','CFBundleInfoDictionaryVersion':'6.0','CFBundleName':'$(PRODUCT_NAME)','CFBundlePackageType':'APPL','CFBundleShortVersionString':'$(MARKETING_VERSION)','CFBundleVersion':'$(CURRENT_PROJECT_VERSION)','LSRequiresIPhoneOS':True,'NSLocalNetworkUsageDescription':'半刻需要连接同一 Wi-Fi 内已配对的电脑，加密同步日程。离线编辑不需要此权限。','NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},'UIApplicationSceneManifest':{'UIApplicationSupportsMultipleScenes':False,'UISceneConfigurations':{'UIWindowSceneSessionRoleApplication':[{'UISceneConfigurationName':'Default','UISceneDelegateClassName':'$(PRODUCT_MODULE_NAME).SceneDelegate'}]}},'UILaunchScreen':{},'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight']}
    with (IOS/'Info.plist').open('wb') as f:plistlib.dump(info,f,sort_keys=False)
    print('Generated deterministic Xcode project and shared scheme')
if __name__=='__main__':generate()
