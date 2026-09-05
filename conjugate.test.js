import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRONOUNS, TENSES, classify, conjugate, isCorrect } from "./conjugate.js";

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

test("大過去は助動詞の半過去と過去分詞から組み立てる", () => {
  assert.equal(conjugate(find("parler"), "plusQueParfait", 0), "avais parlé");
  assert.equal(conjugate(find("finir"), "plusQueParfait", 4), "aviez fini");
  assert.equal(conjugate(find("rester"), "plusQueParfait", 0), "étais resté");
  assert.equal(conjugate(find("aller"), "plusQueParfait", 3), "étions allés");
  assert.equal(conjugate(find("être"), "plusQueParfait", 2), "avait été");
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
  assert.deepEqual(classify(find("parler")), { group: 1, label: "第1群・-er 規則動詞" });
  assert.equal(classify(find("finir")).group, 2);
  assert.equal(classify(find("vendre")).group, 3);
  // aller は -er だが不規則。forms を持つので第3群に落ちる
  assert.deepEqual(classify(find("aller")), { group: 3, label: "第3群・不規則動詞" });
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

test("誤答は表記ゆれを畳んでから記録する", async () => {
  const { normalizeWrong } = await import("./stats.js");
  assert.equal(normalizeWrong(" J’ai  Parlé. "), "ai parlé"); // 連続する空白は1つに
  assert.notEqual(normalizeWrong("aiparlé"), "ai parlé");     // 助動詞との間の空白は残す
  assert.equal(normalizeWrong("je parle"), "parle");          // 先頭の人称代名詞は落とす
  assert.equal(normalizeWrong("Nous PARLONS"), "parlons");
  assert.equal(normalizeWrong("parle"), "parle");
  assert.notEqual(normalizeWrong("parle"), normalizeWrong("parlé")); // アクセントは別物
});

test("動詞×人称×時制のセル単位に集計し、軸ごとの成績は合算で出す", async () => {
  const { blank, record, merge, rate, topWrong, cellKey } = await import("./stats.js");
  const s = blank();
  record(s, { infinitive: "parler", p: 0, tense: "present", input: "parle", ok: true });
  record(s, { infinitive: "parler", p: 0, tense: "imparfait", input: " Je  Parlai ", ok: false });
  record(s, { infinitive: "finir", p: 3, tense: "present", input: "parlai", ok: false });
  record(s, { infinitive: "finir", p: 3, tense: "present", input: "", ok: false });

  assert.equal(rate(s.cells[cellKey("parler", 0, "present")]), 100);
  assert.equal(rate(s.cells[cellKey("finir", 3, "present")]), 0);
  assert.equal(s.cells[cellKey("finir", 3, "present")].n, 2);
  assert.equal(s.cells[cellKey("parler", 3, "present")], undefined); // 解いていないセルは作らない

  // 動詞別・人称別・時制別はセルの合算で出す
  assert.equal(rate(merge(s, (c) => c.infinitive === "parler")), 50);
  assert.equal(rate(merge(s, (c) => c.pronoun === "je")), 50);    // je の2問で1問正解
  assert.equal(rate(merge(s, (c) => c.tense === "present")), 33); // 3問で1問。整数に丸める
  assert.equal(rate(merge(s, (c) => c.tense === "imparfait")), 0);
  assert.equal(rate(merge(s, (c) => c.pronoun === "tu")), null);  // まだ解いていない人称

  // 同じ誤答は合算でも1つにまとまる。空欄は中身を残さない
  assert.deepEqual(topWrong(s.cells[cellKey("finir", 3, "present")]), [["parlai", 1]]);
  assert.deepEqual(topWrong(merge(s, () => true)), [["parlai", 2]]);
});

test("メジャーバージョンが違うスコアは捨てる", async () => {
  const { SCHEMA, KEY, load, save, clear, blank } = await import("./stats.js");
  const mem = new Map();
  const store = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };

  const s = blank();
  s.cells["parler|je|present"] = { n: 3, ok: 2, wrong: { parlai: 1 } };
  save(s, store);
  assert.equal(load(store).cells["parler|je|present"].n, 3);

  // 構造の追加(マイナー/パッチ)は読み継ぐ
  mem.set(KEY, JSON.stringify({ ...s, version: `${SCHEMA.split(".")[0]}.99.99` }));
  assert.equal(load(store).cells["parler|je|present"].n, 3);
  assert.equal(load(store).version, SCHEMA);

  // メジャーが変わったら白紙に戻す
  mem.set(KEY, JSON.stringify({ ...s, version: "99.0.0" }));
  assert.deepEqual(load(store), blank());

  mem.set(KEY, "{壊れた");
  assert.deepEqual(load(store), blank());

  save(s, store);
  assert.deepEqual(clear(store), blank());
  assert.equal(store.getItem(KEY), null);
});

test("代名動詞は再帰代名詞を前に置き、複合時制は être になる", async () => {
  const { infinitiveLabel, auxOf, withPronoun } = await import("./conjugate.js");
  assert.deepEqual(row("lever", "present"),
    ["me lève", "te lèves", "se lève", "nous levons", "vous levez", "se lèvent"]);
  // 母音の前で m'/t'/s' になる。nous/vous は縮まない
  assert.deepEqual(row("appeler", "present"),
    ["m'appelle", "t'appelles", "s'appelle", "nous appelons", "vous appelez", "s'appellent"]);
  // 再帰代名詞は複合時制でも助動詞の前。aux は data に書かなくても être
  assert.equal(conjugate(find("coucher"), "passeCompose", 0), "me suis couché");
  assert.equal(conjugate(find("coucher"), "passeCompose", 3), "nous sommes couchés");
  assert.equal(conjugate(find("souvenir"), "plusQueParfait", 2), "s'était souvenu");
  assert.equal(auxOf(find("coucher")), "être");
  // 見出しの se も母音の前で s' になる
  assert.equal(infinitiveLabel(find("lever")), "se lever");
  assert.equal(infinitiveLabel(find("appeler")), "s'appeler");
  assert.equal(infinitiveLabel(find("parler")), "parler");
  // je は代名詞が子音始まりなのでエリジオンしない
  assert.equal(withPronoun(0, "m'appelle"), "je m'appelle");
  assert.equal(withPronoun(0, "me lève"), "je me lève");
});

test("être を取る複合時制は過去分詞の女性形も作れる", () => {
  assert.equal(conjugate(find("aller"), "passeCompose", 2, true), "est allée");
  assert.equal(conjugate(find("aller"), "passeCompose", 5, true), "sont allées");
  assert.equal(conjugate(find("rester"), "plusQueParfait", 0, true), "étais restée");
  // avoir を取る動詞は主語と性数一致しない
  assert.equal(conjugate(find("parler"), "passeCompose", 2, true), "a parlé");
});

// forms の書き漏らしは、規則活用へ静かに落ちて誤答になる。
// 第3群は導出がまず当たらないので、単純時制5つと過去分詞を必ずデータで持たせる
test("第3群の不規則動詞は単純時制と過去分詞をすべてデータで持つ", () => {
  const SIMPLE = ["present", "imparfait", "futur", "conditionnel", "subjonctif"];
  for (const v of verbs) {
    if (!v.forms || v.group) continue; // group 付きは -er の規則活用で埋まる
    assert.ok(v.pp, `${v.infinitive}: pp がない`);
    for (const t of SIMPLE) assert.ok(v.forms[t], `${v.infinitive}: forms.${t} がない`);
  }
});

test("forms の各行は6人称そろっている", () => {
  for (const v of verbs)
    for (const [t, r] of Object.entries(v.forms ?? {}))
      assert.ok(r.length === 6 && r.every((f) => f && f.trim()), `${v.infinitive} ${t}`);
});

test("-ger/-cer/-yer と語幹が変わる -er 動詞", () => {
  // 綴りが変わるのは nous/vous の前後だけ。ほかは規則どおりに導出させる
  assert.equal(row("manger", "present")[3], "mangeons");
  assert.deepEqual(row("manger", "imparfait"),
    ["mangeais", "mangeais", "mangeait", "mangions", "mangiez", "mangeaient"]);
  assert.deepEqual(row("manger", "subjonctif"),
    ["mange", "manges", "mange", "mangions", "mangiez", "mangent"]); // 導出で足りる
  assert.equal(row("manger", "futur")[0], "mangerai");
  assert.equal(conjugate(find("manger"), "passeCompose", 0), "ai mangé");
  assert.equal(row("commencer", "present")[3], "commençons");
  assert.equal(row("commencer", "imparfait")[3], "commencions"); // i の前は c のまま
  assert.equal(row("commencer", "imparfait")[5], "commençaient");
  // 語幹が変わる -er は未来・条件法まで引きずる。半過去は規則どおり
  assert.deepEqual(row("acheter", "futur")[0], "achèterai");
  assert.equal(row("acheter", "imparfait")[0], "achetais");
  assert.equal(row("jeter", "present")[5], "jettent");
  assert.equal(row("jeter", "futur")[0], "jetterai");
  assert.equal(row("nettoyer", "present")[5], "nettoient");
  assert.equal(row("nettoyer", "futur")[0], "nettoierai");
  assert.equal(row("nettoyer", "subjonctif")[3], "nettoyions");
  assert.equal(row("envoyer", "futur")[0], "enverrai"); // -yer だが未来は特殊
  assert.equal(row("préférer", "futur")[0], "préférerai"); // 未来は規則どおり
  assert.equal(row("préférer", "present")[5], "préfèrent");
  // 綴りが変わるだけなので群は第1群のまま
  assert.equal(classify(find("manger")).group, 1);
  assert.equal(classify(find("mettre")).group, 3);
});

test("追加した第3群と être を取る動詞", () => {
  assert.equal(row("recevoir", "present")[5], "reçoivent"); // -oir は group() が効かない
  assert.equal(row("courir", "futur")[0], "courrai");       // r が重なる
  assert.equal(row("mourir", "futur")[0], "mourrai");
  assert.equal(row("boire", "imparfait")[3], "buvions");
  assert.equal(row("connaître", "present")[2], "connaît");
  assert.equal(conjugate(find("ouvrir"), "passeCompose", 0), "ai ouvert");
  assert.equal(conjugate(find("naître"), "passeCompose", 2, true), "est née");
  assert.equal(conjugate(find("mourir"), "passeCompose", 5, true), "sont mortes");
  assert.equal(conjugate(find("sortir"), "plusQueParfait", 3), "étions sortis");
  assert.equal(conjugate(find("descendre"), "passeCompose", 2, true), "est descendue");
  assert.equal(conjugate(find("arriver"), "passeCompose", 0), "suis arrivé");
});

test("代名動詞の s' は無音の h の前でも縮む", async () => {
  const { infinitiveLabel } = await import("./conjugate.js");
  assert.equal(infinitiveLabel(find("habiller")), "s'habiller");
  assert.equal(conjugate(find("habiller"), "present", 0), "m'habille");
  assert.equal(conjugate(find("habiller"), "present", 3), "nous habillons");
  assert.equal(conjugate(find("habiller"), "passeCompose", 0), "me suis habillé");
  assert.deepEqual(row("promener", "present")[0], "me promène");
  assert.equal(conjugate(find("dépêcher"), "plusQueParfait", 1, true), "t'étais dépêchée");
});
