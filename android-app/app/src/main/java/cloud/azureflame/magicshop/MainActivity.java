package cloud.azureflame.magicshop;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Log;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import org.json.JSONObject;

/**
 * 霧雨魔法店 · 离线优先壳
 *  - 本地加载 assets/www 内置整站, 断网可玩
 *  - filesDir/www 为更新层, 启动时按 version.json 差异同步
 *  - 缺失文件联网即时兜底(小文件)
 *  - 相册/拍照文件选择(供账本截图上传)
 */
public class MainActivity extends Activity {

    private static final String TAG = "MmsMain";
    private static final String SITE_BASE = "https://www.azureflame.cloud";
    private static final String HOME_URL = "https://appassets.androidapp.net/www/index.html";
    private static final String MANIFEST_PATH = "version.json";
    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_CAMERA = 1002;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private File updateDir;                       // filesDir/www 更新层
    private ValueCallback<Uri[]> filePathCallback; // 文件选择回调
    private WebChromeClient.FileChooserParams pendingParams; // 待授权的文件选择参数
    private Uri cameraUri;                        // 拍照输出
    private final AtomicBoolean online = new AtomicBoolean(true);
    private final AtomicBoolean updateRunning = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);

        updateDir = new File(getFilesDir(), "www");
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        setContentView(webView);

        // debug 包开启 WebView 远程调试(Chrome inspect 可查页面状态)
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " mmsapp/1");

        // ── 本地资源加载器: 更新层 → 内置层 → 联网兜底 ──
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidapp.net")
                .addPathHandler("/www/", new SiteHandler())
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                Log.d(TAG, "拦截请求: " + url);
                if ("https".equalsIgnoreCase(url.getScheme())
                        && "appassets.androidapp.net".equals(url.getHost())) {
                    WebResourceResponse r = assetLoader.shouldInterceptRequest(url);
                    Log.d(TAG, "拦截结果: " + (r != null ? "命中(" + r.getMimeType() + ")" : "null"));
                    return r;
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "页面加载完成: " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                Log.e(TAG, "页面加载错误: " + request.getUrl() + " -> " + error.getErrorCode() + " " + error.getDescription());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                filePathCallback = callback;
                pendingParams = params;
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                } else {
                    launchChooser(params, true);
                }
                return true;
            }
        });

        // ── JS 桥: App 原生能力 ──
        webView.addJavascriptInterface(new MmsBridge(), "mmsNative");

        // ── 启动流程: 先显示闪屏, 后台解压离线包, 完成后进主页 ──
        // (解压 61.7MB/350 文件不能卡在 UI 线程, 否则首启黑屏)
        showSplash("正在准备离线包…", true);
        new Thread(new Runnable() {
            @Override
            public void run() {
                final boolean ok = ensureExtract();
                mainHandler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (ok) {
                            if (savedInstanceState != null) {
                                webView.restoreState(savedInstanceState);
                            } else {
                                webView.loadUrl(HOME_URL);
                            }
                        } else {
                            showSplash("离线包加载失败，请重新安装 App 或联系店主", false);
                        }
                    }
                });
            }
        }).start();

        // ── 联网状态监听 ──
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm != null) {
            cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) { online.set(true); }
                @Override
                public void onLost(@NonNull Network network) { online.set(false); }
            });
        }

        // ── 启动 2.5s 后后台检查更新 ──
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (online.get()) startUpdate();
            }
        }, 2500);
    }

    /* ═══════════ 本地资源处理器: 更新层 → 内置层 → 联网兜底 ═══════════ */

    private class SiteHandler implements WebViewAssetLoader.PathHandler {
        @Override
        public WebResourceResponse handle(String path) {
            Log.d(TAG, "handle: " + path);
            if (path == null || path.contains("..") || path.startsWith("/")) return null;

            // 1) 离线层(filesDir/www, 内置包解压 + 增量更新)
            File cached = new File(updateDir, path);
            if (cached.isFile() && cached.length() > 0) {
                Log.d(TAG, "handle 命中 filesDir: " + path);
                try {
                    return responseFor(path, new FileInputStream(cached));
                } catch (IOException ignored) {
                }
            }

            // 2) 联网兜底(仅小文件, 即时拉取并缓存)
            if (online.get() && path.length() <= 128) {
                byte[] data = httpGetBytes(SITE_BASE + "/" + path);
                if (data != null) {
                    Log.d(TAG, "handle 联网兜底: " + path);
                    writeCache(path, data);
                    return responseFor(path, data);
                }
            }
            Log.w(TAG, "handle 未命中: " + path);
            return null;
        }
    }

    // 首次启动: 从 assets/www.zip 解压内置离线包(UTF-8 条目名, 规避 AGP 文件名编码问题)
    // 后台线程调用; 返回是否成功
    private boolean ensureExtract() {
        if (new File(updateDir, "index.html").isFile()) {
            Log.i(TAG, "离线包已存在, 跳过解压");
            return true;
        }
        Log.i(TAG, "开始解压内置离线包 www.zip → " + updateDir);
        long t0 = System.currentTimeMillis();
        int count = 0;
        long bytes = 0;
        try {
            java.util.zip.ZipInputStream zin =
                    new java.util.zip.ZipInputStream(getAssets().open("www.zip"));
            byte[] buf = new byte[16384];
            java.util.zip.ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                if (e.isDirectory()) continue;
                String name = e.getName();
                if (name == null || name.contains("..") || name.startsWith("/")) continue;
                File out = new File(updateDir, name);
                File parent = out.getParentFile();
                if (parent != null && !parent.isDirectory()) parent.mkdirs();
                FileOutputStream fos = new FileOutputStream(out);
                int n;
                while ((n = zin.read(buf)) != -1) {
                    fos.write(buf, 0, n);
                    bytes += n;
                }
                fos.close();
                zin.closeEntry();
                count++;
            }
            zin.close();
        } catch (Exception ex) {
            Log.e(TAG, "解压失败: " + ex.getMessage(), ex);
            return false;
        }
        boolean ok = new File(updateDir, "index.html").isFile();
        Log.i(TAG, "解压结束: " + count + " 文件 / " + (bytes / 1024) + "KB / 耗时 "
                + (System.currentTimeMillis() - t0) + "ms / index.html=" + ok);
        return ok;
    }

    // 启动闪屏 / 错误提示(内联 HTML, 不依赖离线包)
    private void showSplash(String msg, boolean ring) {
        String html = "<!DOCTYPE html><html><head><meta charset='utf-8'>"
                + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                + "<style>"
                + "body{margin:0;background:#1a1520;color:#e0d8ec;font-family:sans-serif;"
                + "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;}"
                + ".logo{font-size:42px;margin-bottom:14px;}"
                + ".title{font-size:20px;font-weight:700;letter-spacing:3px;color:#f0c060;margin-bottom:16px;}"
                + ".msg{font-size:13px;color:#8a7e9a;padding:0 32px;line-height:1.8;}"
                + "@keyframes spin{to{transform:rotate(360deg)}}"
                + ".ring{width:36px;height:36px;border:3px solid #3a3045;border-top-color:#f0c060;"
                + "border-radius:50%;animation:spin 1s linear infinite;margin-bottom:18px;}"
                + "</style></head><body>"
                + "<div class='logo'>✦</div>"
                + "<div class='title'>霧雨魔法店</div>"
                + (ring ? "<div class='ring'></div>" : "")
                + "<div class='msg'>" + msg + "</div>"
                + "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private WebResourceResponse responseFor(String path, InputStream is) {
        String mime = mimeFor(path);
        String enc = (mime.startsWith("text/")
                || "application/javascript".equals(mime)
                || "application/json".equals(mime)) ? "UTF-8" : null;
        return new WebResourceResponse(mime, enc, is);
    }

    private WebResourceResponse responseFor(String path, byte[] data) {
        String mime = mimeFor(path);
        String enc = (mime.startsWith("text/")
                || "application/javascript".equals(mime)
                || "application/json".equals(mime)) ? "UTF-8" : null;
        return new WebResourceResponse(mime, enc, new java.io.ByteArrayInputStream(data));
    }

    private String mimeFor(String path) {
        String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
        if ("js".equals(ext)) return "application/javascript";
        if ("json".equals(ext)) return "application/json";
        if ("html".equals(ext)) return "text/html";
        if ("css".equals(ext)) return "text/css";
        if ("svg".equals(ext)) return "image/svg+xml";
        if ("woff2".equals(ext)) return "font/woff2";
        if ("woff".equals(ext)) return "font/woff";
        if ("ttf".equals(ext)) return "font/ttf";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : "application/octet-stream";
    }

    /* ═══════════ 版本更新器 ═══════════ */

    private class MmsBridge {
        @JavascriptInterface
        public void checkUpdate() {
            if (online.get()) startUpdate();
        }

        @JavascriptInterface
        public boolean isOnline() {
            return online.get();
        }
    }

    private void startUpdate() {
        if (!updateRunning.compareAndSet(false, true)) return;
        Log.i(TAG, "更新器: 启动");
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject remote = fetchManifest(SITE_BASE + "/" + MANIFEST_PATH);
                    if (remote == null) {
                        Log.e(TAG, "更新器: 拉取远程清单失败(网络或解析)");
                        return;
                    }
                    String remoteVersion = remote.optString("version", "");
                    Log.i(TAG, "更新器: 远程清单 version=" + remoteVersion);
                    JSONObject remoteFiles = remote.optJSONObject("files");
                    if (remoteFiles == null) {
                        Log.e(TAG, "更新器: 远程清单无 files 字段");
                        return;
                    }

                    JSONObject local = readLocalManifest();
                    List<String> changed = new ArrayList<>();
                    Iterator<String> keys = remoteFiles.keys();
                    while (keys.hasNext()) {
                        String p = keys.next();
                        if (p.contains("..") || p.startsWith("/")) continue;
                        if (fileChanged(p, remoteFiles.optString(p, ""), local)) changed.add(p);
                    }
                    Log.i(TAG, "更新器: 差异文件 " + changed.size() + " 个"
                            + (changed.size() > 0 && changed.size() <= 8 ? " " + changed : ""));

                    if (changed.isEmpty()) {
                        writeManifest(remoteFiles, remoteVersion);
                        Log.i(TAG, "更新器: 无差异, 清单已同步至 " + remoteVersion);
                        return;
                    }

                    // 清理: 先记下"上次已同步文件"(filesDir 里的旧清单), 更新成功后删除失效文件
                    File mfFile = new File(updateDir, MANIFEST_PATH);
                    final JSONObject oldFiles = mfFile.isFile() ? local.optJSONObject("files") : null;

                    ExecutorService pool = Executors.newFixedThreadPool(4);
                    final CountDownLatch latch = new CountDownLatch(changed.size());
                    final AtomicInteger fails = new AtomicInteger(0);
                    for (final String p : changed) {
                        pool.execute(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    if (!downloadToCache(p, remoteFiles.optString(p, ""))) {
                                        fails.incrementAndGet();
                                        Log.e(TAG, "更新器: 下载失败 " + p);
                                    }
                                } finally {
                                    latch.countDown();
                                }
                            }
                        });
                    }
                    latch.await();
                    pool.shutdown();

                    if (fails.get() == 0) {
                        writeManifest(remoteFiles, remoteVersion);
                        if (oldFiles != null) cleanupRemoved(oldFiles, remoteFiles);
                        Log.i(TAG, "更新器: 同步完成 " + changed.size() + " 个文件 → " + remoteVersion);
                    } else {
                        Log.e(TAG, "更新器: " + fails.get() + "/" + changed.size() + " 下载失败, 放弃本次同步, 清单保持旧版");
                    }
                } catch (Exception ex) {
                    Log.e(TAG, "更新器: 异常 " + ex.getMessage(), ex);
                } finally {
                    updateRunning.set(false);
                    Log.i(TAG, "更新器: 结束");
                }
            }
        }).start();
    }

    private JSONObject readLocalManifest() {
        // filesDir/www/version.json 优先(出厂基线或上次同步结果)
        File f = new File(updateDir, MANIFEST_PATH);
        try {
            if (f.isFile()) {
                return new JSONObject(new String(readFully(new FileInputStream(f)), StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {
        }
        return new JSONObject();
    }

    private void writeManifest(JSONObject files, String version) {
        try {
            JSONObject out = new JSONObject();
            out.put("version", version);
            out.put("files", files);
            writeCache(MANIFEST_PATH, out.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }

    private void cleanupRemoved(JSONObject oldFiles, JSONObject remoteFiles) {
        try {
            Iterator<String> keys = oldFiles.keys();
            while (keys.hasNext()) {
                String p = keys.next();
                if (!remoteFiles.has(p) && !p.equals(MANIFEST_PATH)) {
                    File victim = new File(updateDir, p);
                    if (victim.isFile()) victim.delete();
                }
            }
        } catch (Exception ignored) {
        }
    }

    private boolean fileChanged(String path, String sha, JSONObject local) {
        String l = local.optString(path, "");
        return !sha.equalsIgnoreCase(l);
    }

    private boolean downloadToCache(String path, String sha) {
        byte[] data = httpGetBytes(SITE_BASE + "/" + path);
        if (data == null) return false;
        String actual = sha256(data);
        if (sha == null || sha.isEmpty() || !sha.equalsIgnoreCase(actual)) return false;
        return writeCache(path, data);
    }

    private boolean writeCache(String path, byte[] data) {
        try {
            File out = new File(updateDir, path);
            File parent = out.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            File tmp = new File(updateDir, path + ".tmp");
            FileOutputStream fos = new FileOutputStream(tmp);
            fos.write(data);
            fos.close();
            return tmp.renameTo(out);
        } catch (IOException ignored) {
            return false;
        }
    }

    private String sha256(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private JSONObject fetchManifest(String url) {
        byte[] data = httpGetBytes(url);
        if (data == null) return null;
        try {
            return new JSONObject(new String(data, StandardCharsets.UTF_8));
        } catch (Exception e) {
            return null;
        }
    }

    /* ═══════════ 网络 ═══════════ */

    private byte[] httpGetBytes(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(20000);
            conn.setRequestProperty("User-Agent", "mmsapp/1");
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "HTTP " + code + ": " + urlStr);
                return null;
            }
            return readFully(conn.getInputStream());
        } catch (Exception e) {
            Log.w(TAG, "请求异常 " + urlStr + ": " + e.getMessage());
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private byte[] readFully(InputStream is) throws IOException {
        BufferedInputStream in = new BufferedInputStream(is);
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream(65536);
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    /* ═══════════ 文件选择(相册 + 拍照) ═══════════ */

    private void launchChooser(WebChromeClient.FileChooserParams params, boolean withCamera) {
        Intent base = params.createIntent();
        Intent chooser = Intent.createChooser(base, "选择图片");
        if (withCamera) {
            try {
                File dir = new File(getCacheDir(), "camera");
                if (!dir.isDirectory()) dir.mkdirs();
                File shot = new File(dir, "shot_" + System.currentTimeMillis() + ".jpg");
                cameraUri = FileProvider.getUriForFile(this, "cloud.azureflame.magicshop.fileprovider", shot);
                Intent take = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                take.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                take.setFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{take});
            } catch (Exception ignored) {
            }
        }
        startActivityForResult(chooser, REQ_FILE_CHOOSER);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && filePathCallback != null && pendingParams != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            launchChooser(pendingParams, granted);
            pendingParams = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                } else if (cameraUri != null) {
                    result = new Uri[]{cameraUri};
                }
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            cameraUri = null;
        }
    }

    /* ═══════════ 生命周期 ═══════════ */

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
