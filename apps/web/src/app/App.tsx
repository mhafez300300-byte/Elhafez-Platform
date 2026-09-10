import { FormEvent, useMemo, useState } from 'react';
import { createAuthClient } from '@elhafez/auth/frontend';

type JsonValue = unknown;
const sections = [
  ['Users','/users'],['Companies','/companies'],['Branches','/branches'],['Roles','/roles'],
  ['Permissions','/permissions'],['Audit','/audit'],['Files','/files'],['Notifications','/notifications'],
] as const;

export function App() {
  const baseUrl = import.meta.env.VITE_API_URL ?? '/api';
  const auth = useMemo(() => createAuthClient(baseUrl), [baseUrl]);
  const [accessToken,setAccessToken]=useState<string|null>(()=>localStorage.getItem('elhafez.access'));
  const [refreshToken,setRefreshToken]=useState<string|null>(()=>localStorage.getItem('elhafez.refresh'));
  const [login,setLogin]=useState(''); const [password,setPassword]=useState('');
  const [error,setError]=useState<string|null>(null); const [data,setData]=useState<JsonValue>(null); const [active,setActive]=useState('Core');
  async function signIn(event:FormEvent){event.preventDefault();setError(null);try{const t=await auth.login(login,password);localStorage.setItem('elhafez.access',t.accessToken);localStorage.setItem('elhafez.refresh',t.refreshToken);setAccessToken(t.accessToken);setRefreshToken(t.refreshToken);setPassword('');}catch(e){setError(e instanceof Error?e.message:'Login failed');}}
  async function load(name:string,path:string){setActive(name);setError(null);const request=(token:string)=>fetch(`${baseUrl}${path}`,{headers:{Authorization:`Bearer ${token}`}});let r=await request(accessToken??'');if(r.status===401&&refreshToken){try{const t=await auth.refresh(refreshToken);localStorage.setItem('elhafez.access',t.accessToken);localStorage.setItem('elhafez.refresh',t.refreshToken);setAccessToken(t.accessToken);setRefreshToken(t.refreshToken);r=await request(t.accessToken);}catch{signOut();return;}}const body=await r.json().catch(()=>null) as JsonValue;if(!r.ok){setError(`Request failed (${r.status})`);setData(body);return;}setData(body);}
  function signOut(){localStorage.removeItem('elhafez.access');localStorage.removeItem('elhafez.refresh');setAccessToken(null);setRefreshToken(null);setData(null);setActive('Core');}
  if(!accessToken)return <main className="login-shell"><form className="card login-card" onSubmit={signIn}><div className="brand">Elhafez Platform</div><h1>Core Administration</h1><label>Login<input value={login} onChange={e=>setLogin(e.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={12} required/></label>{error&&<p className="error">{error}</p>}<button type="submit">Sign in</button></form></main>;
  return <div className="shell"><aside><div className="brand">Elhafez Platform</div><p>Core only</p>{sections.map(([name,path])=><button key={name} className={active===name?'active':''} onClick={()=>void load(name,path)}>{name}</button>)}<button onClick={signOut}>Logout</button></aside><main><h1>{active}</h1><p className="muted">Approved platform Core. No business modules are installed.</p>{error&&<p className="error">{error}</p>}<pre>{data===null?'Select a Core section to load live data.':JSON.stringify(data,null,2)}</pre></main></div>;
}
