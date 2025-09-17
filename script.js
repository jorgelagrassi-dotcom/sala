/* ---------- util: detect day name (Portuguese abbreviations) ---------- */
const dayMapShortToFull = {
  'SEG':'Segunda',
  'TER':'Terça',
  'QUA':'Quarta',
  'QUI':'Quinta',
  'SEX':'Sexta',
  'SÁB':'Sábado',
  'SAB':'Sábado'
};

function guessRoomsFromHeader(line){
  const parts = line.trim().split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
  if(parts.length <= 1){
    const tokens = line.trim().split(/\s+/).filter(Boolean);
    if(tokens.length > 1){
      const grouped = [];
      for(let i=0;i<tokens.length;i++){
        if(i+1 < tokens.length && /^[A-ZÀ-Ú]$|^[A-ZÀ-Ú]{1,2}$/.test(tokens[i+1])) {
          grouped.push(tokens[i]+' '+tokens[i+1]); i++;
        } else grouped.push(tokens[i]);
      }
      return grouped;
    }
  }
  return parts;
}

/* parser: recebe rawText e periodo string */
function parsePeriod(rawText, periodo){
  const lines = rawText.split(/\r?\n/).map(l=>l.replace(/\t/g,' ').replace(/\u00A0/g,' ').trimEnd());
  let rooms = null;
  let currentDay = null;
  const entries = [];

  for(let i=0;i<lines.length;i++){
    const raw = lines[i].trim();
    if(!raw) continue;

    if(!rooms){
      const cand = raw;
      const countOrdinal = (cand.match(/º/g)||[]).length;
      const tokens = cand.split(/\s+/).length;
      if(countOrdinal >= 2 || tokens >= 4){
        rooms = guessRoomsFromHeader(cand);
        rooms = rooms.map(r=>r.replace(/\s+/g,' ').trim());
        continue;
      }
    }

    const dayMatch = raw.match(/^([A-Za-zÀ-ú]{3})\b\s*(.*)$/);
    if(dayMatch){
      const head = dayMatch[1].toUpperCase();
      if(dayMapShortToFull[head]){
        currentDay = dayMapShortToFull[head];
        const rest = dayMatch[2].trim();
        if(rest) {
          processTimeLine(rest, currentDay, rooms, periodo, entries);
          continue;
        } else continue;
      }
    }

    if(/^\d{2}:\d{2}/.test(raw)){
      processTimeLine(raw, currentDay, rooms, periodo, entries);
      continue;
    }

    const ords = (raw.match(/º/g)||[]).length;
    const parts = raw.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
    if(ords>=2 || parts.length>3){
      rooms = guessRoomsFromHeader(raw);
      rooms = rooms.map(r=>r.replace(/\s+/g,' ').trim());
      continue;
    }
  }
  return entries;
}

/* processa linha de horário */
function processTimeLine(line, currentDay, rooms, periodo, entries){
  const timeMatch = line.match(/^(\d{2}:\d{2})\s+(.*)$/);
  if(!timeMatch) return;
  const hora = timeMatch[1];
  let rest = timeMatch[2].trim();

  let cols = rest.split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);

  if(rooms && cols.length !== rooms.length){
    const groups = [];
    const regex = /([A-ZÀ-ú0-9.\-\/\s]+?\([^)]+\))/g;
    let m;
    while((m=regex.exec(rest)) !== null){
      groups.push(m[1].trim());
    }
    if(groups.length >= 1) cols = groups;
  }

  if(rooms && cols.length !== rooms.length && cols.length < rooms.length){
    const tokens = rest.split(/\s+/).filter(Boolean);
    const target = rooms.length;
    const avg = Math.ceil(tokens.length/target);
    const rebuilt = [];
    for(let i=0;i<tokens.length;i+=avg){
      rebuilt.push(tokens.slice(i,i+avg).join(' '));
    }
    if(rebuilt.length === target) cols = rebuilt;
  }

  if(!rooms){
    rooms = cols.map((_,i)=>'Sala '+(i+1));
  }
  for(let idx=0; idx<cols.length; idx++){
    const col = cols[idx] || '';
    const sala = rooms[idx] || ('Sala '+(idx+1));
    const profMatch = col.match(/(.*?)\s*\(([^)]+)\)/);
    let materia = col.trim();
    let professor = null;
    if(profMatch){
      materia = (profMatch[1]||'').trim();
      professor = (profMatch[2]||'').trim();
      professor = professor.replace(/\s+/g,' ');
    } else {
      const lastParen = col.match(/([A-ZÀ-ú][A-Za-zÀ-ú\s]+)$/);
      if(lastParen){
      }
    }
    if(professor){
      entries.push({
        dia: currentDay || 'Indefinido',
        hora: hora,
        sala: sala,
        materia: materia || '',
        professor: professor.toUpperCase(),
        periodo: periodo
      });
    } else {
      entries.push({
        dia: currentDay || 'Indefinido',
        hora: hora,
        sala: sala,
        materia: materia || '',
        professor: null,
        periodo: periodo
      });
    }
  }
}

