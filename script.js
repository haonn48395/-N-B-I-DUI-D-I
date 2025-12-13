/* Full script.js
 - Upload TXT (format 1)
 - Menu bài
 - Quiz mode + Flashcard mode
 - Save progress (localStorage)
 - Auto save on actions
*/

// ---------- Globals ----------
let QUESTIONS = {}; // { "[BÀI x]": [ {name, options:[{text,isCorrect}]}, ... ] }
let currentLesson = null;
let currentQuestions = [];
let wrongList = [];
let wrongIndex = 0;
let mode = 'quiz'; // 'quiz' or 'flash'
let currentFlashIndex = 0;
let selectedAnswers = []; // per-question selected index or null
let timer = null;
let timeLeft = 300; // default 5min

const quizDiv = document.getElementById("quiz");
const flashDiv = document.getElementById("flashcard");
const submitBtn = document.getElementById("submitBtn");
const timerDiv = document.getElementById("timer");
const toggleFlashBtn = document.getElementById("toggleFlashBtn");
const saveProgressBtn = document.getElementById("saveProgressBtn");
const clearProgressBtn = document.getElementById("clearProgressBtn");

// ---------- File load ----------
document.getElementById("loadBtn").onclick = () => {
  const file = document.getElementById("fileInput").files[0];
  if (!file) return alert("Chưa chọn file TXT!");
  const reader = new FileReader();
  reader.onload = () => parseTXT(reader.result);
  reader.readAsText(file, "UTF-8");
};

// ---------- Parse TXT (format 1) ----------
function parseTXT(text) {
  QUESTIONS = {};
  const rawLines = text.split(/\r?\n/);
  let lines = rawLines.map(l => l.trim()).filter(l => l !== '');
  let lesson = null;
  let buffer = [];

  for (const line of lines) {
    if (line.startsWith('[') && line.endsWith(']')) {
      if (lesson && buffer.length) QUESTIONS[lesson] = parseQuestions(buffer);
      lesson = line;
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  if (lesson && buffer.length) QUESTIONS[lesson] = parseQuestions(buffer);
  renderMenu();
  // show controls
  toggleFlashBtn.style.display = 'inline-block';
  saveProgressBtn.style.display = 'inline-block';
  clearProgressBtn.style.display = 'inline-block';
  document.getElementById("manageProgressBtn").style.display = "inline-block";
  // check for saved progress
}

function parseQuestions(lines) {
  // join and split by '}' to extract blocks
  const joined = lines.join('\n');
  const blocks = joined.split('}').map(b => b.trim()).filter(b => b);
  return blocks.map(b => parseQuestion(b + '}'));
}

function parseQuestion(block) {
  const name = block.split('{')[0].trim();
  const inside = block.split('{')[1].replace('}', '').trim();
  const opts = inside.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  let options = [];
  let correctIndex = -1;
  opts.forEach((ln, idx) => {
    if (ln.startsWith('=')) {
      correctIndex = idx;
      options.push({ text: ln.slice(1).trim(), isCorrect: true });
    } else if (ln.startsWith('~')) {
      options.push({ text: ln.slice(1).trim(), isCorrect: false });
    } else {
      // tolerate missing marker
      options.push({ text: ln.replace(/^~|^=/, '').trim(), isCorrect: false });
    }
  });
  shuffle(options);
  return { name, options };
}

// ---------- Menu ----------
function renderMenu() {
  const menu = document.getElementById("menu");
  menu.innerHTML = "<h2>Chọn bài:</h2>";
  Object.keys(QUESTIONS).forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'menu-btn';
    btn.textContent = k;
    btn.onclick = () => loadLesson(k);
    menu.appendChild(btn);
  });
}

// ---------- Load lesson ----------
function loadLesson(lessonName) {
  currentLesson = lessonName;
  currentQuestions = JSON.parse(JSON.stringify(QUESTIONS[lessonName])); // deep copy
  shuffle(currentQuestions);
  selectedAnswers = Array(currentQuestions.length).fill(null);
  wrongList = [];
  wrongIndex = 0;
  currentFlashIndex = 0;
  mode = 'quiz';
  showQuiz();
  startTimer();
  saveState(); // save new session
}

