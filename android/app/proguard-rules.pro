# ProGuard / R8 Obfuscation & Security Rules for Bappa Locator Android Release

# Keep Capacitor Native Bridge
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Keep JavaScript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Firebase SDKs
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Remove Log outputs in production release build
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}