/* Parse all three periods */
const manhaEntries = parsePeriod(rawManha, 'manha');
const tardeEntries = parsePeriod(rawTarde, 'tarde');
const noiteEntries = parsePeriod(rawNoite, 'noite');

const allEntries = [...manhaEntries, ...tardeEntries, ...noiteEntries];

// build JSON map: professor -> [entries]
const profMap = {};
allEntries.forEach(e=>{
  const prof = (e.professor || '').toUpperCase().trim();
  if(!prof) return;
  if(!profMap[prof]) profMap[prof]=[];
  profMap[prof].push({
    dia: e.dia,
    hora: e.hora,
    sala: e.sala,
    materia: e.materia,
    periodo: e.periodo
  });
});

// Sort each professor's entries by dia+hora (optional)
const dayOrder = {'Segunda':1,'Terça':2,'Quarta':3,'Quinta':4,'Sexta':5,'Sábado':6,'Domingo':7,'Indefinido':99};
Object.keys(profMap).forEach(p=>{
  profMap[p].sort((a,b)=>{
    const da = (dayOrder[a.dia]||99)*10000 + parseInt(a.hora.replace(':',''));
    const db = (dayOrder[b.dia]||99)*10000 + parseInt(b.hora.replace(':',''));
    return da - db;
  });
});

// populate selects
function populateProfessorSelects(){
  const names = Object.keys(profMap).sort();
  const sel = document.getElementById('professor');
  sel.innerHTML = '<option value="">-- selecione --</option>';
  const sel2 = document.getElementById('qprof');
  sel2.innerHTML = '<option value="">(qualquer)</option>';
  names.forEach(n=>{
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);

    const opt2 = opt.cloneNode(true);
    sel2.appendChild(opt2);
  });
}
populateProfessorSelects();

function populateRoomSelects(){
  const rooms = [...new Set(allEntries.map(e=>e.sala).filter(Boolean))].sort();
  const sel = document.getElementById('sala');
  sel.innerHTML = '<option value="">(qualquer)</option>';
  rooms.forEach(r=>{
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  });
}
populateRoomSelects();

/* clock & period detection */
function format2(n){return n.toString().padStart(2,'0');}
function updateClock(){
  const now = new Date();
  const hh = format2(now.getHours()), mm = format2(now.getMinutes());
  document.getElementById('clock').textContent = hh+':'+mm;
  const periodBox = document.getElementById('period-box');
  const h = now.getHours()*60 + now.getMinutes();
  let periodLabel = 'Fora de período (sem aulas)';
  if(h >= 7*60 && h < 12*60) periodLabel = 'Manhã';
  else if(h >= 12*60+40 && h < 18*60) periodLabel = 'Tarde';
  else if(h >= 19*60 && h < 23*60+59) periodLabel = 'Noite';
  periodBox.textContent = periodLabel;
}
setInterval(updateClock,1000);
updateClock();

/* util: get day name in Portuguese from Date or from a provided date string */
function dayNameFromDateObj(d){
  const idx = d.getDay();
  const map = {1:'Segunda',2:'Terça',3:'Quarta',4:'Quinta',5:'Sexta',6:'Sábado',0:'Domingo'};
  return map[idx] || 'Indefinido';
}

/* find where is professor NOW */
function findNowForProfessor(profName){
  if(!profName) return null;
  const now = new Date();
  const day = dayNameFromDateObj(now);
  const currentMinutes = now.getHours()*60 + now.getMinutes();
  const list = profMap[profName] || [];
  let exact = list.find(e => e.dia === day && timeToMinutes(e.hora) <= currentMinutes && currentMinutes < timeToMinutes(e.hora)+60 );
  if(!exact){
    const today = list.filter(e=>e.dia === day).sort((a,b)=>timeToMinutes(a.hora)-timeToMinutes(b.hora));
    if(today.length){
      const next = today.find(e => timeToMinutes(e.hora) >= currentMinutes);
      if(next) return {type:'proxima', entry: next};
      return {type:'passada', entry: today[today.length-1]};
    }
    return null;
  }
  return {type:'agora', entry: exact};
}

function timeToMinutes(hhmm){
  const m = hhmm.split(':'); return parseInt(m[0])*60 + parseInt(m[1]);
}

