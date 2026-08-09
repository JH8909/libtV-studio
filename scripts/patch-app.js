/**
 * 补丁脚本：为app.js添加自动排布功能
 */

const fs = require('fs');
const path = require('path');

const APP_JS_PATH = path.join(__dirname, '..', 'standalone', 'public', 'app.js');

// 读取原文件
let content = fs.readFileSync(APP_JS_PATH, 'utf8');

// 1. 在fitCanvas函数后添加autoLayoutNodes函数
const fitCanvasIndex = content.indexOf('function fitCanvas(){fitNodes(S.workflow.nodes);}');
if (fitCanvasIndex === -1) {
  console.error('❌ 找不到fitCanvas函数');
  process.exit(1);
}

const autoLayoutFunction = `
  
  // 按节点类型分列自动排布（文本→图片→视频）
  function autoLayoutNodes(){
    const nodes = S.workflow.nodes.filter(n => isGenerationNode(n));
    if (!nodes.length) return toast('画布上没有节点', 'info');
    
    // 分类节点
    const textNodes = nodes.filter(n => n.type === 'textGen');
    const imageNodes = nodes.filter(n => n.type === 'imageGen');
    const videoNodes = nodes.filter(n => n.type === 'videoGen');
    
    // 列位置配置（像素）
    const COL_TEXT_X = 50;
    const COL_IMAGE_X = 650;
    const COL_VIDEO_X = 1200;
    const ROW_SPACING = 300;
    const START_Y = 50;
    
    // 重新定位文本节点
    textNodes.forEach((n, i) => {
      n.position = { x: COL_TEXT_X, y: START_Y + i * ROW_SPACING };
    });
    
    // 重新定位图片节点
    imageNodes.forEach((n, i) => {
      n.position = { x: COL_IMAGE_X, y: START_Y + i * ROW_SPACING };
    });
    
    // 重新定位视频节点
    videoNodes.forEach((n, i) => {
      n.position = { x: COL_VIDEO_X, y: START_Y + i * ROW_SPACING };
    });
    
    scheduleSave();
    renderCanvas();
    renderEdges();
    fitCanvas();
    toast(\`已自动排布 \${nodes.length} 个节点\`, 'info');
  }`;

content = content.slice(0, fitCanvasIndex) + autoLayoutFunction + content.slice(fitCanvasIndex);

// 2. 修改showNodeContextMenu函数，添加"自动排布"菜单项
// 先找到原始文本
const oldMenuText = 'els.nodeContextMenu.innerHTML=`${canRun?`<button class="context-menu-item" data-context-action="run">';
const newMenuText = 'els.nodeContextMenu.innerHTML=\\`<button class="context-menu-item" data-context-action="autoLayout">\\${icon(\\'layout-grid\\')}<span>自动排布</span></button>\\${canRun?`<button class="context-menu-item" data-context-action="run">';

content = content.replace(oldMenuText, newMenuText);

// 3. 添加autoLayout事件处理
const eventHandlerOld = "if(a==='run')generateNode(n.id);else if(a==='duplicate')";
const eventHandlerNew = "if(a==='autoLayout')autoLayoutNodes();else if(a==='run')generateNode(n.id);else if(a==='duplicate')";

content = content.replace(eventHandlerOld, eventHandlerNew);

// 保存文件
fs.writeFileSync(APP_JS_PATH, content, 'utf8');

console.log('✅ app.js 已更新');
console.log('   - 添加了 autoLayoutNodes() 函数');
console.log('   - 右键菜单新增"自动排布"选项');
console.log('');
console.log('📋 功能说明:');
console.log('   - 点击右键 → "自动排布" → 节点按类型分列排布');
console.log('   - 文本节点在最左列(x=50)，图片节点中间列(x=650)，视频节点最右列(x=1200)');
console.log('   - 每列内部按顺序垂直排列，间距300像素');
