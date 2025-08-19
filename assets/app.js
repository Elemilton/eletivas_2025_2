/* assets/app.js — versão estável ES5 (sem crases/optional chaining) */

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 3 | 8);
    return v.toString(16);
  });
}

var app = {
  config: null,
  questions: null,
  counts: {},
  mode: 'remove',
  repoOwner: '',
  repoName: '',
  formEl: null,
  questionsEl: null,
  submitBtn: null,
  refreshBtn: null,
  modal: null
};

function loadJSON(path) {
  // evita template string
  var url = path + '?_=' + Date.now();
  return fetch(url, { cache: 'no-store' }).then(function (res) {
    if (!res.ok) {
      throw new Error('Falha ao carregar ' + path + ' (' + res.status + ')');
    }
    return res.json();
  });
}

function init() {
  app.formEl = document.getElementById('form-limit');
  app.questionsEl = document.getElementById('questions');
  app.submitBtn = document.getElementById('submitBtn');
  app.refreshBtn = document.getElementById('refreshBtn');
  app.modal = document.getElementById('modal');

  return loadJSON('config/app.json')
    .then(function (cfg) { app.config = cfg; return loadJSON('config/questions.json'); })
    .then(function (q) { app.questions = q.questions || []; return loadJSON('data/counts.json'); })
    .then(function (counts) { app.counts = counts || {}; })
    .catch(function () { app.counts = {}; })
    .then(function () {
      app.mode = app.config && app.config.modeWhenFull ? app.config.modeWhenFull : 'remove';
      app.repoOwner = app.config && app.config.repoOwner ? app.config.repoOwner : '';
      app.repoName = app.config && app.config.repoName ? app.config.repoName : '';

      var titleEl = document.getElementById('form-title');
      var helpEl = document.getElementById('form-help');
      if (titleEl) titleEl.textContent = (app.config && app.config.formTitle) ? app.config.formTitle : 'Formulário';
      if (helpEl && app.config && app.config.helpText) helpEl.textContent = app.config.helpText;

      renderForm();

      app.refreshBtn.addEventListener('click', function () {
        refreshCounts().then(renderForm);
      });
      app.formEl.addEventListener('submit', onSubmit);
    })
    .catch(function (err) {
      console.error(err);
      alert('Falha ao iniciar o formulário. Confira os JSONs em config/ e data/.');
    });
}

/* --------- Condições --------- */
function readCurrentAnswers() {
  var out = {};
  for (var i = 0; i < app.questions.length; i++) {
    var q = app.questions[i];
    if (q.type === 'text') {
      var elT = document.querySelector('input[name="' + q.id + '"]');
      if (elT && elT.value.trim()) out[q.id] = elT.value.trim();
    } else if (q.type === 'select') {
      var elS = document.querySelector('select[name="' + q.id + '"]');
      if (elS && elS.value) out[q.id] = elS.value;
    } else if (q.type === 'radio') {
      var elR = document.querySelector('input[name="' + q.id + '"]:checked');
      if (elR) out[q.id] = elR.value;
    } else if (q.type === 'checkbox') {
      var els = Array.prototype.slice.call(document.querySelectorAll('input[name="' + q.id + '"]:checked'))
        .map(function (i) { return i.value; });
      if (els.length) out[q.id] = els;
    }
  }
  return out;
}
function testCondition(cond, answers) {
  if (!cond || !cond.field) return true;
  var cur = answers[cond.field];
  var op = cond.op || 'eq';
  var val = cond.value;
  if (op === 'eq') return cur === val;
  if (op === 'neq') return cur !== val;
  if (op === 'in') return Array.isArray(val) && val.indexOf(cur) !== -1;
  return true;
}
function isQuestionVisible(q, answers) { return testCondition(q.visibleIf, answers); }
function isOptionVisible(opt, answers) { return testCondition(opt && opt.visibleIf, answers); }

/* --------- Limites --------- */
function getCount(qid, val) {
  return (app.counts && app.counts[qid] && app.counts[qid][val]) ? app.counts[qid][val] : 0;
}
function getLimit(q, val) {
  var opt = (q.options || []).find(function (o) { return o.value === val; });
  return opt && typeof opt.limit === 'number' ? opt.limit : Infinity;
}
function remaining(q, val) { return Math.max(0, getLimit(q, val) - getCount(q.id, val)); }

