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

## ディレクトリ構成

```
index.html            ← Vercelにデプロイされる実体（このファイルだけで動く）
vercel.json            ← Vercel向けの最小限の設定
dev/
  app.template.html    ← 編集用のソーステンプレート
  build.mjs             ← app.template.html → ../index.html を生成するビルドスクリプト
  package.json          ← ビルド・テスト用の依存パッケージ定義
  tests/                ← Playwrightによる回帰テスト一式
```
