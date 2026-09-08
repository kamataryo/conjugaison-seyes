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

見出し行の `пара` は、相手が `verbs.json` にあれば押して渡れる (8組は相手が未収録なので字だけ)。
対は語尾が同じで語幹だけ違うことがある (понимать / понять → пойму) ので、続けて解けると効く。
ボタンを出すのは `ru/app.js` の `gloss()`、渡す先を引くのは `drill.js` の `#pair-switch`。

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

## 利用状況の集計 (Umami)

どこで離れているか、どの機能が使われているかを見るために、Umami Cloud にイベントを送っている。
Cookie も localStorage も使わないので同意バナーは要らない。断りはフッターに一行だけ出している。

| イベント | 送るところ | 添えるもの |
|---|---|---|
| `input` | 表の1マス目を書いたとき (表ごとに1回。`touched` で畳む) | |
| `check` | 答え合わせ | `verb` / `cells` 出題数 / `filled` 埋めた数 / `correct` 当たった数 |
| `retry` | やり直す | |
| `next` | 次の動詞 | `quiz` 問題集からの出題か |
| `pick` | ドロップダウンで動詞を選ぶ | |
| `pair` | 体の対に切り替える (露版のみ) | `verb` 渡った先 / `aspect` その体 |
| `pin` | ピン留め | `on` 留めたか外したか |
| `copy-pins` | 問題集をコピー | `count` 何件の問題集か |
| `swap` / `shuffle` / `say` / `cut` | 表の上のボタン | `cut` は `axis` 行か列か |

`check` の `correct` だけは離脱とは別の狙いで、動詞ごと・時制ごとの難しさを全体で見るためのもの。
`stats.js` の集計は端末の中にしか残らないので、ここでしか分からない。

`swap` / `shuffle` / `say` / `cut` は使われているのか分からない機能を測っている。
数ヶ月見て動いていなければ UI から外す。消す根拠を作るための計測。

仏語版と露語版は同じ website-id で、パス (`/` と `/ru/`) で分かれる。イベント名だけの一覧では
混ざるので、`data-tag` に `fr` / `ru` を入れて全イベントに言語が乗るようにしてある。

`pageview → input → check → next` をファネルにすると、書き始める前に離れた人と、書いたが
答え合わせしなかった人が分かれて見える。

`data-exclude-search="true"` は外せない。`?v=` / `?pins=` は表の状態を URL に書いているだけなのに
`build()` のたび `replaceState` が走る。落とさないと表を変えるたびページビューが1件増え、
ページ一覧も URL ごとにばらける。

### 広告からの流入 (UTM)

`exclude-search` で URL のクエリを落としているので、Umami 標準の UTM レポートは動かない。
代わりに、クエリ付きで開かれたら `landing` を1回だけ送る (`drill.js` の `query` の下)。
広告だけでなく、共有された `?v=` `?pins=` の着地もここに入る。

| プロパティ | 元 |
|---|---|
| `source` `medium` `campaign` | `utm_source` `utm_medium` `utm_campaign` |
| `ad` | `utm_content` — 広告1本ずつの識別に使う |
| `v` | `?v=` — 何の動詞で開かせたか |
| `pins` | `?pins=` の件数 (中身は散るので送らない) |

`v` があるので「être や avoir から始めさせると続くか」を測れる。同じクリエイティブで
着地だけ変えた広告を2本流し、`landing → input → check → next` を `v` で絞って比べる。
1回のセッションでどこまで粘ったかは出る。翌日また来たかは Umami のリテンションを
着地条件で切れないので出ない。

Instagram (Meta) 側は広告の「URL パラメータ」欄に入れる。`{{...}}` は Meta が配信時に差し替える。

```
utm_source=instagram&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

Meta は `fbclid` も足してくるが、1 人 1 個の印なので拾わない。`exclude-search` のおかげで
ページ一覧も汚れない。

`landing → input → check` をファネルにして `ad` で絞ると、広告ごとに「開いただけ」と
「書き始めた」の差が出る。インストール数ではなくこれを見る。

スクリプトが読めなければ `track()` は何もしない (`window.umami?.track`)。`exercices.html` は
自分用の目次なので入れていない。

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
