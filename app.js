import { PRONOUNS, TENSES, auxOf, cellIndex, conjugate, classify, infinitiveLabel, isCorrect, withPronoun } from "./conjugate.js";
import { cellKey, load as loadStats, save, clear, record, merge, rate, topWrong } from "./stats.js";

const verbs = await fetch("./verbs.json", { cache: "no-cache" }).then((r) => r.json());

const P = PRONOUNS.length;
const T = TENSES.length;
const $ = (id) => document.getElementById(id);
const grid = $("grid");
const scroller = document.querySelector(".scroll");

// 答えと入力は常に「人称 × 時制」の正準順 (p * T + t) で保持し、表示だけ転置する
let verb;
let answers = [];
const values = new Array(P * T).fill("");
// 採点後に消した人称と時制。やり直しても残り、次の動詞と「消した◯を表示」で戻る
const hidden = { p: new Set(), t: new Set() };
// 表示順。シャッフルで並び替わる。これも動詞をまたいで残る
const order = { p: [...Array(P).keys()], t: [...Array(T).keys()] };
let transposed = false;
let checked = false;
let auxShown = false; // 助動詞を出したか
let cur = 0; // 表示上の位置 (row-major)
let inputs = [];
let reveals = [];
let canon = []; // canon[表示上の位置] = 正準インデックス
let rowKeys = []; // 表示行 → 人称番号(転置時は時制番号)
let colKeys = [];
let footR = []; // 各行の末尾、各列の下にある消去ボタンの置き場
let footC = [];
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

// その隣。行と列をまとめて並び替える
const SHUFFLE_BUTTON = `<button id="shuffle" aria-label="行と列をシャッフル" title="行と列をシャッフル">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
  </svg>
</button>`;

const cutButton = (axis, i) => {
  const what = axis === "row" ? "この行" : "この列";
  return `<button class="cut-btn" data-axis="${axis}" data-i="${i}" title="${what}を消す" aria-label="${what}を消す">✕</button>`;
};

const visible = (axis) => order[axis].filter((i) => !hidden[axis].has(i));

// Fisher-Yates。sort(() => Math.random() - .5) は偏るので使わない
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
const rows = () => rowKeys.length;
const cols = () => colKeys.length;
// 空欄は採点しない。正解にも誤答にも数えず、灰色のまま残す
const answered = (k) => values[k].trim() !== "";

function build() {
  const ps = visible("p");
  const ts = visible("t");
  rowKeys = transposed ? ts : ps;
  colKeys = transposed ? ps : ts;
  // 時制にはフランス語名を添える。aria-label には日本語名だけを使う
  const tense = (i) => `${TENSES[i].label}<small class="fr">${TENSES[i].fr}</small>`;
  const pct = '<small class="pct"></small>';
  const rowHead = (i) => (transposed ? tense(i) : PRONOUNS[i]) + pct;
  const colHead = (i) => (transposed ? PRONOUNS[i] : tense(i)) + pct;
  // 見出しの字面は中身につく。入れ替えても人称はセリフ体、時制は小さな大文字のまま
  const rowCls = transposed ? "tense" : "pron";
  const colCls = transposed ? "pron" : "tense";
  const rowLabel = (i) => (transposed ? TENSES[i].label : PRONOUNS[i]);
  const colLabel = (i) => (transposed ? PRONOUNS[i] : TENSES[i].label);

  grid.innerHTML =
    `<thead><tr><th><div class="corner">${SWAP_BUTTON}${SHUFFLE_BUTTON}</div></th>${colKeys.map((i) => `<th class="${colCls}">${colHead(i)}</th>`).join("")}<th class="foot"></th></tr></thead><tbody>` +
    rowKeys.map((r, y) =>
      `<tr><th class="${rowCls}">${rowHead(r)}</th>${colKeys.map((c, x) =>
        `<td style="--i:${y * cols() + x}"><input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="${rowLabel(r)} ${colLabel(c)}"><small class="ans"></small><small class="pct"></small></td>`,
      ).join("")}<td class="foot"></td></tr>`,
    ).join("") +
    // 列の消去ボタンを置くためだけの行
    `<tr class="footrow"><th></th>${colKeys.map(() => `<td class="foot"></td>`).join("")}<td class="foot"></td></tr>` +
    "</tbody>";

  inputs = [...grid.querySelectorAll("input")];
  reveals = inputs.map((el) => el.nextElementSibling);
  canon = inputs.map((_, n) =>
    cellIndex(rowKeys[Math.floor(n / cols())], colKeys[n % cols()], transposed));
  pcts = [...grid.querySelectorAll("td .pct")];
  rowPct = [...grid.querySelectorAll("tbody th .pct")];
  colPct = [...grid.querySelectorAll("thead .pct")];
  footR = [...grid.querySelectorAll("tbody tr:not(.footrow) td.foot")];
  footC = [...grid.querySelectorAll(".footrow td.foot")].slice(0, cols());
  grid.classList.remove("grading"); // 走りは答え合わせの一回きり

  inputs.forEach((el, n) => {
    el.addEventListener("focus", () => { cur = n; });
    el.addEventListener("input", () => setValue(n, el.value));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); nextCell(); }
    });
  });

  cur = Math.min(cur, inputs.length - 1);
  const cutRows = (transposed ? hidden.t : hidden.p).size;
  const cutCols = (transposed ? hidden.p : hidden.t).size;
  $("restore").hidden = !cutRows && !cutCols;
  $("restore").textContent =
    `消した${cutRows && cutCols ? "行と列" : cutRows ? "行" : "列"}を表示`;
  render();
}

