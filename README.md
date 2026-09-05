# Conjugaison Seyès

フランス語動詞の活用ドリル。ビルド不要の静的サイト（HTML + ES modules）。

## ローカルで動かす

`fetch` と ES modules を使うので、file:// では動かない。

```bash
pnpm dlx serve .
```

## デプロイ（Cloudflare Pages）

### 1. GitHub 連携（推奨）

Cloudflare ダッシュボード → Workers & Pages → Create → Pages → Connect to Git
でこのリポジトリを選び、以下を設定する。

| 項目 | 値 |
| --- | --- |
| Framework preset | None |
| Build command | （空欄） |
| Build output directory | `/` |

以降は `main` への push で自動デプロイされる。

### 2. CLI から直接

```bash
pnpm dlx wrangler@latest pages deploy . --project-name=conjugaison-seyes
```

### デプロイ後

独自ドメインを使う場合は、`index.html` の `og:url` / `og:image` / `canonical`
のホスト名を差し替える（既定は `https://conjugaison-seyes.pages.dev`）。

## OGP 画像

`ogp.html` が版下。編集したら 1200×630 で撮り直して `ogp.png` として置く。
文字のベースラインが背景の罫からずれていたら、`ogp.html` の `--drop` だけを調整する。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot=ogp.png "file://$PWD/ogp.html"
```

## アイコン

`icon.svg` が唯一の版下。SVG のまま favicon に使い、PNG が要る先（iOS のホーム画面、
Android のインストール）向けに3枚を書き出す。中身を直したら撮り直す。

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for s in 180:apple-touch-icon 192:icon-192 512:icon-512; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --window-size="${s%%:*},${s%%:*}" --screenshot="${s##*:}.png" "file://$PWD/icon.svg"
done
```

## テスト

```bash
node --test
```
