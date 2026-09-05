import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRONOUNS, TENSES, conjugate, isCorrect } from "./conjugate.js";

const verbs = JSON.parse(readFileSync(new URL("./verbs.json", import.meta.url), "utf8"));
const find = (inf) => verbs.find((v) => v.infinitive === inf);
const row = (inf, tense) => PRONOUNS.map((_, i) => conjugate(find(inf), tense, i));

test("規則活用を語尾から導出する", () => {
  assert.deepEqual(row("parler", "present"), ["parle", "parles", "parle", "parlons", "parlez", "parlent"]);
  assert.deepEqual(row("finir", "present"), ["finis", "finis", "finit", "finissons", "finissez", "finissent"]);
  assert.deepEqual(row("vendre", "present"), ["vends", "vends", "vend", "vendons", "vendez", "vendent"]);
  assert.deepEqual(row("parler", "imparfait"), ["parlais", "parlais", "parlait", "parlions", "parliez", "parlaient"]);
  assert.deepEqual(row("finir", "imparfait")[3], "finissions");
  assert.deepEqual(row("vendre", "futur"), ["vendrai", "vendras", "vendra", "vendrons", "vendrez", "vendront"]);
  assert.deepEqual(row("finir", "conditionnel")[0], "finirais");
  assert.deepEqual(row("vendre", "subjonctif")[2], "vende");
});

test("複合過去は助動詞と過去分詞から組み立てる", () => {
  assert.equal(conjugate(find("parler"), "passeCompose", 0), "ai parlé");
  assert.equal(conjugate(find("finir"), "passeCompose", 4), "avez fini");
  assert.equal(conjugate(find("vendre"), "passeCompose", 5), "ont vendu");
  assert.equal(conjugate(find("rester"), "passeCompose", 0), "suis resté");
  assert.equal(conjugate(find("aller"), "passeCompose", 3), "sommes allés");
});

test("不規則動詞はシードの値を優先する", () => {
  assert.deepEqual(row("être", "present"), ["suis", "es", "est", "sommes", "êtes", "sont"]);
  assert.equal(row("aller", "futur")[0], "irai");
  assert.equal(row("faire", "subjonctif")[4], "fassiez");
  assert.equal(conjugate(find("être"), "passeCompose", 2), "a été");
});

test("全動詞・全セルが空でない答えを返す", () => {
  for (const v of verbs) {
    for (const t of TENSES) {
      for (let i = 0; i < PRONOUNS.length; i++) {
        const a = conjugate(v, t.key, i);
        assert.ok(a && a.trim(), `${v.infinitive} ${t.key} ${i}`);
      }
    }
  }
});

test("採点は大文字小文字と前後空白を無視し、アクセントは区別する", () => {
  assert.ok(isCorrect("  Parlé ", "parlé"));
  assert.ok(!isCorrect("parle", "parlé"));
});

test("動詞の群を判定する", async () => {
  const { classify } = await import("./conjugate.js");
  assert.deepEqual(classify(find("parler")), { group: 1, label: "第1群・-er 規則動詞", irregular: false });
  assert.equal(classify(find("finir")).group, 2);
  assert.equal(classify(find("vendre")).group, 3);
  assert.equal(classify(find("vendre")).irregular, false);
  // aller は -er だが不規則。forms を持つので第3群に落ちる
  assert.deepEqual(classify(find("aller")), { group: 3, label: "第3群・不規則動詞", irregular: true });
});

test("正解表示に人称代名詞を添え、je はエリジオンする", async () => {
  const { withPronoun } = await import("./conjugate.js");
  assert.equal(withPronoun(0, "parle"), "je parle");
  assert.equal(withPronoun(0, "ai"), "j'ai");            // avoir 現在
  assert.equal(withPronoun(0, "étais"), "j'étais");      // être 半過去
  assert.equal(withPronoun(0, "irai"), "j'irai");        // aller 未来
  assert.equal(withPronoun(0, "ai parlé"), "j'ai parlé"); // 複合過去
  assert.equal(withPronoun(1, "as"), "tu as");           // tu はエリジオンしない
  assert.equal(withPronoun(3, "sommes allés"), "nous sommes allés");
});

test("有音の h はエリジオンしない", async () => {
  const { withPronoun } = await import("./conjugate.js");
  assert.equal(withPronoun(0, "habite"), "j'habite");          // 無音の h
  assert.equal(withPronoun(0, "hais", true), "je hais");       // 有音の h (haïr)
  assert.equal(withPronoun(0, "haïssais", true), "je haïssais");
  assert.equal(find("haïr").aspirate, true);
  assert.equal(find("habiter").aspirate, undefined);
});

test("転置してもセルと答えの対応が保たれる", async () => {
  const { cellIndex } = await import("./conjugate.js");
  const seen = [];
  for (let p = 0; p < PRONOUNS.length; p++) {
    for (let t = 0; t < TENSES.length; t++) {
      // 通常は 行=人称/列=時制、転置時は 行=時制/列=人称。同じセルは同じ答えを指す
      assert.equal(cellIndex(p, t, false), cellIndex(t, p, true));
      seen.push(cellIndex(t, p, true));
    }
  }
  // 全セルが重複なく答え配列を覆う
  assert.equal(new Set(seen).size, PRONOUNS.length * TENSES.length);
});
