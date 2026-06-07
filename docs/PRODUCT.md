# AI 同声传译助手 — 产品文档

> 版本 v0.1.0 | 2026-06-07 | 七牛云面试项目

---

## 一、产品概述

AI 同声传译助手是一款基于大语言模型的**实时语音翻译系统**，面向国际会议、技术讲座、跨国商务沟通等场景。用户说出任意支持的语言，系统在 1-2 秒内完成语音识别、AI 上下文翻译、字幕呈现，并在后续对话中**自动修正前文翻译**，保证术语一致性和翻译质量。

### 产品定位

| 维度 | 说明 |
|------|------|
| **目标用户** | 参加国际会议的技术人员、跨国商务人士、留学生 |
| **核心场景** | 英文/日文/韩文技术讲座实时字幕、跨国会议同传 |
| **差异化** | AI 上下文感知翻译 + 自动回写纠错，非传统逐句机翻 |
| **运行环境** | Chrome 浏览器（Web Speech API）+ Node.js 服务端 |

### 一句话描述

> 打开浏览器，点击开始，说话即可获得带 AI 上下文理解和自动纠错的双语实时字幕。

---

## 二、核心功能

### 2.1 实时语音识别

- 基于浏览器原生 **Web Speech API**，无需额外安装语音引擎
- 支持 **双结果输出**：`interim`（实时听写中间结果）+ `final`（完整句子）
- 搭配 **Web Audio API** 音频电平可视化（8格麦克风动画）
- 识别过程中**锁定语言选择器**，防止语言/翻译错配

### 2.2 AI 上下文翻译

- **双通道翻译架构**：
  - **Interim 快速翻译**：低延迟直译（`temperature=0.1`），用于实时字幕滚动
  - **Final 精确翻译**：带上下文滑动窗口的高质量翻译（`temperature=0.2`）
- **8 句滑动上下文窗口**：将当前句与前 7 句一同送入 AI，理解语境
- **动态语言路由**：根据用户选择的源语言自动构建 `System Prompt`

### 2.3 自动纠错回写

- **策略一 — 上下文重译**：后续句子揭示更多语境后，回译前面 2-4 句
- **策略二 — 术语一致性检测**：正则匹配同一英文术语在不同位置的中文译法，自动统一
- **差异判定**：字符级差异 > 5% 视为有效修正
- **频率控制**：最小间隔 2000ms，避免高频修正闪烁
- **可视化反馈**：旧译文红线删除 → 新译文绿色动画滑入 + 修正原因标注

### 2.4 翻译历史管理

- **会话文件夹系统**：用户可创建多个命名的翻译会话（如「React Conf」「产品发布会」）
- **文件夹切换**：翻译过程中锁定切换，停止后可自由切换
- **历史面板**：可折叠的双栏历史（原文 | 译文），标注置信度和修正记录
- **统计概要**：显示当前会话的总翻译条数 + 修正次数

### 2.5 多语言支持

| 源语言 | 代码 | 翻译方向 |
|--------|------|----------|
| English | `en-US` | → 中文 |
| 日本語 | `ja-JP` | → 中文 |
| 한국어 | `ko-KR` | → 中文 |
| 中文 | `zh-CN` | → English |

---

## 三、技术架构

### 系统架构图

