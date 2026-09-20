plugins { id("com.android.application") }
android {
    namespace = "com.dsharnessmobile.asrlab"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.dsharnessmobile.asrlab"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += "arm64-v8a" }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging { jniLibs { useLegacyPackaging = true; keepDebugSymbols += "**/libasr_server.so" } }
    signingConfigs {
        create("localLab") {
            storeFile = rootProject.file("../android-shell/keystore/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    buildTypes { getByName("debug") { signingConfig = signingConfigs.getByName("localLab") } }
}