/* --------- Render --------- */
function renderForm() {
  app.questionsEl.innerHTML = '';
  var answersSnapshot = readCurrentAnswers();

  for (var i = 0; i < app.questions.length; i++) {
    var q = app.questions[i];
    if (!isQuestionVisible(q, answersSnapshot)) continue;

    var wrap = document.createElement('section');
    wrap.className = 'question';

    var title = document.createElement('h3');
    title.textContent = q.label;
    wrap.appendChild(title);

    if (q.help) {
      var help = document.createElement('p');
      help.className = 'help';
      help.textContent = q.help;
      wrap.appendChild(help);
    }

    if (q.type === 'text') {
      var divT = document.createElement('div');
      divT.className = 'text-wrap';
      var inputT = document.createElement('input');
      inputT.type = 'text';
      inputT.name = q.id;
      inputT.required = !!q.required;
      inputT.value = answersSnapshot[q.id] || '';
      divT.appendChild(inputT);
      wrap.appendChild(divT);
    } else if (q.type === 'radio' || q.type === 'checkbox') {
      var list = document.createElement('div');
      list.className = 'options';
      var allOpts = (q.options || []).filter(function (o) { return isOptionVisible(o, answersSnapshot); });

      for (var j = 0; j < allOpts.length; j++) {
        var o = allOpts[j];
        var rem = remaining(q, o.value);
        var available = rem > 0;
        if (app.mode === 'remove' && !available) continue;

        var id = q.id + '_' + o.value;
        var item = document.createElement('div');
        item.className = 'option';
        if (!available) item.setAttribute('aria-disabled', 'true');

        var input = document.createElement('input');
        input.type = q.type;
        input.name = q.id;
        input.value = o.value;
        input.id = id;
        input.required = q.required && q.type === 'radio';
        if (!available) input.disabled = true;

        if (q.type === 'radio' && answersSnapshot[q.id] === o.value) input.checked = true;
        if (q.type === 'checkbox' && Array.isArray(answersSnapshot[q.id]) && answersSnapshot[q.id].indexOf(o.value) !== -1) input.checked = true;

        var label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = o.label;

        var badge = document.createElement('span');
        badge.className = 'badge';
        badge.title = 'vagas restantes';
        badge.textContent = rem + ' restantes';

        item.appendChild(input);
        item.appendChild(label);
        item.appendChild(badge);
        list.appendChild(item);
      }
      wrap.appendChild(list);
    } else if (q.type === 'select') {
      var divS = document.createElement('div');
      divS.className = 'select-wrap';
      var select = document.createElement('select');
      select.name = q.id;
      select.required = !!q.required;

      var ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'Selecione...';
      ph.disabled = true;

      var prev = answersSnapshot[q.id] || '';
      if (!prev) ph.selected = true;
      select.appendChild(ph);

      var opts = (q.options || []);
      for (var k = 0; k < opts.length; k++) {
        var so = opts[k];
        if (!isOptionVisible(so, answersSnapshot)) continue;
        var remS = remaining(q, so.value);
        var availableS = remS > 0;
        if (app.mode === 'remove' && !availableS) continue;

        var optEl = document.createElement('option');
        optEl.value = so.value;
        optEl.disabled = !availableS;
        optEl.textContent = so.label + (availableS ? '' : ' (indisponível)');
        if (prev && prev === so.value) optEl.selected = true;
        select.appendChild(optEl);
      }

      if (q.id === 'serie_turma') {
        select.addEventListener('change', function () { renderForm(); });
      }

      divS.appendChild(select);
      wrap.appendChild(divS);
    }

    app.questionsEl.appendChild(wrap);
  }
}

/* --------- Counts --------- */
function refreshCounts() {
  return loadJSON('data/counts.json').then(function (c) { app.counts = c || {}; }).catch(function () { app.counts = {}; });
}

