package org.banke.community.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.nio.ByteBuffer;
import java.util.concurrent.*;

/** Native HTTP only: no CORS exception or external-page JavaScript bridge. */
public final class MainActivity extends Activity {
    private WebView view;
    private final ThreadPoolExecutor network = new ThreadPoolExecutor(2,2,30,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(4));
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(1);
        view = new WebView(this);
        WebSettings s=view.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        view.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,String url){ return !url.equals("file:///android_asset/web/index.html"); }
        });
        view.setWebChromeClient(new WebChromeClient());
        view.addJavascriptInterface(new Bridge(),"BankeNative");
        setContentView(view);
        view.loadUrl("file:///android_asset/web/index.html");
    }
    @Override protected void onResume(){super.onResume();if(view!=null){view.onResume();view.evaluateJavascript("window.dispatchEvent(new Event('banke:active'))",null);}}
    @Override protected void onPause(){if(view!=null)view.onPause();super.onPause();}
    @Override protected void onDestroy(){network.shutdownNow();if(view!=null){view.removeJavascriptInterface("BankeNative");view.destroy();view=null;}super.onDestroy();}
    private static String read(InputStream in,int limit) throws Exception {
        try(InputStream input=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buf=new byte[8192];int n,total=0;
            while((n=input.read(buf))!=-1){total+=n;if(total>limit)throw new IOException("Data exceeds size limit");out.write(buf,0,n);}
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(out.toByteArray())).toString();
        }
    }
    private static String error(String message){try{return new JSONObject().put("ok",false).put("error",message).toString();}catch(Exception impossible){return "{\"ok\":false}";}}
    private void deliver(final String id,final String result){
        runOnUiThread(new Runnable(){public void run(){if(view!=null)view.evaluateJavascript("window.__bankeNativeResult("+JSONObject.quote(id)+","+JSONObject.quote(result)+")",null);}});
    }
    private static URL endpoint(String text) throws Exception {
        URI uri=new URI(text);String host=uri.getHost();
        if(!"http".equals(uri.getScheme())||uri.getRawUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||host==null||!host.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))throw new IOException("Invalid private LAN address");
        String[] parts=host.split("\\.");int[] oct=new int[4];
        for(int i=0;i<4;i++){oct[i]=Integer.parseInt(parts[i]);if(oct[i]<0||oct[i]>255)throw new IOException("Invalid address");}
        if(!(oct[0]==10||oct[0]==192&&oct[1]==168||oct[0]==172&&oct[1]>=16&&oct[1]<=31))throw new IOException("Only private Wi-Fi addresses are allowed");
        String path=uri.getPath();
        if(!path.equals("/banke/v1/info")&&!path.equals("/banke/v1/pair/request")&&!path.equals("/banke/v1/message"))throw new IOException("Unsupported sync endpoint");
        if(uri.getPort()<1||uri.getPort()>65535)throw new IOException("Invalid port");
        return uri.toURL();
    }
    public final class Bridge {
        private final AtomicFile file=new AtomicFile(new File(getFilesDir(),"community-bundle.json"));
        @JavascriptInterface public synchronized String loadBundle(){
            if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists())return "";
            try{return read(file.openRead(),32*1024*1024);}catch(Exception ex){return error("Cannot read local schedule. Original file retained.");}
        }
        @JavascriptInterface public synchronized String saveBundle(String raw){
            FileOutputStream output=null;
            try{
                byte[] bytes=raw.getBytes(StandardCharsets.UTF_8);if(bytes.length>32*1024*1024)throw new IOException("Schedule too large");
                JSONObject obj=new JSONObject(raw);if(obj.getInt("version")!=1||!obj.has("state")||!obj.has("baseline"))throw new IOException("Invalid schedule");
                output=file.startWrite();output.write(bytes);file.finishWrite(output);return "{\"ok\":true}";
            }catch(Exception ex){if(output!=null)file.failWrite(output);return error("Cannot save local schedule. Original file retained.");}
        }
        @JavascriptInterface public String getDeviceName(){return Build.MODEL;}
        @JavascriptInterface public void request(final String id,final String text){
            if(id==null||!id.matches("[a-f0-9]{40}"))return;
            try{network.execute(new Runnable(){public void run(){
                HttpURLConnection conn=null;
                try{
                    if(text.length()>42*1024*1024)throw new IOException("Request too large");
                    JSONObject req=new JSONObject(text);URL url=endpoint(req.getString("url"));String method=req.getString("method");
                    if(!method.equals("GET")&&!method.equals("POST"))throw new IOException("Unsupported method");
                    if(method.equals("GET")&&!url.getPath().equals("/banke/v1/info")||method.equals("POST")&&url.getPath().equals("/banke/v1/info"))throw new IOException("Invalid endpoint method");
                    conn=(HttpURLConnection)url.openConnection(Proxy.NO_PROXY);conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(8000);conn.setReadTimeout(8000);conn.setRequestMethod(method);conn.setRequestProperty("Accept","application/json");
                    if(method.equals("POST")){byte[] data=req.getString("body").getBytes(StandardCharsets.UTF_8);if(data.length>40*1024*1024)throw new IOException("Request too large");conn.setDoOutput(true);conn.setFixedLengthStreamingMode(data.length);conn.setRequestProperty("Content-Type","application/json; charset=utf-8");try(OutputStream out=conn.getOutputStream()){out.write(data);}}
                    int status=conn.getResponseCode();InputStream stream=status>=200&&status<300?conn.getInputStream():conn.getErrorStream();String body=stream==null?"":read(stream,40*1024*1024);
                    JSONObject result=new JSONObject().put("ok",status>=200&&status<300).put("status",status).put("body",body);
                    if(status<200||status>=300)result.put("error","Computer returned status "+status);
                    deliver(id,result.toString());
                }catch(Exception ex){deliver(id,error("Cannot connect to computer. Local edits are retained."));}finally{if(conn!=null)conn.disconnect();}
            }});}catch(RejectedExecutionException ex){deliver(id,error("Network is busy; retry shortly."));}
        }
    }
}
