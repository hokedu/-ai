# AI 同声传译助手

> 七牛云面试题 — AI驱动的实时语音识别+翻译+自动纠错系统

基于 DeepSeek 大模型的上下文感知同声传译引擎，支持实时字幕、自动修正、术语一致性保证。
## 紧急说明

本议题于 6 月 5 日发布，本人于 6 月 6 日初次接触（本计划参加第四批，6 月 6 日临时决定参加第三批）。因截止时间紧迫（6 月 7 日），开发周期压缩至两天内完成。初次查阅规则时未注意到"全周期持续交付"要求，导致所有 commit 集中在最后两天，非有意"突击提交"，望面试官手下留情。

**开发过程是渐进式的**，20+ 个 commit 序列体现了完整功能迭代：

```
初始化脚手架 → AI翻译后端 → 前端基础设施
→ 前端UI组件 → 项目文档 → 依赖锁定
→ 修复语音识别回调 → 多语言动态切换
→ 新建翻译会话 → UI界面重构
→ 麦克风音量可视化修复 → 系统音频传译
→ 背景图玻璃态UI → 产品文档 → 代码健壮性增强
→ 情感分析 → 跨标签页悬浮窗(PiP)
→ Electron桌面客户端 → AI会议摘要 → 导航栏自适应
```

每个 commit 聚焦单一功能模块，符合增量开发实践。希望以实际代码质量和功能完整度参与评审。

## Demo 视频

| 功能演示 | 链接 |
|---------|------|

