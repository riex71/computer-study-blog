/* Own loopback servers and fresh browser profiles; no real GitHub writes. */
const {spawn}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{const server=spawn(process.execPath,['admin/tests/browser-server.mjs'],{cwd:root,stdio:['ignore','pipe','pipe']});let errors='';server.stderr.on('data',chunk=>errors+=chunk);server.stdout.on('data',()=>{});try{
 let ready=false;for(let i=0;i<50;i++){if(server.exitCode!==null)throw Error('Browser server failed: '+errors);try{const r=await fetch('http://127.0.0.1:8767/__test/state',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}if(!ready)throw Error('Browser server timed out');
 for(const file of ['tests/public-browser.cjs','admin/tests/browser.cjs','admin/tests/images-browser.cjs','admin/tests/manage-browser.cjs'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{cwd:root,env:process.env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(file+' failed with '+code)));});
}finally{server.kill();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
