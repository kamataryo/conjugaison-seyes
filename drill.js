// 活用ドリルの本体。文法と文言は lang から受け取るので、フランス語版とロシア語版で共有する。
// 各言語の app.js が自前の conjugate.js を束ねて start() を呼ぶ。
//
// lang に要るもの:
//   conjugate.js の一式 (PRONOUNS / TENSES / conjugate / classify / infinitiveLabel /
//                        isCorrect / withPronoun / cellIndex / normalizeWrong)
//   storage  localStorage キーの接頭辞 ("conjugaison" → conjugaison.stats / .pins)
//   locale   ドロップダウンの並び順に使う ("fr" / "ru")
//   ui       ボタンに添える原語の文言
//   gloss    見出し行の項目を並べた配列。falsy は捨てられる

import { cellKey, load as loadStats, save, clear, record, merge, rate, topWrong } from "/stats.js";

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

const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const COPY_ICON = icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
const DONE_ICON = icon('<path d="M20 6 9 17l-5-5"/>');

const iota = (n) => [...Array(n).keys()];
const sorted = (a) => a.every((v, i) => v === i);
const sample = (a) => a[Math.floor(Math.random() * a.length)];

// Fisher-Yates。sort(() => Math.random() - .5) は偏るので使わない
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export async function start(lang) {
  const {
    PRONOUNS, TENSES, cellIndex, conjugate, classify,
    infinitiveLabel, isCorrect, withPronoun, normalizeWrong, ui,
  } = lang;
  const STATS_KEY = `${lang.storage}.stats`;
  const PINS_KEY = `${lang.storage}.pins`;

  // 相対 URL は document 基準で解決されるので、/ru/ から読んだときは ru/verbs.json になる
  const verbs = await fetch("./verbs.json")
    .then((r) => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    // ここで落ちると main が hidden のまま = 白紙。断りを出してから止まる
    .catch((e) => { document.getElementById("fallback").hidden = false; throw e; });

  const P = PRONOUNS.length;
  const T = TENSES.length;
  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const scroller = document.querySelector(".scroll");

  // 答えと入力は常に「人称*時制」の正準順 (p * T + t) で保持し、表示だけ転置する
  let verb;
  let answers = [];
  // 性で形が変わるものだけ女性形にした別解。それ以外は answers と同じ文字列
  let femAnswers = [];
  const values = new Array(P * T).fill("");
  // 採点後に消した人称と時制。やり直しても残り、次の動詞と「消した◯を表示」で戻る
  const hidden = { p: new Set(), t: new Set() };
  // 表示順。シャッフルで並び替わる。これも動詞をまたいで残る
  const order = { p: iota(P), t: iota(T) };
  let transposed = false;
  let checked = false;
  // 見出し行に伏せてある項目(フランス語版の助動詞)を出したか
  let revealed = false;
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

  let stats = loadStats(STATS_KEY);

  const visible = (axis) => order[axis].filter((i) => !hidden[axis].has(i));
  // 転置もシャッフルもしていない、まっさらな並び
  const plain = () => !transposed && sorted(order.p) && sorted(order.t);

  // 行の見出しは CSS の :has で染まるが、同じ列の見出しは CSS から選べないので印をつける
  const markCol = (x) =>
    grid.querySelectorAll("thead th").forEach((th, i) => th.classList.toggle("here", i === x + 1 && x >= 0));

  const rows = () => rowKeys.length;
  const cols = () => colKeys.length;
  // 空欄は採点しない。正解にも誤答にも数えず、灰色のまま残す
  const answered = (k) => values[k].trim() !== "";
  // 女性形で答えたか。正解表示の性もこれに合わせる
  const isFem = (k) => femAnswers[k] !== answers[k] && isCorrect(values[k], femAnswers[k]);
  const graded = (k) => isCorrect(values[k], answers[k]) || isFem(k);
  // 形が存在しないマス。ロシア語版の完了体の現在、命令法の я など。
  // フランス語版の conjugate() は null を返さないので、下の分岐はすべて素通りする
  const none = (k) => answers[k] === null;

  function build() {
    const ps = visible("p");
    const ts = visible("t");
    rowKeys = transposed ? ts : ps;
    colKeys = transposed ? ps : ts;
    // 時制には原語名を添える。aria-label には日本語名だけを使う
    const tense = (i) => `${TENSES[i].label}<small class="sub">${TENSES[i].sub}</small>`;
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
      el.addEventListener("focus", () => { cur = n; markCol(n % cols()); });
      el.addEventListener("blur", () => markCol(-1));
      el.addEventListener("input", () => setValue(n, el.value));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); nextCell(); }
      });
    });

    cur = Math.min(cur, inputs.length - 1);
    const cutRows = (transposed ? hidden.t : hidden.p).size;
    const cutCols = (transposed ? hidden.p : hidden.t).size;
    $("restore").hidden = !cutRows && !cutCols;
    const kind = cutRows && cutCols ? "both" : cutRows ? "rows" : "cols";
    const what = { both: "行と列", rows: "行", cols: "列" }[kind];
    $("restore").innerHTML = `消した${what}を表示<small class="sub">${ui.restore(kind)}</small>`;
    // 1セルだけになったら並べ替える先がない
    $("shuffle").disabled = rows() === 1 && cols() === 1;
    $("reorder").hidden = plain();
    syncUrl();
    renderPins();
    render();
  }

  // 辞書の見出しにならった1行。中身は言語ごとに違うので lang.gloss に任せる
  function renderGloss() {
    $("gloss").innerHTML = `<span class="chip">${classify(verb).label}</span>` +
      lang.gloss(verb, revealed).filter(Boolean).join('<span class="sep">,</span>');
    // 用例は必ず活用形を含むので、答え合わせのあとだけ出す
    $("ex").innerHTML = checked && verb.ex
      ? `${verb.ex[0]}<small>${verb.ex[1]}</small>` : "";
  }

  // 伏せてある項目を押して出す (フランス語版の助動詞)。他の言語には #aux-hint が出ない
  $("gloss").addEventListener("click", (e) => {
    if (!e.target.closest("#aux-hint")) return;
    revealed = true;
    renderGloss();
  });

  // 正解表示。人称代名詞は控えめに、動詞のほうを太くする
  function answerHtml(p, form, fem, tense) {
    const s = withPronoun(p, form, { verb, tense, fem });
    const pr = s.slice(0, -form.length); // "je " / "j'" / "она " / 命令法では ""
    return `<span class="pr">${pr}</span>${form}`;
  }

  function render() {
    grid.classList.toggle("checked", checked); // 消去ボタンは採点まで畳んでおく
    inputs.forEach((el, n) => {
      const k = canon[n];
      const gap = none(k); // 形のないマスは最初から伏せる。書く場所がないことも文法の一部
      const done = checked && answered(k);
      el.value = values[k];
      el.placeholder = gap ? "—" : "";
      el.classList.toggle("gap", gap);
      el.classList.toggle("ok", done && graded(k));
      el.classList.toggle("ng", done && !graded(k));
      el.classList.toggle("skip", checked && !done && !gap); // 空欄は採点対象外
      el.disabled = checked || gap; // 採点中は触れない。やり直すと入力に戻る
      // 答えは空欄のセルにも出す。行の高さが揃って背景がずれない
      const fem = isFem(k);
      reveals[n].innerHTML = checked && !gap
        ? answerHtml(Math.floor(k / T), fem ? femAnswers[k] : answers[k], fem, TENSES[k % T].key)
        : "";
    });

    // 今回のリリースでは通算正答率を出さない。記録は続けているので、この行を戻せば表示される
    // renderStats();

    // 答え合わせのあと、行・列の末尾に消去ボタンを出す。最後の1本は消せない
    footR.forEach((cell, r) => { cell.innerHTML = checked && rows() > 1 ? cutButton("row", r) : ""; });
    footC.forEach((cell, c) => { cell.innerHTML = checked && cols() > 1 ? cutButton("col", c) : ""; });
  }

  const setValue = (n, v) => {
    inputs[n].value = v;
    values[canon[n]] = v;
  };

  const focusCell = (n) => { inputs[n].focus(); inputs[n].select(); };

  // 形のないマスは入力できないので、移動では飛ばす
  const live = (n) => n < inputs.length && !none(canon[n]);
  const firstLive = (c) => {
    for (let n = c; n < inputs.length; n += cols()) if (live(n)) return n;
    return -1;
  };
  // 表の左上から数えて最初に書けるマス
  const focusStart = () => {
    for (let c = 0; c < cols(); c++) {
      const n = firstLive(c);
      if (n >= 0) return focusCell(n);
    }
  };

  // Enter は「次のセル」。列の一番下まで来たら次の列の一番上へ折り返す
  function nextCell() {
    for (let n = cur + cols(); n < inputs.length; n += cols()) {
      if (!live(n)) continue;
      // 縦に進むときだけ、空セルを直前の答えで埋めて補助する
      if (!inputs[n].value) setValue(n, inputs[cur].value);
      return focusCell(n);
    }
    // 折り返し先は隣の時制(転置時は隣の人称)なので写さない。右下の最後のセルでは止まる
    for (let c = (cur % cols()) + 1; c < cols(); c++) {
      const n = firstLive(c);
      if (n >= 0) return focusCell(n);
    }
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
    revealed = v; // 答え合わせで出し、やり直すとまた伏せる
    $("check").innerHTML = v
      ? `やり直す<small class="sub">${ui.recheck}</small>`
      : `答え合わせ<small class="sub">${ui.check}</small>`;
    renderGloss();
  }

  function reset() {
    values.fill("");
    setChecked(false);
    build(); // 消去ボタンを引っ込める。消した行列はそのまま
    cur = 0;
    focusStart();
  }

  function load(v) {
    verb = v;
    $("verb").textContent = infinitiveLabel(v);
    $("pick").value = verbs.indexOf(v); // 「次の動詞」やピンで動いたときも選択を合わせる
    $("meaning").textContent = v.meaning ?? "";
    answers = PRONOUNS.flatMap((_, p) => TENSES.map((t) => conjugate(v, t.key, p)));
    femAnswers = PRONOUNS.flatMap((_, p) => TENSES.map((t) => conjugate(v, t.key, p, true)));
    values.fill("");
    setChecked(false);
    cur = 0;
    build(); // 消した行列も並び順も、動詞をまたいでそのまま。URL は build() が書く
    focusStart();
  }

  // ?v=parler&p=05&t=13 = 動詞と、消した人称・時制。リロードや共有で同じ表に戻る
  function syncUrl() {
    const url = new URL(location);
    url.searchParams.set("v", infinitiveLabel(verb));
    for (const a of ["p", "t"]) {
      if (hidden[a].size) url.searchParams.set(a, [...hidden[a]].sort().join(""));
      else url.searchParams.delete(a);
      // 並び順は初期状態のときだけ省く。URL をむやみに長くしない
      if (sorted(order[a])) url.searchParams.delete("o" + a);
      else url.searchParams.set("o" + a, order[a].join(""));
    }
    if (transposed) url.searchParams.set("x", "1");
    else url.searchParams.delete("x");
    if (quizMode) url.searchParams.set("q", "1");
    else url.searchParams.delete("q");
    url.searchParams.delete("pins"); // 取り込んだら用済み。共有は「問題集をコピー」で作り直す
    history.replaceState(null, "", url);
  }

  $("check").addEventListener("click", () => {
    if (checked) return reset();
    for (const k of canon) { // 消した行列と空欄、形のないマスは数えない
      if (none(k) || !answered(k)) continue;
      record(stats, {
        infinitive: verb.infinitive,
        pronoun: PRONOUNS[Math.floor(k / T)],
        tense: TENSES[k % T].key,
        input: values[k],
        ok: graded(k),
      }, normalizeWrong);
    }
    save(stats, STATS_KEY);
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
      put(el, stats.cells[cellKey(verb.infinitive, PRONOUNS[Math.floor(k / T)], TENSES[k % T].key)]);
    });
    // 見出しには軸ごとの合算を出す。軸は転置で入れ替わる。通常は 行=人称 / 列=時制
    const axis = (key, pronoun) => merge(stats, (c) =>
      pronoun ? c.pronoun === PRONOUNS[key] : c.tense === TENSES[key].key);
    rowPct.forEach((el, r) => put(el, axis(rowKeys[r], !transposed)));
    colPct.forEach((el, c) => put(el, axis(colKeys[c], transposed)));
  }

  // 今回のリリースではスコアのリセットを出さない。index.html の #reset-score と対で戻す
  // $("reset-score").addEventListener("click", () => {
  //   const all = merge(stats, () => true);
  //   if (!all.n) return alert("まだ記録がありません。");
  //   if (!confirm(`これまで ${all.n} 問中 ${all.ok} 問正解 (${rate(all)}%) です。\nスコアをすべて消しますか?`)) return;
  //   stats = clear(STATS_KEY);
  //   render();
  // });

  $("restore").addEventListener("click", () => {
    hidden.p.clear();
    hidden.t.clear();
    build();
  });

  // シャッフルと行列入れ替えをまとめて戻す。消した行列はそのまま (#restore の担当)
  $("reorder").addEventListener("click", () => {
    order.p = iota(P);
    order.t = iota(T);
    transposed = false;
    build();
  });

  const pick = () => sample(verbs);
  $("next").addEventListener("click", () => {
    if (!quizMode) return load(pick());
    // 問題集からは表ごと引く (動詞・並び順・消した行列で1件)。2件以上あれば今の表は避ける
    const here = stateKey(state());
    const rest = pins.filter((s) => stateKey(s) !== here);
    applyPin(sample(rest.length ? rest : pins));
  });

  // ドロップダウンからの直接指定。並び順・消した行列はそのまま引き継ぐ
  // classify() の分類ごとに optgroup。群の番号順に並べ、分類の中はアルファベット順
  const byKind = Object.groupBy(
    verbs
      .map((v, i) => [i, v])
      .sort(([, a], [, b]) =>
        classify(a).group - classify(b).group ||
        a.infinitive.localeCompare(b.infinitive, lang.locale)),
    ([, v]) => classify(v).label,
  );
  $("pick").innerHTML = Object.entries(byKind)
    .map(([label, vs]) => `<optgroup label="${label}">${
      vs.map(([i, v]) => `<option value="${i}">${infinitiveLabel(v)}</option>`).join("")
    }</optgroup>`)
    .join("");
  $("pick").addEventListener("change", (e) => load(verbs[+e.target.value]));

  // ピン留め。動詞・並び順(シャッフルと転置)・消した行列を1件としてまとめる。
  // URL の ?v=&p=&t=&op=&ot=&x= と同じ中身なので、戻すのも同じ経路で済む
  const DEFAULT_ORDER = { p: iota(P).join(""), t: iota(T).join("") };
  let pins = loadPins();
  // 「問題集から出題」。次の動詞をピンの中からだけ引く
  let quizMode = false;
  // 共有 URL から入っているあいだは localStorage を書かない。相手のピンを消さないため
  let ephemeral = false;

  const state = () => ({
    v: infinitiveLabel(verb),
    p: [...hidden.p].sort().join(""),
    t: [...hidden.t].sort().join(""),
    op: order.p.join(""),
    ot: order.t.join(""),
    x: transposed ? 1 : 0,
  });
  const stateKey = (s) => [s.v, s.p, s.t, s.op, s.ot, s.x].join("|");

  function loadPins(storage = localStorage) {
    try {
      const a = JSON.parse(storage.getItem(PINS_KEY));
      return Array.isArray(a) ? a.filter((s) => s?.v) : [];
    } catch {
      return []; // 壊れた JSON や storage 不可。ドリル自体は動く
    }
  }
  function savePins(storage = localStorage) {
    if (ephemeral) return; // 共有 URL の問題集はこの画面かぎり
    try { storage.setItem(PINS_KEY, JSON.stringify(pins)); } catch { /* プライベートモード等 */ }
  }

  // 残っている人称・時制。1本だけならその名前、そうでなければ本数
  const TENSE_LABELS = TENSES.map((t) => t.label);
  const axisLabel = (cut, labels, name) => {
    if (!cut) return null;
    const rest = labels.filter((_, i) => !cut.includes(`${i}`));
    return rest.length === 1 ? rest[0] : `${name} ${rest.length}/${labels.length}`;
  };

  // 一覧に出す一言。並びをいじっていない全体表なら何も言わない
  const pinLabel = (s) => [
    s.x && "転置",
    (s.op !== DEFAULT_ORDER.p || s.ot !== DEFAULT_ORDER.t) && "シャッフル",
    axisLabel(s.p, PRONOUNS, "人称"),
    axisLabel(s.t, TENSE_LABELS, "時制"),
  ].filter(Boolean).join(" · ");

  function renderPins() {
    if (!pins.length) quizMode = false; // 出題元がなくなったら勝手にオフ
    const here = stateKey(state());
    $("pin").setAttribute("aria-pressed", pins.some((s) => stateKey(s) === here));
    $("pins").innerHTML = pins.map((s, i) => {
      const label = pinLabel(s);
      return `<li><button class="pin-open" data-i="${i}" title="この表に戻る"><b>${s.v}</b>${label ? `<small>${label}</small>` : ""}</button>` +
        `<button class="pin-del" data-i="${i}" aria-label="${s.v} のピンを外す" title="ピンを外す">✕</button></li>`;
    }).join("") + (pins.length
      ? `<li class="br"></li>` + // 問題集の操作はピンとは別の行に置く
        `<li class="mode"><button id="quiz-mode" aria-pressed="${quizMode}" title="「次の動詞」をピン留めの中からだけ引く">問題集から出題</button></li>` +
        `<li class="copy"><button id="copy-pins" title="ピン留めをまとめた URL をコピー">${COPY_ICON}問題集をコピー</button></li>`
      : "");
    $("pins").hidden = !pins.length;
    $("pins").classList.toggle("quiz", quizMode);
  }

  // http://192.168.x.x のような非セキュアな文脈では navigator.clipboard ごと存在しない。
  // 黙って失敗すると前のクリップボードの中身が残って紛らわしいので、旧 API に落とす
  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.readOnly = true;
    ta.style.cssText = "position:fixed;top:0;opacity:0";
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS は select() だけでは範囲が決まらない
    const ok = document.execCommand("copy");
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error("copy"));
  }

  // ピン一覧をまとめた ?pins=。1件を stateKey のまま "," でつなぐだけ
  const pinsUrl = () => {
    const url = new URL(location);
    url.searchParams.set("pins", pins.map(stateKey).join(","));
    return String(url);
  };
  // 受け取った側は localStorage を見ずにこれで一覧を作る
  function parsePins(v) {
    return (v ?? "").split(",").filter(Boolean).map((s) => {
      const [inf, p, t, op, ot, x] = s.split("|");
      // 中身は URL から読むときと同じ検算にかけ、今の表と stateKey が揃う形に直す
      return {
        v: inf,
        p: [...parseCut(p, P)].sort().join(""),
        t: [...parseCut(t, T)].sort().join(""),
        op: parseOrder(op, P).join(""),
        ot: parseOrder(ot, T).join(""),
        x: x === "1" ? 1 : 0,
      };
    }).filter((s) => verbs.some((w) => infinitiveLabel(w) === s.v));
  }

  // 消した行列も並び順も、URL から読むときと同じ検算にかける
  function applyPin(s) {
    hidden.p = parseCut(s.p, P);
    hidden.t = parseCut(s.t, T);
    order.p = parseOrder(s.op, P);
    order.t = parseOrder(s.ot, T);
    transposed = !!s.x;
    load(verbs.find((v) => infinitiveLabel(v) === s.v) ?? pick());
  }

  $("pin").addEventListener("click", () => {
    const here = stateKey(state());
    const i = pins.findIndex((s) => stateKey(s) === here);
    if (i < 0) pins.push(state());
    else pins.splice(i, 1); // 留めてある表をもう一度押したら外す
    savePins();
    renderPins();
  });

  // 押した手応えをボタンの字で返す。次の renderPins() で元に戻る
  function flash(btn, svg, msg) {
    btn.innerHTML = svg + msg;
    setTimeout(renderPins, 1600);
  }

  $("pins").addEventListener("click", (e) => {
    const del = e.target.closest(".pin-del");
    if (del) {
      pins.splice(+del.dataset.i, 1);
      savePins();
      return renderPins();
    }
    const copy = e.target.closest("#copy-pins");
    if (copy) {
      // iOS Safari は click の中から直に呼ぶかぎり通る。await を挟むと弾かれるので then で受ける
      return copyText(pinsUrl()).then(
        () => flash(copy, DONE_ICON, "コピーしました"),
        () => flash(copy, COPY_ICON, "コピーできません"),
      );
    }
    const mode = e.target.closest("#quiz-mode");
    if (mode) {
      quizMode = !quizMode;
      syncUrl(); // 出題モードも URL に残す。リロードでも共有先でも続く
      return renderPins();
    }
    const open = e.target.closest(".pin-open");
    if (open) applyPin(pins[+open.dataset.i]);
  });

  // ?v=parler で動詞を指す。リロードしても同じ表に戻る
  const query = new URLSearchParams(location.search);
  const wanted = query.get("v");
  // 消した人称・時制は1桁ずつ並べてある。数字以外と範囲外は捨て、最後の1本は必ず残す
  const parseCut = (v, n) =>
    new Set([...new Set(v ?? "")].map(Number).filter((i) => i >= 0 && i < n).slice(0, n - 1));
  hidden.p = parseCut(query.get("p"), P);
  hidden.t = parseCut(query.get("t"), T);
  // 並び順は全索引がそろっているときだけ採る。欠けても重なっても初期順に戻す
  const parseOrder = (v, n) => {
    const a = [...new Set(v ?? "")].map(Number).filter((i) => i >= 0 && i < n);
    return a.length === n ? a : iota(n);
  };
  order.p = parseOrder(query.get("op"), P);
  order.t = parseOrder(query.get("ot"), T);
  transposed = query.get("x") === "1";
  // ?pins= があればそれを一覧にする。この画面かぎりで、localStorage は読みも書きもしない
  const shared = parsePins(query.get("pins"));
  if (shared.length) {
    pins = shared; // 手元のピンは localStorage に残したまま、この画面だけ差し替える
    ephemeral = true;
  }
  // 問題集の URL から入ったら出題モードで始める
  quizMode = (shared.length > 0 || query.get("q") === "1") && pins.length > 0;
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
}
