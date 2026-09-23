# UI 规格书 · 项目工作台（与最终成品逐项一致）

> 本规格书描述的是**已交付产物的真实视觉与交互**。`references/workbench.css` 是真品样式表（457 行，逐字节抽取），
> 复现时把该文件整体内联进 `<style>` 即得到完全一致的呈现。本文件说明**为什么这样写**以及**如何按此重建**。

---

## 1. 设计令牌（`:root`，必须原样使用）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--bg` | `#f4f6fb` | 页面底色（浅灰蓝） |
| `--card` | `#ffffff` | 卡片/顶栏底 |
| `--text` | `#1a2233` | 主文字（近黑深蓝） |
| `--muted` | `#6b7280` | 次要文字 |
| `--border` | `#e7eaf3` | 所有描边 |
| `--primary` | `#4f6ef7` | 品牌主色（导航选中、主按钮、链接） |
| `--primary-soft` | `#eef1fe` | 主色浅底（chip/标签底） |
| `--primary-deep` | `#3b56d6` | 主色深（chips 文字、hover） |
| `--green` / `--green-soft` | `#16a34a` / `#e7f6ee` | 已解决、亮点、成功态 |
| `--orange` / `--orange-soft` | `#f59e0b` / `#fef4e2` | 待验证、一般提醒 |
| `--blue` / `--blue-soft` | `#3b82f6` / `#e8f1fe` | 进行中、阶段完成徽标 |
| `--red` / `--red-soft` | `#ef4444` / `#fdeaea` | 未解决、缺陷、危险 |
| `--purple` / `--purple-soft` | `#8b5cf6` / `#f1ecfe` | 美术类、装饰渐变 |
| `--teal` / `--teal-soft` | `#0d9488` / `#e3f5f3` | 当前版本强调色（3.0 预备） |
| `--shadow` | `0 1px 3px rgba(23,32,74,.06),0 6px 18px rgba(23,32,74,.05)` | 卡片默认阴影 |
| `--shadow-lg` | `0 10px 34px rgba(23,32,74,.12)` | hover / 弹窗阴影 |
| `--radius` | `14px` | 卡片圆角 |
| `--sidebar-w` | `236px` | 侧边栏固定宽 |
| `--mono` | `"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace` | 编号/数值等宽字体 |

**页面字体栈**（body）：`-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif`；基准字号 `14px`，行高 `1.6`，开启 `-webkit-font-smoothing:antialiased`。

**六大衡量标签配色**（写入数据层 `dimensions[].color`，前端通过 `--dc`/`--dcs` 注入）：

| 标签 | 色值 |
|---|---|
| ✨ 新鲜感 | `#8b5cf6` |
| 🎯 目标感 | `#3b82f6` |
| 📈 成长感 | `#16a34a` |
| 🎮 乐趣性 | `#ef4444` |
| 🤝 社交感 | `#0d9488` |
| ⏱ 时间成本 | `#f59e0b` |

标签组件样式：`.dim-chip{background:var(--dcs);color:var(--dc)}`、选中 `.dim-chip.on{background:var(--dc);color:#fff}`；
颜色以 CSS 变量注入元素内联 style：`dimStyle(key)` → `--dc:<color>;--dcs:<color>1f`（`1f` = 12% 透明度的 hex）。

---

## 2. 布局骨架（尺寸必须一致）

```
.app (display:flex; height:100vh; overflow:hidden)
├── aside.sidebar        236px 固定，深色 #111a33，内边距 20px 14px，纵向 flex
│   ├── .brand           38×38 logo（11px 圆角、linear-gradient(135deg,#4f6ef7,#8b5cf6)、投影）+ 名称 15px/700 + 副标题 11px #7c8db0
│   ├── .nav-group       分组标题 11px 大写字距 .06em 色 #5d6d8f，margin-top 16px
│   ├── .nav             纵向 gap 3px
│   │   └── .nav-item    11px 12px 内边距、圆角 10px、13.5px、#aeb9d0；hover 白 6% 透明；active 主色渐变 + 投影
│   └── .foot            margin-top:auto，11.5px，上方 1px 白 7% 分隔线；`.dot` 7px 绿点带 3px 光晕
└── .main (flex:1; 纵向 flex; overflow:hidden)
    ├── header.topbar    高 60px、白底、下边框；左侧 标题 17px/700 + 面包屑 12.5px muted；
    │                    右侧 .search 260px（圆角 10px，聚焦时主色描边 + 3px 光晕）+ 日期标签 12.5px
    └── .content         flex:1; overflow-y:auto; padding:24px
        └── section.view 默认 display:none；.active 显示并播放 fade .25s
```

