/**
 * 批量从图片节点创建视频节点
 * 
 * 用法：
 *   node scripts/batch-video-from-images.mjs <project_id>
 * 
 * 功能：
 *   1. 找到所有imageGen节点（已完成或待生成）
 *   2. 为每个图片节点创建对应的videoGen节点
 *   3. 自动连接 imageGen → videoGen（role='first-frame'）
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || 'E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\standalone\\data\\db.json';
const PROJECT_ID = process.argv[2];

function main() {
  console.log('🎬 批量创建视频节点工具');
  console.log('=' .repeat(50));
  
  let state;
  try {
    const content = readFileSync(DB_PATH, 'utf8');
    state = JSON.parse(content);
  } catch (e) {
    console.error('❌ 无法读取db.json:', e.message);
    process.exit(1);
  }
  
  const targetProjectId = PROJECT_ID || Object.keys(state.projects || {})[0];
  if (!targetProjectId) {
    console.error('❌ 没有找到任何项目');
    process.exit(1);
  }
  console.log(`📁 目标项目: ${targetProjectId}`);
  
  const project = state.projects[targetProjectId];
  if (!project) {
    console.error('❌ 项目不存在');
    process.exit(1);
  }
  
  const workflow = project.workflow || {};
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  
  // 找到所有imageGen节点
  const imageNodes = nodes.filter(n => n.type === 'imageGen');
  
  if (imageNodes.length === 0) {
    console.log('⚠️ 没有找到imageGen节点');
    console.log('提示：请先运行 batch-image-from-storyboard.mjs');
    process.exit(0);
  }
  
  console.log(`✅ 找到 ${imageNodes.length} 个图片节点\n`);
  
  // 为每个图片节点创建视频节点
  const newNodes = [];
  const newEdges = [];
  
  for (let i = 0; i < imageNodes.length; i++) {
    const imgNode = imageNodes[i];
    const nodeId = imgNode.id;
    const nodeIndex = i + 1;
    
    // 创建videoGen节点
    const videoNodeId = `vid-${nodeIndex}-${Date.now()}`;
    const newNode = {
      id: videoNodeId,
      type: 'videoGen',
      position: { x: imgNode.position?.x + 560 || 960, y: imgNode.position?.y || 20 },
      data: {
        modelKey: 'agnes::agnes-video-v2.0',
        prompt: '',
        status: 'idle',
        progress: 0,
        params: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
        layoutWidth: 500,
        expanded: true,
        forcedCapability: 'video.image_to_video',
        originImageId: nodeId,
        originShot: nodeIndex
      }
    };
    
    newNodes.push(newNode);
    
    // 创建边：imageGen → videoGen
    newEdges.push({
      id: `edge-img-to-vid-${nodeId}-${videoNodeId}`,
      source: nodeId,
      target: videoNodeId,
      role: 'first-frame'
    });
    
    console.log(`   📹 镜头 ${nodeIndex}: ${imgNode.id.slice(0, 8)}... → ${videoNodeId.slice(0, 8)}...`);
  }
  
  // 更新workflow
  workflow.nodes = [...nodes, ...newNodes];
  workflow.edges = [...edges, ...newEdges];
  project.workflow = workflow;
  project.updatedAt = new Date().toISOString();
  
  writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  console.log(`\n💾 已保存 ${newNodes.length} 个视频节点到 db.json`);
  console.log('\n✨ 完成！请刷新Studio界面查看新节点');
}

main();
