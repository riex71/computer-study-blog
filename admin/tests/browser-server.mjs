/* Loopback-only adapter: test cookies, encrypted in-memory KV and mock GitHub only. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../worker.mjs';
import { environment,login,origin,token } from './helpers.mjs';
import { OWNER_ID,OWNER_LOGIN,REPOSITORY_ID,REPOSITORY } from '../github.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dist=path.join(root,'admin/dist'),publicRoot=path.join(root,'_site'),env=environment();
let head='a'.repeat(40),counter=0,fixtureCookie='';const blobs=new Map(),files=new Map(),pending=[],commits=[];
async function textFile(name){return files.has(name)?files.get(name):fs.readFile(path.join(root,name),'utf8');}
const fetchImpl=async(url,init={})=>{
 if(url==='https://github.com/login/oauth/access_token')return new Response(JSON.stringify({access_token:token,expires_in:28800}));
 const u=new URL(url);if(u.hostname!=='api.github.com')throw Error('Only mock GitHub is allowed');
 if(init.headers.Authorization!=='Bearer '+token||!init.headers['User-Agent'])throw Error('Invalid server authorization');
 const endpoint=u.pathname.replace('/repos/'+REPOSITORY+'/',''),body=init.body?JSON.parse(init.body):null;let result;
 if(u.pathname==='/user')result={login:OWNER_LOGIN,id:OWNER_ID};
 else if(u.pathname==='/user/installations')result={installations:[{id:77,app_id:12345,account:{id:OWNER_ID},permissions:{contents:'write'}}]};
 else if(u.pathname==='/user/installations/77/repositories')result={repositories:[{id:REPOSITORY_ID,full_name:REPOSITORY}]};
 else if(u.pathname==='/repos/'+REPOSITORY)result={permissions:{push:true}};
 else if(endpoint==='git/ref/heads/main')result={object:{sha:head}};
 else if(endpoint==='git/commits/'+head)result={tree:{sha:'old-tree'}};
 else if(endpoint.startsWith('contents/'))result={encoding:'base64',content:Buffer.from(await textFile(endpoint.slice(9))).toString('base64')};
 else if(endpoint==='git/blobs'){const sha='blob'+(++counter);blobs.set(sha,Buffer.from(body.content,'base64').toString('utf8'));result={sha};}
 else if(endpoint==='git/trees'){pending.splice(0,pending.length,...body.tree);result={sha:'new-tree'};}
 else if(endpoint==='git/commits'){commits.push({parents:body.parents,message:body.message});result={sha:'b'.repeat(40)};}
 else if(endpoint==='git/refs/heads/main'){if(body.force!==false)throw Error('Force update forbidden');head=body.sha;for(const file of pending)files.set(file.path,blobs.get(file.sha));result={object:{sha:head}};}
 else throw Error('Unexpected mock endpoint');
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
};
const handler=createHandler({fetchImpl});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
env.ASSETS={fetch:async request=>{const name=path.resolve(dist,'.'+new URL(request.url).pathname);if(!name.startsWith(dist+path.sep))return new Response('Not found',{status:404});try{let data=await fs.readFile(name);if(path.basename(name)==='writer.mjs')data=Buffer.from(data.toString('utf8').replace('publicURL:LIVE',"publicURL:'http://127.0.0.1:8769/'"));return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':mime[path.extname(name)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:8767');
 if(url.pathname==='/__test/reset'&&req.method==='POST'){head='a'.repeat(40);counter=0;blobs.clear();files.clear();pending.length=0;commits.length=0;env.SESSIONS.records.clear();fixtureCookie=(await login(env,fetchImpl)).cookie;res.writeHead(200).end('reset');return;}
 if(url.pathname==='/__test/state'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({head,commits,files:Object.fromEntries(files)}));return;}
 const headers=new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string'));
 if(headers.get('cookie')?.includes('test-owner=yes'))headers.set('Cookie',fixtureCookie);
 if(headers.get('origin')==='http://127.0.0.1:8767')headers.set('Origin',origin);
 const data=[];for await(const chunk of req)data.push(chunk);
 const request=new Request(origin+url.pathname+url.search,{method:req.method,headers,...(data.length?{body:Buffer.concat(data)}:{})}),response=await handler(request,env);
 for(const [name,value]of response.headers)if(name!=='set-cookie')res.setHeader(name,value);
 if(response.headers.getSetCookie().length)res.setHeader('Set-Cookie',response.headers.getSetCookie());
 res.writeHead(response.status);res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500).end('Test adapter failed');}}).listen(8767,'127.0.0.1',()=>console.log('Private GitHub login test server: http://127.0.0.1:8767/write.html'));

http.createServer(async(req,res)=>{const rel=new URL(req.url,'http://127.0.0.1:8769').pathname.replace(/^\/$/,'/index.html'),name=path.resolve(publicRoot,'.'+rel);if(!name.startsWith(publicRoot+path.sep)){res.writeHead(403).end();return;}try{let data=await fs.readFile(name);if(path.basename(name)==='draft-migration.html')data=Buffer.from(data.toString('utf8').replace('data-admin-origin="https://studybase-admin.dmcydh1804.workers.dev"','data-admin-origin="http://127.0.0.1:8767"'));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);}catch{res.writeHead(404).end();}}).listen(8769,'127.0.0.1',()=>console.log('Isolated old-origin draft store: http://127.0.0.1:8769/'));
