// フランス語版の入り口。文法 (conjugate.js) と文言をまとめて、共有本体に渡すだけ
import * as grammar from "./conjugate.js";
import { start } from "/drill.js";

// 辞書の見出しにならって、品詞・語法・複合時制の助動詞を1行に並べる。
// 助動詞は複合過去・大過去の答えそのものなので、押すまで伏せておく
const gloss = (verb, revealed) => [
  verb.kind && `<i>${verb.kind}</i>`,
  verb.usage?.join(" / "), // 語法の中の並列は / 。項目の区切り(,)と混ざらないように
  revealed
    ? `aux. <i>${grammar.auxOf(verb)}</i>`
    : `aux. <button id="aux-hint" class="chip" aria-label="助動詞を表示" title="助動詞を表示"><span>?</span></button>`,
];

start({
  ...grammar,
  storage: "conjugaison",
  locale: "fr",
  ui: {
    check: "Corriger",
    recheck: "Recommencer",
    restore: (kind) =>
      `Afficher les ${{ both: "lignes et colonnes", rows: "lignes", cols: "colonnes" }[kind]}`,
  },
  gloss,
});
