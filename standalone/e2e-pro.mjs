import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=dirname(fileURLToPath(import.meta.url));
const dataDir=await mkdtemp(join(tmpdir(),'libtv-e2e-pro-')); const port=3220; const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),DATA_DIR:dataDir,ARK_API_KEY:'test-only',KLING_ACCESS_KEY:'test-only',KLING_SECRET_KEY:'test-only',GEMINI_API_KEY:'test-only'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',c=>logs+=c);child.stderr.on('data',c=>logs+=c);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitHealth(){for(let i=0;i<50;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok)return await r.json();}catch{}await sleep(100);}throw new Error(`server did not start\n${logs}`)}
async function j(path,options={}){const r=await fetch(base+path,options);const text=await r.text();let body={};try{body=JSON.parse(text)}catch{body={text}}if(!r.ok)throw Object.assign(new Error(`${path}: ${JSON.stringify(body)}`),{status:r.status,body});return body}
async function upload(projectId,path,name,mime){return j(`/api/projects/${projectId}/assets/upload?filename=${encodeURIComponent(name)}`,{method:'POST',headers:{'content-type':mime,'x-filename':name},body:await readFile(path)})}
try{
  const health=await waitHealth(); if(!health.ffmpeg)throw new Error('ffmpeg required for pro E2E');
  const models=(await j('/api/models')).models; for(const provider of ['seedance','kling','veo'])if(!models.some(m=>m.providerId===provider))throw new Error(`${provider} registry missing`);
  const project=await j('/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Pro E2E'})});
  const frame=join(dataDir,'frame.png');const frameResult=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x121826:s=1280x720','-frames:v','1',frame]);if(frameResult.status!==0)throw new Error('failed to make image fixture');
  const img=await upload(project.id,frame,'frame.png','image/png'); const vid=await upload(project.id,join(ROOT,'fixtures','mock-video.mp4'),'clip.mp4','video/mp4');
  const tone=join(dataDir,'tone.wav');const toneResult=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','pcm_s16le',tone]);if(toneResult.status!==0)throw new Error('failed to make audio fixture');const aud=await upload(project.id,tone,'tone.wav','audio/wav');
  const timeline={fps:30,width:1280,height:720,tracks:{C1:{muted:false,hidden:false},V2:{muted:false,hidden:false},V1:{muted:false,hidden:false},A1:{muted:false,hidden:false},A2:{muted:false,hidden:false}},items:[
    {id:'i1',track:'V1',startFrame:0,durationInFrames:90,name:'base',kind:'image',sourceAssetId:img.id,sourceInFrame:0,sourceOutFrame:90,playbackRate:1,opacity:1,fadeOutFrames:10,transform:{x:0,y:0,scale:1}},
    {id:'v1',track:'V2',startFrame:30,durationInFrames:60,name:'overlay',kind:'video',sourceAssetId:vid.id,sourceInFrame:0,sourceOutFrame:60,playbackRate:1,opacity:.72,fadeInFrames:8,fadeOutFrames:8,transform:{x:12,y:-8,scale:.6}},
    {id:'a1',track:'A1',startFrame:0,durationInFrames:90,name:'tone',kind:'audio',sourceAssetId:aud.id,sourceInFrame:0,sourceOutFrame:90,playbackRate:1,volume:.2,fadeInFrames:3,fadeOutFrames:6},
    {id:'c1',track:'C1',startFrame:12,durationInFrames:65,name:'字幕',kind:'text',text:'LibTV 字幕导出测试',opacity:1,textStyle:{fontSize:52,color:'#ffffff',x:50,y:82}}
  ]};
  await j(`/api/projects/${project.id}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(timeline)});const exported=await j(`/api/projects/${project.id}/timeline/export`,{method:'POST'});const r=await fetch(base+exported.publicUrl);const buf=Buffer.from(await r.arrayBuffer());if(buf.length<5000)throw new Error('pro export too small');const output=join(dataDir,'pro.mp4');await writeFile(output,buf);const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',output],{encoding:'utf8'});const streams=JSON.parse(probe.stdout).streams?.map(s=>s.codec_type)||[];if(!streams.includes('video')||!streams.includes('audio'))throw new Error(`expected video+audio, got ${streams}`);
  const invalid=await fetch(`${base}/api/generations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,capability:'video.generate',providerId:'veo',modelId:models.find(m=>m.providerId==='veo').modelId,prompt:'validation only',params:{duration:5,aspectRatio:'16:9',resolution:'720p'},references:[]})});if(invalid.status!==400)throw new Error(`Veo constraint validation expected 400, got ${invalid.status}`);
  console.log(JSON.stringify({ok:true,version:health.version,providers:['seedance','kling','veo'],captionFont:health.captionFont,exportBytes:buf.length,streams},null,2));
}finally{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1500)]);await rm(dataDir,{recursive:true,force:true})}
