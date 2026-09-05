# Conjugaison Seyès

フランス語動詞の活用ドリル。

## デプロイ（Cloudflare Pages）

```bash
pnpm dlx wrangler@latest pages deploy . --project-name=conjugaison-seyes
```

### デプロイ後

独自ドメインを使う場合は、`index.html` の `og:url` / `og:image` / `canonical` のホスト名を差し替える（既定は `https://conjugaison-seyes.pages.dev`）。

## OGP 画像

`ogp.html` が版下。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot=ogp.png "file://$PWD/ogp.html"
```

## アイコン

`icon.svg` が版下。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=512,512 --screenshot=icon-512.png "file://$PWD/icon.svg"
sips -Z 192 icon-512.png --out icon-192.png
sips -Z 180 icon-512.png --out apple-touch-icon.png
```

## テスト

```bash
node --test
```
