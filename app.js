import { PRONOUNS, TENSES, cellIndex, conjugate, classify, isCorrect, withPronoun } from "./conjugate.js";
import { cellKey, load as loadStats, save, clear, record, merge, rate, topWrong } from "./stats.js";

const verbs = await fetch("./verbs.json").then((r) => r.json());

const P = PRONOUNS.length;
const T = TENSES.length;
const $ = (id) => document.getElementById(id);
const grid = $("grid");
const scroller = document.querySelector(".scroll");
const touch = matchMedia("(pointer: coarse)").matches;

// 答えと入力は常に「人称 × 時制」の正準順 (p * T + t) で保持し、表示だけ転置する
let verb;
let answers = [];
const values = new Array(P * T).fill("");
// 全問正解して消した人称と時制。やり直しても残り、次の動詞で戻る
const hidden = { p: new Set(), t: new Set() };
const cuts = []; // 消した順。アンドゥで後ろから戻す
let transposed = false;
let checked = false;
let cur = 0; // 表示上の位置 (row-major)
let inputs = [];
let reveals = [];
let canon = []; // canon[表示上の位置] = 正準インデックス
let rowKeys = []; // 表示行 → 人称番号(転置時は時制番号)
let colKeys = [];
let cutR = []; // 各行の末尾にある消去ボタンの置き場
let cutC = [];
let pcts = []; // 各セルの通算正答率
let rowPct = []; // 行・列の見出しに出す、人称別・時制別の通算正答率
let colPct = [];

let stats = loadStats();

// 表の左上の空欄に置く行列入れ替えボタン。横矢印=行、縦矢印=列
const SWAP_BUTTON = `<button id="swap" aria-label="行と列を入れ替え" title="行と列を入れ替え">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7h14m0 0-4-4m4 4-4 4"/>
    <path d="M7 4v14m0 0-4-4m4 4 4-4"/>
  </svg>
</button>`;

const cutButton = (dir, key) => {
  const what = dir === "row" ? "この行" : "この列";
  return `<button class="cut-btn" data-cut="${dir}" data-key="${key}" title="${what}を消す" aria-label="${what}を消す">✕</button>`;
};

const visible = (set, n) => [...Array(n).keys()].filter((i) => !set.has(i));
const rows = () => rowKeys.length;
const cols = () => colKeys.length;

function build() {
  const ps = visible(hidden.p, P);
  const ts = visible(hidden.t, T);
  rowKeys = transposed ? ts : ps;
  colKeys = transposed ? ps : ts;
  // 時制にはフランス語名を添える。aria-label には日本語名だけを使う
  const tense = (i) => `${TENSES[i].label}<small class="fr">${TENSES[i].fr}</small>`;
  const pct = '<small class="pct"></small>';
  const rowHead = (i) => (transposed ? tense(i) : PRONOUNS[i]) + pct;
  const colHead = (i) => (transposed ? PRONOUNS[i] : tense(i)) + pct;
  const rowLabel = (i) => (transposed ? TENSES[i].label : PRONOUNS[i]);
  const colLabel = (i) => (transposed ? PRONOUNS[i] : TENSES[i].label);

  grid.innerHTML =
    `<thead><tr><th>${SWAP_BUTTON}</th>${colKeys.map((i) => `<th>${colHead(i)}</th>`).join("")}<th class="cut"></th></tr></thead><tbody>` +
    rowKeys.map((r) =>
      `<tr><th>${rowHead(r)}</th>${colKeys.map((c) =>
        `<td><input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="${rowLabel(r)} ${colLabel(c)}"><small class="ans"></small><small class="pct"></small></td>`,
      ).join("")}<td class="cut"></td></tr>`,
    ).join("") +
    // 列の消去ボタンを置くためだけの行。ボタンが出ても表が伸びないよう常に置く
    `<tr class="cutrow"><th></th>${colKeys.map(() => `<td class="cut"></td>`).join("")}<td class="cut"></td></tr>` +
    "</tbody>";

  inputs = [...grid.querySelectorAll("input")];
  reveals = inputs.map((el) => el.nextElementSibling);
  canon = inputs.map((_, n) =>
    cellIndex(rowKeys[Math.floor(n / cols())], colKeys[n % cols()], transposed));
  pcts = [...grid.querySelectorAll("td .pct")];
  rowPct = [...grid.querySelectorAll("tbody th .pct")];
  colPct = [...grid.querySelectorAll("thead .pct")];
  cutR = [...grid.querySelectorAll("tbody tr:not(.cutrow) td.cut")];
  cutC = [...grid.querySelectorAll(".cutrow td.cut")].slice(0, cols());
  grid.classList.toggle("transposed", transposed);

  inputs.forEach((el, n) => {
    el.addEventListener("focus", () => { cur = n; pinTable(); reveal(el); });
    el.addEventListener("input", () => {
      values[canon[n]] = el.value;
      el.classList.remove("ok", "ng");
      reveals[n].textContent = "";
      if (checked) setChecked(false); // 直して再採点できるように戻す
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nextCell(); }
    });
  });

  cur = Math.min(cur, inputs.length - 1);
  $("undo").disabled = !cuts.length;
  render();
}

