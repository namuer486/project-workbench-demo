# 模板拼接静默失效防线

JS 里有两种拼接错误**不会抛异常、不会语法报错、页面看起来正常**，但会静默吃掉大段模板。
`node --check` 放行，jsdom 也测不出「少了一块」——只会显示成「元素数量为 0」。
必须在 build 脚本里静态拦下来，并在烟测里加渲染完整性断言。

---

## 失效模式 1：ASI 缺 `+`

```js
el.innerHTML =
  '<div class="grid">' +
    card('A', bodyA)          // ← 这行末尾漏了 +
  '</div>' +                  // ← 下一行以字符串字面量开头
  '<div class="grid">' + card('B', bodyB);
```

ASI（自动分号插入）看到 `card(...)` 后面跟着一个字符串字面量，判定当前表达式无法继续，
**在行尾插入分号**。结果：

```js
el.innerHTML = '<div class="grid">' + card('A', bodyA);   // 真正的赋值
'</div>' + card('B', bodyB);                              // 被丢弃的独立表达式语句
```

页面渲染出 A 卡就停了，B 及之后全部消失，**没有任何报错**。

### 检测

行尾是 `)` / `}` / `]`，且下一行（strip 后）以 `'` 或 `"` 开头 → 报错。

```python
_lint = []
_ls = tpl.split('\n')
for _i in range(len(_ls) - 1):
    _a = _ls[_i].rstrip()
    _b = _ls[_i + 1].strip()
    if _a and _b and _b[0] in ("'", '"') and _a.endswith((')', '}', ']')):
        _lint.append('  line %d: %s  >>>  %s' % (_i + 1, _a[-56:], _b[:44]))
if _lint:
    raise SystemExit('模板存在被 ASI 静默截断的拼接（缺 +）：\n' + '\n'.join(_lint))
```

---

## 失效模式 2：逗号运算符

```js
el.innerHTML =
  '<div>' + card('A', bodyA),      // ← 这里写成了逗号
  card('B', bodyB) + '</div>';
```

`=` 的优先级**高于** `,`，所以实际解析为：

```js
(el.innerHTML = '<div>' + card('A', bodyA)), (card('B', bodyB) + '</div>');
```

**只赋值逗号前的部分**，逗号之后全部丢弃。同样不报错。

> 直觉陷阱：很多人以为 `x = A, B` 等价于 `x = (A, B)`。不是。要赋值整个逗号表达式必须加括号。

### 检测（括号/字符串感知的顶层逗号扫描）

```python
import re

def _top_level_commas(src, idx):
    """从 idx 处的 '=' 开始扫描到语句结束，返回顶层逗号所在行号列表。"""
    i, depth, line = idx, 0, src.count('\n', 0, idx) + 1
    instr = None          # 当前处于哪种字符串字面量中
    hits = []
    while i < len(src):
        c = src[i]
        if c == '\n':
            line += 1
        if instr:                       # 字符串内部：只找结束引号
            if c == '\\':
                i += 2
                continue
            if c == instr:
                instr = None
            i += 1
            continue
        if c in '"\'':
            instr = c
            i += 1
            continue
        if c == '/' and i + 1 < len(src) and src[i + 1] == '/':   # 行注释
            while i < len(src) and src[i] != '\n':
                i += 1
            continue
        if c in '([{':
            depth += 1
        elif c in ')]}':
            if depth == 0:
                break                   # 语句结束
            depth -= 1
        elif c == ',' and depth == 0:
            hits.append(line)
        elif c == ';' and depth == 0:
            break
        i += 1
    return hits

_bad = []
for _m in re.finditer(r"\.innerHTML\s*=", tpl):
    for _ln in _top_level_commas(tpl, _m.end()):
        _bad.append('  第 %d 行：innerHTML 赋值表达式存在顶层逗号' % _ln)
if _bad:
    raise SystemExit('模板存在被逗号运算符静默截断的拼接：\n' + '\n'.join(sorted(set(_bad))))
```

> 注意：`card('标题', body, '提示')` 里的逗号深度 > 0，不会被误报。只有 **depth == 0** 的逗号才是问题。

---

## 配套：烟测的渲染完整性断言

lint 只能挡住已知模式，仍要加断言兜底。原则：**断言该视图独有的「尾部区块标记」存在，并给出内容长度下限**。

```js
// 弱断言（挡不住截断）
ok('页面有内容', document.body.innerHTML.length > 0);

// 强断言（能挡住截断）
ok('仪表盘含总结条目卡', count('#v-dashboard .pcard') === 13, count('#v-dashboard .pcard'));
ok('仪表盘含 SVG 图表', count('#v-dashboard svg') >= 6, count('#v-dashboard svg'));
ok('仪表盘含末尾说明区块', $('#v-dashboard').innerHTML.indexOf('种子数据说明') >= 0);
ok('仪表盘内容长度下限', $('#v-dashboard').innerHTML.length > 20000);
```

每个视图都要有一条「它独有的、位于模板最末尾的元素/文案」的断言。

---

## 根治办法

**大块 HTML 模板不要用 `+` 拼接，改用数组 join：**

```js
$('v-dashboard').innerHTML = [
  '<div class="grid g6">' + stats.join('') + '</div>',
  '<div class="grid g2">' + card1 + card2 + '</div>',
  '<div class="card">' + summaryCards + '</div>',
  '<div class="card">' + seedInfo + '</div>'
].join('');
```

数组元素之间用 `,` 是**语法正确**的，不会触发以上两种失效模式，
且每个元素各自成行，漏写 `+` 的后果降级为「该元素内少拼一段」而不是「整段消失」。
