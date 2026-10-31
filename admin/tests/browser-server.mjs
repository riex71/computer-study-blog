/* Loopback-only test adapter. It signs test identities and mocks GitHub; never deploy. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createHandler } from '../worker.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), dist = path.join(root,'admin/dist');
const origin='https://private.example.test', issuer='https://test-team.cloudflareaccess.com';
const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'browser-key',alg:'RS256'};
const jwt=await new SignJWT({email:'owner@example.test'}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(issuer).setAudience('browser-tests').setSubject('browser-owner').setIssuedAt().setExpirationTime('1h').sign(privateKey);
const env={ADMIN_ORIGIN:origin,ACCESS_TEAM_DOMAIN:issuer,ACCESS_AUD:'browser-tests',OWNER_EMAIL:'owner@example.test',GITHUB_TOKEN:'test-server-only-github-token'};
let head='a'.repeat(40),counter=0;const blobs=new Map(),files=new Map(),pending=[],commits=[];
async function textFile(name){return files.has(name)?files.get(name):fs.readFile(path.join(root,name),'utf8');}
const handler=createHandler({keySet:createLocalJWKSet({keys:[jwk]}),fetchImpl:async(url,init)=>{
 const u=new URL(url);if(u.hostname!=='api.github.com')throw Error('Only mock GitHub is allowed');
 if(init.headers.Authorization!=='Bearer '+env.GITHUB_TOKEN||!init.headers['User-Agent'])throw Error('Invalid server authorization');
 const endpoint=u.pathname.replace('/repos/riex71/computer-study-blog/',''),body=init.body?JSON.parse(init.body):null;let result;
 if(u.pathname==='/user')result={login:'riex71'};
 else if(u.pathname==='/repos/riex71/computer-study-blog')result={permissions:{push:true}};
 else if(endpoint==='git/ref/heads/main')result={object:{sha:head}};
 else if(endpoint==='git/commits/'+head)result={tree:{sha:'old-tree'}};
 else if(endpoint.startsWith('contents/'))result={encoding:'base64',content:Buffer.from(await textFile(endpoint.slice(9))).toString('base64')};
 else if(endpoint==='git/blobs'){const sha='blob'+(++counter);blobs.set(sha,Buffer.from(body.content,'base64').toString('utf8'));result={sha};}
 else if(endpoint==='git/trees'){pending.splice(0,pending.length,...body.tree);result={sha:'new-tree'};}
 else if(endpoint==='git/commits'){commits.push({parents:body.parents,message:body.message});result={sha:'b'.repeat(40)};}
 else if(endpoint==='git/refs/heads/main'){if(body.force!==false)throw Error('Force update forbidden');head=body.sha;for(const file of pending)files.set(file.path,blobs.get(file.sha));result={object:{sha:head}};}
 else throw Error('Unexpected mock endpoint');
 return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
}});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
env.ASSETS={fetch:async request=>{const name=path.resolve(dist,'.'+new URL(request.url).pathname);if(!name.startsWith(dist+path.sep))return new Response('Not found',{status:404});try{return new Response(request.method==='HEAD'?null:await fs.readFile(name),{headers:{'Content-Type':mime[path.extname(name)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}}};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:8767');
 if(url.pathname==='/__test/reset'&&req.method==='POST'){head='a'.repeat(40);counter=0;blobs.clear();files.clear();pending.length=0;commits.length=0;res.writeHead(200).end('reset');return;}
 if(url.pathname==='/__test/state'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({head,commits,files:Object.fromEntries(files)}));return;}
 const headers=new Headers(Object.entries(req.headers).filter(([,v])=>typeof v==='string'));
 if(headers.get('cookie')?.includes('test-owner=yes'))headers.set('Cf-Access-Jwt-Assertion',jwt);
 if(headers.get('origin')==='http://127.0.0.1:8767')headers.set('Origin',origin);
 const data=[];for await(const chunk of req)data.push(chunk);
 const request=new Request(origin+url.pathname+url.search,{method:req.method,headers,...(data.length?{body:Buffer.concat(data)}:{})});
 const response=await handler(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500).end('Test adapter failed');}}).listen(8767,'127.0.0.1',()=>console.log('Isolated private-admin test server: http://127.0.0.1:8767/write.html'));
