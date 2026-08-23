#!/usr/bin/env python3
"""
修复app.js中的自动排布功能
"""

import re

APP_JS_PATH = r'F:\codex\libtv-studio-complete-v1.3\standalone\public\app.js'

# 读取原文件（使用latin-1编码处理特殊字符）
with open(APP_JS_PATH, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# 1. 删除重复的autoLayoutNodes函数定义
# 找到所有autoLayoutNodes函数的位置并删除
pattern = r'  // 按节点类型分列自动排布.*?function autoLayoutNodes\(\)\{[\s\S]*?toast\(`已自动排布.*?\n  \}'
matches = list(re.finditer(pattern, content))

if len(matches) > 1:
    # 保留最后一个，删除前面的
    for match in reversed(matches[:-1]):
        content = content[:match.start()] + content[match.end():]
    print(f'[FIX] Removed {len(matches)-1} duplicate autoLayoutNodes functions')
elif len(matches) == 1:
    print('[OK] Found single autoLayoutNodes function')
else:
    print('[WARN] No autoLayoutNodes function found')

# 2. 确保showNodeContextMenu包含autoLayout按钮
if 'data-context-action="autoLayout"' not in content:
    # 找到showNodeContextMenu函数并修改
    pattern = r'(els\.nodeContextMenu\.innerHTML=)`${canRun\?'
    replacement = r'\1`<button class="context-menu-item" data-context-action="autoLayout">${icon(\'layout-grid\')}<span>\xe8\x87\xaa\xe5\x8a\xa8\xe6\x8e\x92\xe5\xb8\x83</span></button>${canRun?'
    content = re.sub(pattern, replacement, content)
    print('[FIX] Added autoLayout button to context menu')
else:
    print('[OK] autoLayout button already exists in context menu')

# 3. 确保事件处理包含autoLayout
if 'if(a===\'autoLayout\')autoLayoutNodes()' not in content:
    pattern = r"(if\(a==='run'\)generateNode\(n\.id\);)"
    replacement = r"if(a==='autoLayout')autoLayoutNodes();else \1"
    content = re.sub(pattern, replacement, content)
    print('[FIX] Added autoLayout event handler')
else:
    print('[OK] autoLayout event handler already exists')

# 保存文件
with open(APP_JS_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print('\n[DONE] app.js patch completed!')
print('Please refresh your browser to see the changes.')
