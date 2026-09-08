// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorCommunityBackgroundGeolocation", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor-community/background-geolocation"),
        .package(name: "CapacitorFirebaseAnalytics", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor-firebase/analytics"),
        .package(name: "CapacitorFirebaseAppCheck", path: "symlinks/CapacitorFirebaseAppCheck"),
        .package(name: "CapacitorFirebaseAuthentication", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor-firebase/authentication"),
        .package(name: "CapacitorApp", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/app"),
        .package(name: "CapacitorCamera", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorGeolocation", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorHaptics", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPreferences", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorSplashScreen", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@capacitor/status-bar"),
        .package(name: "RevenuecatPurchasesCapacitor", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/@revenuecat/purchases-capacitor"),
        .package(name: "CapacitorHealth", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/capacitor-health"),
        .package(name: "CapacitorLiveActivities", path: "../../../../../a9f86de622b5/tropos-glass/node_modules/capacitor-live-activities"),
        .package(name: "CordovaPluginPurchase", path: "../../capacitor-cordova-ios-plugins/sources/CordovaPluginPurchase")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityBackgroundGeolocation", package: "CapacitorCommunityBackgroundGeolocation"),
                .product(name: "CapacitorFirebaseAnalytics", package: "CapacitorFirebaseAnalytics"),
                .product(name: "CapacitorFirebaseAppCheck", package: "CapacitorFirebaseAppCheck"),
                .product(name: "CapacitorFirebaseAuthentication", package: "CapacitorFirebaseAuthentication"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar"),
                .product(name: "RevenuecatPurchasesCapacitor", package: "RevenuecatPurchasesCapacitor"),
                .product(name: "CapacitorHealth", package: "CapacitorHealth"),
                .product(name: "CapacitorLiveActivities", package: "CapacitorLiveActivities"),
                .product(name: "CordovaPluginPurchase", package: "CordovaPluginPurchase")
            ]
        )
    ]
)