```
┌────────────────────────────────────────────────────────────┐
│                       用户浏览器                            │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ Web Speech   │  │ Web Audio     │  │ React 18       │  │
│  │ API (STT)    │  │ API (Meter)   │  │ SPA (Vite)     │  │
│  └──────┬───────┘  └───────┬───────┘  └───────┬────────┘  │
│         │ speech text       │ audio level      │ WebSocket │
│         └───────────────────┴──────────────────┤ Client    │
│                                                │           │
└────────────────────────────────────────────────┼───────────┘
                                                 │
                              WebSocket (ws://)   │
                                                 │
┌────────────────────────────────────────────────┼───────────┐
│                   Node.js 服务端                │           │
│  ┌─────────────────────────────────────────────┴───────┐  │
│  │                  WebSocket Server (ws)               │  │
│  │         ┌───────────────────────────────┐           │  │
│  │         │     Session Manager            │           │  │
│  │         │  • history[]                  │           │  │
│  │         │  • contextWindow[] (max 8)    │           │  │
│  │         │  • interimCache               │           │  │
│  │         │  • sourceLanguage             │           │  │
│  │         └───────────┬───────────────────┘           │  │
│  └─────────────────────┼───────────────────────────────┘  │
│                        │                                   │
│  ┌─────────────────────┼───────────────────────────────┐  │
│  │          Translation Engine (DeepSeek)              │  │
│  │  • translateQuick() — interim 快速翻译              │  │
│  │  • translateWithContext() — final 上下文翻译        │  │
│  │  • retranslateWithNewContext() — 纠错回译           │  │
│  │  • estimateConfidence() — 置信度评估                │  │
│  │  • LANG_MAP — 动态语言路由                          │  │
│  └─────────────────────┬───────────────────────────────┘  │
│                        │                                   │
│  ┌─────────────────────┼───────────────────────────────┐  │
│  │          Correction Engine                          │  │
│  │  • checkAndCorrect() — 双策略纠错入口               │  │
│  │  • isMeaningfullyDifferent() — 差异判定             │  │
│  │  • detectTermInconsistency() — 术语一致性检测       │  │
│  │  • extractTermTranslation() — 术语正则提取          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────┐     │
│  │         Express HTTP Server                       │     │
│  │  • GET /api/health — 健康检查                     │     │
│  │  • static /dist — 前端静态托管                    │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │   DeepSeek Chat API     │
                    │   api.deepseek.com      │
                    │   model: deepseek-chat  │
                    └─────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| **前端框架** | React 18 + TypeScript | UI 组件、状态管理 |
| **构建工具** | Vite 5 | 开发服务器、生产构建 |
| **后端运行时** | Node.js + Express | HTTP 服务、静态托管 |
| **实时通信** | ws (WebSocket) | 双向实时消息 |
| **AI 模型** | DeepSeek Chat API | 翻译、纠错 |
| **语音识别** | Web Speech API | 浏览器端 STT |
| **音频分析** | Web Audio API | 麦克风电平可视化 |
| **样式方案** | CSS Custom Properties | 设计令牌、玻璃态 UI |

---

## 四、数据流与协议

### 4.1 WebSocket 消息协议

所有消息为 JSON 格式，通过单一 WebSocket 连接双向传输。

#### 客户端 → 服务端

| type | 触发时机 | 关键字段 |
|------|----------|----------|
| `interim` | 语音识别产生中间结果 | `id`, `text`, `sourceLanguage` |
| `final` | 语音识别完成一句完整话 | `id`, `text`, `sourceLanguage` |
| `reset` | 用户点击新建会话 | 无额外字段 |
| `ping` | 心跳检测 | 无额外字段 |

#### 服务端 → 客户端

| type | 触发时机 | 关键字段 |
|------|----------|----------|
| `translation` | 翻译完成 | `mode`(interim\|final), `id`, `source`, `translation`, `confidence` |
| `correction` | 自动纠错完成 | `id`, `oldTranslation`, `newTranslation`, `reason` |
| `reset_ack` | 会话重置确认 | `timestamp` |
| `pong` | 心跳响应 | 无额外字段 |
| `error` | 处理异常 | `message` |

### 4.2 完整翻译生命周期

```
用户开始说话
    │
    ├─ 每 250ms ──► interim 消息 ──► translateQuick() ──► 前端实时字幕更新
    │
    └─ 说完一句 ──► final 消息 ──► translateWithContext()
                      │                  │
                      │   contextWindow  │
                      │   (前7句上下文)   │
                      │                  ▼
                      │          DeepSeek API
                      │                  │
                      │                  ▼
                      │          置信度评估 + 存入 history[]
                      │                  │
                      │                  ▼
                      │          ws.send(translation/final)
                      │
                      ├─ history.length >= 2 ──► CorrectionEngine.checkAndCorrect()
                      │                              │
                      │   ┌──────────────────────────┴──────────────┐
                      │   │  Strategy 1: retranslateWithNewContext() │
                      │   │  Strategy 2: detectTermInconsistency()   │
                      │   └──────────────────────────┬──────────────┘
                      │                              ▼
                      │                     ws.send(correction) × N
                      ▼
             前端收到 correction ──► 替换翻译 + 修正动画 + 历史记录
