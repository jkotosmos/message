Android SDK setup and APK/AAB build

1) Install Android SDK & tools (Linux example):
   - Download Command line tools: https://developer.android.com/studio
   - Extract to /opt/android-sdk/cmdline-tools/latest
   - Add to PATH: export ANDROID_SDK_ROOT=/opt/android-sdk
   - Install platforms/build-tools:
     sdkmanager --licenses
     sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"

2) Configure project:
   - Edit local.properties if SDK path differs:
     sdk.dir=/opt/android-sdk

3) Sync web assets and build:
   cd ../../
   npm run build
   npx cap copy android
   cd android
   ./gradlew assembleDebug      # Debug APK
   ./gradlew bundleRelease      # AAB (Release)

4) Release signing (example):
   keytool -genkeypair -v -keystore neontalk.keystore -alias neontalk -keyalg RSA -keysize 2048 -validity 3650
   # Configure signing in app/build.gradle or via Android Studio

Notes:
 - Min SDK 23, Target/Compile SDK 35 (variables.gradle)
 - For FCM push (optional), add google-services.json in app/ and apply plugin.

