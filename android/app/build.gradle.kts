import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// AdMob ids (android/admob.properties). Debug builds, and release builds while testing=true, request Google's test ad
// units, so the real units are never hit during development (clicking your own real ads gets an account suspended).
val admob = Properties().apply { rootProject.file("admob.properties").inputStream().use { load(it) } }
fun ad(k: String) = admob.getProperty(k)?.trim() ?: error("admob.properties: missing $k")
val testRewarded = "ca-app-pub-3940256099942544/5224354917"
val testInterstitial = "ca-app-pub-3940256099942544/1033173712"
val adsTesting = ad("testing").toBoolean()

android {
    namespace = "com.brycekuo.matcharchitect"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.brycekuo.matcharchitect"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        manifestPlaceholders["admobAppId"] = ad("appId")
        buildConfigField("String", "ADMOB_REWARDED", "\"$testRewarded\"")
        buildConfigField("String", "ADMOB_INTERSTITIAL", "\"$testInterstitial\"")
        buildConfigField("boolean", "ADS_TESTING", "true")
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
            if (!adsTesting) {
                buildConfigField("String", "ADMOB_REWARDED", "\"${ad("rewarded")}\"")
                buildConfigField("String", "ADMOB_INTERSTITIAL", "\"${ad("interstitial")}\"")
                buildConfigField("boolean", "ADS_TESTING", "false")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    androidResources { noCompress += listOf("html") }
}
kotlin { jvmToolchain(17) }

dependencies {
    implementation("com.google.android.gms:play-services-ads:25.5.0")
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")
}
