#!/usr/bin/env python3
"""
移除重复的autoLayoutNodes函数
"""

APP_JS_PATH = r'E:\codex\libtv-studio-complete-v1.3\libtv-studio-complete-v1.3\standalone\public\app.js'

with open(APP_JS_PATH, 'r', encoding='utf-8', errors='replace') as f:
    lines = f.readlines()

# 找到所有autoLayoutNodes函数定义的位置
func_starts = []
for i, line in enumerate(lines):
    if 'function autoLayoutNodes()' in line:
        func_starts.append(i)

print(f'Found autoLayoutNodes at lines: {[i+1 for i in func_starts]}')

if len(func_starts) > 1:
    # 删除第二个及之后的函数（保留第一个）
    for idx in func_starts[1:]:
        # 向前查找函数开始位置（去除注释行）
        start = idx
        while start > 0 and '// 按节点类型分列自动排布' in lines[start]:
            start -= 1
        # 向后查找函数结束位置（匹配花括号）
        end = idx
        brace_count = 0
        for j in range(idx, len(lines)):
            for char in lines[j]:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
            if brace_count == 0 and j > idx:
                end = j + 1
                break
        
        print(f'Deleting duplicate function at lines {idx+1}-{end}')
        lines = lines[:start] + lines[end:]
        break  # 只删除一个
    
    with open(APP_JS_PATH, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    
    print('\n[DONE] Removed duplicate autoLayoutNodes function')
else:
    print('[OK] No duplicate found')