```

### 4.3 上下文滑动窗口

```
时间线 ─────────────────────────────────────────────────►
句子:  [S1]  [S2]  [S3]  [S4]  [S5]  [S6]  [S7]  [S8]  [S9]
                                                         ^
                                                    ← 当前句 →

翻译 S9 时，contextWindow = [S2, S3, S4, S5, S6, S7, S8]
                                          ↑ 最多 8 句 ↑
```

当窗口满 8 句后，最早的一句自动移出（FIFO）。

---

## 五、翻译引擎详解

### 5.1 DeepSeek API 配置

```
Base URL:  https://api.deepseek.com
Model:     deepseek-chat
Auth:      Bearer Token (API Key)
兼容性:    OpenAI Chat Completions 格式
```

### 5.2 三种翻译模式

| 模式 | 方法 | temperature | max_tokens | Context | 延迟 |
|------|------|-------------|-------------|---------|------|
| **Quick** | `translateQuick()` | 0.1 | 200 | 无 | < 500ms |
| **Context** | `translateWithContext()` | 0.2 | 300 | 前 7 句 | ~1s |
| **Re-translate** | `retranslateWithNewContext()` | 0.2 | 300 | 完整窗口(不含自身) | ~1s |

### 5.3 System Prompt 设计

```
You are a professional simultaneous interpreter for technical conferences.
Your task is to translate {English} speech into fluent, natural {Chinese}
in real-time.

RULES:
1. Output ONLY the {Chinese} translation — no explanations, no notes, no prefixes
2. Maintain consistency: same {English} term → same {Chinese} translation
3. For technical terms, use standard {Chinese} technical translations
4. Preserve speaker tone: formal for keynotes, relaxed for casual talks
5. If the input is incomplete or fragmented, translate what you can naturally
6. Handle pronouns correctly based on provided context
7. For numbers, dates, and proper nouns, preserve them exactly
```

Prompt 中的源语言和目标语言根据 `LANG_MAP` **动态生成**，支持英→中、日→中、韩→中、中→英四条翻译路径。

### 5.4 置信度评估算法

```
基础分: 85
- 译文/原文长度比 < 0.3 → -20（译文过短，可能丢失信息）
- 译文/原文长度比 > 3.0 → -10（译文过长，可能包含幻觉）
- 译文中每出现一个英文单词 → -5（应译未译）
- 译文与原文完全相同 → -50（未翻译）
最终分数: 0-100
```

---

## 六、自动纠错机制

### 6.1 为什么需要自动纠错？

传统逐句翻译的问题：

```
时刻 T1: 说 "React is great" → 译 "React 很棒"
时刻 T2: 说 "But it has a learning curve" → 译 "但它有学习曲线"

问题：T1 时 AI 不知道后面会说什么，"React is great" 孤立翻译可能
      不如有 T2 上下文后翻译得好。
```

同声传译员的工作方式就是在听到更多内容后脑内不断修正之前的理解。

### 6.2 双策略纠错

#### 策略一：上下文重译 (Context Re-translation)

```
输入: 历史记录 (history) + 完整上下文窗口 (contextWindow)
操作:
  1. 选取倒数第 2-4 句（非当前句）作为候选
  2. 跳过已修正过的句子 (_corrected = true)
  3. 调用 retranslateWithNewContext(句子原文, 完整上下文, 源语言)
  4. 比较新旧翻译: isMeaningfullyDifferent(old, new)
  5. 差异 > 5% → 推送 correction 消息
