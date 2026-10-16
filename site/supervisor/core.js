globalThis.MP = (() => {
  const D=globalThis.MP_DATA;
  const sum=(rows,key='amount')=>rows.reduce((n,r)=>n+r[key],0);
  const cutOf=date=>D.cuts.find(c=>c.date===date)||D.cuts.at(-1);
  const positive=r=>r.hasPositive??(r.amount>0&&r.qty>0);
  const track=D.lines.filter(l=>!l.excluded);
  const trackedIds=new Set(track.map(l=>l.id));
  const blocks=D.blocks;
  const priority=track.filter(l=>['foco','campania'].includes(l.block)).map(l=>l.id);
  const linesFor=key=>key==='all'?track:key.startsWith('block:')?track.filter(l=>l.block===key.slice(6)):track.filter(l=>l.id===key);
  const selectionName=key=>key==='all'?'MP total':key.startsWith('block:')?blocks.find(b=>b.id===key.slice(6))?.name:track.find(l=>l.id===key)?.name;
  const metricCache=new Map();
  function sellers(scope){return D.sellers.filter(s=>(scope.supervisor==='all'||s.supervisor===scope.supervisor)&&(scope.branch==='all'||s.branch===scope.branch)&&(scope.force==='all'||s.force===scope.force));}
  const factIndex=new Map(),clientIndex=new Map(),seasonIndex=new Map();
  for(const f of D.facts){const k=f.seller+'|'+f.period;if(!factIndex.has(k))factIndex.set(k,[]);factIndex.get(k).push(f);const ck=f.client+'|'+f.line+'|'+f.period;if(!clientIndex.has(ck))clientIndex.set(ck,[]);clientIndex.get(ck).push(f);}
  for(const s of D.seasonal)seasonIndex.set(s.client+'|'+s.line,s);
  const clientFacts=(client,line,period)=>clientIndex.get(client+'|'+line+'|'+period)||[];
  function facts(ids,line='all',period=D.period,ordinal=26){const set=new Set(ids),allowed=line==='all'?trackedIds:new Set(linesFor(line).map(l=>l.id));return ids.flatMap(s=>factIndex.get(s+'|'+period)||[]).filter(f=>f.ordinal<=ordinal&&(!allowed||allowed.has(f.line)));}
  function coverage(rows){const balances=new Map();for(const f of rows)balances.set(f.client,(balances.get(f.client)||0)+f.amount);return [...balances.values()].filter(v=>v>0).length;}
  function metrics(ids,line,date){const cacheKey=JSON.stringify([ids,line,date]);if(metricCache.has(cacheKey))return metricCache.get(cacheKey);const allowed=line==='all'?trackedIds:new Set(linesFor(line).map(l=>l.id));const cut=cutOf(date),rows=facts(ids,line,D.period,cut.ordinal),today=rows.filter(f=>f.date===cut.date),previous=rows.filter(f=>f.date<cut.date),plan=sum(D.plans.filter(p=>ids.includes(p.seller)&&(!allowed||allowed.has(p.line))));
    const actual=sum(rows),projected=actual/cut.ordinal*D.totalDays,remaining=D.totalDays-cut.ordinal;
    const history=D.history.map(p=>coverage(facts(ids,line,p,cut.ordinal))),historyFull=D.history.map(p=>coverage(facts(ids,line,p,99))),reference=sum(history.map(amount=>({amount})))/3,fullReference=sum(historyFull.map(amount=>({amount})))/3;
    const active=today.some(positive),activeMonth=rows.some(positive),earlier=previous.some(positive);
    const result={actual,plan,projected,projectionPct:plan>0?projected/plan*100:null,required:remaining>0?Math.max(0,plan-actual)/remaining:null,coverage:coverage(rows),reference,fullReference,coveragePct:reference>0?coverage(rows)/reference*100:null,coverageGap:coverage(rows)-reference,today:sum(today),qty:line!=='all'&&!line.startsWith('block:')?sum(today,'qty'):null,positiveQty:line!=='all'&&!line.startsWith('block:')?sum(today,'placedQty'):null,returnedQty:line!=='all'&&!line.startsWith('block:')?sum(today,'returnedQty'):null,active,activeMonth,earlier,returned:today.some(f=>f.amount<0||f.qty<0||f.returnedQty>0),state:active?earlier?'Vendió en el día':'Primera venta del mes':activeMonth?'Sin venta en el día':'Sin venta en el mes'};metricCache.set(cacheKey,result);return result;
  }
  function classify(rows){const out=new Map(),positiveRows=rows.filter(r=>r.value>0).sort((a,b)=>b.value-a.value),n=positiveRows.length;let before=0;
    for(let i=0;i<n;){let j=i+1;while(j<n&&positiveRows[j].value===positiveRows[i].value)j++;const middle=(before+(j-i)/2)/n,band=middle<=1/3?'superior':middle<=2/3?'medio':'inferior';for(let k=i;k<j;k++)out.set(positiveRows[k].id,band);before+=j-i;i=j;}
    for(const r of rows)if(r.value<=0)out.set(r.id,r.value<0?'negativo':'cero');return out;
  }
  function model(scope){const selected=sellers(scope),ids=selected.map(s=>s.id),line=scope.line,cut=cutOf(scope.date),bands=classify(selected.map(s=>({id:s.id,value:metrics([s.id],line,scope.date).actual}))),baselineBands=classify(selected.map(s=>({id:s.id,value:metrics([s.id],line,D.baseline).actual})));
    const rows=selected.map(s=>({...s,mp:metrics([s.id],'all',scope.date),focus:metrics([s.id],line,scope.date),band:bands.get(s.id),baselineBand:baselineBands.get(s.id)}));
    const scopedLines=linesFor(line),zeroLines=scopedLines.filter(l=>!facts(ids,l.id,D.period,cut.ordinal).some(f=>f.date===cut.date&&positive(f)));
    const noFocus=rows.filter(s=>s.mp.active&&!facts([s.id],'all',D.period,cut.ordinal).some(f=>f.ordinal===cut.ordinal&&priority.includes(f.line)&&positive(f)));
    const summary=['superior','medio','inferior'].map(id=>{const rs=rows.filter(r=>r.band===id);return{id,count:rs.length,mean:rs.length?rs.reduce((n,r)=>n+r.focus.actual,0)/rs.length:null};});
    const lineRows=scopedLines.map(l=>({...l,...metrics(ids,l.id,scope.date),sold:rows.filter(s=>metrics([s.id],l.id,scope.date).active).length,zeroMonth:rows.filter(s=>!metrics([s.id],l.id,scope.date).activeMonth).length}));
    const blockRows=blocks.map(b=>({...b,...metrics(ids,'block:'+b.id,scope.date),lines:track.filter(l=>l.block===b.id),soldLines:track.filter(l=>l.block===b.id&&metrics(ids,l.id,scope.date).active).length}));
    return {rows,ids,total:rows.length,mp:metrics(ids,'all',scope.date),focus:metrics(ids,line,scope.date),zeroDay:rows.filter(r=>!r.mp.active),zeroMonth:rows.filter(r=>!r.mp.activeMonth),zeroLines,noFocus,summary,lineRows,blockRows};
  }
  function opportunities(seller,line,date,visit='all',query=''){const cut=cutOf(date),lines=linesFor(line),clients=D.clients.filter(c=>c.seller===seller&&(visit==='all'||(c.visits||[c.visit]).some(v=>String(v)===visit))&&`${c.name} ${c.id}`.toLowerCase().includes(query.toLowerCase()));
    return clients.map(c=>{const items=lines.map(l=>{const historical=D.history.map(p=>sum(clientFacts(c.id,l.id,p))),season=seasonIndex.get(c.id+'|'+l.id),ref=l.block==='campania'?season?.amount??0:historical.reduce((a,b)=>a+b,0)/3,currentRows=clientFacts(c.id,l.id,D.period).filter(f=>f.date<=cut.date),actual=sum(currentRows),hasPurchase=currentRows.some(positive),gap=Math.max(0,ref-actual),allMP=track.some(l=>clientFacts(c.id,l.id,D.period).some(f=>f.date<=cut.date&&positive(f))),basis=l.block==='campania'?'Octubre 2025 completo':'Promedio mensual jul–sep 2026';
      return {...l,ref,actual,gap,basis,status:!hasPurchase?(allMP?'Línea pendiente':'Sin compra MP'): 'Revisar reposición',action:!hasPurchase?'Consultar recompra de '+l.name:'Consultar necesidad de reposición de '+l.name,eligible:ref>0&&gap>0};}).filter(i=>i.eligible).sort((a,b)=>a.id.localeCompare(b.id));return {...c,items};}).filter(c=>c.items.length).sort((a,b)=>line==='all'||line.startsWith('block:')?a.name.localeCompare(b.name):b.items[0].ref-a.items[0].ref||a.name.localeCompare(b.name));
  }
  function evolution(scope){const selected=sellers(scope),reference=classify(selected.map(s=>({id:s.id,value:metrics([s.id],scope.line,D.baseline).actual})));return D.cuts.map(c=>({date:c.date,groups:['inferior','medio','superior'].map(b=>{const ids=selected.filter(s=>reference.get(s.id)===b).map(s=>s.id);return {band:b,count:ids.length,mean:ids.length?metrics(ids,scope.line,c.date).actual/ids.length:null};})}));}
  function placements(scope){return sellers(scope).flatMap(s=>linesFor(scope.line).map(l=>({seller:s,line:l,mp:metrics([s.id],'all',scope.date),metric:metrics([s.id],l.id,scope.date)})));}
  function message(seller,scope,clients,note=''){
    const s=D.sellers.find(s=>s.id===seller),mp=metrics([seller],'all',scope.date),money=n=>'S/ '+Math.round(n).toLocaleString('es-PE'),pct=n=>n==null?'sin base':n.toFixed(1)+'%';
    const scopeName=scope.line==='all'?'Todos los bloques':selectionName(scope.line);
    const sections=blocks.map(b=>{const selected=track.filter(l=>l.block===b.id),m=metrics([seller],'block:'+b.id,scope.date),sold=selected.filter(l=>metrics([seller],l.id,scope.date).active).length;return b.name+(b.priority?' · PRIORIDAD':'')+': proyección de cuota '+pct(m.projectionPct)+' · '+sold+'/'+selected.length+' líneas con venta del día · día '+money(m.today)+' · mes '+money(m.actual);});
    const focus=scope.line==='all'?'': '\n\n*DETALLE · '+scopeName+'*\n'+linesFor(scope.line).map(l=>{const m=metrics([seller],l.id,scope.date);return l.name+': proyección de cuota '+pct(m.projectionPct)+' · '+m.state+' · día '+money(m.today)+' ('+m.qty+' '+l.unit+' netas) · mes '+money(m.actual)+(m.returned?' · con devoluciones':'');}).join('\n');
    return '*Seguimiento MP | '+s.name+' ('+s.id+')*\nCorte cerrado '+scope.date.split('-').reverse().join('/')+' · importes sin IGV\n\n*MP TOTAL · SIN PANETONES NI TURRONES*\nProyección de cuota '+pct(mp.projectionPct)+' · cierre '+money(mp.projected)+'\nVenta '+money(mp.actual)+' / Cuota '+money(mp.plan)+'\nRequerido '+money(mp.required)+'/jornada\nCobertura '+mp.coverage+' clientes / prom.3M al corte '+mp.reference.toFixed(1)+' ('+pct(mp.coveragePct)+')\n\n*BLOQUES COMERCIALES*\nSe excluyen Panetones y Turrones: seguimiento propio.\n'+sections.join('\n')+focus+'\n\n*CLIENTES CON OPORTUNIDAD · '+clients.length+'*\n'+clients.map(c=>c.id+' · '+c.name+'\n'+c.items.map(i=>'• '+i.group+' / '+i.name+': mes '+money(i.actual)+' / ref. '+money(i.ref)+' ('+i.basis+'). '+i.action+'.').join('\n')).join('\n\n')+(clients.length?'':'Sin oportunidades con historial en esta selección.')+(note?'\n\n*Indicación del supervisor*\n'+note:'')+'\n\nReferencias históricas, no cuotas de cliente. Panetones y Turrones se excluyen de todos los indicadores, cuotas, cobertura y oportunidades; tienen seguimiento propio.';
  }
  return {D,track,blocks,linesFor,selectionName,priority,sum,positive,cutOf,sellers,facts,coverage,metrics,classify,model,opportunities,evolution,placements,message};
})();