// ---------- Render Quiz ----------
function showQuiz() {
  flashDiv.style.display = 'none';
  quizDiv.style.display = 'block';
  submitBtn.style.display = 'block';
  toggleFlashBtn.textContent = 'Chuyển sang Flashcard';
  toggleFlashBtn.style.display = 'inline-block';
  quizDiv.innerHTML = '';
  currentQuestions.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'question';
    let html = `<h3>${i+1}. ${q.name}</h3>`;
    q.options.forEach((opt, idx) => {
      html += `<label><input type="radio" name="q${i}" value="${idx}"> ${opt.text}</label>`;
    });
    d.innerHTML = html;
    quizDiv.appendChild(d);
  });
  // restore answers if exist
  restoreSelectedAnswersToUI();
}

// ---------- Flashcard Mode ----------
toggleFlashBtn.onclick = () => {
  if (!currentQuestions.length) return alert('Chưa load bài.');
  if (mode === 'quiz') {
    mode = 'flash';
    showFlashcard();
  } else {
    mode = 'quiz';
    showQuiz();
  }
  saveState();
};

function showFlashcard() {
  quizDiv.style.display = 'none';
  submitBtn.style.display = 'none';
  flashDiv.style.display = 'block';
  toggleFlashBtn.textContent = 'Chuyển sang Quiz';
  renderFlash(currentFlashIndex);
}

function renderFlash(index) {
  flashDiv.innerHTML = '';
  const q = currentQuestions[index];
  const card = document.createElement('div'); card.className = 'card';
  const qtext = document.createElement('div'); qtext.className = 'qtext';
  qtext.innerHTML = `<b>${index+1}.</b> ${q.name}`;
  card.appendChild(qtext);

  // show options as small list (optional) — but flashcard shows only question and image (if any)
  // For simplicity, we'll not show options by default; "Hiện đáp án" will show correct text.
  const ansDiv = document.createElement('div');
  ansDiv.className = 'answer-key';
  ansDiv.style.display = 'none';
  ansDiv.innerHTML = `Đáp án đúng: <b>${q.options.find(o=>o.isCorrect).text}</b>`;
  card.appendChild(ansDiv);

  const controls = document.createElement('div'); controls.className = 'controls';
  const prev = document.createElement('button'); prev.className='small-btn'; prev.textContent='⟵ Trước';
  const show = document.createElement('button'); show.className='small-btn'; show.textContent='Hiện đáp án';
  const next = document.createElement('button'); next.className='small-btn'; next.textContent='Tiếp ⟶';
  const known = document.createElement('button'); known.className='small-btn'; known.textContent='Đã biết';
  const unknown = document.createElement('button'); unknown.className='small-btn'; unknown.textContent='Chưa biết';

  prev.onclick = () => { currentFlashIndex = (currentFlashIndex-1 + currentQuestions.length) % currentQuestions.length; renderFlash(currentFlashIndex); saveState(); }
  next.onclick = () => { currentFlashIndex = (currentFlashIndex+1) % currentQuestions.length; renderFlash(currentFlashIndex); saveState(); }
  show.onclick = () => { ansDiv.style.display = ansDiv.style.display === 'none' ? 'block' : 'none'; saveState(); }
  known.onclick = () => { markKnown(index, true); saveState(); }
  unknown.onclick = () => { markKnown(index, false); saveState(); }

  // display known/unknown status if saved
  const tag = document.createElement('div');
  tag.style.position = 'absolute';
  tag.style.top = '12px';
  tag.style.right = '16px';

  const knownKey = getSavedKnownMap();
  if (knownKey && knownKey[index]) {
    tag.innerHTML = `<span class="tag-known">Đã biết</span>`;
  } else {
    tag.innerHTML = `<span class="tag-unknown">Chưa biết</span>`;
  }

  controls.appendChild(prev); controls.appendChild(show); controls.appendChild(next);
  controls.appendChild(known); controls.appendChild(unknown);
  card.appendChild(controls);
  card.appendChild(tag);

  flashDiv.appendChild(card);
}

// mark known/unknown map in localStorage (per lesson)
function markKnown(idx, val) {
  const key = getStorageKey();
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  saved.known = saved.known || {};
  saved.known[idx] = !!val;
  localStorage.setItem(key, JSON.stringify(saved));
  renderFlash(idx);
}

// helper to get known map
function getSavedKnownMap() {
  const key = getStorageKey();
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  return saved.known || {};
}

// ---------- Submit quiz ----------
submitBtn.onclick = finishQuiz;

