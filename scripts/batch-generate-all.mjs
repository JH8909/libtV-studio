/**
 * 一键批量生成：分镜脚本 → 图片节点 → 视频节点
 * 
 * 用法：
 *   node scripts/batch-generate-all.mjs [project_id]
 * 
 * 功能：
 *   1. 解析textGen节点中的分镜脚本Markdown表格
 *   2. 为每个镜头创建imageGen节点（自动填充prompt）
 *   3. 为每个图片节点创建videoGen节点（自动连接first-frame）
 *   4. 保存workflow到db.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || 'E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\standalone\\data\\db.json';
const PROJECT_ID = process.argv[2];

// ============ 工具函数 ============
function parseMarkdownTable(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let start = 0; start < lines.length; start++) {
    if (!lines[start].includes('|')) continue;
    const headers = splitRow(lines[start]);
    if (!headers) continue;
    
    let end = start + 2;
    while (end < lines.length && lines[end].includes('|') && !isSeparator(lines[end])) {
      end++;
    }
    
    const rows = [];
    for (let i = start + 2; i < end; i++) {
      const cells = splitRow(lines[i]);
      if (cells && cells.length >= 6) rows.push(cells);
    }
    
    if (rows.length > 0) return { headers, rows };
  }
  return null;
}

function splitRow(line) {
  if (!line.trim().startsWith('|')) return null;
  return line.trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.replace(/\\\|/g, '|').trim());
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function cleanCell(value) {
  return value
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\*\*(.+?)\*\*$/,'$1')
    .trim();
}

function generateImagePrompt(row, headers) {
  const descIdx = headers.findIndex(h => h.includes('画面'));
  const stageIdx = headers.findIndex(h => h.includes('阶段') || h.includes('景别'));
  const durationIdx = headers.findIndex(h => h.includes('时长'));
  const audioIdx = headers.findIndex(h => h.includes('音效') || h.includes('音乐'));
  
  const scene = cleanCell(row[descIdx] || '');
  const stage = cleanCell(row[stageIdx] || '');
  const duration = cleanCell(row[durationIdx] || '');
  const audio = cleanCell(row[audioIdx] || '');
  
  const chinesePrompt = `电影级画面：${stage}，${scene}。时长${duration}${audio ? '，音效/音乐：' + audio : ''}。专业调色，胶片质感，35mm镜头，浅景深。`;
  
  return { prompt: chinesePrompt, row };
}

// ============ 主逻辑 ============
function main() {
  console.log('🎬 分镜脚本批量生成工具');
  console.log('=' .repeat(50));
  console.log('功能：分镜脚本 → 图片节点 → 视频节点\n');
  
  // 读取数据库
  let state;
  try {
    const content = readFileSync(DB_PATH, 'utf8');
    state = JSON.parse(content);
  } catch (e) {
    console.error('❌ 无法读取db.json:', e.message);
    process.exit(1);
  }
  
  // 确定项目ID
  const targetProjectId = PROJECT_ID || Object.keys(state.projects || {})[0];
  if (!targetProjectId) {
    console.error('❌ 没有找到任何项目');
    process.exit(1);
  }
  console.log(`📁 目标项目: ${targetProjectId}\n`);
  
  const project = state.projects[targetProjectId];
  if (!project) {
    console.error('❌ 项目不存在');
    process.exit(1);
  }
  
  const workflow = project.workflow || {};
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  
  // 找到所有分镜脚本节点
  const textNodes = nodes.filter(n => n.type === 'textGen' && n.data?.preset === 'storyboard' && n.data?.status === 'succeeded');
  
  if (textNodes.length === 0) {
    console.error('❌ 没有发现已完成的分镜脚本节点');
    console.log('提示：请先生成textGen类型的分镜脚本（preset=storyboard）');
    process.exit(1);
  }
  
  console.log(`✅ 找到 ${textNodes.length} 个分镜脚本节点\n`);
  
  let totalImageNodes = 0;
  let totalVideoNodes = 0;
  
  // 处理每个分镜脚本
  for (const textNode of textNodes) {
    const outputText = textNode.data?.outputText || '';
    if (!outputText) continue;
    
    console.log(`📝 解析分镜脚本: ${textNode.id.slice(0, 8)}...`);
    
    const table = parseMarkdownTable(outputText);
    if (!table || table.rows.length === 0) {
      console.log('   ⚠️ 无法解析表格格式');
      continue;
    }
    
    console.log(`   ✅ 解析到 ${table.rows.length} 个镜头`);
    
    // 为每个镜头创建图片节点和视频节点
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const { prompt } = generateImagePrompt(row, table.headers);
      
      // 创建图片节点
      const imgNodeId = `img-${i + 1}-${Date.now()}`;
      const imgNode = {
        id: imgNodeId,
        type: 'imageGen',
        position: { x: 400 + i * 500, y: 20 },
        data: {
          modelKey: 'agnes::agnes-image-2.1-flash',
          prompt: prompt,
          status: 'idle',
          progress: 0,
          params: { aspectRatio: '16:9', quality: '2K' },
          layoutWidth: 500,
          expanded: true,
          originShot: i + 1,
          originTextId: textNode.id
        }
      };
      
      nodes.push(imgNode);
      edges.push({
        id: `edge-text-to-img-${textNode.id}-${imgNodeId}`,
        source: textNode.id,
        target: imgNodeId
      });
      totalImageNodes++;
      
      // 创建视频节点
      const vidNodeId = `vid-${i + 1}-${Date.now()}`;
      const vidNode = {
        id: vidNodeId,
        type: 'videoGen',
        position: { x: imgNode.position.x + 560, y: imgNode.position.y },
        data: {
          modelKey: 'agnes::agnes-video-v2.0',
          prompt: '',
          status: 'idle',
          progress: 0,
          params: { duration: 5, aspectRatio: '16:9', resolution: '720p' },
          layoutWidth: 500,
          expanded: true,
          forcedCapability: 'video.image_to_video',
          originImageId: imgNodeId,
          originShot: i + 1
        }
      };
      
      nodes.push(vidNode);
      edges.push({
        id: `edge-img-to-vid-${imgNodeId}-${vidNodeId}`,
        source: imgNodeId,
        target: vidNodeId,
        role: 'first-frame'
      });
      totalVideoNodes++;
      
      console.log(`   🖼️📹 镜头 ${i + 1}: ${cleanCell(row[0] || '')}`);
    }
    
    console.log(`   ✅ 已添加 ${table.rows.length} 个图片节点 + ${table.rows.length} 个视频节点\n`);
  }
  
  // 更新workflow
  workflow.nodes = nodes;
  workflow.edges = edges;
  project.workflow = workflow;
  project.updatedAt = new Date().toISOString();
  
  // 保存
  writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  
  console.log('=' .repeat(50));
  console.log(`💾 已保存到 db.json`);
  console.log(`📊 统计:`);
  console.log(`   - 新增图片节点: ${totalImageNodes}`);
  console.log(`   - 新增视频节点: ${totalVideoNodes}`);
  console.log(`   - 总节点数: ${nodes.length}`);
  console.log(`   - 总边数: ${edges.length}`);
  console.log('\n✨ 完成！请在Studio界面刷新查看新节点');
  console.log('\n📋 下一步操作:');
  console.log('   1. 在画布上点击"运行全部"按钮，自动按依赖顺序生成');
  console.log('   2. 或者手动点击每个图片节点，等图片生成完成后点击视频节点');
  console.log('   3. 确保修复已完成: PUBLIC_BASE_URL 问题已通过代码修改解决');
}

main();
