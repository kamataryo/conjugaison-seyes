import { PRONOUNS, TENSES } from "./conjugate.js";

/**
 * 保存するデータ構造のバージョン。構造を変えたときだけ上げる(データの追加では上げない)。
 * メジャーが上がったら読み込み時に破棄する。マイナー/パッチはそのまま読み継ぐ。
 */
export const SCHEMA = "0.0.1";

export const KEY = "conjugaison.stats";

const major = (v) => String(v).split(".")[0];

/** { version, cells: { "parler|je|present": bucket } } */
export const blank = () => ({ version: SCHEMA, cells: {} });

/** bucket = { n: 回答数, ok: 正答数, wrong: { 正規化した誤答: 回数 } } */
const bucket = () => ({ n: 0, ok: 0, wrong: {} });

/** 集計の単位は「動詞×人称×時制」。動詞別・人称別・時制別は merge() で合算して出す */
export const cellKey = (infinitive, p, tense) => `${infinitive}|${PRONOUNS[p]}|${tense}`;

/**
 * 誤答をまとめるためのキー。採点(conjugate.js の normalize)と同じ強さで畳む。
 * 複合時制の助動詞との間の空白は意味を持つので潰さない。
 * - Unicode 正規化(NFC)、小文字化、前後の空白と句読点を落とす
 * - アポストロフィの字形を ' に統一、連続する空白は1つに
 * - 先頭の人称代名詞 (je / j' / tu ...) を落とす
 */
export function normalizeWrong(s) {
  return (s ?? "").normalize("NFC").toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?'"-]+|[\s.,;:!?'"-]+$/g, "")
    .replace(/^(?:j'|je |tu |il |elle |on |nous |vous |ils |elles )/, "");
}

/** 1セル分の結果を足し込む。stats を破壊的に更新して返す */
export function record(stats, { infinitive, p, tense, input, ok }) {
  const b = (stats.cells[cellKey(infinitive, p, tense)] ??= bucket());
  b.n++;
  if (ok) return b.ok++, stats;
  const key = normalizeWrong(input);
  if (key) b.wrong[key] = (b.wrong[key] ?? 0) + 1; // 空欄は誤答の中身として残さない
  return stats;
}

/** match に合うセルを合算する。動詞別・人称別・時制別はこれで作る */
export function merge(stats, match) {
  const out = bucket();
  for (const [k, b] of Object.entries(stats.cells)) {
    const [infinitive, pronoun, tense] = k.split("|");
    if (!match({ infinitive, pronoun, tense })) continue;
    out.n += b.n;
    out.ok += b.ok;
    for (const [w, c] of Object.entries(b.wrong)) out.wrong[w] = (out.wrong[w] ?? 0) + c;
  }
  return out;
}

export const rate = (b) => (b?.n ? Math.round((b.ok / b.n) * 100) : null);

/** 誤答を多い順に。同数なら文字順で安定させる */
export const topWrong = (b, limit = 5) =>
  Object.entries(b?.wrong ?? {})
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, limit);

export function load(storage = localStorage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    // メジャーが違う = 構造が非互換。作り直す
    if (!s || major(s.version) !== major(SCHEMA)) return blank();
    return { version: SCHEMA, cells: s.cells ?? {} }; // 知らないキーは持ち越さない
  } catch {
    return blank(); // 壊れた JSON や storage 不可でも学習は続けられる
  }
}

export function save(stats, storage = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(stats));
  } catch { /* プライベートモード等。集計が消えるだけで採点は動く */ }
}

export function clear(storage = localStorage) {
  try { storage.removeItem(KEY); } catch { /* 同上 */ }
  return blank();
}