```

#### 策略二：术语一致性检测 (Terminology Consistency)

```
输入: 当前翻译条目 + 历史记录
操作:
  1. 正则提取源句中的专有名词和长词: \b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b
  2. 正则提取源句中的普通名词: \b[a-z]{4,}\b
  3. 遍历历史记录，查找同一术语的其他翻译
  4. 用正则 [一-鿿]{2,6} 提取目标语言中的候选术语翻译
  5. 同一源术语 → 不同译法 → 统一为首次出现的译法
```

### 6.3 差异判定算法

```
isMeaningfullyDifferent(oldText, newText):
  // 完全相同 → 无修正意义
  if (oldText === newText) return false

  // 计算字符级差异 + 长度差异
  maxLen = max(oldText.length, newText.length)
  minLen = min(oldText.length, newText.length)
  lenDiff = maxLen - minLen

  charDiffs = 逐字符比较差异数(仅比较 minLen 范围内的字符)
  diffRatio = (charDiffs + lenDiff) / maxLen

  // 超过 5% 差异 → 判定为有意义的不同
  return diffRatio > 0.05
```

### 6.4 频率控制

- 最小纠错间隔：**2000ms**
- 目的：防止高频修正导致 UI 闪烁、避免 API 调用过于频繁

---

## 七、前端 UI 设计

### 7.1 设计语言

| 维度 | 方案 |
|------|------|
| **主题** | 深色玻璃态（Dark Glassmorphism） |
| **配色** | `#09090b` 基底 + `#3b82f6` 蓝色强调 |
| **字体** | SF Pro Display / Inter 系统界面字体 |
| **圆角** | 10px(小) / 16px(中) / 20px(大) |
| **模糊** | `backdrop-filter: blur(18-24px)` 配合 `rgba(9,9,11,0.32-0.4)` |
| **过渡** | 0.15-0.3s ease |
| **背景** | 专业翻译场景图片 + 暗色玻璃叠加 |

### 7.2 布局结构

```
┌──────────────────────────────────────────────────────┐
│  [● AI同声传译] [English ▼ → 中文] [AI已连接] [待机] │
│                         [▂▃▄▅▆▇██] [🎤开始翻译] [📁] │  ← 控制栏
├───────────────────────────────┬──────────────────────┤
│                               │                      │
│  源语言 (SOURCE)              │  中文译文 (TARGET)    │
│                               │                      │
│  ┌────────────────────────┐   │  ┌────────────────┐  │
│  │ 上一句原文...           │   │  │ 上一句译文      │  │
│  └────────────────────────┘   │  └────────────────┘  │
│                               │                      │
│  ┌────────────────────────┐   │  ┌────────────────┐  │  ← 双语字幕
│  │ 当前原文 (高亮)         │   │  │ 当前译文 (高亮) │  │
│  └────────────────────────┘   │  └────────────────┘  │
│                               │  ┌─── 修正 ───────┐  │
│  ┌────────────────────────┐   │  │ 旧译 (删除线)  │  │
│  │ 正在听写... (闪烁)     │   │  │ 新译 (绿色)    │  │
│  └────────────────────────┘   │  └────────────────┘  │
│                               │                      │
├───────────────────────────────┴──────────────────────┤
│  ▼ 翻译历史  12 条  3 次修正                          │  ← 可折叠历史
│  ┌──────────────────────┬──────────────────────────┐  │
│  │ 原文                  │ 译文                     │  │
│  └──────────────────────┴──────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 7.3 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `App` | `src/App.tsx` | 主应用：状态管理、文件夹管理、消息路由 |
| `SubtitleOverlay` | `src/components/SubtitleOverlay.tsx` | 双语分屏字幕：源语+译文实时展示 |
| `TranslationHistory` | `src/components/TranslationHistory.tsx` | 可折叠历史面板：原文/译文对照+修正记录 |

### 7.4 自定义 Hooks

| Hook | 文件 | 职责 |
|------|------|------|
| `useSpeechRecognition` | `src/hooks/useSpeechRecognition.ts` | 语音识别 + 音频电平分析 |
| `useWebSocket` | `src/hooks/useWebSocket.ts` | WebSocket 连接管理 + 自动重连 |

### 7.5 音频电平可视化

- 8 格竖向条形图，对数阈值分布
- 最低格阈值 0.03（轻松触发），最高格阈值 0.73（需较大音量）
- `getByteFrequencyData` 获取频域数据，2.5× 扩展曲线放大灵敏度
- `smoothingTimeConstant = 0.5` 平衡响应速度和平滑度
- 激活时颜色从蓝到青蓝 HSL 渐变 + `scaleY` 动画

---

## 八、会话与文件夹管理

### 8.1 数据结构

```typescript
interface TranslationFolder {
  id: string          // 格式: "folder-{timestamp}-{random}"
  name: string        // 用户命名，如 "React Conf Q&A"
  entries: SubtitleEntry[]   // 翻译条目列表
  corrections: CorrectionEvent[]  // 修正事件列表
  createdAt: number   // 创建时间戳
}

