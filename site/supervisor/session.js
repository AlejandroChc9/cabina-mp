export const PROJECT='https://cotifawudlwgkcxksngl.supabase.co';
export const KEY='sb_publishable_chIe6tDXcecpyxxTvNApRQ_EQwtuwmT';
export class SupervisorSession{
 constructor(fetcher=globalThis.fetch.bind(globalThis),storage=sessionStorage){this.fetcher=fetcher;this.storage=storage;this.refreshing=null;try{this.session=JSON.parse(storage.getItem('mps-session')||'null');}catch{this.clear();}}
 clear(){this.session=null;try{this.storage.removeItem('mps-session');}catch{}}
 save(data){if(!data.access_token||!data.refresh_token)throw Error('No se pudo establecer la sesión');this.session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||Math.floor(Date.now()/1000)+data.expires_in};try{this.storage.setItem('mps-session',JSON.stringify(this.session));}catch{}}
 async request(path,{token,method='GET',body}={}){
  const r=await this.fetcher(PROJECT+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(60000),headers:{apikey:KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const e=Error(r.status===429?'Demasiados intentos. Espera un momento.':'No se pudo verificar tu ingreso o tus permisos.');e.status=r.status;throw e;}
  return r.status===204?null:r.json();
 }
 async token(){if(!this.session)throw Error('Ingresa con tu correo y contraseña.');if(this.session.expires_at*1000<Date.now()+60000){if(!this.refreshing)this.refreshing=(async()=>{try{this.save(await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}}));}catch(e){this.clear();throw e;}finally{this.refreshing=null;}})();await this.refreshing;}return this.session.access_token;}
 async login(email,password){this.clear();this.save(await this.request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));try{return await this.manifest();}catch(e){await this.logout();throw e;}}
 async manifest(){
  const token=await this.token(),access=await this.request('/rest/v1/mps_access?select=enabled',{token});
  if(access.length!==1||access[0].enabled!==true)throw Error('Tu cuenta aún no tiene un equipo habilitado. Contacta a Alejandro.');
  const membership=await this.request('/rest/v1/mps_user_scopes?select=scope_id&enabled=eq.true',{token});
  if(!membership.length)throw Error('Tu cuenta aún no tiene un equipo asignado.');
  const release=await this.request('/rest/v1/mps_release?id=eq.1&select=release_id,meta,updated_at',{token});
  if(release.length!==1)throw Error('Los datos de tu equipo aún no están disponibles.');
  const active=release[0],rows=await this.request('/rest/v1/mps_scope_snapshots?release_id=eq.'+active.release_id+'&select=scope_id,scope,sha256',{token});
  const allowed=new Set(membership.map(m=>m.scope_id)),scopes=rows.filter(r=>allowed.has(r.scope_id));
  if(!scopes.length)throw Error('No hay una cartera habilitada para tu cuenta.');
  return {releaseId:active.release_id,scopeRows:scopes,context:{...active.meta,scopes:scopes.map(r=>r.scope),generatedAt:active.updated_at,localOnly:false}};
 }
 async snapshot(scopeId,manifest){
  const expected=manifest.scopeRows.find(r=>r.scope_id===scopeId);if(!expected)throw Error('Equipo fuera de tu acceso');
  const rows=await this.request('/rest/v1/mps_scope_snapshots?release_id=eq.'+manifest.releaseId+'&scope_id=eq.'+encodeURIComponent(scopeId)+'&select=payload_gzip_base64,sha256',{token:await this.token()});
  if(rows.length!==1||rows[0].sha256!==expected.sha256)throw Error('Tu acceso o los datos cambiaron. Actualiza la vista.');
  const bytes=Uint8Array.from(atob(rows[0].payload_gzip_base64),c=>c.charCodeAt(0)),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(c=>c.toString(16).padStart(2,'0')).join('');
  if(sha!==expected.sha256)throw Error('Los datos no superaron el control de integridad.');
  const data=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  if(data.scope?.id!==scopeId||data.data?.supervisors?.length!==1||data.data.supervisors[0].id!==scopeId||data.data.sellers.some(s=>s.supervisor!==scopeId))throw Error('El archivo no corresponde a tu equipo');
  return data;
 }
 async logout(){const token=this.session?.access_token;this.clear();if(token)try{await this.request('/auth/v1/logout?scope=local',{method:'POST',token});}catch{}}
}
