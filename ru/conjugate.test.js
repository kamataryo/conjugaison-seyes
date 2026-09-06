import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRONOUNS, TENSES, classify, conjugate, isCorrect, normalize } from "./conjugate.js";

const verbs = JSON.parse(readFileSync(new URL("./verbs.json", import.meta.url), "utf8"));
const find = (inf) => verbs.find((v) => v.infinitive === inf);
const row = (inf, tense, fem = false) => PRONOUNS.map((_, i) => conjugate(find(inf), tense, i, fem));

test("第1変化は -е- の語尾を取る", () => {
  assert.deepEqual(row("читать", "present"), ["читаю", "читаешь", "читает", "читаем", "читаете", "читают"]);
  // 語幹が子音で終われば1人称単数は -у、3人称複数は -ут
  assert.deepEqual(row("писать", "present"), ["пишу", "пишешь", "пишет", "пишем", "пишете", "пишут"]);
  // 語尾に力点があると е は ё になる
  assert.deepEqual(row("идти", "present"), ["иду", "идёшь", "идёт", "идём", "идёте", "идут"]);
  // ь のあとはやわらかい語尾 (пью, пьют)
  assert.deepEqual(row("пить", "present"), ["пью", "пьёшь", "пьёт", "пьём", "пьёте", "пьют"]);
});

test("第2変化は -и- の語尾を取り、ж ч ш щ のあとで у/ат になる", () => {
  assert.deepEqual(row("говорить", "present"), ["говорю", "говоришь", "говорит", "говорим", "говорите", "говорят"]);
  assert.deepEqual(row("учить", "present"), ["учу", "учишь", "учит", "учим", "учите", "учат"]);
  // 1人称単数だけ子音が交替する (любить → люблю, видеть → вижу)
  assert.equal(row("любить", "present")[0], "люблю");
  assert.equal(row("видеть", "present")[0], "вижу");
  assert.equal(row("видеть", "present")[5], "видят");
  assert.equal(row("спать", "present")[0], "сплю");
});

test("過去は人称ではなく性・数で決まる", () => {
  assert.deepEqual(row("читать", "past"), ["читал", "читал", "читал", "читали", "читали", "читали"]);
  assert.deepEqual(row("читать", "past", true), ["читала", "читала", "читала", "читали", "читали", "читали"]);
  // 複数の3セルは女性形を求めても変わらない
  assert.deepEqual(row("идти", "past"), ["шёл", "шёл", "шёл", "шли", "шли", "шли"]);
  assert.equal(row("идти", "past", true)[1], "шла");
  assert.equal(row("мочь", "past", true)[0], "могла");
});

test("未来は体で作り方が変わる", () => {
  // 不完了体は быть + 不定詞
  assert.deepEqual(row("читать", "future").slice(0, 2), ["буду читать", "будешь читать"]);
  // 完了体は非過去の形がそのまま未来になる
  assert.deepEqual(row("купить", "future"), ["куплю", "купишь", "купит", "купим", "купите", "купят"]);
  // 完了体に現在はない
  assert.deepEqual(row("купить", "present"), new Array(6).fill(null));
  // быть の未来は буду 単独。буду быть にはしない
  assert.equal(row("быть", "future")[0], "буду");
  assert.deepEqual(row("быть", "present"), new Array(6).fill(null));
});

test("仮定法は過去形 + бы", () => {
  assert.equal(row("читать", "conditional")[0], "читал бы");
  assert.equal(row("читать", "conditional", true)[0], "читала бы");
  assert.equal(row("быть", "conditional")[5], "были бы");
});

test("命令法は ты と вы にだけ形がある", () => {
  assert.deepEqual(row("читать", "imperative"), [null, "читай", null, null, "читайте", null]);
  assert.deepEqual(row("говорить", "imperative"), [null, "говори", null, null, "говорите", null]);
  assert.equal(row("пить", "imperative")[1], "пей");
  assert.equal(row("быть", "imperative")[1], "будь");
  // 命令法を作らない動詞
  assert.deepEqual(row("мочь", "imperative"), new Array(6).fill(null));
});

