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

/** verb.forms に書いてあればそれを、なければ規則活用から導出する */
export function conjugate(verb, tense, i) {
  const auxTense = COMPOUND[tense];
  if (auxTense) {
    const aux = verb.aux ?? "avoir";
    const pp = verb.pp ?? participle(verb.infinitive);
    // ponytail: 主語は男性扱い固定。女性形の性一致が要るなら人称ごとに性を持たせる
    return `${AUX[aux][auxTense][i]} ${aux === "être" && i >= 3 ? pp + "s" : pp}`;
  }
  const given = verb.forms?.[tense];
  if (given) return given[i];
  const ending = tense === "present"
    ? ENDINGS.present[group(verb.infinitive)][i]
    : ENDINGS[tense][i];
  return stem(verb.infinitive, tense) + ending;
}

/** 第1群(-er) / 第2群(-ir, -issons型) / 第3群。forms を持つものは不規則 */
export function classify(verb) {
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
  i === 0 && !aspirate && /^[aeiouyàâäéèêëîïôöùûüh]/i.test(form) ? `j'${form}` : `${PRONOUNS[i]} ${form}`;

export const normalize = (s) =>
  s.trim().toLowerCase().replace(/[’´]/g, "'").replace(/\s+/g, " ");

export const isCorrect = (input, answer) => normalize(input) === normalize(answer);
