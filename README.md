# Conjugaison Seyès

フランス語動詞の活用ドリル。`/ru/` にロシア語版がある。

## 構成

表と操作の中身はルートに1つだけ置き、言語ごとの差だけを分ける。

| | |
|---|---|
| `drill.js` | ドリル本体。両版で共有。`start(lang)` を公開する |
| `stats.js` | 通算の集計。保存キーと誤答の畳み方は引数で受け取る |
| `style.css` | 紙面。両版で共有 |
| `app.js` / `ru/app.js` | 入り口。文法と文言を束ねて `start()` を呼ぶだけ |
| `conjugate.js` / `ru/conjugate.js` | 文法。共有しない |
| `verbs.json` / `ru/verbs.json` | 動詞データ。共有コアは `infinitive` / `kind` / `meaning` / `usage` / `ex` |
| `index.html` / `ru/index.html` | 文言・OGP・書体の上書き |

`lang` に要るものは `drill.js` の冒頭に書いてある。`/ru/` から読んでも
`fetch("./verbs.json")` は document 基準で解決されるので `ru/verbs.json` になる。

## ロシア語版 (`ru/`)

同じ表・同じ操作で、中身をロシア語の文法に合わせたもの。localStorage のキーは
`spryazhenie.*` で別。ロシア語側でだけ効いている決めごと:

- 列は 現在・過去・未来・仮定法・命令法 の5つ。時制ではなく体 (вид) が形を決める
- 完了体に現在はない。命令法は ты と вы にしかない。мочь に複合未来はない。
  こうした「形のないマス」は `conjugate()` が `null` を返し、表では斜線を敷いて入力させない
- 過去と仮定法は人称ではなく性・数で決まる。я/ты/он の行は男性形・女性形の両方を正解にする
  (フランス語版の être + 過去分詞の性数一致と同じ `femAnswers` の仕組みに乗っている)
- -ся 動詞は母音のあとで -сь になる。不完了体の未来 (буду читать) の助動詞は再帰にしない
- 採点では ё と е を同一視し、力点記号は落とす

OGP・アイコン・manifest も `ru/` に別で持つ (版下は `ru/ogp.html` と `ru/icon.svg`)。
紙面はセイエス罫ではなく косая линейка (横罫 + 右上がりの斜線)。

フランス語版にしかない「助動詞を伏せる」ボタンは `app.js` の `gloss()` が出しているだけで、
`drill.js` は `#aux-hint` が押されたら `revealed` を立てて描き直すことしか知らない。

## 問題集 URL をまとめて作る (`/quiz-url`)

画面のピン留めと「問題集をコピー」で足りるのは1つ2つまで。10件20件をまとめて欲しいときは
`.claude/skills/quiz-url` を使う。`?pins=` の組み立てと index の突き合わせをやってくれる。

頼み方のコツは2つ。

**動詞の絞り込みは `verbs.json` の語で言う。** `kind` / `usage` / 語尾などで書くと拾ってくれる。

```
/quiz-url -ir 動詞を10個、複合過去だけの表で
/quiz-url pron の動詞ぜんぶ、tu と vous だけ、全時制
```

**向きは「行=◯◯、列=◯◯」か「縦一列」で言う。**「列として表示」だけだと、
〈縦に並べる〉のか〈列見出しに置く〉のか決まらず取り違える。

```
/quiz-url être について、人称ごとに全時制の表を6件、時制ごとに全人称の表を7件。
          前半は 行=時制・列=人称、後半は 行=人称・列=時制
```

件ごとに向きが違うときは上のように件ごとに書く。全件同じなら「全部1列 (縦並び) で」で足りる。

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
