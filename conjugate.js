export const PRONOUNS = ["je", "tu", "il/elle", "nous", "vous", "ils/elles"];

export const TENSES = [
  { key: "present", label: "直説法現在", fr: "présent" },
  { key: "imparfait", label: "半過去", fr: "imparfait" },
  { key: "futur", label: "単純未来", fr: "futur simple" },
  { key: "conditionnel", label: "条件法現在", fr: "conditionnel" },
  { key: "subjonctif", label: "接続法現在", fr: "subjonctif" },
  { key: "passeCompose", label: "複合過去", fr: "passé composé" },
  { key: "plusQueParfait", label: "大過去", fr: "plus-que-parfait" },
];

// 複合時制 → 助動詞をどの時制に活用するか
const COMPOUND = { passeCompose: "present", plusQueParfait: "imparfait" };

// 助動詞。verbs.json を参照すると循環するのでここに置く
const AUX = {
  avoir: {
    present: ["ai", "as", "a", "avons", "avez", "ont"],
    imparfait: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
  },
  être: {
    present: ["suis", "es", "est", "sommes", "êtes", "sont"],
    imparfait: ["étais", "étais", "était", "étions", "étiez", "étaient"],
  },
};

const ENDINGS = {
  present: {
    er: ["e", "es", "e", "ons", "ez", "ent"],
    ir: ["is", "is", "it", "issons", "issez", "issent"],
    re: ["s", "s", "", "ons", "ez", "ent"],
  },
  imparfait: ["ais", "ais", "ait", "ions", "iez", "aient"],
  futur: ["ai", "as", "a", "ons", "ez", "ont"],
  conditionnel: ["ais", "ais", "ait", "ions", "iez", "aient"],
  subjonctif: ["e", "es", "e", "ions", "iez", "ent"],
};

const group = (inf) => inf.slice(-2);

// 母音と無音の h。je の j' と、代名動詞の m'/t'/s' で同じ判定を使う
const VOWEL = /^[aeiouyàâäéèêëîïôöùûüh]/i;

/** 代名動詞の再帰代名詞。me/te/se だけが母音の前で m'/t'/s' になる */
const REFL = ["me", "te", "se", "nous", "vous", "se"];
const reflex = (i, form) =>
  REFL[i].length === 2 && VOWEL.test(form) ? `${REFL[i][0]}'${form}` : `${REFL[i]} ${form}`;

/** 複合時制の助動詞。代名動詞は必ず être */
export const auxOf = (verb) => (verb.pron ? "être" : verb.aux ?? "avoir");

/** 見出しに出す不定詞。代名動詞は se を添える (se lever / s'appeler) */
export const infinitiveLabel = (verb) => (verb.pron ? reflex(2, verb.infinitive) : verb.infinitive);

function stem(inf, tense) {
  const g = group(inf);
  const base = inf.slice(0, -2);
  switch (tense) {
    case "present": return base;
    case "imparfait":
    case "subjonctif": return g === "ir" ? base + "iss" : base;
    case "futur":
    case "conditionnel": return g === "re" ? inf.slice(0, -1) : inf;
    default: throw new Error(`unknown tense: ${tense}`);
  }
}

const participle = (inf) =>
  inf.slice(0, -2) + { er: "é", ir: "i", re: "u" }[group(inf)];

/**
 * verb.forms に書いてあればそれを、なければ規則活用から導出する。
 * fem=true で、être を取る複合時制の過去分詞を女性形にする (allé → allée / allées)
 */
export function conjugate(verb, tense, i, fem = false) {
  const auxTense = COMPOUND[tense];
  let form;
  if (auxTense) {
    const aux = auxOf(verb);
    let pp = verb.pp ?? participle(verb.infinitive);
    // 過去分詞が主語に性数一致するのは être のとき。avoir は不変
    if (aux === "être") pp += (fem ? "e" : "") + (i >= 3 ? "s" : "");
    form = `${AUX[aux][auxTense][i]} ${pp}`;
  } else {
    // 語尾は forms が無いときだけ引く。haïr のように群から外れる綴りがある
    const given = verb.forms?.[tense];
    form = given ? given[i] : stem(verb.infinitive, tense) + (tense === "present"
      ? ENDINGS.present[group(verb.infinitive)][i]
      : ENDINGS[tense][i]);
  }
  // 再帰代名詞は複合時制でも助動詞の前 (je me suis levé)
  return verb.pron ? reflex(i, form) : form;
}

/**
 * 第1群(-er) / 第2群(-ir, -issons型) / 第3群。forms を持つものは不規則。
 * ただし語幹や綴りが変わるだけの -er 動詞 (lever → lève, manger → mangeons) も
 * forms を持つので、data 側の group で本来の群に引き戻せるようにする
 */
export function classify(verb) {
  if (verb.group) return { group: verb.group, label: `第${verb.group}群・語幹・綴りの変化` };
  if (verb.forms) return { group: 3, label: "第3群・不規則動詞" };
  const g = group(verb.infinitive);
  if (g === "er") return { group: 1, label: "第1群・-er 規則動詞" };
  if (g === "ir") return { group: 2, label: "第2群・-ir 規則動詞" };
  return { group: 3, label: "第3群・-re 規則活用" };
}

/** 表示上の (行, 列) から正準インデックス(人称 * 時制数 + 時制)へ。転置時は行が時制 */
export const cellIndex = (r, c, transposed) =>
  transposed ? c * TENSES.length + r : r * TENSES.length + c;

/**
 * 正解表示用に人称代名詞を添える。je だけが母音と無音の h の前で j' になる
 * 有音の h (haïr など) は動詞データの aspirate: true で除外する
 */
export const withPronoun = (i, form, aspirate = false) =>
  i === 0 && !aspirate && VOWEL.test(form) ? `j'${form}` : `${PRONOUNS[i]} ${form}`;

export const normalize = (s) =>
  s.trim().toLowerCase().replace(/[’´]/g, "'").replace(/\s+/g, " ");

export const isCorrect = (input, answer) => normalize(input) === normalize(answer);
