package com.brycekuo.matcharchitect

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
import org.json.JSONObject

/**
 * AdMob for the game page, as window.MQAndroidAds (see src/ads.js, androidAds()).
 * Every call takes a callback id and answers later with window.__mqAdsCb(id, {…}).
 * One rewarded and one interstitial ad are kept loaded, so showing one is instant; after each show the next loads.
 * Consent (UMP) is asked first where the law needs it (EEA / UK); ads only load once requesting them is allowed.
 */
class AdsBridge(private val act: Activity, private val web: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private var started = false
    private var ready = false
    private val initWait = mutableListOf<String>()

    private var rewarded: RewardedAd? = null
    private var loadingR = false
    private val waitR = mutableListOf<String>()
    private var inter: InterstitialAd? = null
    private var loadingI = false
    private val waitI = mutableListOf<String>()

    private fun reply(id: String, o: JSONObject) {
        val js = "window.__mqAdsCb && window.__mqAdsCb(${JSONObject.quote(id)}, $o)"
        main.post { web.evaluateJavascript(js, null) }
    }
    private fun ok() = JSONObject().put("ok", true)
    private fun fail(why: String) = JSONObject().put("ok", false).put("error", why)

    @JavascriptInterface
    fun config(): String = JSONObject()
        .put("rewarded", BuildConfig.ADMOB_REWARDED)
        .put("interstitial", BuildConfig.ADMOB_INTERSTITIAL)
        .put("testing", BuildConfig.ADS_TESTING)
        .toString()

    @JavascriptInterface
    fun initialize(id: String) {
        main.post {
            if (ready) { reply(id, ok()); return@post }
            initWait += id
            if (started) return@post
            started = true
            val ci = UserMessagingPlatform.getConsentInformation(act)
            ci.requestConsentInfoUpdate(act, ConsentRequestParameters.Builder().build(), {
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(act) { err ->
                    if (err != null) Log.w(TAG, "consent form: ${err.message}")
                    startAds(ci.canRequestAds())
                }
            }, { err ->
                Log.w(TAG, "consent info: ${err.message}")
                startAds(ci.canRequestAds())
            })
        }
    }

    private fun startAds(allowed: Boolean) {
        if (!allowed) { flush(initWait, fail("no consent")); started = false; return }
        MobileAds.initialize(act) {
            ready = true
            flush(initWait, ok())
            loadRewarded()
            loadInterstitial()
        }
    }

    private fun flush(list: MutableList<String>, o: JSONObject) {
        val ids = list.toList(); list.clear()
        for (i in ids) reply(i, o)
    }

    // ---------------------------------------------------------------- rewarded
    private fun loadRewarded() {
        if (!ready || rewarded != null || loadingR) return
        loadingR = true
        RewardedAd.load(act, BuildConfig.ADMOB_REWARDED, AdRequest.Builder().build(), object : RewardedAdLoadCallback() {
            override fun onAdLoaded(ad: RewardedAd) { rewarded = ad; loadingR = false; flush(waitR, ok()) }
            override fun onAdFailedToLoad(e: LoadAdError) {
                loadingR = false; Log.w(TAG, "rewarded load: ${e.code} ${e.message}")
                flush(waitR, fail(e.message))
                main.postDelayed({ loadRewarded() }, RETRY_MS)
            }
        })
    }

    @JavascriptInterface
    fun loadRewarded(id: String) {
        main.post {
            if (!ready) { reply(id, fail("not ready")); return@post }
            if (rewarded != null) { reply(id, ok()); return@post }
            waitR += id
            loadRewarded()
            main.postDelayed({ if (waitR.remove(id)) reply(id, fail("timeout")) }, WAIT_MS)
        }
    }

    @JavascriptInterface
    fun showRewarded(id: String) {
        main.post {
            val ad = rewarded
            if (ad == null) { reply(id, fail("not loaded").put("earned", false)); loadRewarded(); return@post }
            rewarded = null
            var earned = false
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() { reply(id, ok().put("earned", earned)); loadRewarded() }
                override fun onAdFailedToShowFullScreenContent(e: AdError) { reply(id, fail(e.message).put("earned", false)); loadRewarded() }
            }
            ad.show(act) { earned = true }
        }
    }

    // ---------------------------------------------------------------- interstitial
    private fun loadInterstitial() {
        if (!ready || inter != null || loadingI) return
        loadingI = true
        InterstitialAd.load(act, BuildConfig.ADMOB_INTERSTITIAL, AdRequest.Builder().build(), object : InterstitialAdLoadCallback() {
            override fun onAdLoaded(ad: InterstitialAd) { inter = ad; loadingI = false; flush(waitI, ok()) }
            override fun onAdFailedToLoad(e: LoadAdError) {
                loadingI = false; Log.w(TAG, "interstitial load: ${e.code} ${e.message}")
                flush(waitI, fail(e.message))
                main.postDelayed({ loadInterstitial() }, RETRY_MS)
            }
        })
    }

    @JavascriptInterface
    fun loadInterstitial(id: String) {
        main.post {
            if (!ready) { reply(id, fail("not ready")); return@post }
            if (inter != null) { reply(id, ok()); return@post }
            waitI += id
            loadInterstitial()
            main.postDelayed({ if (waitI.remove(id)) reply(id, fail("timeout")) }, WAIT_MS)
        }
    }

    @JavascriptInterface
    fun showInterstitial(id: String) {
        main.post {
            val ad = inter
            if (ad == null) { reply(id, fail("not loaded")); loadInterstitial(); return@post }
            inter = null
            ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() { reply(id, ok()); loadInterstitial() }
                override fun onAdFailedToShowFullScreenContent(e: AdError) { reply(id, fail(e.message)); loadInterstitial() }
            }
            ad.show(act)
        }
    }

    companion object {
        private const val TAG = "MQAds"
        private const val WAIT_MS = 8000L     // a player waits at most this long for an ad that isn't loaded yet
        private const val RETRY_MS = 60000L   // after a failed load, try again a minute later
    }
}
