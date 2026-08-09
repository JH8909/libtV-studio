/**
 * 批量从分镜脚本生成图片节点
 * 
 * 用法：
 *   node scripts/batch-image-from-storyboard.mjs <project_id> [output_json]
 * 
 * 功能：
 *   1. 读取db.json中的textGen节点（分镜脚本）
 *   2. 解析Markdown表格，提取每个镜头的画面描述
 *   3. 为每个镜头创建imageGen节点
 *   4. 自动连接textGen → imageGen的边
 *   5. 可选：输出JSON供手动导入
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// ============ 配置 ============
const DB_PATH = process.env.DB_PATH || 'E:\\codex\\libtv-studio-complete-v1.3\\libtv-studio-complete-v1.3\\standalone\\data\\db.json';
const PROJECT_ID = process.argv[2];
const OUTPUT_JSON = process.argv[3]; // 可选，输出结果JSON

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
  // 找到"画面描述"列的索引
  const descIdx = headers.findIndex(h => h.includes('画面'));
  const stageIdx = headers.findIndex(h => h.includes('阶段') || h.includes('景别'));
  const durationIdx = headers.findIndex(h => h.includes('时长'));
  const audioIdx = headers.findIndex(h => h.includes('音效') || h.includes('音乐'));
  
  const scene = cleanCell(row[descIdx] || '');
  const stage = cleanCell(row[stageIdx] || '');
  const duration = cleanCell(row[durationIdx] || '');
  const audio = cleanCell(row[audioIdx] || '');
  
  // 构建英文prompt（AI图像模型对英文理解更好）
  const prompt = `Cinematic film still, ${scene}. Shot type: ${stage}. Duration: ${duration}. ${audio ? `Audio note: ${audio}.` : ''} Professional color grading, film grain, 35mm lens, shallow depth of field.`;
  
  // 同时保留中文备用
  const chinesePrompt = `电影级画面：${stage}，${scene}。时长${duration}${audio ? '，音效/音乐：' + audio : ''}。专业调色，胶片质感，35mm镜头，浅景深。`;
  
  return { prompt, chinesePrompt, row };
}

// ============ 主逻辑 ============
function main() {
  console.log('🎬 分镜脚本批量图片生成工具');
  console.log('=' .repeat(50));
  
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
  console.log(`📁 目标项目: ${targetProjectId}`);
  
  const project = state.projects[targetProjectId];
  if (!project) {
    console.error('❌ 项目不存在');
    process.exit(1);
  }
  
  // 查找textGen节点（分镜脚本）
  const workflow = project.workflow || {};
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  
  const textNodes = nodes.filter(n => n.type === 'textGen' && n.data?.preset === 'storyboard' && n.data?.status === 'succeeded');
  
  if (textNodes.length === 0) {
    console.error('❌ 没有发现已完成的分镜脚本节点（textGen + preset=storyboard）');
    console.log('提示：请先生成分镜脚本');
    process.exit(1);
  }
  
  console.log(`✅ 找到 ${textNodes.length} 个分镜脚本节点\n`);
  
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
    console.log(`   表头: ${table.headers.join(' | ')}`);
    
    // 为每个镜头创建imageGen节点
    const newRowIds = [];
    const newEdges = [];
    
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const { prompt, chinesePrompt } = generateImagePrompt(row, table.headers);
      
      const newNodeId = crypto.randomUUID ? 
        `${Math.random().toString(36).substr(2, 9)}-${Date.now()}` : 
        `img-${i}-${Date.now()}`;
      
      const newNode = {
        id: newNodeId,
        type: 'imageGen',
        position: { x: 400 + i * 500, y: 20 + i * 300 },
        data: {
          modelKey: 'agnes::agnes-image-2.1-flash',
          prompt: chinesePrompt,
          status: 'idle',
          progress: 0,
          params: { aspectRatio: '16:9', quality: '2K' },
          layoutWidth: 500,
          expanded: true,
          originShot: i + 1,
          originNodeId: textNode.id
        }
      };
      
      nodes.push(newNode);
      newRowIds.push(newNodeId);
      
      // 创建边连接到textGen节点
      newEdges.push({
        id: `edge-${textNode.id}-${newNodeId}`,
        source: textNode.id,
        target: newNodeId
      });
      
      console.log(`   🖼️  镜头 ${i + 1}: ${cleanCell(row[0] || '')} → ${newNodeId.slice(0, 8)}...`);
    }
    
    // 更新workflow
    workflow.nodes = nodes;
    workflow.edges = [...edges, ...newEdges];
    project.workflow = workflow;
    project.updatedAt = new Date().toISOString();
    
    console.log(`   ✅ 已添加 ${newRowIds.length} 个图片节点\n`);
  }
  
  // 保存
  writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf8');
  console.log('💾 已保存到 db.json');
  
  // 可选：输出JSON
  if (OUTPUT_JSON) {
    const result = {
      projectId: targetProjectId,
      updatedAt: new Date().toISOString(),
      nodeCount: (project.workflow?.nodes || []).length,
      edgeCount: (project.workflow?.edges || []).length
    };
    writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2), 'utf8');
    console.log(`📄 结果已保存到: ${OUTPUT_JSON}`);
  }
  
  console.log('\n✨ 完成！请在Studio界面刷新查看新节点');
}

main();
