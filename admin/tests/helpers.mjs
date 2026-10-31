import { base64url } from 'jose';
import { beginOAuth, finishOAuth } from '../auth.mjs';
import { OWNER_ID, OWNER_LOGIN, REPOSITORY_ID, REPOSITORY } from '../github.mjs';
export const origin='https://admin.example.test', token='test-server-only-github-token', sha='a'.repeat(40);
export function memoryKV(){const records=new Map();return {records,async get(key){return records.get(key)||null},async put(key,value){records.set(key,value)},async delete(key){records.delete(key)}};}
export function environment(){return {ADMIN_ORIGIN:origin,GITHUB_CLIENT_ID:'test-client-id',GITHUB_CLIENT_SECRET:'test-client-secret',GITHUB_APP_ID:'12345',SESSION_SECRET:base64url.encode(new Uint8Array(32).fill(7)),SESSIONS:memoryKV()};}
export function mockGitHub({user={id:OWNER_ID,login:OWNER_LOGIN},installed=true,repository=true,tokenError=false}={}){
 const calls=[];return {calls,fetch:async(url,init={})=>{
  calls.push({url,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});let value;
  if(url==='https://github.com/login/oauth/access_token')return new Response(JSON.stringify(tokenError?{error:'bad_verification_code'}:{access_token:token,expires_in:28800,refresh_token:'discarded-refresh-token'}),{status:tokenError?400:200});
  if(init.headers.Authorization!=='Bearer '+token)throw Error('Unexpected GitHub credential');
  if(url==='https://api.github.com/user')value=user;
  else if(url==='https://api.github.com/user/installations')value={installations:installed?[{id:77,app_id:12345,account:{id:OWNER_ID},permissions:{contents:'write'}}]:[]};
  else if(url==='https://api.github.com/user/installations/77/repositories')value={repositories:repository?[{id:REPOSITORY_ID,full_name:REPOSITORY}]:[]};
  else if(url==='https://api.github.com/repos/'+REPOSITORY)value={id:REPOSITORY_ID,full_name:REPOSITORY,owner:{id:OWNER_ID},permissions:{push:true}};
  else throw Error('Unexpected GitHub path');
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }};
}
export async function login(env,fetchImpl,returnTo='/write.html'){
 const start=await beginOAuth(new Request(origin+'/auth/github/start?returnTo='+encodeURIComponent(returnTo)),env),url=new URL(start.headers.get('Location')),state=url.searchParams.get('state'),browser=start.headers.get('Set-Cookie').split(';')[0];
 const finish=await finishOAuth(new Request(origin+'/auth/github/callback?code=test-code&state='+state,{headers:{Cookie:browser}}),env,fetchImpl);
 const session=finish.headers.getSetCookie().find(c=>c.startsWith('__Host-studybase-session=')).split(';')[0];return {start,url,state,browser,finish,cookie:session};
}
