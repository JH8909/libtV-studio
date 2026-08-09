#!/usr/bin/env python3
"""
补丁脚本：为app.js添加自动排布功能
"""

import re
import sys

APP_JS_PATH = r'E:\codex\libtv-studio-complete-v1.3\libtv-studio-complete-v1.3\standalone\public\app.js'

# 读取原文件
with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 在fitCanvas函数后添加autoLayoutNodes函数
old_fitCanvas = 'function fitCanvas(){fitNodes(S.workflow.nodes);}'
new_fitCanvas = '''function fitCanvas(){fitNodes(S.workflow.nodes);}

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
    toast(`已自动排布 ${nodes.length} 个节点`, 'info');
  }'''

if old_fitCanvas in content:
    content = content.replace(old_fitCanvas, new_fitCanvas)
    print('[OK] Added autoLayoutNodes() function')
else:
    print('[ERROR] Could not find fitCanvas function')
    sys.exit(1)

# 2. 修改showNodeContextMenu函数，添加"自动排布"菜单项
# 找到菜单HTML构建的部分
old_menu_html = '''els.nodeContextMenu.innerHTML=`${canRun?`<button class="context-menu-item" data-context-action="run">${icon('player-play')}<span>运行 / 重新生成</span></button>`:''}<button class="context-menu-item" data-context-action="duplicate">'''
new_menu_html = '''els.nodeContextMenu.innerHTML=`<button class="context-menu-item" data-context-action="autoLayout">${icon('layout-grid')}<span>自动排布</span></button>${canRun?`<button class="context-menu-item" data-context-action="run">${icon('player-play')}<span>运行 / 重新生成</span></button>`:''}<button class="context-menu-item" data-context-action="duplicate">'''

if old_menu_html in content:
    content = content.replace(old_menu_html, new_menu_html)
    print('[OK] Added autoLayout menu item')
else:
    print('[WARN] Menu HTML pattern not found, trying alternative approach...')
    # 备用：直接替换整个函数体
    pattern = r'(function showNodeContextMenu\(x,y,n\)\{.*?)(if\(a===\'run\'\)generateNode)'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        old_part = match.group(1)
        new_part = old_part.replace(
            "els.nodeContextMenu.innerHTML=`${canRun?`<button class=\"context-menu-item\" data-context-action=\"run\">",
            "els.nodeContextMenu.innerHTML=`<button class=\"context-menu-item\" data-context-action=\"autoLayout\">${icon('layout-grid')}<span>自动排布</span></button>${canRun?`<button class=\"context-menu-item\" data-context-action=\"run\">"
        )
        content = content[:match.start()] + new_part + content[match.end()-len("if(a==='run')generateNode"):]
        print('[OK] Added autoLayout menu via fallback')
    else:
        print('[ERROR] Cannot modify menu items')

# 3. 添加autoLayout事件处理
old_event_handler = "if(a==='run')generateNode(n.id);"
new_event_handler = "if(a==='autoLayout')autoLayoutNodes();else if(a==='run')generateNode(n.id);"

if old_event_handler in content:
    content = content.replace(old_event_handler, new_event_handler)
    print('[OK] Added autoLayout event handler')
else:
    print('[WARN] Event handler pattern not found')

# 保存文件
with open(APP_JS_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print('\n[INFO] Feature description:')
print('   - Right-click node -> "Auto Layout"')
print('   - Text nodes: left column (x=50), Image nodes: middle (x=650), Video nodes: right (x=1200)')
print('   - Nodes in each column are arranged vertically with 300px spacing')
print('\n[DONE] Patch applied! Please refresh browser to see changes.')