/* --------- Coleta --------- */
function collectAnswers() {
  var answers = {};
  var vis = readCurrentAnswers();

  for (var i = 0; i < app.questions.length; i++) {
    var q = app.questions[i];
    if (!isQuestionVisible(q, vis)) continue;

    if (q.type === 'text') {
      var el = document.querySelector('input[name="' + q.id + '"]');
      var val = el ? el.value.trim() : '';
      if (q.required && !val) throw new Error('Preencha "' + q.label + '".');
      if (val) answers[q.id] = val;
    } else if (q.type === 'radio') {
      var elsAll = Array.prototype.slice.call(document.querySelectorAll('input[name="' + q.id + '"]'));
      var visibleValues = (q.options || []).filter(function (o) { return isOptionVisible(o, vis); }).map(function (o) { return o.value; });
      var checked = null;
      for (var j = 0; j < elsAll.length; j++) {
        var elr = elsAll[j];
        if (elr.checked && visibleValues.indexOf(elr.value) !== -1) { checked = elr; break; }
      }
      if (checked) answers[q.id] = checked.value;
      else if (q.required) throw new Error('Selecione uma opção em "' + q.label + '".');
    } else if (q.type === 'checkbox') {
      var els = Array.prototype.slice.call(document.querySelectorAll('input[name="' + q.id + '"]:checked'))
        .filter(function (elc) {
          var opt = (q.options || []).find(function (o) { return o.value === elc.value; });
          return isOptionVisible(opt, vis);
        })
        .map(function (i) { return i.value; });
      if (q.required && (!els || els.length === 0)) throw new Error('Escolha pelo menos uma opção em "' + q.label + '".');
      if (q.maxSelections && els.length > q.maxSelections) throw new Error('Você só pode escolher até ' + q.maxSelections + ' em "' + q.label + '".');
      answers[q.id] = els;
    } else if (q.type === 'select') {
      var sel = document.querySelector('select[name="' + q.id + '"]');
      if (!sel) continue;
      if (q.required && !sel.value) throw new Error('Selecione uma opção em "' + q.label + '".');
      if (sel.value) answers[q.id] = sel.value;
    }
  }
  return answers;
}

/* --------- Issue --------- */
function buildIssueURL(submission) {
  var title = '[FORM] Submission ' + submission.id;
  var bodyMD = [
    '# FORM SUBMISSION',
    '',
    '<!-- DO NOT EDIT BELOW -->',
    'json',
    JSON.stringify(submission),
    '',
    ''
  ].join('\n');
  var url = new URL('https://github.com/' + app.repoOwner + '/' + app.repoName + '/issues/new');
  url.searchParams.set('title', title);
  url.searchParams.set('body', bodyMD);
  url.searchParams.set('labels', 'submission');
  return url.toString();
}

/* --------- Submit --------- */
function onSubmit(e) {
  e.preventDefault();
  app.submitBtn.disabled = true;
  Promise.resolve().then(function () {
    // 1) Coleta primeiro
    return collectAnswers();
  }).then(function (answers) {
    // 2) Atualiza counts e valida limite
    return refreshCounts().then(function () { return answers; });
  }).then(function (answers) {
    for (var i = 0; i < app.questions.length; i++) {
      var q = app.questions[i];
      if (!q.options) continue;
      var check = function (val) {
        var cnt = getCount(q.id, val);
        var lim = getLimit(q, val);
        if (cnt + 1 > lim) throw new Error('A opção "' + val + '" em "' + q.label + '" atingiu o limite.');
      };
      if (q.type === 'checkbox') {
        var arr = answers[q.id] || [];
        for (var j = 0; j < arr.length; j++) check(arr[j]);
      } else if (answers[q.id]) {
        check(answers[q.id]);
      }
    }
    var submission = { id: uuidv4(), at: new Date().toISOString(), answers: answers, client: { ua: navigator.userAgent, lang: navigator.language } };
    var url = buildIssueURL(submission);
    window.open(url, '_blank', 'noopener');
    if (app.modal && typeof app.modal.showModal === 'function') app.modal.showModal();
    else alert('Abrimos uma nova aba com o Issue. Clique em "Submit new issue" no GitHub para concluir.');
  }).catch(function (err) {
    alert(err.message || String(err));
  }).finally(function () {
    app.submitBtn.disabled = false;
  });
}

init();