function finishQuiz() {
  stopTimer();
  wrongList = [];
  let score = 0;
  currentQuestions.forEach((q, i) => {
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    const div = quizDiv.children[i];
    const ans = document.createElement('div');
    ans.className = 'answer-key';
    ans.innerHTML = 'Đáp án đúng: <b>' + q.options.find(o=>o.isCorrect).text + '</b>';
    div.appendChild(ans);
    if (sel && q.options[sel.value].isCorrect) {
      div.classList.add('correct');
      score++;
    } else {
      div.classList.add('incorrect');
      wrongList.push(div);
    }
    // disable radios
    const radios = div.querySelectorAll('input');
    radios.forEach(r=>r.disabled=true);
    div.classList.add('glow');
  });
  document.getElementById('result').innerHTML = `<h2>Kết quả: ${score} / ${currentQuestions.length}</h2>`;
  renderWrongNav();
  saveState(); // save after finish
}

// ---------- Wrong nav ----------
function renderWrongNav() {
  if (!wrongList.length) return;
  // remove existing nav if any
  const existing = document.getElementById('wrongNav');
  if (existing) existing.remove();
  const nav = document.createElement('div');
  nav.id = 'wrongNav';
  nav.style.textAlign = 'center';
  nav.style.marginTop = '12px';
  nav.innerHTML = `<button class="menu-btn" id="prevWrong">Câu sai trước</button>
                   <button class="menu-btn" id="nextWrong">Câu sai tiếp</button>`;
  document.querySelector('.container').appendChild(nav);
  document.getElementById('prevWrong').onclick = ()=> moveWrong(-1);
  document.getElementById('nextWrong').onclick = ()=> moveWrong(1);
}
function moveWrong(dir) {
  if (!wrongList.length) return;
  wrongIndex += dir;
  if (wrongIndex < 0) wrongIndex = wrongList.length - 1;
  if (wrongIndex >= wrongList.length) wrongIndex = 0;
  wrongList[wrongIndex].scrollIntoView({behavior:'smooth', block:'center'});
}