/* render functions */
function renderProfessor(profName){
  const resultado = document.getElementById('resultado');
  resultado.innerHTML = '';
  if(!profName){
    resultado.innerHTML = '<div class="empty">Selecione um professor acima.</div>';
    document.getElementById('agora').innerHTML = 'Nenhum professor selecionado';
    return;
  }
  const arr = profMap[profName] || [];
  const nowInfo = findNowForProfessor(profName);
  const aside = document.getElementById('agora');
  if(!nowInfo){
    aside.innerHTML = `<div class="empty">Sem aula agora (ou sem registro para o dia atual).</div>`;
  } else {
    const en = nowInfo.entry;
    if(nowInfo.type === 'agora'){
      aside.innerHTML = `<div class="now">
        <div class="badge" style="background:linear-gradient(180deg,#e6f4ea,#dff0e5);border:1px solid rgba(15,157,88,0.12);color:var(--success)">AGORA</div>
        <div><b>${profName}</b><div class="small">${en.dia} • ${en.hora} • ${en.sala} • ${en.materia} (${en.periodo})</div></div>
      </div>`;
    } else if(nowInfo.type === 'proxima'){
      aside.innerHTML = `<div class="now">
        <div class="badge">PRÓXIMA</div>
        <div><b>${profName}</b><div class="small">Próxima aula: ${en.dia} • ${en.hora} • ${en.sala} • ${en.materia} (${en.periodo})</div></div>
      </div>`;
    } else {
      aside.innerHTML = `<div class="now">
        <div class="badge">ÚLTIMA</div>
        <div><b>${profName}</b><div class="small">Última aula hoje: ${en.dia} • ${en.hora} • ${en.sala} • ${en.materia} (${en.periodo})</div></div>
      </div>`;
    }
  }

  if(arr.length === 0){
    resultado.innerHTML = '<div class="empty">Nenhum horário encontrado para esse professor.</div>';
    return;
  }
  const title = document.createElement('h3');
  title.textContent = `Horários de ${profName} (${arr.length} registros)`;
  resultado.appendChild(title);

  const grouped = {};
  arr.forEach(a=>{
    grouped[a.dia] = grouped[a.dia] || [];
    grouped[a.dia].push(a);
  });
  const days = Object.keys(grouped).sort((a,b)=> (dayOrder[a]||99) - (dayOrder[b]||99));
  days.forEach(d=>{
    const h = document.createElement('div');
    h.innerHTML = `<h4 style="margin:12px 0 6px 0">${d}</h4>`;
    resultado.appendChild(h);
    grouped[d].forEach(a=>{
      const div = document.createElement('div');
      div.className = 'aula';
      div.innerHTML = `<b>${a.hora}</b> — ${a.sala}<br><span class="small">${a.materia} • ${a.periodo}</span>`;
      resultado.appendChild(div);
    });
  });
}

/* Buttons */
document.getElementById('btn-mostrar').addEventListener('click',()=>{
  const p = document.getElementById('professor').value;
  if(!p) {
    alert('Selecione um professor');
    return;
  }
  renderProfessor(p);
});
document.getElementById('btn-limpar').addEventListener('click',()=>{
  document.getElementById('professor').value = '';
  document.getElementById('data').value = '';
  document.getElementById('periodo').value = '';
  document.getElementById('qprof').value = '';
  document.getElementById('dia').value = ''; // add this line
  document.getElementById('sala').value = '';
  document.getElementById('resultado').innerHTML = '';
  document.getElementById('agora').innerHTML = 'Nenhum professor selecionado';
});

/* Pesquisa avançada */
document.getElementById('btn-avancada').addEventListener('click', ()=>{
  const dateVal = document.getElementById('data').value;
  const periodo = document.getElementById('periodo').value;
  const profOpt = document.getElementById('qprof').value;
  const diaOpt = document.getElementById('dia').value;
  const salaOpt = document.getElementById('sala').value;
  const results = [];

  let filterDay = null;
  if(dateVal){
    const d = new Date(dateVal + 'T00:00:00');
    filterDay = dayNameFromDateObj(d);
  }

  const profsToSearch = profOpt ? [profOpt] : Object.keys(profMap);
  profsToSearch.forEach(p=>{
    (profMap[p] || []).forEach(a=>{
      if(filterDay && a.dia !== filterDay) return;
      if(diaOpt && a.dia !== diaOpt) return;
      if(periodo && a.periodo !== periodo) return;
      if(salaOpt && a.sala !== salaOpt) return;
      results.push({prof:p, ...a});
    });
  });

  const resultado = document.getElementById('resultado');
  resultado.innerHTML = '';
  if(results.length === 0){
    resultado.innerHTML = '<div class="empty">Nenhum resultado para esses filtros.</div>';
    return;
  }
  const title = document.createElement('h3');
  title.textContent = `Resultados (${results.length})`;
  resultado.appendChild(title);
  results.sort((x,y)=> (dayOrder[x.dia]||99)*10000 + timeToMinutes(x.hora) - ((dayOrder[y.dia]||99)*10000 + timeToMinutes(y.hora)));
  results.forEach(r=>{
    const div = document.createElement('div');
    div.className = 'aula';
    div.innerHTML = `<b>${r.prof}</b><br>${r.dia} • ${r.hora} • ${r.sala} • ${r.materia} • ${r.periodo}`;
    resultado.appendChild(div);
  });
});

/* On select change show immediately */
document.getElementById('professor').addEventListener('change', (e)=>{
  const v = e.target.value;
  renderProfessor(v);
});

/* OPTIONAL: expose JSON download for debugging */
function downloadJSON(){
  const blob = new Blob([JSON.stringify(profMap, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'horarios_professores.json'; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
// Add small debug key: Ctrl+D to download JSON
document.addEventListener('keydown',(e)=>{
  if(e.ctrlKey && e.key.toLowerCase()==='d'){
    e.preventDefault(); downloadJSON();
  }
});

/* debug: write counts to console */
console.log('Total registros extraídos:', allEntries.length);
console.log('Professores detectados:', Object.keys(profMap).length);