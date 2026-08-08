import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'libtv-e2e-'));
const port = 3219;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore','pipe','pipe'] });
let logs=''; child.stdout.on('data',c=>logs+=c); child.stderr.on('data',c=>logs+=c);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function waitHealth(){for(let i=0;i<40;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok)return;}catch{}await sleep(100);}throw new Error(`server did not start\n${logs}`);}
async function j(path, options={}){const r=await fetch(base+path,options);const b=await r.json();if(!r.ok)throw new Error(`${path}: ${JSON.stringify(b)}`);return b;}
async function waitJob(id){for(let i=0;i<80;i++){const x=await j(`/api/generations/${id}`);if(['succeeded','failed','canceled'].includes(x.status)){if(x.status!=='succeeded')throw new Error(`job ${id}: ${x.error||x.status}`);return x;}await sleep(100);}throw new Error('job timeout');}
try {
  await waitHealth();
  const project=await j('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'E2E'})});
  const uploadBytes=await readFile(join(ROOT,'fixtures','mock-image.svg'));
  const uploaded=await j(`/api/projects/${project.id}/assets/upload`,{method:'POST',headers:{'content-type':'image/svg+xml','x-filename':'fixture.svg'},body:uploadBytes});
  const imageJob=await j('/api/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,capability:'image.generate',providerId:'mock',modelId:'mock-image',prompt:'E2E image',references:[]})});
  const image=await waitJob(imageJob.id); const imageAsset=image.outputs[0];
  const videoJob=await j('/api/generations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,capability:'video.image_to_video',providerId:'mock',modelId:'mock-video',prompt:'E2E video',references:[{assetId:imageAsset.id,role:'first-frame'}]})});
  const video=await waitJob(videoJob.id); const videoAsset=video.outputs[0];
  await j(`/api/projects/${project.id}/workflow`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({version:1,nodes:[{id:'p1',type:'prompt',position:{x:0,y:0},data:{text:'E2E'}}],edges:[]})});
  await j(`/api/projects/${project.id}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({fps:30,width:640,height:360,items:[{id:'i1',track:'V1',startFrame:0,durationInFrames:30,name:'image',kind:'image',sourceAssetId:imageAsset.id,sourceInFrame:0,sourceOutFrame:30},{id:'v1',track:'V1',startFrame:30,durationInFrames:60,name:'video',kind:'video',sourceAssetId:videoAsset.id,sourceInFrame:0,sourceOutFrame:60}]})});
  const exported=await j(`/api/projects/${project.id}/timeline/export`,{method:'POST'});
  const mp4=await fetch(base+exported.publicUrl); const buffer=Buffer.from(await mp4.arrayBuffer()); if(buffer.length<1000)throw new Error('exported MP4 too small');
  const saved=join(dataDir,'e2e-export.mp4');await writeFile(saved,buffer);
  console.log(JSON.stringify({ok:true,projectId:project.id,uploadedAssetId:uploaded.id,imageAssetId:imageAsset.id,videoAssetId:videoAsset.id,exportAssetId:exported.id,exportBytes:buffer.length},null,2));
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);
  await rm(dataDir,{recursive:true,force:true});
}
