# 闇ワリカ

飲み会や旅行の割り勘を記録し、最後は運命のルーレット＆ガチャで清算するWebアプリです。

サーバーもデータベースも使わない、1枚のHTMLファイル（`index.html`）だけで完結する構成になっています。イベント名・メンバー・支払いの記録はすべてURLの `#s=...` 部分にエンコードされており、そのURLを共有することでメンバー間の状態を受け渡します。

## Vercelへのデプロイ

このリポジトリはVercelの「静的サイト」としてそのままデプロイできます。特別な設定は不要です。

1. このリポジトリをGitHubにプッシュする
2. Vercelで「Add New Project」からこのリポジトリを選択する
3. Framework Presetは `Other`（未検出）のままでOK。Build CommandやOutput Directoryも空欄で問題ありません（`index.html`をリポジトリのルートにそのまま配置しているため、Vercelが自動で静的ファイルとして配信します）
4. Deployを押せば完了です

以降は `index.html` を更新して `git push` するたびに、Vercelが自動で最新版を再デプロイします。

### 注意点

Vercelにデプロイしても、データがサーバー側に保存されるようにはなりません。状態は引き続きURLの中だけに存在します。イベントを作成すると `https://（あなたのプロジェクト）.vercel.app/#s=...` のようなURLが発行されるので、それを友達に共有してください。

## 開発方法（index.htmlを直接編集しない理由）

`index.html` は `dev/app.template.html` から自動生成されたファイルです。QRコード生成用のライブラリ（`qrcode-generator`）のソースコードを、テンプレート内の `/*__QRCODE_GENERATOR_LIBRARY__*/` という目印の位置に埋め込んで1枚のファイルに合体させています。

そのため、機能を変更したいときは次の手順で行います。

```bash
cd dev
npm install          # 初回のみ（qrcode-generator, playwrightを取得）
# app.template.html を編集する
node build.mjs        # ../index.html を再生成する
```

`dev/tests/` には簡単な回帰テスト（Playwrightを使ったブラウザ自動操作テスト）が入っています。

```bash
cd dev
npx playwright install chromium   # 初回のみ
npm test
```

ブラウザをダウンロードしたくない場合は、パソコンにインストール済みのEdge（またはChrome）を使うこともできます（`PW_CHANNEL` に `msedge` または `chrome` を指定します）。

```powershell
cd dev
$env:PW_CHANNEL = 'msedge'   # Windows PowerShell の場合
npm test
```

## ディレクトリ構成

```
index.html            ← Vercelにデプロイされる実体（このファイルだけで動く）
vercel.json            ← Vercel向けの最小限の設定
favicon-32.png         ← ブラウザのタブに表示されるアイコン
apple-touch-icon.png   ← スマホのホーム画面に追加したときのアイコン
dev/
  app.template.html    ← 編集用のソーステンプレート
  build.mjs             ← app.template.html → ../index.html を生成するビルドスクリプト
  package.json          ← ビルド・テスト用の依存パッケージ定義
  tests/                ← Playwrightによる回帰テスト一式
```

## デザインについて

見た目は「藍（Ai / Indigo Minimal）」に統一しています（ライトモードのみ）。細い罫線と余白で情報を整理し、影は使いません。色は藍色1色を中心に、状態を表す緑・黄土・赤だけを補助に使います。文字は Noto Sans JP、金額などの数字は Roboto です。色の定義は `dev/app.template.html` の先頭にある `:root` にまとまっています。

## 最終ガチャのルール

- 抽選の途中（罰金の割合が決まったあと〜結果が出るまで）は、画面を閉じて回し直すことはできません。
- 結果を反映したあと、引き直せるのは1回までです（取り消しても回数は戻りません）。
- 結果の対象になったメンバーを削除した場合は、その結果が無効になり、回数も最初に戻ります。