**栅格**：`.grid{gap:16px}`，`.grid-4` = `repeat(4,1fr)`、`.grid-2` = `repeat(2,1fr)`、`.grid-3` = `repeat(3,1fr)`；
响应式断点：
- `≤1100px`：grid-4 → 2 列，grid-3 → 1 列，grid-2 → 1 列（另有一处 1100px 用于 dim-grid / shot-grid / ur-two 单列）
- `≤900px`：`.form-grid` 两列表单 → 单列
- `≤820px`：侧边栏收成 66px 图标条（隐藏名称/分组/页脚文字，导航居中）

---

## 3. 组件清单（复现时必须逐项一致）

| 组件 | 关键规格 |
|---|---|
| `.card` | 白底、1px `--border`、圆角 `--radius`(14px)、`--shadow`、内边距 20px；`h3` 14.5px/700 + 底部 14px；`h3 .tag` 靠右 11px 灰底胶囊 |
| `.stat`（统计卡） | 内边距 18px 20px；`.value` 30px/800 字距 -.5px；`.unit` 14px muted；`.label` 12.5px muted；`.ico` 右上 26px 透明度 .2；`::before` 左侧 4px 色条取 `--c` |
| `.chip` | 12px、内边距 3px 10px、圆角 20px；状态色 `.st-已解决/.st-待验证/.st-进行中/.st-未解决`、优先级 `.p-高/.p-中/.p-缺陷/.p-美术/.p-一般`、分类 `.cat-chip` |
| `.btn` | 13.5px/600、内边距 9px 16px、圆角 10px；`.primary` 主色 + 投影；`.ghost` 透明；`.sm` 6px 11px + 圆角 8px；`.danger` 红字 |
| `.table-wrap` | 1px 描边 + 圆角 12px + `overflow:auto`；`thead th` sticky 吸顶、底色 `#f8fafd`、12px/600 muted、内边距 11px 14px；`tbody td` 11px 14px、`vertical-align:top`；行 hover `#fafbfe` |
| `.ipd-banner` | 深色渐变 `linear-gradient(135deg,#111a33,#25356e)`、白字、圆角 14px、内边距 16px 22px；阶段胶囊 `.ib-step`（默认半透明白底 / `.done` 绿字 / `.now` 主色实底）；右侧 `.ib-ksf` 12px 右对齐 |
| `.dim-card` | 左侧 4px 维度色条、圆角 12px、内边距 13px 15px；`.dc-rate` 维度色胶囊；`.dc-meter` 7px 高四段满意度分布条（绿/黄绿/橙/红）；`.dc-foot` 11.5px；选中 `.on` 外发光 2px |
| `.pain-item` | 圆角 12px、内边距 15px 18px、底部间距 12px；hover 上浮 1px + 大阴影；`.pi-no` 44×26 主色浅底圆角 8px；`.pi-keys` 项目符号为 `·`；`.pi-btn` 12px/600；`.hl` 主色描边 + 3px 光晕 |
| `.tc-topic` | 11.5px、圆角 999px、主色浅底 + 浅描边，可点击 |
| `.link-banner` | 主色浅底 + 描边、圆角 11px、内边距 11px 16px；右上 `.lb-x` 下划线清除按钮 |
| `.shot-box`（定位图） | 容器圆角 12px 深底 `#0f1424`；`.shot-head` 灰底信息条；`.shot-canvas` 内 `<img>` 宽度 100%；`.shot-tag` **绝对定位 + `transform:translate(-50%,-50%)`**，百分比坐标，圆角 999px，白底 + 维度色描边，`::before` 6px 圆点；亮点态 `.spot` 维度色实底；`.shot-legend` 灰底图例条 |
| `.ur-adv`（建议卡） | 左侧 4px 维度色条、圆角 10px、内边距 11px 14px；`.ua-n` 22×22 序号块 |
| `.meth-flow`（方法论流程条） | 步骤胶囊 `.fstep`（主色浅底、圆角 6px）+ 箭头 `.farrow`（`#c7cff0`） |
| `.pd-sec`（四段式详情） | `.pd-h` 12px/700 主色深；`.pd-b` 灰底圆角 10px；方案段 `.sol` 绿底；`.ksf-list` 前缀 `✓` |
| `.minor-toggle` | 全宽折叠条、内边距 15px 20px、底色 `#fafbfe`；箭头旋转 180° 表示展开 |
| `.week-pill` | 圆角 11px、1.5px 描边；选中主色实底；`.w-badge` 11px 主色浅底胶囊 |
| `.ver-badge` | 10.5px/600 胶囊：`.v20dev` 蓝、`.v20trans` 绿、`.v10` 灰 |
| `.graph-canvas-wrap` | 高 640px、圆角 14px、**背景为 22px 网格点阵** `radial-gradient(circle at 1px 1px,#e6e9f2 1px,transparent 0) 0 0/22px 22px`；`cursor:grab`，拖拽时 `.dragging` → `grabbing` |
| `.graph-tip` / `.node-tip` | 左上说明卡 / 跟随节点的深色 tooltip（`#111a33`，最大宽 300px） |
| `.modal-mask` / `.modal` | 遮罩 `rgba(15,23,42,.45)` + `backdrop-filter:blur(3px)`；弹窗最大宽 560px、圆角 16px、内边距 24px、`max-height:90vh`、`animation:fade .2s` |
| `.toast` | 底部居中 26px、深色底、圆角 11px；`.ok` 深绿、`.err` 深红；`.show` 淡入上移 |
| `.empty` | 居中内边距 46px 20px，`.e-ico` 42px 半透明 |

