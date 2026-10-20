# TestFlight に載せる手順（Mac 不要・オーナー用）

クラウドの Mac が「署名 → Apple へ送信」まで自動でやります。オーナーの作業は **Apple の画面で鍵を1つ作って、GitHub に4つ貼るだけ** です。スマホのブラウザでもできます（PC の方が楽）。

> 鍵（.p8 ファイル）は **一度しかダウンロードできません**。他人に見せない・チャットに貼らないでください。私（Claude）にも渡さないでください。GitHub の Secrets に直接貼るだけで大丈夫です。

## 1. アプリの ID を登録（初回だけ）
1. https://developer.apple.com/account/resources/identifiers/list を開く
2. 「＋」→「App IDs」→「App」→ 続ける
3. Description: `TURF` ／ Bundle ID: **Explicit** で `com.himori.jintori`
4. Capabilities はそのまま → 登録

## 2. App Store Connect にアプリを作る（初回だけ）
1. https://appstoreconnect.apple.com → マイApp →「＋」→ 新規App
2. プラットフォーム: iOS ／ 名前: `TURF` ／ 言語: 日本語 ／ バンドルID: `com.himori.jintori` ／ SKU: `jintori-sanpo-001`

## 3. 送信用の鍵（API キー）を作る
1. App Store Connect →「ユーザとアクセス」→「統合」タブ →「App Store Connect API」
2. 初めてなら「アクセスをリクエスト」→ 承認されたら「チームキー」の「＋」
3. 名前: `github-actions` ／ アクセス: **Admin**（署名用の証明書を自動で作るため）
4. 作成後、次の3つを控える
   - **Issuer ID**（一覧の上に出ている長い英数字）
   - **キー ID**（10文字）
   - **API キーをダウンロード**（`AuthKey_XXXXXXXXXX.p8`。一度だけ）

## 4. チーム ID を確認
https://developer.apple.com/account →「メンバーシップの詳細」の **チームID**（10文字）

## 5. GitHub に4つ貼る
https://github.com/cb1228/auto-revenue-agent/settings/secrets/actions →「New repository secret」を4回

| Name | Secret に貼るもの |
|---|---|
| `ASC_ISSUER_ID` | 3 の Issuer ID |
| `ASC_KEY_ID` | 3 のキー ID |
| `ASC_KEY_P8` | .p8 ファイルを開いた**中身全部**（`-----BEGIN PRIVATE KEY-----` から `-----END PRIVATE KEY-----` まで） |
| `APPLE_TEAM_ID` | 4 のチーム ID |

## 6. 送信を実行
1. https://github.com/cb1228/auto-revenue-agent/actions/workflows/ios-build.yml
2. 「Run workflow」→ チェック「署名して TestFlight に送る」がオンのまま →「Run workflow」
3. 20〜30分で緑になれば送信完了。App Store Connect の「TestFlight」タブに10〜30分で出てきます

## 7. 自分の iPhone で試す
1. iPhone に「TestFlight」アプリを入れる
2. App Store Connect →「TestFlight」→「内部テスト」にグループを作り、自分（Apple ID）を追加
3. 届いたメール or TestFlight アプリから「インストール」

## 8. Proパック（アプリ内課金）の商品を登録する
アプリ側は実装済みです。Apple 側で商品を作るまでは、ボタンが「ただいま準備中」と出ます。
1. App Store Connect →「ビジネス」（旧「契約/税金/口座情報」）で **有料App契約** に同意し、口座・税務情報を入れる（無いと課金が動きません）
2. マイApp → TURF →「収益化」→「App内課金」→「＋」
   - 種類: **非消耗型** ／ 参照名: `Proパック` ／ 製品ID: **`com.himori.jintori.pro`**（一字一句同じ）
3. 価格: ¥850（無ければ近い価格）／ 日本語の表示名: `Proパック` ／ 説明: `限定スキン3種・金縁カード・ミッション入れ替え`
4. 審査用スクショ: アプリの「設定 → Proパック」の画面を撮って添付
5. 最初のアプリ審査のとき、バージョンのページの「App内課金」欄でこの商品を選んで一緒に提出
- TestFlight では本物のお金はかかりません（テスト購入）。

## うまくいかないとき
- 赤くなったら、その実行の画面を開いて、赤い行のメッセージを私に教えてください（鍵の中身は送らないでください）
- 「Secrets が足りません」→ 5 の4つの名前が一字一句同じか確認
- 送信のたびにビルド番号は自動で増えます（同じ番号の重複エラーは起きません）
