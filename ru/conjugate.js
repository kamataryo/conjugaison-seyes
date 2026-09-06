export const PRONOUNS = ["я", "ты", "он/она", "мы", "вы", "они"];

// ロシア語に仏語のような時制の並びはない。人称で形が変わるのはこの5つだけ。
// 命令法は ты と вы にしか形がないので、残りのセルは null (答えのないマス) になる
export const TENSES = [
  { key: "present", label: "現在", ru: "настоящее" },
  { key: "past", label: "過去", ru: "прошедшее" },
  { key: "future", label: "未来", ru: "будущее" },
  { key: "conditional", label: "仮定法", ru: "сослагательное" },
  { key: "imperative", label: "命令法", ru: "повелительное" },
];

export const ASPECTS = { нсв: "不完了体", св: "完了体" };

const VOWEL = /[аеёиоуыэюя]$/;
const HUSH = /[жчшщ]$/; // ж ч ш щ のあとは ю→у, я→а (учу, учат)

// 不完了体の未来はここに不定詞をつなぐ (буду читать)
const BE = ["буду", "будешь", "будет", "будем", "будете", "будут"];

// 語尾。第1変化は -е-、第2変化は -и-。語尾に力点があると第1変化の е は ё になる (идёшь)
const E1 = ["ешь", "ет", "ем", "ете"];
const E1_YO = ["ёшь", "ёт", "ём", "ёте"];
const E2 = ["ишь", "ит", "им", "ите"];

const isRefl = (inf) => inf.endsWith("ся");
/** -ся 動詞の不定詞から -ся を落とす (заниматься → занимать) */
const bare = (inf) => (isRefl(inf) ? inf.slice(0, -2) : inf);
/** 再帰の後綴。母音のあとだけ -сь (занимаюсь / занимаешься) */
const postfix = (form) => form + (VOWEL.test(form) ? "сь" : "ся");

/** 1人称単数・3人称複数の語尾がやわらかい形 (ю/ют) を取るか。母音と ь のあとがそう */
const soft = (stem) => VOWEL.test(stem) || stem.endsWith("ь");

/** 現在・単純未来 (非過去)。1人称単数だけ子音の交替が起きるので stem1 で差し替える */
function nonPast(v, i) {
  const s = v.stem;
  if (i === 0) {
    const s1 = v.stem1 ?? s;
    return s1 + (v.conj === 2 ? (HUSH.test(s1) ? "у" : "ю") : (soft(s1) ? "ю" : "у"));
  }
  if (i === 5) return s + (v.conj === 2 ? (HUSH.test(s) ? "ат" : "ят") : (soft(s) ? "ют" : "ут"));
  return s + (v.conj === 2 ? E2 : v.yo ? E1_YO : E1)[i - 1];
}

/** 過去は人称ではなく性・数で決まる。[男性, 女性, 複数] */
const pastForms = (v) => v.past ?? ["л", "ла", "ли"].map((e) => bare(v.infinitive).slice(0, -2) + e);

/** 命令法の語幹。母音で終われば -й、そうでなければ -и。-ь 型などは data の imp で書く */
const imperativeStem = (v) =>
  "imp" in v ? v.imp : v.stem + (VOWEL.test(v.stem) ? "й" : "и");

/**
 * verb.forms にその時制が書いてあればそれを使う (быть の現在のように null = 形がない)。
 * fem=true で過去・仮定法を女性形にする (читал → читала)
 * 形が存在しないセルでは null を返す。呼ぶ側はそのマスを伏せる
 */
export function conjugate(verb, tense, i, fem = false) {
  if (verb.forms && tense in verb.forms) return verb.forms[tense]?.[i] ?? null;
  const refl = isRefl(verb.infinitive);
  const done = (form) => (refl ? postfix(form) : form);
  switch (tense) {
    // 完了体に現在はない。非過去の形はそのまま未来の意味になる
    case "present": return verb.aspect === "св" ? null : done(nonPast(verb, i));
    case "future": return verb.aspect === "св"
      ? done(nonPast(verb, i))
      : `${BE[i]} ${verb.infinitive}`; // 助動詞は再帰にしない (буду заниматься)
    case "past": {
      const p = pastForms(verb);
      return done(i >= 3 ? p[2] : fem ? p[1] : p[0]);
    }
    // 仮定法は過去形 + бы。бы は不変化なので後ろに置くだけ
    case "conditional": {
      const p = conjugate(verb, "past", i, fem);
      return p && `${p} бы`;
    }
    case "imperative": {
      const s = imperativeStem(verb);
      if (!s || (i !== 1 && i !== 4)) return null;
      return done(i === 1 ? s : s + "те");
    }
    default: throw new Error(`unknown tense: ${tense}`);
  }
}

/** 第1変化 (-е-) / 第2変化 (-и-) / 不規則。forms を持つものは不規則 */
export function classify(verb) {
  if (verb.forms) return { group: 3, label: "不規則変化" };
  return verb.conj === 1
    ? { group: 1, label: "第1変化 (-е-)" }
    : { group: 2, label: "第2変化 (-и-)" };
}

/** 見出しに出す不定詞。-ся はデータに入っているのでそのまま */
export const infinitiveLabel = (verb) => verb.infinitive;

/** 表示上の (行, 列) から正準インデックス(人称 * 時制数 + 時制)へ。転置時は行が時制 */
export const cellIndex = (r, c, transposed) =>
  transposed ? c * TENSES.length + r : r * TENSES.length + c;

/** 正解表示用に人称代名詞を添える。命令法は主語を立てない (читай) */
export const withPronoun = (i, form, tense) =>
  tense === "imperative" ? form : `${PRONOUNS[i]} ${form}`;

/**
 * 採点用の正規化。ё は日常の表記では е と書かれるので同一視する。
 * 力点記号 (U+0301) も落とす。書き方の違いで不正解にしない
 */
export const normalize = (s) =>
  (s ?? "").normalize("NFC").trim().toLowerCase()
    .replace(/́/g, "").replace(/ё/g, "е").replace(/\s+/g, " ");

export const isCorrect = (input, answer) =>
  answer != null && normalize(input) === normalize(answer);
