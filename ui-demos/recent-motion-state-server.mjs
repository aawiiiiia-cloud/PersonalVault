import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {validate} from './recent-motion-model.js';
const path=new URL('./recent-motion-settings.json',import.meta.url);
http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(origin)){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://127.0.0.1:4173');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.url!=='/settings'){res.writeHead(404);res.end();return;}
 try{
  if(req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)throw new Error('Too large');}
   const input=JSON.parse(body);if(!input.parameters||input.version!==1)throw new Error('Invalid settings');
   const data={version:1,savedAt:new Date().toISOString(),parameters:validate(input.parameters)};
   await writeFile(path,JSON.stringify(data,null,2)+'\n','utf8');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:true}));
  }else if(req.method==='GET'){
   res.setHeader('Content-Type','application/json');res.end(await readFile(path,'utf8'));
  }else {res.writeHead(405);res.end();}
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(4174,'127.0.0.1',()=>console.log('Motion tuner settings ready on 127.0.0.1:4174'));