function render() {
  grid.classList.toggle("checked", checked); // 消去ボタンの行は採点まで畳んでおく
  inputs.forEach((el, n) => {
    const k = canon[n];
    el.value = values[k];
    const good = checked && isCorrect(values[k], answers[k]);
    el.classList.toggle("ok", good);
    el.classList.toggle("ng", checked && !good);
    reveals[n].textContent = checked
      ? withPronoun(Math.floor(k / T), answers[k], verb.aspirate)
      : "";
  });

  renderStats();

  // 全部正解した行・列だけ、末尾に消去ボタンを出す。最後の1本は消せない
  const allOk = (ns) => checked && ns.every((n) => isCorrect(values[canon[n]], answers[canon[n]]));
  cutR.forEach((cell, r) => {
    const ns = colKeys.map((_, c) => r * cols() + c);
    cell.innerHTML = rows() > 1 && allOk(ns) ? cutButton("row", rowKeys[r]) : "";
  });
  cutC.forEach((cell, c) => {
    const ns = rowKeys.map((_, r) => r * cols() + c);
    cell.innerHTML = cols() > 1 && allOk(ns) ? cutButton("col", colKeys[c]) : "";
  });
}

// 左端の人称列は sticky で浮いているため、ブラウザは「見えている」と判断してしまう。
// その幅ぶんを差し引いて自前で横スクロールさせる
function reveal(el) {
  const sticky = el.closest("tr").querySelector("th").offsetWidth;
  const cell = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  const over = Math.min(cell.left - view.left - sticky, 0) || Math.max(cell.right - view.right, 0);
  if (over) scroller.scrollLeft += over + Math.sign(over) * 8;
  el.scrollIntoView({ block: "nearest" });
}

// ソフトキーボードの高さは iframe の中からは測れない(visualViewport が縮まない)。
// 表と操作バーごと画面の上端に寄せて、鍵盤に隠れない位置に収める。
// body の padding-bottom がそのためのスクロール余地。
function pinTable() {
  if (!touch) return;
  const top = scroller.getBoundingClientRect().top;
  if (Math.abs(top - 8) > 4) scrollBy({ top: top - 8 });
}

function move(dir) {
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  const r = clamp(Math.floor(cur / cols()) + (dir === "down") - (dir === "up"), rows() - 1);
  const c = clamp((cur % cols()) + (dir === "right") - (dir === "left"), cols() - 1);
  const next = r * cols() + c;
  if (next === cur) return;
  if (!inputs[next].value) { // 空セルだけ直前の答えで補助
    inputs[next].value = inputs[cur].value;
    values[canon[next]] = inputs[next].value;
  }
  inputs[next].focus();
  inputs[next].select();
}

// Enter は「次のセル」。列の一番下まで来たら次の列の一番上へ折り返す。
// 折り返し先は隣の時制(転置時は隣の人称)なので、move() の直前の答えを写す補助はしない
function nextCell() {
  if (Math.floor(cur / cols()) < rows() - 1) return move("down");
  const c = cur % cols();
  if (c === cols() - 1) return; // 右下の最後のセルで止まる
  inputs[c + 1].focus();
  inputs[c + 1].select();
}