test("-ся 動詞は母音のあとで -сь になる", () => {
  assert.deepEqual(row("заниматься", "present"),
    ["занимаюсь", "занимаешься", "занимается", "занимаемся", "занимаетесь", "занимаются"]);
  assert.deepEqual(row("учиться", "present").slice(0, 2), ["учусь", "учишься"]);
  assert.equal(row("заниматься", "past", true)[0], "занималась");
  assert.deepEqual(row("заниматься", "imperative"), [null, "занимайся", null, null, "занимайтесь", null]);
  // 未来の助動詞は再帰にしない
  assert.equal(row("заниматься", "future")[0], "буду заниматься");
  assert.equal(row("вернуться", "future")[1], "вернёшься");
});

test("不規則動詞はシードの値を優先する", () => {
  assert.deepEqual(row("есть", "present"), ["ем", "ешь", "ест", "едим", "едите", "едят"]);
  assert.deepEqual(row("хотеть", "present").slice(0, 4), ["хочу", "хочешь", "хочет", "хотим"]);
  assert.deepEqual(row("дать", "future"), ["дам", "дашь", "даст", "дадим", "дадите", "дадут"]);
  assert.equal(row("помочь", "future")[1], "поможешь");
});

test("採点は大文字小文字・前後空白・ё の書き分けを無視する", () => {
  assert.ok(isCorrect("  Идёшь ", "идёшь"));
  assert.ok(isCorrect("идешь", "идёшь")); // ё を е と書いても正解にする
  assert.ok(!isCorrect("идет", "идёшь"));
  assert.equal(normalize("идёшь́"), "идешь"); // 力点記号は落とす
  // 形のないマスは何を書いても正解にならない
  assert.ok(!isCorrect("", null));
  assert.ok(!isCorrect("куплю", null));
});

test("動詞の変化型を判定する", () => {
  assert.equal(classify(find("читать")).label, "第1変化 (-е-)");
  assert.equal(classify(find("говорить")).label, "第2変化 (-и-)");
  assert.equal(classify(find("есть")).label, "不規則変化");
});

test("データの必須項目がそろっている", () => {
  const infs = new Set();
  for (const v of verbs) {
    assert.ok(!infs.has(v.infinitive), `重複: ${v.infinitive}`);
    infs.add(v.infinitive);
    assert.ok(["нсв", "св"].includes(v.aspect), `${v.infinitive}: aspect`);
    assert.ok(v.meaning, `${v.infinitive}: meaning`);
    assert.ok(v.kind, `${v.infinitive}: kind`);
    assert.equal(v.ex?.length, 2, `${v.infinitive}: ex`);
    // forms を持たないものは語幹と変化型から作る
    if (!v.forms) assert.ok(v.stem && [1, 2].includes(v.conj), `${v.infinitive}: stem/conj`);
    // 体の対も動詞一覧に載っているとは限らないが、綴りだけは確かめる
    if (v.pair) assert.match(v.pair, /^[а-яё]+$/, `${v.infinitive}: pair`);
  }
});

test("全セルが空でない答えか、形のない null のどちらかを返す", () => {
  for (const v of verbs) {
    for (const t of TENSES) {
      for (let i = 0; i < PRONOUNS.length; i++) {
        for (const fem of [false, true]) {
          const a = conjugate(v, t.key, i, fem);
          assert.ok(a === null || (a && a.trim()), `${v.infinitive} ${t.key} ${i}`);
          // 答えにラテン文字が混じっていない
          if (a) assert.ok(!/[a-z]/i.test(a), `${v.infinitive} ${t.key} ${i}: ${a}`);
        }
      }
    }
  }
});

test("現在か未来のどちらかは必ず埋まる", () => {
  for (const v of verbs) {
    for (let i = 0; i < PRONOUNS.length; i++) {
      const filled = conjugate(v, "present", i) ?? conjugate(v, "future", i);
      assert.ok(filled, `${v.infinitive} ${i}`);
    }
  }
});