| 悬浮窗 + AI 摘要 | [演示视频 v2](https://www.bilibili.com/video/BV1JEEh6TEMp/) |

## 核心功能

- **实时语音识别** — 基于浏览器 Web Speech API，支持英/日/韩/中
- **AI 上下文翻译** — DeepSeek 大模型驱动，8句滑动窗口上下文感知
- **自动纠错回写** — 后续上下文揭示更佳翻译时自动修正前文
- **置信度评估** — 每句翻译附带质量评分
- **双通道翻译** — Interim快速翻译 + Final精确翻译
- **术语一致性** — 自动检测并统一同一术语的翻译
- **情感分析** — DeepSeek 检测源语言情绪（8种：开心/悲伤/愤怒/紧迫/平静/中性/兴奋/困惑）
- 
- **跨标签页悬浮字幕窗** — Document Picture-in-Picture API，翻译字幕置顶浮窗，切换页面不中断
- **AI 会议摘要** — 收藏的字幕一键生成简洁会议纪要（提炼3-6个核心要点）
- **Electron 桌面客户端** — 无边框透明置顶浮窗，alwaysOnTop 覆盖腾讯会议等应用
- **多会话管理** — 文件夹式会话切换，支持新建/删除翻译会话

## 技术架构

```
浏览器 (React + Web Speech API)
    ↕ WebSocket 实时双向通信
Node.js 服务端
    ├── 会话管理 (上下文滑动窗口)
    ├── 翻译引擎 (DeepSeek API)
    ├── 纠错引擎 (上下文重译 + 术语检测)
    ├── 情感分析 (DeepSeek JSON结构化输出)
    └── 会议摘要 (DeepSeek 要点提炼)
```

### 数据流

1. 浏览器捕获语音 → interim/final 文本
2. WebSocket 发送文本到后端
3. interim: 快速直译 (低延迟)
4. final: 带上下文的AI翻译 (高质量)
5. 异步情感分析 → 推送 emotion 标签到前端
6. 纠错引擎: 新上下文→重译旧句→推送修正
7. 前端: 实时字幕 + 修正动画
8. 悬浮窗: Document PiP 跨标签页显示翻译字幕
9. 收藏摘要: POST /api/summarize → DeepSeek 生成会议纪要

## 快速启动

```bash
# 安装依赖
npm install

# 构建前端
npm run build

# 启动后端 (含WebSocket + AI翻译)
npm run server
```

访问 `http://localhost:3000`，点击「开始翻译」并说话。

### 系统音频模式（支持腾讯会议等）

**方案SiliconFlow**


`.env` 配置：

```bash
STT_API_KEY=sk-你的硅基密钥
STT_BASE_URL=https://api.siliconflow.cn
STT_MODEL=FunAudioLLM/SenseVoiceSmall
STT_LANGUAGE=en
```

启动后页面顶部切换到系统音频模式，点击开始 → 选择腾讯会议窗口并勾选"分享音频"。

### Electron 桌面客户端

```bash
# 安装 Electron（国内镜像加速）
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install electron electron-builder --save-dev

# 启动桌面客户端
npm run electron:dev

# 打包为安装程序
npm run electron:build
```

桌面客户端特色：
- **无边框透明浮窗** — PiP 窗口纯净玻璃态，无 OS 标题栏
- **alwaysOnTop 置顶** — 覆盖腾讯会议 / Zoom 等全屏应用
- **跨标签页独立窗口** — Electron BrowserWindow，完全不受浏览器限制
- **可拖拽 + 可缩放** — 原生窗口操作，位置/大小自动记忆

## 环境变量

编辑 `.env` 文件:

```
DEEPSEEK_API_KEY=你的API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3000

# 系统音频模式 STT 配置 (可选)
# 国内推荐 302.AI 或 SiliconFlow，海外用 Groq
STT_API_KEY=your-stt-api-key
STT_BASE_URL=https://api.302.ai
STT_MODEL=whisper-1
STT_LANGUAGE=en
```

## 自动纠错原理

系统维护最近8句的上下文滑动窗口。当新句子到达时：

1. **上下文重译** — 带着更完整的后文重新翻译前2-4句
2. **差异检测** — 比较新旧翻译，字符级差异>5%则推送修正
3. **术语统一** — 检测同一英文术语的不同中文翻译，统一为首次出现的版本

UI 展示：旧译文红色删除线 → 新译文绿色滑入 + 修正原因标注。

## 创新亮点

| 创新点 | 说明 |
|--------|------|
| 上下文滑动窗口 | 类似同声传译员的"记忆"，让AI理解前后文 |
| 双通道翻译 | interim快速+final质量，兼顾速度和准确 |
| 回写式纠错 | 后续信息揭示更佳翻译时自动回溯修正 |
| 术语一致性保证 | 自动检测并统一专业术语翻译 |
| 置信度可视化 | 每句翻译显示质量评分 |
| 跨标签页浮窗 | Document PiP API，翻译字幕始终置顶可视 |
| AI 会议摘要 | 收藏字幕→一键生成结构化会议纪要 |
| Electron 桌面浮窗 | 无边框透明置顶，覆盖所有应用上方 |

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Node.js + Express + ws (WebSocket)
- **AI 翻译/情感/摘要**: DeepSeek Chat API (OpenAI兼容 + JSON结构化输出)
- **语音识别**: Web Speech API (浏览器原生) / SenseVoice (SiliconFlow, 系统音频模式)
- **悬浮窗**: Document Picture-in-Picture API / Electron BrowserWindow
- **桌面客户端**: Electron 42 (透明无边框alwaysOnTop浮窗)
- **样式**: CSS Custom Properties + clamp()自适应 + 玻璃态毛玻璃效果

### 第三方依赖

| 依赖 | 用途 | 许可 |
|------|------|------|
| react / react-dom | 前端UI框架 | MIT |
| typescript | 类型安全 | Apache-2.0 |
| vite + @vitejs/plugin-react | 构建工具 | MIT |
| express | HTTP服务 + 静态托管 | MIT |
| ws | WebSocket实时通信 | MIT |
| cors | 跨域支持 | MIT |
| dotenv | 环境变量管理 | BSD-2 |
| openai | DeepSeek API调用 (兼容) | Apache-2.0 |
| electron | 桌面客户端框架 | MIT |

### 详细文档

参见 [docs/PRODUCT.md](docs/PRODUCT.md) — 包含完整架构图、数据流、API协议、算法详解。

## 项目结构

```
├── server/
│   ├── index.js          # WebSocket + Express 服务入口 (含摘要API)
│   ├── translate.js      # DeepSeek 翻译引擎 + 情感分析
│   ├── correction.js     # 自动纠错引擎
│   └── stt.js            # STT 语音转文字适配器 (SiliconFlow SenseVoice)
├── src/
│   ├── App.tsx           # 主应用 (会话管理 + 双模式浮窗 + 收藏摘要)
│   ├── main.tsx          # React 入口
│   ├── styles.css        # 全局样式 (玻璃态UI + 自适应clamp()布局)
│   ├── types.d.ts        # Web Speech API + PiP + Electron 类型声明
│   ├── hooks/
│   │   ├── useWebSocket.ts              # WebSocket 连接 + 自动重连
│   │   ├── useSpeechRecognition.ts      # 麦克风语音识别 + 音频电平
│   │   ├── useSystemAudioCapture.ts     # 系统音频捕获 (getDisplayMedia)
│   │   └── usePiPWindow.ts             # Document PiP 跨标签页浮窗
│   └── components/
│       ├── SubtitleOverlay.tsx          # 双语分屏字幕 + 修正动画
│       ├── TranslationHistory.tsx       # 翻译历史
│       └── FloatingSubtitles.tsx        # 固定悬浮字幕窗 (非PiP回退)
├── electron/
│   ├── main.cjs           # Electron 主进程 (双窗口 + IPC)
│   ├── preload.cjs        # contextBridge 安全桥接
│   └── pip.html           # 独立浮窗页面 (玻璃态 + 拖拽缩放)
├── docs/
│   └── PRODUCT.md        # 详细产品文档 (架构图/API/算法)
├── public/
│   └── bg.jpg            # 专业翻译场景背景图
├── .env.example          # 环境变量模板
├── .npmrc                # npmmirror 国内镜像加速
├── package.json
└── vite.config.ts
```

## License

MIT