// ---------- Timer ----------
function startTimer() {
  timeLeft = 900;
  stopTimer();
  updateTimerUI();
  timer = setInterval(()=> {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) { finishQuiz(); }
    saveState(); // periodic auto save
  }, 1000);
}
function updateTimerUI() {
  const m = String(Math.floor(timeLeft/60)).padStart(2,'0');
  const s = String(timeLeft%60).padStart(2,'0');
  timerDiv.textContent = `Thời gian: ${m}:${s}`;
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

// ---------- Utilities ----------
function shuffle(arr) { for (let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }

// ---------- Save / Load state ----------
function getStorageKey() {
  return 'quiz_save_' + (currentLesson || 'no_lesson');
}

function saveState() {
  if (!currentLesson) return;
  // collect minimal state
  const state = {
    lesson: currentLesson,
    mode,
    timeLeft,
    currentFlashIndex,
    selectedAnswers: collectSelectedAnswers(),
    questions: currentQuestions, // store current shuffled questions so order persists
  };
  localStorage.setItem(getStorageKey(), JSON.stringify(state));
  // also global index list of saved lessons
  const savedList = JSON.parse(localStorage.getItem('quiz_saved_lessons')||'[]');
  if (!savedList.includes(currentLesson)) { savedList.push(currentLesson); localStorage.setItem('quiz_saved_lessons', JSON.stringify(savedList)); }
}

function collectSelectedAnswers() {
  // read UI radios
  const arr = [];
  for (let i=0;i<currentQuestions.length;i++){
    const sel = document.querySelector(`input[name="q${i}"]:checked`);
    arr.push(sel ? parseInt(sel.value) : null);
  }
  return arr;
}

function restoreSelectedAnswersToUI() {
  if (!selectedAnswers) return;
  selectedAnswers.forEach((val,i) => {
    if (val === null || val === undefined) return;
    const inp = document.querySelector(`input[name="q${i}"][value="${val}"]`);
    if (inp) inp.checked = true;
  });
}

// manual buttons
saveProgressBtn.onclick = () => { saveState(); alert('Đã lưu tiến trình.'); };
clearProgressBtn.onclick = () => {
  if (!currentLesson) return alert('Chưa có tiến trình.');
  if (!confirm('Xóa tiến trình lưu cho bài này?')) return;
  localStorage.removeItem(getStorageKey());
  // update saved list
  let savedList = JSON.parse(localStorage.getItem('quiz_saved_lessons')||'[]');
  savedList = savedList.filter(x=>x!==currentLesson);
  localStorage.setItem('quiz_saved_lessons', JSON.stringify(savedList));
  alert('Đã xóa.');
};

// check saved progress after load file
/*
function checkSavedProgress() {
  // show resume if any saved lessons
  const savedList = JSON.parse(localStorage.getItem('quiz_saved_lessons')||'[]');
  if (savedList.length===0) return;
  // show a prompt to resume any saved lesson or auto show a resume button in menu
  const menu = document.getElementById('menu');
  const resumeDiv = document.createElement('div');
  resumeDiv.style.marginTop = '10px';
  resumeDiv.innerHTML = '<h3>Tiến trình đã lưu:</h3>';
  savedList.forEach(k=>{
    const btn = document.createElement('button');
    btn.className='menu-btn';
    btn.textContent = 'Resume: ' + k;
    btn.onclick = ()=> resumeLesson(k);
    resumeDiv.appendChild(btn);
  });
  menu.appendChild(resumeDiv);
}
*/
function resumeLesson(lessonKey) {
  const saved = JSON.parse(localStorage.getItem('quiz_save_' + lessonKey) || 'null');
  if (!saved) return alert('Không tìm thấy tiến trình.');
  currentLesson = saved.lesson;
  currentQuestions = saved.questions;
  selectedAnswers = saved.selectedAnswers || Array(currentQuestions.length).fill(null);
  timeLeft = saved.timeLeft || 300;
  mode = saved.mode || 'quiz';
  currentFlashIndex = saved.currentFlashIndex || 0;
  // render appropriate mode
  if (mode === 'quiz') showQuiz();
  else showFlashcard();
  restoreSelectedAnswersToUI();
  startTimer(); // resume timer (it uses timeLeft)
  saveState();
}

// ---------- Auto-save before unload ----------
window.addEventListener('beforeunload', () => {
  // save if lesson loaded
  saveState();
});

// ---------- Helper for debug ----------
/* Uncomment to clear all saved on dev:
localStorage.clear();
*/
// ===============================
// PROGRESS MANAGER (POPUP)
// ===============================

const manageBtn = document.getElementById("manageProgressBtn");
const modal = document.getElementById("progressModal");
const progressList = document.getElementById("progressList");
const closeModal = document.getElementById("closeModal");

manageBtn.onclick = () => {
  renderProgressManager();
  modal.style.display = "block";
};

closeModal.onclick = () => {
  modal.style.display = "none";
};

// ===============================
// RENDER PROGRESS LIST
// ===============================
function renderProgressManager() {
  progressList.innerHTML = "";

  const savedLessons = JSON.parse(localStorage.getItem("quiz_saved_lessons") || "[]");

  if (savedLessons.length === 0) {
    progressList.innerHTML = "<p>Chưa có tiến trình nào.</p>";
    return;
  }

  savedLessons.forEach(lesson => {
    const state = JSON.parse(localStorage.getItem("quiz_save_" + lesson));
    if (!state) return;

    const percent = calculateProgressPercent(state);

    const div = document.createElement("div");
    div.className = "progress-item";

    div.innerHTML = `
      <div class="progress-header">
        <b>${lesson}</b>
        <span>${percent}%</span>
      </div>
      <div class="progress-bar">
        <span style="width:${percent}%"></span>
      </div>
      <div style="margin-top:8px;">
        <button class="menu-btn" onclick="resumeFromModal('${lesson}')">Resume</button>
        <button class="menu-btn" onclick="deleteFromModal('${lesson}')">Xoá</button>
      </div>
    `;

    progressList.appendChild(div);
  });
}

// ===============================
// CALCULATE %
// ===============================
function calculateProgressPercent(state) {
  if (!state.questions || state.questions.length === 0) return 0;

  // Quiz mode
  if (state.selectedAnswers) {
    const answered = state.selectedAnswers.filter(a => a !== null).length;
    return Math.round((answered / state.questions.length) * 100);
  }

  // Flashcard mode
  if (state.known) {
    const knownCount = Object.values(state.known).filter(Boolean).length;
    return Math.round((knownCount / state.questions.length) * 100);
  }

  return 0;
}

// ===============================
// RESUME / DELETE
// ===============================
function resumeFromModal(lesson) {
  modal.style.display = "none";
  resumeLesson(lesson);
}

function deleteFromModal(lesson) {
  if (!confirm(`Xoá toàn bộ tiến trình của ${lesson}?`)) return;

  localStorage.removeItem("quiz_save_" + lesson);

  let savedLessons = JSON.parse(localStorage.getItem("quiz_saved_lessons") || "[]");
  savedLessons = savedLessons.filter(l => l !== lesson);
  localStorage.setItem("quiz_saved_lessons", JSON.stringify(savedLessons));

  renderProgressManager();
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}


// End of script.js

