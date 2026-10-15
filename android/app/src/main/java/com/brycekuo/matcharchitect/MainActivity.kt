package com.brycekuo.matcharchitect

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/** 火柴建築師 App：整頁 WebView（assets/index.html = 完整版 dist/app/index.html）＋ AdMob（AdsBridge）。 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var ads: AdsBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(SKY)
        setContentView(web)
        fullScreen()

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            textZoom = 100
            setSupportZoom(false)
        }
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.webViewClient = object : WebViewClient() {
            // links out of the game (GitHub, itch.io …) open in the browser, not inside the app
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.scheme == "file") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(request.url.toString()))) } catch (_: Exception) {}
                return true
            }
        }
        ads = AdsBridge(this, web)
        web.addJavascriptInterface(ads, "MQAndroidAds")
        web.loadUrl("file:///android_asset/index.html")
    }

    private fun fullScreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) fullScreen()
    }

    // in the background, or covered by a full-screen ad: the game goes quiet
    override fun onPause() {
        web.evaluateJavascript("window.__mqAppPause && window.__mqAppPause(true)", null)
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        web.evaluateJavascript("window.__mqAppPause && window.__mqAppPause(false)", null)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object { val SKY = Color.rgb(0xA9, 0xDA, 0xF2) }
}