interface SubtitleEntry {
  id: string
  source: string        // 源语言文本
  translation: string   // 译文
  mode: 'interim' | 'final'
  confidence: number    // 0-100
  timestamp: number
}

interface CorrectionEvent {
  id: string
  oldTranslation: string
  newTranslation: string
  reason: string        // 如 "术语统一"、"根据上下文补充"
  timestamp: number
}
```

### 8.2 操作限制

| 操作 | 翻译中 | 停止后 |
|------|--------|--------|
| 切换文件夹 | 禁止 | 允许 |
| 创建文件夹 | 允许 | 允许 |
| 删除文件夹 | 允许 | 允许 |
| 切换语言 | 禁止 | 允许 |
| 开始翻译 | — | 允许 |
| 停止翻译 | 允许 | — |

### 8.3 Session Reset（服务端）

客户端发送 `{ type: 'reset' }` 后，服务端清空：

- `session.history = []`
- `session.contextWindow = []`
- `session.interimCache = null`
- `session.sourceLanguage = null`

旧会话上下文**完全隔离**，新翻译不受前一次会话影响。

---

## 九、部署与配置

### 9.1 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（必填） | — |
| `DEEPSEEK_BASE_URL` | API 基础地址 | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型名称 | `deepseek-chat` |
| `PORT` | 服务端口 | `3000` |

### 9.2 启动步骤

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY

# 3. 构建前端
npm run build

# 4. 启动服务
npm run server
# → HTTP: http://localhost:3000
# → WS:   ws://localhost:3000
```

### 9.3 开发模式

```bash
# 终端1: 启动后端 (含 WebSocket)
npm run server

# 终端2: 启动前端开发服务器 (HMR)
npm run dev
# → http://localhost:4173 (自动代理 /api 到 3000)
```

---

## 十、项目结构

```
ai同声传译助手/
├── index.html                       # HTML 入口
├── vite.config.ts                   # Vite 构建配置
├── package.json                     # 依赖与脚本
├── tsconfig.json                    # TypeScript 配置
├── .env.example                     # 环境变量模板
├── README.md                        # 项目说明（快速启动）
├── docs/
│   └── PRODUCT.md                   # 产品文档（本文档）
├── public/
│   └── bg.jpg                       # 背景图
├── server/
│   ├── index.js                     # 服务入口 (WebSocket + Express)
│   ├── translate.js                 # DeepSeek 翻译引擎
│   └── correction.js                # 自动纠错引擎
└── src/
    ├── main.tsx                     # React 入口
    ├── App.tsx                      # 主应用组件
    ├── styles.css                   # 全局样式 (设计令牌 + 玻璃态 UI)
    ├── types.d.ts                   # Web Speech API 类型声明
    ├── assets/
    │   └── 专业翻译网站背景图生成.png
    ├── hooks/
    │   ├── useWebSocket.ts          # WebSocket 连接管理 Hook
    │   └── useSpeechRecognition.ts  # 语音识别 + 音频电平 Hook
    └── components/
        ├── SubtitleOverlay.tsx      # 双语分屏字幕组件
        └── TranslationHistory.tsx   # 翻译历史面板组件
```

