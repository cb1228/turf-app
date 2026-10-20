#!/usr/bin/env bash
# じんとり散歩の iOS プロジェクトを用意する（クラウドの macOS で実行。ios/ はリポジトリに入れず毎回ここで作る）
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --no-audit --no-fund
npx cap add ios
npx capacitor-assets generate --ios --iconBackgroundColor '#0c0f14' --splashBackgroundColor '#0c0f14'

PLIST="ios/App/App/Info.plist"
set_str() { plutil -replace "$1" -string "$2" "$PLIST" 2>/dev/null || plutil -insert "$1" -string "$2" "$PLIST"; }
set_str NSLocationWhenInUseUsageDescription "歩いた場所を領地にするために、現在地を使います。"
# バックグラウンドGPS（画面を消してポケットに入れても記録を続ける）
set_str NSLocationAlwaysAndWhenInUseUsageDescription "画面を消してポケットに入れたままでも、歩いた道を記録して領地にするために使います。"
set_str NSLocationAlwaysUsageDescription "画面を消してポケットに入れたままでも、歩いた道を記録して領地にするために使います。"
plutil -replace UIBackgroundModes -json '["location"]' "$PLIST" 2>/dev/null || plutil -insert UIBackgroundModes -json '["location"]' "$PLIST"
set_str NSPhotoLibraryAddUsageDescription "領地カードの画像を写真に保存するために使います。"
# アイコン画像を選ぶとき（写真から選ぶ・その場で撮る）。無いと選んだ瞬間にアプリが落ちる
set_str NSPhotoLibraryUsageDescription "ランキングに表示するアイコン画像を、写真から選ぶために使います。"
set_str NSCameraUsageDescription "ランキングに表示するアイコン画像を撮影するために使います。"
set_str UIStatusBarStyle UIStatusBarStyleLightContent
plutil -replace UIViewControllerBasedStatusBarAppearance -bool false "$PLIST" 2>/dev/null || plutil -insert UIViewControllerBasedStatusBarAppearance -bool false "$PLIST"
# 暗号化の申告: OS標準の暗号(HTTPS・WebCrypto)のみで輸出規制の対象外。提出のたびの質問を省く
plutil -replace ITSAppUsesNonExemptEncryption -bool false "$PLIST" 2>/dev/null || plutil -insert ITSAppUsesNonExemptEncryption -bool false "$PLIST"

# 言語は日本語（無いと App Store の「言語」欄が「英語」になる。2026-10-06 に発覚）
set_str CFBundleDevelopmentRegion ja
plutil -replace CFBundleLocalizations -json '["ja"]' "$PLIST" 2>/dev/null || plutil -insert CFBundleLocalizations -json '["ja"]' "$PLIST"
sed -i '' 's/developmentRegion = en;/developmentRegion = ja;/; s/knownRegions = (/knownRegions = (ja, /' ios/App/App.xcodeproj/project.pbxproj

# iPhone 専用（iPad 用のスクショ不要）
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' ios/App/App.xcodeproj/project.pbxproj

# プライバシー申告ファイル（2024年5月以降、無いとアップロード時に弾かれる）
cat > ios/App/App/PrivacyInfo.xcprivacy <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeCoarseLocation</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeOtherDataTypes</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
XML
plutil -lint ios/App/App/PrivacyInfo.xcprivacy
# Xcode プロジェクトに追加（CocoaPods に同梱の xcodeproj を使う）
ruby -e 'require "xcodeproj"' 2>/dev/null || sudo gem install xcodeproj --no-document
ruby -e '
require "xcodeproj"
p = Xcodeproj::Project.open("ios/App/App.xcodeproj")
t = p.targets.find { |x| x.name == "App" }
g = p.main_group.find_subpath("App", false)
unless g.files.any? { |f| f.path == "PrivacyInfo.xcprivacy" }
  ref = g.new_file("PrivacyInfo.xcprivacy")
  t.resources_build_phase.add_file_reference(ref)
end
p.save
puts "PrivacyInfo.xcprivacy added"
'

npx cap sync ios
(cd ios/App && pod install)