// 辞書の見出しにならって、品詞・語法・複合時制の助動詞を1行に並べる。
// 助動詞は複合過去・大過去の答えそのものなので、押すまで伏せておく
function renderGloss() {
  const aux = auxOf(verb);
  $("gloss").innerHTML = [
    verb.kind && `<i>${verb.kind}</i>`,
    verb.usage,
    auxShown
      ? `aux. <i>${aux}</i>`
      : `aux. <button id="aux-hint" aria-label="助動詞を表示" title="助動詞を表示">?</button>`,
  ].filter(Boolean).join('<span class="sep">·</span>');
  // 用例は必ず活用形を含むので、答え合わせのあとだけ出す
  $("ex").innerHTML = checked && verb.ex
    ? `${verb.ex[0]}<small>${verb.ex[1]}</small>` : "";
}

$("gloss").addEventListener("click", (e) => {
  if (!e.target.closest("#aux-hint")) return;
  auxShown = true;
  renderGloss();
});

// 正解表示。人称代名詞は控えめに、動詞のほうを太くする
function answerHtml(p, form) {
  const s = withPronoun(p, form, verb.aspirate);
  return `<span class="pr">${s.slice(0, -form.length)}</span>${form}`; // "je " / "j'" / "il/elle "
}

function render() {
  grid.classList.toggle("checked", checked); // 消去ボタンは採点まで畳んでおく
  inputs.forEach((el, n) => {
    const k = canon[n];
    const done = checked && answered(k);
    el.value = values[k];
    el.classList.toggle("ok", done && isCorrect(values[k], answers[k]));
    el.classList.toggle("ng", done && !isCorrect(values[k], answers[k]));
    el.classList.toggle("skip", checked && !done); // 空欄は採点対象外
    el.disabled = checked; // 採点中は触れない。やり直すと入力に戻る
    // 答えは空欄のセルにも出す。行の高さが揃って背景がずれない
    reveals[n].innerHTML = checked ? answerHtml(Math.floor(k / T), answers[k]) : "";
  });

  renderStats();

  // 答え合わせのあと、行・列の末尾に消去ボタンを出す。最後の1本は消せない
  footR.forEach((cell, r) => { cell.innerHTML = checked && rows() > 1 ? cutButton("row", r) : ""; });
  footC.forEach((cell, c) => { cell.innerHTML = checked && cols() > 1 ? cutButton("col", c) : ""; });
}

const setValue = (n, v) => {
  inputs[n].value = v;
  values[canon[n]] = v;
};

const focusCell = (n) => { inputs[n].focus(); inputs[n].select(); };

// Enter は「次のセル」。列の一番下まで来たら次の列の一番上へ折り返す
function nextCell() {
  const down = cur + cols();
  if (down < inputs.length) {
    // 縦に進むときだけ、空セルを直前の答えで埋めて補助する
    if (!inputs[down].value) setValue(down, inputs[cur].value);
    return focusCell(down);
  }
  // 折り返し先は隣の時制(転置時は隣の人称)なので写さない。右下の最後のセルでは止まる
  const c = (cur % cols()) + 1;
  if (c < cols()) focusCell(c);
}

