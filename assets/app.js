function uuidv4(){return'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){const r=Math.random()*16|0,v=c=='x'?r:(r&0x3|0x8);return v.toString(16);});}

const app={config:null,questions:null,counts:{},mode:'remove',repoOwner:'',repoName:'',formEl:null,questionsEl:null,submitBtn:null,refreshBtn:null,modal:null};

async function loadJSON(path){
  const res=await fetch(`${path}?_=${Date.now()}`,{cache:'no-store'});
  if(!res.ok) throw new Error(`Falha ao carregar ${path} (${res.status})`);
  return await res.json();
}

async function init(){
  app.formEl=document.getElementById('form-limit');
  app.questionsEl=document.getElementById('questions');
  app.submitBtn=document.getElementById('submitBtn');
  app.refreshBtn=document.getElementById('refreshBtn');
  app.modal=document.getElementById('modal');

  app.config=await loadJSON('config/app.json');
  app.questions=(await loadJSON('config/questions.json')).questions;
  app.counts=await loadJSON('data/counts.json').catch(()=>({}));

  app.mode=app.config.modeWhenFull||'remove';
  app.repoOwner=app.config.repoOwner;
  app.repoName=app.config.repoName;

  const titleEl=document.getElementById('form-title');
  const helpEl=document.getElementById('form-help');
  if(titleEl) titleEl.textContent=app.config.formTitle||'Formulário';
  if(helpEl && app.config.helpText) helpEl.textContent=app.config.helpText;

  renderForm();

  app.refreshBtn.addEventListener('click', async ()=>{
    await refreshCounts();
    renderForm();
  });

  app.formEl.addEventListener('submit', onSubmit);
}

function readCurrentAnswers(){
  const out={};
  for(const q of app.questions){
    if(q.type==='text'){
      const el=document.querySelector(`input[name="${q.id}"]`);
      if(el && el.value.trim()) out[q.id]=el.value.trim();
    }else if(q.type==='select'){
      const el=document.querySelector(`select[name="${q.id}"]`);
      if(el && el.value) out[q.id]=el.value;
    }else if(q.type==='radio'){
      const el=document.querySelector(`input[name="${q.id}"]:checked`);
      if(el) out[q.id]=el.value;
    }else if(q.type==='checkbox'){
      const els=Array.from(document.querySelectorAll(`input[name="${q.id}"]:checked`)).map(i=>i.value);
      if(els.length) out[q.id]=els;
    }
  }
  return out;
}
function testCondition(cond, answers){
  if(!cond || !cond.field) return true;
  const cur=answers[cond.field];
  const {op='eq', value}=cond;
  if(op==='eq')  return cur===value;
  if(op==='neq') return cur!==value;
  if(op==='in')  return Array.isArray(value)&&value.includes(cur);
  return true;
}
function isQuestionVisible(q, answers){ return testCondition(q.visibleIf, answers); }
function isOptionVisible(opt, answers){ return testCondition(opt.visibleIf, answers); }

function getCount(qid,val){return (app.counts?.[qid]?.[val])||0;}
function getLimit(q,val){const opt=q.options?.find(o=>o.value===val);return opt?.limit??Infinity;}
function remaining(q,val){return Math.max(0,getLimit(q,val)-getCount(q.id,val));}

function renderForm(){
  app.questionsEl.innerHTML='';
  const answersSnapshot=readCurrentAnswers();

  for(const q of app.questions){
    if(!isQuestionVisible(q, answersSnapshot)) continue;

    const wrap=document.createElement('section');
    wrap.className='question';

    const title=document.createElement('h3');
    title.textContent=q.label;
    wrap.appendChild(title);

    if(q.help){
      const help=document.createElement('p');
      help.className='help';
      help.textContent=q.help;
      wrap.appendChild(help);
    }

    if(q.type==='text'){
      const div=document.createElement('div');
      div.className='text-wrap';
      const input=document.createElement('input');
      input.type='text';
      input.name=q.id;
      input.required=!!q.required;
      input.value=(answersSnapshot[q.id]||'');
      div.appendChild(input);
      wrap.appendChild(div);
    }
    else if(q.type==='radio' || q.type==='checkbox'){
      const list=document.createElement('div');
      list.className='options';
      const visibleOpts=(q.options||[]).filter(o=>isOptionVisible(o, answersSnapshot));

      const opts=visibleOpts.map(o=>{
        const rem=remaining(q,o.value);
        return {...o, rem, available: rem>0};
      });

      for(const o of opts){
        if(app.mode==='remove' && !o.available) continue;

        const id=`${q.id}_${o.value}`;
        const item=document.createElement('div');
        item.className='option';
        if(!o.available) item.setAttribute('aria-disabled','true');

        const input=document.createElement('input');
        input.type=q.type;
        input.name=q.id;
        input.value=o.value;
        input.id=id;
        input.required=q.required && q.type==='radio';
        if(!o.available) input.disabled=true;

        if(q.type==='radio' && answersSnapshot[q.id]===o.value) input.checked=true;
        if(q.type==='checkbox' && Array.isArray(answersSnapshot[q.id]) && answersSnapshot[q.id].includes(o.value)) input.checked=true;

        const label=document.createElement('label');
        label.setAttribute('for',id);
        label.textContent=o.label;

        const badge=document.createElement('span');
        badge.className='badge';
        badge.title='vagas restantes';
        badge.textContent=`${o.rem} restantes`;

        item.appendChild(input);
        item.appendChild(label);
        item.appendChild(badge);
        list.appendChild(item);

        if(q.type==='checkbox' && q.maxSelections){
          list.addEventListener('change', ()=>{
            const checked=list.querySelectorAll('input[type="checkbox"]:checked').length;
            const boxes=list.querySelectorAll('input[type="checkbox"]');
            boxes.forEach(b=>{
              if(!b.checked) b.disabled = checked>=q.maxSelections || (remaining(q,b.value)<=0);
            });
          });
        }
      }

      wrap.appendChild(list);
    }
    else if(q.type==='select'){
      const div=document.createElement('div');
      div.className='select-wrap';
      const select=document.createElement('select');
      select.name=q.id;
      select.required=!!q.required;

      const ph=document.createElement('option');
      ph.value='';
      ph.textContent='Selecione...';
      ph.disabled=true;

      const prev=answersSnapshot[q.id]||'';
      if(!prev) ph.selected=true;
      select.appendChild(ph);

      for(const o of (q.options||[])){
        if(!isOptionVisible(o, answersSnapshot)) continue;
        const rem=remaining(q,o.value);
        const available=rem>0;
        if(app.mode==='remove' && !available) continue;
        const opt=document.createElement('option');
        opt.value=o.value;
        opt.disabled=!available;
        opt.textContent=`${o.label}${available?'':' (indisponível)'}`;
        if(prev && prev===o.value) opt.selected=true;
        select.appendChild(opt);
      }

      if(q.id==='serie_turma'){
        select.addEventListener('change', ()=>renderForm());
      }

      div.appendChild(select);
      wrap.appendChild(div);
    }

    app.questionsEl.appendChild(wrap);
  }
}

async function refreshCounts(){
  app.counts=await loadJSON('data/counts.json').catch(()=>({}));
}

function collectAnswers(){
  const answers={};
  const vis=readCurrentAnswers();

  for(const q of app.questions){
    if(!isQuestionVisible(q, vis)) continue;

    if(q.type==='text'){
      const el=document.querySelector(`input[name="${q.id}"]`);
      const val=el?el.value.trim():'';
      if(q.required && !val) throw new Error(`Preencha "${q.label}".`);
      if(val) answers[q.id]=val;
    }
    else if(q.type==='radio'){
      const elsAll=Array.from(document.querySelectorAll(`input[name="${q.id}"]`));
      const visibleValues=(q.options||[]).filter(o=>isOptionVisible(o, vis)).map(o=>o.value);
      const checked=elsAll.find(el=>el.checked && visibleValues.includes(el.value));
      if(checked) answers[q.id]=checked.value;
      else if(q.required) throw new Error(`Selecione uma opção em "${q.label}".`);
    }
    else if(q.type==='checkbox'){
      const els=Array.from(document.querySelectorAll(`input[name="${q.id}"]:checked`))
        .filter(el=>isOptionVisible((q.options||[]).find(o=>o.value===el.value), vis))
        .map(i=>i.value);
      if(q.required && (!els || els.length===0)) throw new Error(`Escolha pelo menos uma opção em "${q.label}".`);
      if(q.maxSelections && els.length>q.maxSelections) throw new Error(`Você só pode escolher até ${q.maxSelections} em "${q.label}".`);
      answers[q.id]=els;
    }
    else if(q.type==='select'){
      const el=document.querySelector(`select[name="${q.id}"]`);
      if(!el) continue;
      if(q.required && !el.value) throw new Error(`Selecione uma opção em "${q.label}".`);
      if(el.value) answers[q.id]=el.value;
    }
  }
  return answers;
}

function buildIssueURL(submission){
  const {repoOwner,repoName}=app;
  const title=`[FORM] Submission ${submission.id}`;
  const bodyMD=["# FORM SUBMISSION","","<!-- DO NOT EDIT BELOW -->","```json",JSON.stringify(submission),"```",""].join("\n");
  const url=new URL(`https://github.com/${repoOwner}/${repoName}/issues/new`);
  url.searchParams.set('title',title);
  url.searchParams.set('body',bodyMD);
  url.searchParams.set('labels','submission');
  return url.toString();
}

async function onSubmit(e){
  e.preventDefault();
  app.submitBtn.disabled=true;
  try{
    const answers=collectAnswers();
    await refreshCounts();

    for(const q of app.questions){
      const check=(val)=>{
        const cnt=(app.counts?.[q.id]?.[val])||0;
        const lim=q.options?.find(o=>o.value===val)?.limit ?? Infinity;
        if(cnt+1>lim){ throw new Error(`A opção "${val}" em "${q.label}" atingiu o limite.`); }
      };
      if(q.type==='checkbox'){ for(const v of answers[q.id]||[]) check(v); }
      else if(answers[q.id] && q.options){ check(answers[q.id]); }
    }

    const submission={ id:uuidv4(), at:new Date().toISOString(), answers, client:{ ua:navigator.userAgent, lang:navigator.language } };
    const url=buildIssueURL(submission);
    window.open(url,'_blank','noopener');

    const dlg=document.getElementById('modal');
    if(typeof dlg.showModal==='function'){ dlg.showModal(); }
    else { alert('Abrimos uma nova aba com o Issue. Clique em "Submit new issue" no GitHub para concluir.'); }
  }catch(err){
    alert(err.message||String(err));
  }finally{
    app.submitBtn.disabled=false;
  }
}

init().catch(err=>{
  console.error(err);
  alert('Falha ao iniciar o formulário. Verifique se config/app.json, config/questions.json e data/counts.json existem e são JSON válido.');
});
