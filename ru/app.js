// ロシア語版の入り口。文法 (conjugate.js) と文言をまとめて、共有本体に渡すだけ
import * as grammar from "./conjugate.js";
import { start } from "/drill.js";

// 辞書の見出しにならって、体・対の動詞・格支配を1行に並べる。
// 体は現在と未来の作り方そのものなので、表を読む前に見えている必要がある
// 体の対は、収録してあれば押して渡れるようにする。同じ語尾で語幹だけ違う相手 (понимать /
// понять) を続けて解けるように。手元にない相手はこれまでどおり字だけ出す
const gloss = (verb, _revealed, has) => [
  `<i>${verb.aspect}</i> ${grammar.ASPECTS[verb.aspect]}`,
  verb.pair && (has(verb.pair)
    ? `пара <button id="pair-switch" data-v="${verb.pair}" title="体の対に切り替え" aria-label="${verb.pair} に切り替え">${verb.pair}</button>`
    : `пара <i>${verb.pair}</i>`),
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
  },
  gloss,
});
