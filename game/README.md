# じんとり散歩（native game project）

歩いて囲ったエリアが領地になる位置ゲー。夜間ランキング版MVP・¥0運用から始める。
詳細方針は [`PLAN.md`](PLAN.md)。

## 現状（2026-09-25）
- ✅ Webプロトタイプ稼働中: https://auto-revenue-agent.himosho22.workers.dev/turf （`../site/turf.html`）
- ✅ **Capacitorのネイティブ器を構築**: `package.json` / `capacitor.config.json` / 依存インストール済み
- ✅ **アプリアイコン・スプラッシュ生成**: `assets/icon.png`(1024・不透明) / `assets/splash.png`(2732) を `icon.svg` から生成
- ✅ **クラウドMac自動ビルド**: `.github/workflows/ios-build.yml`（Windowsだけでも毎pushでiOSコンパイル検証）
- ✅ Apple Developer Program 加入済み（2027/9/23まで有効）
- ✅ **ゲーム本体 v0.2**: レベル/称号・日替わりミッション・実績12種・連続日数・スキン・制圧スケール・領地カードのシェア・指でなぞる体験モード・オンボーディング
- ✅ **ランキング**: 今週/総合。`worker/index.js`（Cloudflare Workers + SQLite版Durable Object・無料・アカウント追加不要）。送信は面積/マス数/レベル/自動生成名のみ
- ⏳ 次: 署名ビルド → TestFlight → 審査提出

## アプリ情報
- **Bundle ID**: `com.himori.jintori`
- **App名**: じんとり散歩
- **web root**: `www/`（＝ゲーム画面。`../site/turf.html` と同一）

## ディレクトリ
- `www/` … アプリ内に載せるWeb本体（ゲーム画面）
- `assets/` … アイコン元SVG＋生成済みPNG（icon/splash）
- `supabase/` … バックエンドのDBスキーマ・夜間バッチSQL
- `.github/workflows/ios-build.yml` … クラウドMacビルド定義
- `PLAN.md` … 全体計画・役割分担・コスト

## ローカルでビルドする場合（Mac所有時のみ・任意）
```bash
cd game
npm install
npx cap add ios
npm run assets            # アイコン/スプラッシュを各サイズ生成
npx cap sync ios
npx cap open ios          # Xcode で実機/シミュレータ
```
> Windowsしか無い場合はローカルビルド不可。GitHubにpushすれば `ios-build` ワークフローがクラウドMacで自動ビルドする。

## オーナーの操作が必要なもの（私＝エージェントは代行不可・Apple ID絡み）
1. **App Store Connect でアプリ登録**: https://appstoreconnect.apple.com → マイApp → ＋ → Bundle ID `com.himori.jintori` を登録
2. **署名証明書・プロビジョニング**: Xcode Cloud か fastlane match、または手動で作成（Apple IDログインが必要）
3. **審査提出**（TestFlight → 本番）
4. Supabase / AdMob / (課金はRevenueCat) の無料アカウント作成・鍵の受け渡し

## 私（エージェント）がやること
- Capacitor設定・ネイティブGPS/ハプティクス/保存/広告/課金の組込みコード
- クラウドMacビルドのCI維持、Info.plist権限文言、ストア掲載文・スクショ構成
- `supabase/` のスキーマ適用SQL・夜間ランキング
- 各フェーズの動作検証

## 私（エージェント）がやること
- Capacitor設定・背景GPS/広告/課金の組込みコード
- `supabase/` のスキーマ適用SQL・夜間ランキングのEdge Function or cron
- プライバシーポリシーページ、ストア掲載文・スクショ構成案
- 各フェーズの動作検証（ロジックはNode等で自己検証）

## 収益（確定）
- AdMob 広告（バナー/インタースティシャル/リワード）＋ **「Proパック」買い切りIAP（¥850・広告非表示＋α）**
- 集客は **TikTok中心**（企画/台本/ハッシュタグ/サムネは私が用意、撮影/投稿はオーナー）
- 夜間ランキングのため月額サーバー費は¥0スタート（拡大時のみ検討）