---

## 十一、创新亮点

| 序号 | 创新点 | 技术实现 | 用户价值 |
|------|--------|----------|----------|
| 1 | **上下文滑动窗口** | 8 句 FIFO 队列 + 带上下文的 System Prompt | 类似同传译员的"记忆"，理解讲座前后关联 |
| 2 | **双通道翻译** | interim(t=0.1) + final(t=0.2) 两条翻译管道 | 兼顾实时滚动速度与最终质量 |
| 3 | **回写式自动纠错** | 上下文重译 + 术语一致性检测双策略 | 后文揭示更佳翻译时自动修正前文 |
| 4 | **动态语言路由** | LANG_MAP 驱动的 System Prompt 生成 | 一套代码支持 4 种语言 |
| 5 | **会话隔离** | 客户端文件夹系统 + 服务端 session 重置 | 多场翻译互不干扰 |
| 6 | **音频电平可视化** | Web Audio API + 对数阈值 + 频率分析 | 直观确认麦克风工作状态 |
| 7 | **置信度可视化** | 启发性评估算法 + 颜色编码 | 用户可直观判断翻译质量 |
| 8 | **玻璃态深色 UI** | backdrop-filter 毛玻璃 + 背景图叠加 | 专业大气的会议工具视觉风格 |

---

## 十二、API 参考

### HTTP API

#### `GET /api/health`

健康检查接口。

**响应**:
```json
{
  "status": "ok",
  "model": "deepseek-chat"
}
```

### WebSocket 消息参考

#### 发送 interim 翻译请求

```json
{
  "type": "interim",
  "id": "interim-current",
  "text": "Today we will discuss",
  "sourceLanguage": "en-US"
}
```

#### 发送 final 翻译请求

```json
{
  "type": "final",
  "id": "1717766400000-a3f2b1",
  "text": "Today we will discuss the future of artificial intelligence",
  "sourceLanguage": "en-US"
}
```

#### 接收翻译结果

```json
{
  "type": "translation",
  "mode": "final",
  "id": "1717766400000-a3f2b1",
  "source": "Today we will discuss the future of artificial intelligence",
  "translation": "今天我们将讨论人工智能的未来",
  "confidence": 87,
  "timestamp": 1717766401500
}
```

#### 接收纠错结果

```json
{
  "type": "correction",
  "id": "1717766395000-b7c4d2",
  "oldTranslation": "今天我们会谈谈人工智能",
  "newTranslation": "今天我们将讨论人工智能的未来",
  "reason": "根据上下文补充了更准确的翻译",
  "timestamp": 1717766402500
}
```

#### 重置会话

```json
{ "type": "reset" }
// 响应
{ "type": "reset_ack", "timestamp": 1717766500000 }
```

---

## 十三、已知限制与未来规划

### 当前限制

| 限制 | 说明 |
|------|------|
| 仅支持 Chrome | Web Speech API 在 Firefox/Safari 上兼容性有限 |
| 无离线能力 | 翻译依赖 DeepSeek API 网络请求 |
| 单会话单语言 | 同一会话内不支持混合语言输入 |
| 无发言者区分 | 不区分不同说话人 |

### 未来规划

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 移动端适配 | 响应式优化 + PWA 支持 |
| P1 | 发言者区分 | 多人会议中标识不同说话人 |
| P1 | 术语库管理 | 用户可预定义专业术语对照表 |
| P2 | 翻译缓存 | 相同/相似句子复用缓存，降低 API 成本 |
| P2 | 导出功能 | 导出双语字幕文件 (SRT/VTT) |
| P3 | 流式翻译 | DeepSeek stream 模式，逐字渲染翻译 |
| P3 | 录音回放 | 录音保存 + 离线翻译 |

---

> 本文档随项目持续更新。最新版本参见 `docs/PRODUCT.md`。
