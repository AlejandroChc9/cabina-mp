import {SupervisorSession} from './session.js';
const session=new SupervisorSession(),$=s=>document.querySelector(s);let manifest,activeScope,checking=false,started=false,generation=0;
function lock(message){generation++;$('#protected-content').hidden=true;$('#account-bar').hidden=true;$('#auth-panel').hidden=false;$('#auth-message').textContent=message;$('#app').replaceChildren();$('#overlay').replaceChildren();$('#toast').textContent='';document.body.style.overflow='';delete globalThis.MP_DATA;delete globalThis.MP;}
async function enter(){
 const version=++generation;manifest=await session.manifest();let id=sessionStorage.getItem('mps-chosen-scope');if(!manifest.scopeRows.some(r=>r.scope_id===id))id=manifest.scopeRows[0].scope_id;
 const packet=await session.snapshot(id,manifest);if(generation!==version)return;
 activeScope=id;globalThis.MP_DATA=packet.data;
 const selector=$('#account-scope');selector.replaceChildren(...manifest.scopeRows.map(r=>{const opt=document.createElement('option');opt.value=r.scope_id;opt.textContent=r.scope.label;return opt;}));selector.value=id;selector.disabled=manifest.scopeRows.length===1;
 $('#auth-panel').hidden=true;$('#protected-content').hidden=false;$('#account-bar').hidden=false;$('#account-status').textContent='Corte '+packet.data.defaultCut.split('-').reverse().join('/');
 if(!started){started=true;await import('./core.js');await import('./app.js');}else location.reload();
}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();$('#auth-submit').disabled=true;$('#auth-message').textContent='Verificando tu acceso…';try{await session.login($('#auth-email').value.trim(),$('#auth-password').value);await enter();}catch(e){lock(e.message);}finally{$('#auth-password').value='';$('#auth-submit').disabled=false;}});
$('#logout').addEventListener('click',async()=>{lock('Sesión cerrada.');sessionStorage.removeItem('mps-chosen-scope');await session.logout();location.reload();});
$('#account-scope').addEventListener('change',()=>{const id=$('#account-scope').value;if(!manifest.scopeRows.some(r=>r.scope_id===id))return;sessionStorage.setItem('mps-chosen-scope',id);lock('Cargando equipo…');location.reload();});
$('#refresh-data').addEventListener('click',()=>location.reload());
async function check(){if(!started||checking||!session.session)return;checking=true;try{const next=await session.manifest();if(!next.scopeRows.some(r=>r.scope_id===activeScope))throw Error('Tu acceso a este equipo cambió. Ingresa nuevamente.');if(next.releaseId!==manifest.releaseId){lock('Hay un cierre actualizado. Cargando…');location.reload();}}catch(e){session.clear();lock(e.message);}finally{checking=false;}}
setInterval(check,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
if(session.session)enter().catch(e=>{session.clear();lock(e.message);});