// 表の中のボタンは build() のたびに作り直されるので委譲しておく
grid.addEventListener("pointerdown", (e) => {
  if (e.target.closest("#swap, #shuffle, .cut-btn")) e.preventDefault();
});
grid.addEventListener("click", (e) => {
  const cut = e.target.closest(".cut-btn");
  if (cut) {
    const isRow = cut.dataset.axis === "row";
    const i = +cut.dataset.i;
    // 消す行・列だけ先に畳んで見せてから、作り直す
    const at = cut.closest("td").cellIndex;
    const gone = isRow ? [cut.closest("tr")] : [...grid.rows].map((tr) => tr.cells[at]);
    gone.forEach((el) => el?.classList.add("leaving"));
    hidden[isRow !== transposed ? "p" : "t"].add(isRow ? rowKeys[i] : colKeys[i]);
    return setTimeout(() => build(), 200); // .leaving の transition と同じ長さ
  }
  const swap = e.target.closest("#swap");
  if (!swap && !e.target.closest("#shuffle")) return;
  const k = canon[cur];
  const wasFocused = document.activeElement === inputs[cur];
  if (swap) transposed = !transposed;
  else { shuffle(order.p); shuffle(order.t); }
  build();
  // 転置は中身を追って同じセルに留まる。シャッフルは表の同じマスに留まる
  if (swap) cur = Math.max(canon.indexOf(k), 0);
  if (wasFocused) inputs[cur].focus();
});

function setChecked(v) {
  checked = v;
  auxShown = v; // 答え合わせで出し、やり直すとまた伏せる
  $("check").textContent = v ? "やり直す" : "答え合わせ";
  renderGloss();
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
  $("verb").textContent = infinitiveLabel(v);
  $("meaning").textContent = v.meaning ?? "";
  $("group").textContent = kind.label;
  answers = PRONOUNS.flatMap((_, p) => TENSES.map((t) => conjugate(v, t.key, p)));
  values.fill("");
  setChecked(false);
  cur = 0;
  build(); // 消した行列も並び順も、動詞をまたいでそのまま
  inputs[0].focus();
  const url = new URL(location);
  url.searchParams.set("v", infinitiveLabel(v));
  history.replaceState(null, "", url);
}

$("check").addEventListener("click", () => {
  if (checked) return reset();
  for (const k of canon) { // 消した行列と空欄は数えない
    if (!answered(k)) continue;
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
  grid.classList.add("grading");
  render();
});

// 通算の正答率を表の中に置く。セルは動詞×人称×時制、見出しは人称別・時制別(全動詞の合算)。
// 採点したセルにだけ出す
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
    if (!answered(k)) return clean(el);
    put(el, stats.cells[cellKey(verb.infinitive, Math.floor(k / T), TENSES[k % T].key)]);
  });
  // 見出しには軸ごとの合算を出す。軸は転置で入れ替わる。通常は 行=人称 / 列=時制
  const axis = (key, pronoun) => merge(stats, (c) =>
    pronoun ? c.pronoun === PRONOUNS[key] : c.tense === TENSES[key].key);
  rowPct.forEach((el, r) => put(el, axis(rowKeys[r], !transposed)));
  colPct.forEach((el, c) => put(el, axis(colKeys[c], transposed)));
}

$("reset-score").addEventListener("click", () => {
  const all = merge(stats, () => true);
  if (!all.n) return alert("まだ記録がありません。");
  if (!confirm(`これまで ${all.n} 問中 ${all.ok} 問正解 (${rate(all)}%) です。\nスコアをすべて消しますか?`)) return;
  stats = clear();
  render();
});

$("restore").addEventListener("click", () => {
  hidden.p.clear();
  hidden.t.clear();
  build();
});

const pick = () => verbs[Math.floor(Math.random() * verbs.length)];
$("next").addEventListener("click", () => load(pick()));

// ?v=parler で動詞を指す。リロードしても同じ表に戻る
const wanted = new URLSearchParams(location.search).get("v");
// 表を作る前に出す。描画はこのタスクの終わりまで起きないので、まだちらつかない
document.querySelector("main").hidden = false;
load(verbs.find((v) => infinitiveLabel(v) === wanted) ?? pick());

// 表が右に見切れていたら、横スクロールできることを一度だけ知らせる
if (scroller.scrollWidth > scroller.clientWidth + 4) {
  const hint = $("hint");
  const hide = () => hint.classList.add("gone");
  hint.hidden = false;
  scroller.addEventListener("scroll", hide, { once: true });
  setTimeout(hide, 2800);
}
