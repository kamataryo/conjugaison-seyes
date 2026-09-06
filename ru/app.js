// ロシア語版の入り口。文法 (conjugate.js) と文言をまとめて、共有本体に渡すだけ
import * as grammar from "./conjugate.js";
import { start } from "/drill.js";

// 辞書の見出しにならって、体・対の動詞・格支配を1行に並べる。
// 体は現在と未来の作り方そのものなので、表を読む前に見えている必要がある
const gloss = (verb) => [
  `<i>${verb.aspect}</i> ${grammar.ASPECTS[verb.aspect]}`,
  verb.pair && `пара <i>${verb.pair}</i>`, // 体の対
  verb.kind,
  verb.usage?.join(" / "), // 語法の中の並列は / 。項目の区切り(,)と混ざらないように
];

start({
  ...grammar,
  storage: "spryazhenie",
  locale: "ru",
  ui: {
    check: "Проверить",
    recheck: "Заново",
    restore: (kind) =>
      `Показать ${{ both: "строки и столбцы", rows: "строки", cols: "столбцы" }[kind]}`,
  },
  gloss,
});
