// 活用ドリルの本体。文法と文言は lang から受け取るので、フランス語版とロシア語版で共有する。
// 各言語の app.js が自前の conjugate.js を束ねて start() を呼ぶ。
//
// lang に要るもの:
//   conjugate.js の一式 (PRONOUNS / TENSES / conjugate / classify / infinitiveLabel /
//                        isCorrect / withPronoun / cellIndex / normalizeWrong)
//   storage  localStorage キーの接頭辞 ("conjugaison" → conjugaison.stats)
//   locale   ドロップダウンの並び順に使う ("fr" / "ru")
//   ui       ボタンに添える原語の文言
//   gloss    見出し行の項目を並べた配列。falsy は捨てられる

import { cellKey, load as loadStats, save, clear, record, merge, rate, topWrong } from "/stats.js";

// 利用状況の集計 (Umami)。スクリプトが読めていなければ何もしない
const track = (name, data) => window.umami?.track(name, data);

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

// 正解のうしろに出る読み上げボタン。再生中は波を1本増やして音が出ていることを示す
const sayButton = (flip) => '<button class="say' + (flip ? " flip" : "") + '" aria-label="読み上げ" title="読み上げ">' +
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M14.5 9a4 4 0 0 1 0 6"/>' +
  '<path class="live" d="M17.5 6a8 8 0 0 1 0 12"/></svg></button>';

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

  // 相対 URL は document 基準で解決されるので、/ru/ から読んだときは ru/verbs.json になる
  const verbs = await fetch("./verbs.json")
    .then((r) => r.ok ? r.json() : Promise.reject(new Error(r.status)))
    // ここで落ちると main が hidden のまま = 白紙。断りを出してから止まる
    .catch((e) => { document.getElementById("fallback").hidden = false; throw e; });

  // 見出し行に出せる動詞かどうか。ロシア語版が体の対の相手を出すのに使う
  const has = (inf) => verbs.some((v) => v.infinitive === inf);

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
  // 表示順。シャッフルで並び替わる。動詞を変えると初期順に戻る
  const order = { p: iota(P), t: iota(T) };
  let transposed = false;
  let checked = false;
  // 見出し行に伏せてある項目(フランス語版の助動詞)を出したか
  let revealed = false;
  let touched = false; // この表で1マスでも書いたか。集計の input を1回に畳む
  let cur = 0; // 表示上の位置 (row-major)
  let inputs = [];
  let reveals = [];
  let canon = []; // canon[表示上の位置] = 正準インデックス
  let rowKeys = []; // 表示行 → 人称番号(転置時は時制番号)
  let colKeys = [];
  let footR = []; // 行見出しの中、列見出しの中にある消去ボタンの置き場
  let footC = [];
  let pcts = []; // 各セルの通算正答率
  let rowPct = []; // 行・列の見出しに出す、人称別・時制別の通算正答率
  let colPct = [];

  let stats = loadStats(STATS_KEY);

  const visible = (axis) => order[axis].filter((i) => !hidden[axis].has(i));

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
      `<thead><tr><th><div class="corner">${SWAP_BUTTON}${SHUFFLE_BUTTON}</div></th>${colKeys.map((i) => `<th class="${colCls}">${colHead(i)}<span class="cut-slot"></span></th>`).join("")}</tr></thead><tbody>` +
      rowKeys.map((r, y) =>
        `<tr><th class="${rowCls}">${rowHead(r)}<span class="cut-slot"></span></th>${colKeys.map((c, x) =>
          `<td style="--i:${y * cols() + x}"><input autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="${rowLabel(r)} ${colLabel(c)}"><small class="ans"></small><small class="pct"></small></td>`,
        ).join("")}</tr>`,
      ).join("") +
      "</tbody>";

    inputs = [...grid.querySelectorAll("input")];
    reveals = inputs.map((el) => el.nextElementSibling);
    canon = inputs.map((_, n) =>
      cellIndex(rowKeys[Math.floor(n / cols())], colKeys[n % cols()], transposed));
    pcts = [...grid.querySelectorAll("td .pct")];
    rowPct = [...grid.querySelectorAll("tbody th .pct")];
    colPct = [...grid.querySelectorAll("thead .pct")];
    footR = [...grid.querySelectorAll("tbody th .cut-slot")];
    footC = [...grid.querySelectorAll("thead .cut-slot")];
    grid.classList.remove("grading"); // 走りは答え合わせの一回きり

    inputs.forEach((el, n) => {
      el.addEventListener("focus", () => { cur = n; markCol(n % cols()); });
      el.addEventListener("blur", () => markCol(-1));
      el.addEventListener("input", () => {
        setValue(n, el.value);
        if (!touched) { touched = true; track("input"); } // 表ごとに1回だけ
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); nextCell(); }
      });
    });

    cur = Math.min(cur, inputs.length - 1);
    // 1セルだけになったら並べ替える先がない
    $("shuffle").disabled = rows() === 1 && cols() === 1;
    renderState();
    syncUrl();
    renderPins();
    render();
  }

  // 表の上に出す今の表の断り。消した行列とシャッフルだけ。転置は表を見ればわかる
  // 出題中は消した行列をピンが決めているので ✕ を出さない。シャッフルはピンの外なので出す
  function renderState() {
    const undo = (r, label) => quizMode && r !== "o" ? ""
      : `<button class="chip-x" data-r="${r}" aria-label="${label}" title="${label}">✕</button>`;
    const axis = (name, a, n) =>
      hidden[a].size
        ? `<span class="chip"><span>${name} ${n - hidden[a].size}/${n}</span>${undo(a, `消した${name}を表示`)}</span>` : "";
    const html = axis("人称", "p", P) + axis("時制", "t", T) +
      (sorted(order.p) && sorted(order.t) ? ""
        : `<span class="chip"><span>シャッフル</span>${undo("o", "並び順を戻す")}</span>`);
    $("state").innerHTML = html;
    $("state").hidden = !html;
  }

  // 辞書の見出しにならった1行。中身は言語ごとに違うので lang.gloss に任せる
  function renderGloss() {
    $("gloss").innerHTML = `<span class="chip">${classify(verb).label}</span>` +
      lang.gloss(verb, revealed, has).filter(Boolean).join('<span class="sep">,</span>');
    // 用例は必ず活用形を含むので、答え合わせのあとだけ出す
    $("ex").innerHTML = checked && verb.ex
      ? `${verb.ex[0]}<small>${verb.ex[1]}</small>` : "";
  }

  // 伏せてある項目を押して出す (フランス語版の助動詞)。他の言語には #aux-hint が出ない。
  // ロシア語版はここに体の対への切り替え (#pair-switch) も出す
  $("gloss").addEventListener("click", (e) => {
    const pair = e.target.closest("#pair-switch");
    if (pair) {
      const v = verbs.find((x) => x.infinitive === pair.dataset.v);
      track("pair", { verb: v.infinitive, aspect: v.aspect }); // どちらの体へ渡るか
      return load(v);
    }
    if (!e.target.closest("#aux-hint")) return;
    revealed = true;
    renderGloss();
  });

  // 正解表示。人称代名詞は控えめに、動詞のほうを太くする
  // flip: 男性形と女性形が同じつづりのセル。読み上げの主語だけ性を入れ替えてよい
  function answerHtml(p, form, fem, tense, flip) {
    const s = withPronoun(p, form, { verb, tense, fem });
    const pr = s.slice(0, -form.length); // "je " / "j'" / "она " / 命令法では ""
    return `<span>${pr && `<span class="pr">${pr}</span>`}${form}</span>${canSpeak ? sayButton(flip) : ""}`;
  }

  // 読み上げ。声の在庫はブラウザ任せなので、言語と(選べれば)女性の声だけ指定する
  const canSpeak = "speechSynthesis" in window;
  const VOICE = { fr: "fr-FR", ru: "ru-RU" }[lang.locale];
  // 性別は API から取れないので名前で当てる。よくある女性名を拾い、外れたら既定の声のまま。
  // ponytail: 名前のべた書き。声の指定を細かくしたくなったら設定に出す
  const FEMALE = /am[eé]lie|aur[eé]lie|audrey|julie|marie|c[eé]line|denise|hortense|elo[iï]se|charlotte|milena|katya|irina|svetlana|dariya|alyona|female|женск/i;
  // getVoices() は最初の呼び出しで空を返すことがある (声の読み込みが非同期)。
  // 空のまま声を選ばずに喋らせるとロシア語のように既定の声がない言語で無音になるので、控えておく
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  if (canSpeak) {
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }
  const femaleVoice = () => {
    const list = voices.filter((v) => v.lang.replace("_", "-").startsWith(lang.locale));
    // Google の声は fr/ru とも女性。名前で当たらなかったときの受け皿にする
    return list.find((v) => FEMALE.test(v.name)) ?? list.find((v) => v.name.includes("Google")) ?? list[0];
  };
  // il/elle のように性が畳んであるセルは、読み上げるたびに男女を入れ替える
  let sayFem = false;

  function speak(btn) {
    const playing = btn.classList.contains("on");
    speechSynthesis.cancel(); // 前の読み上げは切る。onend で向こうのボタンが戻る
    if (playing) return; // 鳴っているボタンをもう一度押したら止めるだけ
    // 性で形が変わるセル (elle est allée) は主語を動かすと一致が崩れるので、男性のまま読む
    const text = btn.parentElement.textContent
      .replace(/^(\S+)\/(\S+)/, (_, m, f) =>
        btn.classList.contains("flip") && (sayFem = !sayFem) ? f : m);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE;
    u.rate = 0.85; // 活用を聞き取る用なので、既定より少し遅く
    const v = femaleVoice();
    if (v) u.voice = v;
    u.onend = u.onerror = () => btn.classList.remove("on");
    btn.classList.add("on");
    // cancel() の直後に speak() すると読み上げが落ちることがある (Chrome)。
    // 一拍おいてから積む。pause 状態のまま残ることもあるので resume() も添える
    speechSynthesis.resume();
    setTimeout(() => speechSynthesis.speak(u), 30);
  }

  function render() {
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
        ? answerHtml(Math.floor(k / T), fem ? femAnswers[k] : answers[k], fem, TENSES[k % T].key, femAnswers[k] === answers[k])
        : "";
    });

    // 今回のリリースでは通算正答率を出さない。記録は続けているので、この行を戻せば表示される
    // renderStats();

    // 答え合わせのあと、行・列の見出しの中に消去ボタンを出す。最後の1本は消せない。
    // 出題中は今の表をピンが決めているので、戻せる ✕ を出さないのと対で、消すほうも出さない
    const cuttable = checked && !quizMode;
    const cutR = cuttable && rows() > 1;
    const cutC = cuttable && cols() > 1;
    // 見出しはボタンが出るときだけ、その置き場のぶん広げる
    grid.classList.toggle("cut-r", cutR);
    grid.classList.toggle("cut-c", cutC);
    footR.forEach((cell, r) => { cell.innerHTML = cutR ? cutButton("row", r) : ""; });
    footC.forEach((cell, c) => { cell.innerHTML = cutC ? cutButton("col", c) : ""; });
  }

  const setValue = (n, v) => {
    inputs[n].value = v;
    values[canon[n]] = v;
  };

  // preventScroll: こちらから当てるフォーカスで表を動かさない。
  // 画面外のセルは指で送ってもらう。Enter で1マス進むたびに紙面が跳ねるほうが読みにくい
  const focusCell = (n) => { inputs[n].focus({ preventScroll: true }); inputs[n].select(); };

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
    if (e.target.closest("#swap, #shuffle, .cut-btn, .say")) e.preventDefault();
  });
  grid.addEventListener("click", (e) => {
    const say = e.target.closest(".say");
    if (say) { track("say"); return speak(say); }
    const cut = e.target.closest(".cut-btn");
    if (cut) {
      const isRow = cut.dataset.axis === "row";
      const i = +cut.dataset.i;
      track("cut", { axis: isRow ? "row" : "col" });
      // 消す行・列だけ先に畳んで見せてから、作り直す
      const at = cut.closest("th").cellIndex;
      const gone = isRow ? [cut.closest("tr")] : [...grid.rows].map((tr) => tr.cells[at]);
      gone.forEach((el) => el?.classList.add("leaving"));
      hidden[isRow !== transposed ? "p" : "t"].add(isRow ? rowKeys[i] : colKeys[i]);
      return setTimeout(() => build(), 200); // .leaving の transition と同じ長さ
    }
    const swap = e.target.closest("#swap");
    if (!swap && !e.target.closest("#shuffle")) return;
    const k = canon[cur];
    const wasFocused = document.activeElement === inputs[cur];
    track(swap ? "swap" : "shuffle");
    if (swap) transposed = !transposed;
    else { shuffle(order.p); shuffle(order.t); }
    build();
    // 転置は中身を追って同じセルに留まる。シャッフルは表の同じマスに留まる
    if (swap) cur = Math.max(canon.indexOf(k), 0);
    if (wasFocused) inputs[cur].focus({ preventScroll: true });
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
    track("retry");
    values.fill("");
    setChecked(false);
    touched = false;
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
    touched = false;
    cur = 0;
    // シャッフルはこの表かぎり。消した行列と転置は動詞をまたいでそのまま
    order.p = iota(P);
    order.t = iota(T);
    build(); // URL は build() が書く
    focusStart();
  }

  // ?v=parler&p=05&t=13 = 動詞と、消した人称・時制。リロードや共有で同じ表に戻る。
  // シャッフルはその場かぎりなので URL に入れない
  // push=true のときだけ履歴に1段積む。取り消せない操作 (ピンを外す) の前後を残すため
  function syncUrl(push = false) {
    const url = new URL(location);
    url.searchParams.set("v", infinitiveLabel(verb));
    for (const a of ["p", "t"]) {
      if (hidden[a].size) url.searchParams.set(a, [...hidden[a]].sort().join(""));
      else url.searchParams.delete(a);
    }
    if (transposed) url.searchParams.set("x", "1");
    else url.searchParams.delete("x");
    // 問題集は URL が唯一の置き場。リロードでも共有先でも同じ一覧に戻る
    if (pins.length) {
      url.searchParams.set("pins", pins.map(stateKey).join(","));
      url.searchParams.set("q", quizMode ? "1" : "0"); // 0 も書く。既存の共有リンク(q なし)は出題モードで開く
    } else {
      url.searchParams.delete("pins");
      url.searchParams.delete("q");
    }
    history[push ? "pushState" : "replaceState"](null, "", url);
  }

  // 表の状態は全部 URL に入っているので、戻る/進むは読み直しで足りる。
  // ponytail: popstate から状態を組み直さず reload で済ませる。書きかけの答えは消えるが、
  // 積んだ履歴はピンを外す取り消しだけなので、そこで消えて困る入力はない
  addEventListener("popstate", () => location.reload());

  $("check").addEventListener("click", () => {
    if (checked) return reset();
    let cells = 0; // 出題数と、そのうち埋めた数、当たった数。集計に送る
    let filled = 0;
    let correct = 0;
    for (const k of canon) { // 消した行列と空欄、形のないマスは数えない
      if (none(k)) continue;
      cells++;
      if (!answered(k)) continue;
      filled++;
      const ok = graded(k);
      if (ok) correct++;
      record(stats, {
        infinitive: verb.infinitive,
        pronoun: PRONOUNS[Math.floor(k / T)],
        tense: TENSES[k % T].key,
        input: values[k],
        ok,
      }, normalizeWrong);
    }
    save(stats, STATS_KEY);
    // 当たり具合は端末の中にしか残らないので、動詞ごとの難しさが見えるのはここだけ
    track("check", { verb: verb.infinitive, cells, filled, correct });
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

  // 断り書きの ✕ は、そのチップが言っている分だけを戻す。
  // 転置はチップに出していない (表を見ればわかる) ので、戻すのは左上の ⇄ の担当
  $("state").addEventListener("click", (e) => {
    const r = e.target.closest(".chip-x")?.dataset.r;
    if (!r) return;
    if (r === "o") { order.p = iota(P); order.t = iota(T); }
    else hidden[r].clear();
    build();
  });

  const pick = () => sample(verbs);
  $("next").addEventListener("click", () => {
    track("next", { quiz: quizMode });
    if (!quizMode) return load(pick());
    // 問題集からは表ごと引く (動詞・並び順・消した行列で1件)。2件以上あれば今の表は避ける
    const here = stateKey(state());
    const rest = pins.filter((s) => stateKey(s) !== here);
    applyPin(sample(rest.length ? rest : pins));
  });

  // ドロップダウンからの直接指定。消した行列と転置はそのまま引き継ぐ
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
  // ランダムの「次の動詞」に対して、こちらは覚えたい動詞を名指しした行動
  $("pick").addEventListener("change", (e) => {
    track("pick");
    load(verbs[+e.target.value]);
  });

  // ピン留め。動詞・転置・消した行列を1件としてまとめる。
  // URL の ?v=&p=&t=&x= と同じ中身なので、戻すのも同じ経路で済む。
  // シャッフルはその場かぎりの並べ替えなので入れない
  let pins = []; // 中身は下の ?pins= から入る
  // 「問題集から出題」。次の動詞をピンの中からだけ引く
  let quizMode = false;

  const state = () => ({
    v: infinitiveLabel(verb),
    p: [...hidden.p].sort().join(""),
    t: [...hidden.t].sort().join(""),
    x: transposed ? 1 : 0,
  });
  const stateKey = (s) => [s.v, s.p, s.t, s.x].join("|");
  // 今の表が問題集の1件か
  const pinned = () => pins.some((s) => stateKey(s) === stateKey(state()));

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
    axisLabel(s.p, PRONOUNS, "人称"),
    axisLabel(s.t, TENSE_LABELS, "時制"),
  ].filter(Boolean).join(" · ");

  function renderPins() {
    if (!pins.length) quizMode = false; // 出題元がなくなったら勝手にオフ
    $("pin").setAttribute("aria-pressed", pinned());
    const chips = pins.map((s, i) => {
      const label = pinLabel(s);
      return `<li><button class="pin-open" data-i="${i}" title="この表に戻る"><b>${s.v}</b>${label ? `<small>${label}</small>` : ""}</button>` +
        `<button class="pin-del" data-i="${i}" aria-label="${s.v} のピンを外す" title="ピンを外す">✕</button></li>`;
    }).join("");
    const ctrl = pins.length
      ? `<li class="mode"><button id="quiz-mode" aria-pressed="${quizMode}" title="「次の動詞」をピン留めの中からだけ引く">問題集（ピン留め）から出題</button></li>` +
        `<li class="copy"><button id="copy-pins" title="ピン留めをまとめた URL をコピー">${COPY_ICON}問題集をコピー</button></li>` +
        `<li class="clear"><button id="clear-pins" title="ピン留めをすべて外す">ピン留めをすべて外す</button></li>`
      : "";
    $("pins").innerHTML = chips;
    $("pin-ctrl").innerHTML = ctrl;
    $("pin-ctrl").hidden = !pins.length;
    $("pins-title").textContent = `問題集（${pins.length}問）`;
    $("pins-box").hidden = !pins.length;
    for (const id of ["pins", "pin-ctrl", "pins-box"]) $(id).classList.toggle("quiz", quizMode);
    // 出題中の動詞は問題集が決める。自分で選べると出題が崩れる
    $("pick").disabled = quizMode;
  }

  // 並べ替えを見せる (FLIP)。動いた分だけ元の位置に戻してから、新しい位置へ流す
  function reflowPins(fn) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return fn();
    const key = (li) => li.querySelector("button")?.id || li.querySelector("[data-i]")?.dataset.i;
    const before = new Map([...$("pins").children].map((li) => [key(li), li.getBoundingClientRect()]));
    fn();
    for (const li of $("pins").children) {
      const a = before.get(key(li));
      if (!a) continue; // 新しく出た項目は動かしようがない
      const b = li.getBoundingClientRect();
      const [dx, dy] = [a.left - b.left, a.top - b.top];
      if (dx || dy) li.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], 220);
    }
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

  // ?pins= を一覧に戻す。1件は stateKey のまま "," でつないである
  function parsePins(v) {
    const seen = new Set();
    return (v ?? "").split(",").filter(Boolean).map((s) => {
      const [inf, p, t, x] = s.split("|");
      // 中身は URL から読むときと同じ検算にかけ、今の表と stateKey が揃う形に直す
      return {
        v: inf,
        p: [...parseCut(p, P)].sort().join(""),
        t: [...parseCut(t, T)].sort().join(""),
        x: x === "1" ? 1 : 0,
      };
    }).filter((s) => {
      if (!verbs.some((w) => infinitiveLabel(w) === s.v)) return false;
      const k = stateKey(s); // 同じ表が2件あっても出題が偏るだけ
      return !seen.has(k) && !!seen.add(k);
    });
  }

  // 消した行列は URL から読むときと同じ検算にかける。並び順は load() が初期順に戻す
  function applyPin(s) {
    hidden.p = parseCut(s.p, P);
    hidden.t = parseCut(s.t, T);
    transposed = !!s.x;
    load(verbs.find((v) => infinitiveLabel(v) === s.v) ?? pick());
  }

  $("pin").addEventListener("click", () => {
    const here = stateKey(state());
    const i = pins.findIndex((s) => stateKey(s) === here);
    track("pin", { on: i < 0 }); // 留めたのか外したのか
    if (i < 0) pins.push(state());
    else pins.splice(i, 1); // 留めてある表をもう一度押したら外す
    syncUrl();
    renderPins();
  });

  // 押した手応えをボタンの字で返す。次の renderPins() で元に戻る
  function flash(btn, svg, msg) {
    btn.innerHTML = svg + msg;
    setTimeout(renderPins, 1600);
  }

  const onPinsClick = (e) => {
    const del = e.target.closest(".pin-del");
    if (del) {
      pins.splice(+del.dataset.i, 1);
      renderPins(); // 最後の1件を外すと出題モードも落ちるので、URL はそのあとで揃える
      return syncUrl(true); // 外す前の一覧に戻れるよう履歴に積む
    }
    const copy = e.target.closest("#copy-pins");
    if (copy) {
      track("copy-pins", { count: pins.length }); // 何件の問題集が配られたか
      // iOS Safari は click の中から直に呼ぶかぎり通る。await を挟むと弾かれるので then で受ける
      return copyText(location.href).then(
        () => flash(copy, DONE_ICON, "コピーしました"),
        () => flash(copy, COPY_ICON, "コピーできません"),
      );
    }
    const wipe = e.target.closest("#clear-pins");
    if (wipe) {
      pins = [];
      renderPins(); // 出題モードもここで落ちる
      return syncUrl(true); // 戻したいときはブラウザの戻るで直前の ?pins= に戻れる
    }
    const mode = e.target.closest("#quiz-mode");
    if (mode) {
      quizMode = !quizMode;
      return reflowPins(() => {
        // 出題モードに入ったのに問題集の外の表のまま、では出題が始まらない
        if (quizMode && !pinned()) return applyPin(sample(pins));
        // 断りの ✕ と消去ボタンは出題中かどうかで変わるので、表ごと作り直す。
        // URL (出題モードも残す) とピン一覧も build() が揃える
        build();
      });
    }
    const open = e.target.closest(".pin-open");
    if (open) applyPin(pins[+open.dataset.i]);
  };
  // チップ (details の中) と操作ボタン (外) で親が分かれたので、両方で拾う
  $("pins").addEventListener("click", onPinsClick);
  $("pin-ctrl").addEventListener("click", onPinsClick);

  // ?v=parler で動詞を指す。リロードしても同じ表に戻る
  const query = new URLSearchParams(location.search);

  // クエリ付きで開かれたとき (広告・共有リンク) の着地を1回だけ記録する。
  // exclude-search で URL は送られないので、ここで拾わないとどこにも残らない。
  // fbclid のような 1 人 1 個の印は拾わない (拾うと内訳が人数分に散る)
  if (location.search) track("landing", {
    source: query.get("utm_source") || undefined,
    medium: query.get("utm_medium") || undefined,
    campaign: query.get("utm_campaign") || undefined,
    ad: query.get("utm_content") || undefined,
    // 何の動詞で開かせたか。「être から始めると続くか」を見るための足がかり
    v: query.get("v") || undefined,
    pins: query.get("pins")?.split(",").length, // 問題集は件数だけ。中身は散るので見ない
  });

  const wanted = query.get("v");
  // 消した人称・時制は1桁ずつ並べてある。数字以外と範囲外は捨て、最後の1本は必ず残す
  const parseCut = (v, n) =>
    new Set([...new Set(v ?? "")].map(Number).filter((i) => i >= 0 && i < n).slice(0, n - 1));
  hidden.p = parseCut(query.get("p"), P);
  hidden.t = parseCut(query.get("t"), T);
  transposed = query.get("x") === "1";
  pins = parsePins(query.get("pins"));
  // 問題集の URL から入ったら出題モードで始める。自分で切ったときだけ q=0 が書いてある
  quizMode = pins.length > 0 && query.get("q") !== "0";
  // 表を作る前に出す。描画はこのタスクの終わりまで起きないので、まだちらつかない
  document.querySelector("main").hidden = false;
  load(verbs.find((v) => infinitiveLabel(v) === wanted) ?? pick());
  // 問題集リンクから入ったのに今の表がピンに無い = URL の指す表は問題集の外。
  // 「次の動詞」を待たせず、最初から問題集の中身を出す
  if (quizMode && !pinned()) applyPin(sample(pins));

  // 表が右に見切れていたら、横スクロールできることを一度だけ知らせる
  if (scroller.scrollWidth > scroller.clientWidth + 4) {
    const hint = $("hint");
    const hide = () => hint.classList.add("gone");
    hint.style.setProperty("--thead-h", grid.tHead.offsetHeight + "px"); // 見出し行を除いて中央に置く
    hint.hidden = false;
    scroller.addEventListener("scroll", hide, { once: true });
    setTimeout(hide, 2800);
  }

  // 不具合の報告は環境と場所が分からないと追えない。フォームを開く直前に足す
  document.querySelector('a[href*="docs.google.com/forms"]')?.addEventListener("click", (e) => {
    const url = new URL(e.currentTarget.href);
    url.searchParams.set("entry.149797981", navigator.userAgent);
    url.searchParams.set("entry.1293148250", location.href);
    e.currentTarget.href = url;
  });
}
