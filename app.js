import { PRONOUNS, TENSES, cellIndex, conjugate, classify, isCorrect, withPronoun } from "./conjugate.js";

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
let transposed = false;
let checked = false;
let cur = 0; // 表示上の位置 (row-major)
let inputs = [];
let reveals = [];
let canon = []; // canon[表示上の位置] = 正準インデックス

const rows = () => (transposed ? T : P);
const cols = () => (transposed ? P : T);

function build() {
  const rowLabels = transposed ? TENSES.map((t) => t.label) : PRONOUNS;
  const colLabels = transposed ? PRONOUNS : TENSES.map((t) => t.label);

  grid.innerHTML =
    `<thead><tr><th></th>${colLabels.map((l) => `<th>${l}</th>`).join("")}</tr></thead><tbody>` +
    rowLabels.map((rl) =>
      `<tr><th>${rl}</th>${colLabels.map((cl) =>
        `<td><input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="${rl} ${cl}"><small class="ans"></small></td>`,
      ).join("")}</tr>`,
    ).join("") +
    "</tbody>";

  inputs = [...grid.querySelectorAll("input")];
  reveals = inputs.map((el) => el.nextElementSibling);
  canon = inputs.map((_, n) => cellIndex(Math.floor(n / cols()), n % cols(), transposed));

  inputs.forEach((el, n) => {
    el.addEventListener("focus", () => { cur = n; pinTable(); reveal(el); });
    el.addEventListener("input", () => {
      values[canon[n]] = el.value;
      el.classList.remove("ok", "ng");
      reveals[n].textContent = "";
      if (checked) setChecked(false); // 直して再採点できるように戻す
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); move("down"); }
    });
  });

  render();
}

function render() {
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

// ボタンにフォーカスを奪わせない。効かない環境でも cur は保持しているので復帰できる
document.querySelectorAll(".pad button").forEach((b) => {
  b.addEventListener("pointerdown", (e) => e.preventDefault());
});
document.querySelectorAll("[data-move]").forEach((b) => {
  b.addEventListener("click", () => move(b.dataset.move));
});

$("swap").addEventListener("click", () => {
  const k = canon[cur];
  const wasFocused = document.activeElement === inputs[cur];
  transposed = !transposed;
  build();
  cur = canon.indexOf(k); // 同じセルに留まる
  if (wasFocused) inputs[cur].focus();
});

function setChecked(v) {
  checked = v;
  $("check").textContent = v ? "やり直す" : "答え合わせ";
}

function reset() {
  values.fill("");
  setChecked(false);
  render();
  $("score").textContent = "";
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
  setChecked(false);
  render();
  $("score").textContent = "";
  cur = 0;
  scrollTo({ top: 0 }); // 表を上端に寄せたままだと新しい動詞が画面外なので戻す
}

$("check").addEventListener("click", () => {
  if (checked) return reset();
  const ok = values.reduce((n, v, k) => n + isCorrect(v, answers[k]), 0);
  setChecked(true);
  render();
  $("score").innerHTML = `<b>${ok} / ${values.length}</b> 正解`;
});

const pick = () => verbs[Math.floor(Math.random() * verbs.length)];
$("next").addEventListener("click", () => load(pick()));

build();
load(pick());