// ボタンにフォーカスを奪わせない。効かない環境でも cur は保持しているので復帰できる
document.querySelectorAll(".pad button").forEach((b) => {
  b.addEventListener("pointerdown", (e) => e.preventDefault());
});
document.querySelectorAll("[data-move]").forEach((b) => {
  b.addEventListener("click", () => move(b.dataset.move));
});

// 表の中のボタンは build() のたびに作り直されるので委譲しておく
grid.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#swap, .cut-btn")) e.preventDefault();
});
grid.addEventListener("click", (e) => {
  const cut = e.target.closest(".cut-btn");
  if (cut) {
    const isRow = cut.dataset.cut === "row";
    const axis = isRow !== transposed ? "p" : "t";
    hidden[axis].add(+cut.dataset.key);
    cuts.push([axis, +cut.dataset.key]);
    return build();
  }
  if (!e.target.closest("#swap")) return;
  const k = canon[cur];
  const wasFocused = document.activeElement === inputs[cur];
  transposed = !transposed;
  build();
  cur = Math.max(canon.indexOf(k), 0); // 同じセルに留まる
  if (wasFocused) inputs[cur].focus();
});

function setChecked(v) {
  checked = v;
  $("check").textContent = v ? "やり直す" : "答え合わせ";
}

function reset() {
  values.fill("");
  setChecked(false);
  build(); // 消去ボタンを引っ込める。消した行列はそのまま
  cur = 0;
  inputs[0].focus();
}

function load(v) {
  verb = v;
  const kind = classify(v);
  $("verb").textContent = v.infinitive;
  $("meaning").textContent = v.meaning ?? "";
  $("group").textContent = kind.label;
  $("group").classList.toggle("irregular", kind.irregular);
  answers = PRONOUNS.flatMap((_, p) => TENSES.map((t) => conjugate(v, t.key, p)));
  values.fill("");
  hidden.p.clear();
  hidden.t.clear();
  cuts.length = 0;
  setChecked(false);
  cur = 0;
  build(); // 消した行列を戻す
  scrollTo({ top: 0 }); // 表を上端に寄せたままだと新しい動詞が画面外なので戻す
}

$("check").addEventListener("click", () => {
  if (checked) return reset();
  for (const k of canon) { // 消した行列は数えない
    record(stats, {
      infinitive: verb.infinitive,
      p: Math.floor(k / T),
      tense: TENSES[k % T].key,
      input: values[k],
      ok: isCorrect(values[k], answers[k]),
    });
  }
  save(stats);
  setChecked(true);
  render();
});

// 通算の正答率を表の中に置く。セルは動詞×人称×時制、見出しは人称別・時制別(全動詞の合算)。
// 答え合わせのときだけ出す
function renderStats() {
  const clean = (el) => { el.textContent = ""; el.title = ""; };
  if (!checked) return [...pcts, ...rowPct, ...colPct].forEach(clean);

  const put = (el, b) => {
    if (!b?.n) return clean(el);
    el.textContent = `${rate(b)}%`;
    const wrong = topWrong(b, 3).map(([w, c]) => (c > 1 ? `${w} ×${c}` : w)).join("、");
    el.title = `${b.ok} / ${b.n} 問正解` + (wrong ? `　よくある誤答: ${wrong}` : "");
  };
  pcts.forEach((el, n) => {
    const k = canon[n];
    put(el, stats.cells[cellKey(verb.infinitive, Math.floor(k / T), TENSES[k % T].key)]);
  });
  // 見出しには軸ごとの合算を出す。軸は転置で入れ替わる。通常は 行=人称 / 列=時制
  const axis = (key, pronoun) => merge(stats, (c) =>
    pronoun ? c.pronoun === PRONOUNS[key] : c.tense === TENSES[key].key);
  rowPct.forEach((el, r) => put(el, axis(rowKeys[r], !transposed)));
  colPct.forEach((el, c) => put(el, axis(colKeys[c], transposed)));
}

$("reset-score").addEventListener("click", () => {
  stats = clear();
  render();
});

$("undo").addEventListener("click", () => {
  const [axis, key] = cuts.pop();
  hidden[axis].delete(key);
  build();
});

const pick = () => verbs[Math.floor(Math.random() * verbs.length)];
$("next").addEventListener("click", () => load(pick()));

load(pick());
