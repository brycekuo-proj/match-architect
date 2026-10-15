import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// AdMob ids (android/admob.properties): Google's test ids until the real ones are filled in
val admob = Properties().apply { rootProject.file("admob.properties").inputStream().use { load(it) } }
fun ad(k: String) = admob.getProperty(k)?.trim() ?: error("admob.properties: missing $k")

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
        buildConfigField("String", "ADMOB_REWARDED", "\"${ad("rewarded")}\"")
        buildConfigField("String", "ADMOB_INTERSTITIAL", "\"${ad("interstitial")}\"")
        buildConfigField("boolean", "ADS_TESTING", ad("testing"))
    }
    buildFeatures { buildConfig = true }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
