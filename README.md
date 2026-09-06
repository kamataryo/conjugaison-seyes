# Conjugaison Seyès

フランス語動詞の活用ドリル。`/ru/` にロシア語版がある。

## ロシア語版 (`ru/`)

同じ表・同じ操作で、中身をロシア語の文法に合わせたもの。CSS はルートの `style.css` を
両版で共有し、`ru/index.html` が書体と見出し列の幅だけを上書きする。
`conjugate.js` / `verbs.json` / `app.js` / `index.html` / `stats.js` は丸ごと分けている
(localStorage のキーも別)。ロシア語側でだけ効いている決めごと:

- 列は 現在・過去・未来・仮定法・命令法 の5つ。時制ではなく体 (вид) が形を決める
- 完了体に現在はない。命令法は ты と вы にしかない。мочь に複合未来はない。
  こうした「形のないマス」は `conjugate()` が `null` を返し、表では斜線を敷いて入力させない
- 過去と仮定法は人称ではなく性・数で決まる。я/ты/он の行は男性形・女性形の両方を正解にする
  (フランス語版の être + 過去分詞の性数一致と同じ仕組みを使っている)
- -ся 動詞は母音のあとで -сь になる。不完了体の未来 (буду читать) の助動詞は再帰にしない
- 採点では ё と е を同一視し、力点記号は落とす

OGP・アイコン・manifest も `ru/` に別で持つ (版下は `ru/ogp.html` と `ru/icon.svg`)。
紙面はセイエス罫ではなく косая линейка (横罫 + 右上がりの斜線)。

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

ロシア語版は `ru/ogp.html` が版下。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot=ru/ogp.png "file://$PWD/ru/ogp.html"
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

ロシア語版は `ru/icon.svg` が版下。書き出し先も `ru/` にする
(`ru/manifest.json` と `ru/index.html` がこの3枚を指している)。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=512,512 --screenshot=ru/icon-512.png "file://$PWD/ru/icon.svg"
sips -Z 192 ru/icon-512.png --out ru/icon-192.png
sips -Z 180 ru/icon-512.png --out ru/apple-touch-icon.png
```

## テスト

```bash
node --test
```