---

## 4. 动效与交互（复现要点）

| 场景 | 规格 |
|---|---|
| 视图切换 | `.view` 淡入 + 上移 6px：`@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`，时长 .25s |
| 卡片 hover | 定位卡上浮 2px + `--shadow-lg`；条目卡上浮 1px + 主色描边 |
| 进度/分布条 | `width` 过渡 `.5s ease` |
| 输入聚焦 | 描边转主色 + `box-shadow:0 0 0 3px var(--primary-soft)` |
| 折叠箭头 | `.arrow` 过渡 .2s，展开旋转 180° |
| 弹窗 | 遮罩淡入 + 弹窗 fade .2s；关闭即移除 `.show` |
| 图谱 | 力导向布局；滚轮缩放、拖拽平移/拖节点、悬停显示 `.node-tip`、点击查看详情；网格近邻斥力保证 200+ 节点毫秒级收敛 |
| 主题 | `:root` 只定义浅色一套（当前成品即浅色主题，`--bg:#f4f6fb` 浅底 + 深色文字）；无深色模式分支 |

**交互一致性红线**：所有可点的筛选控件必须绑定 `change` 触发重渲染；所有可展开/收起的区块要同步箭头与 `open` 类；所有联动跳转应「设状态 → 切视图 → 目标视图渲染时读状态并显示来源提示条」。

---

## 5. 自检（做完拿截图逐项比对）

- [ ] 侧边栏 236px 深色、导航分「核心 / 过程 / 综合」三组，选中项为主色渐变
- [ ] 顶栏 60px、标题 17px、搜索框 260px 可聚焦发光
- [ ] 内容区 padding 24px、卡片 14px 圆角 + 双层柔和阴影
- [ ] 统计卡左色条 + 30px 数值 + 右上淡图标
- [ ] 六大标签卡左侧 4px 色条，颜色与标签一一对应（新鲜感紫 / 目标感蓝 / 成长感绿 / 乐趣性红 / 社交感青 / 时间成本橙）
- [ ] 定位图标签以百分比坐标贴在画面上，缩放窗口不跑位
- [ ] 图谱画布为 22px 点阵网格 + 640px 高
- [ ] 表格表头吸顶、行 hover 变色、圆角 12px 容器
- [ ] 1100 / 900 / 820 三个断点表现正常（无横向溢出）
