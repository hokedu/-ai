# AI 同声传译助手

> 七牛云面试题 — AI驱动的实时语音识别+翻译+自动纠错系统

基于 DeepSeek 大模型的上下文感知同声传译引擎，支持实时字幕、自动修正、术语一致性保证。

## 核心功能

- **实时语音识别** — 基于浏览器 Web Speech API，支持英/日/韩/中
- **AI 上下文翻译** — DeepSeek 大模型驱动，8句滑动窗口上下文感知
- **自动纠错回写** — 后续上下文揭示更佳翻译时自动修正前文
- **置信度评估** — 每句翻译附带质量评分
- **双通道翻译** — Interim快速翻译 + Final精确翻译
- **术语一致性** — 自动检测并统一同一术语的翻译

## 技术架构

```
浏览器 (React + Web Speech API)
    ↕ WebSocket 实时双向通信
Node.js 服务端
    ├── 会话管理 (上下文滑动窗口)
    ├── 翻译引擎 (DeepSeek API)
    └── 纠错引擎 (上下文重译 + 术语检测)
```

### 数据流

1. 浏览器捕获语音 → interim/final 文本
2. WebSocket 发送文本到后端
3. interim: 快速直译 (低延迟)
4. final: 带上下文的AI翻译 (高质量)
5. 纠错引擎: 新上下文→重译旧句→推送修正
6. 前端: 实时字幕 + 修正动画

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

### 系统音频模式（腾讯会议等）

配置 STT 服务后，可捕获本机系统音频实时翻译：

```bash
# .env 中添加 STT 配置（推荐 Groq 免费 Whisper API）
STT_API_KEY=gsk_xxxx
STT_BASE_URL=https://api.groq.com/openai
STT_MODEL=whisper-large-v3
STT_LANGUAGE=en
```

启动后页面顶部切换到系统音频模式，点击开始 → 选择腾讯会议窗口并勾选"分享音频"。

## Demo 视频

> [演示视频](https://www.bilibili.com/video/BV1SvEb62ET1/)

## 环境变量

编辑 `.env` 文件:

```
DEEPSEEK_API_KEY=你的API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
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

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **后端**: Node.js + Express + ws (WebSocket)
- **AI 翻译**: DeepSeek Chat API (OpenAI兼容)
- **语音识别**: Web Speech API (浏览器原生) / Whisper API (系统音频模式)
- **样式**: CSS Custom Properties + 玻璃态毛玻璃效果

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

### 详细文档

参见 [docs/PRODUCT.md](docs/PRODUCT.md) — 包含完整架构图、数据流、API协议、算法详解。

## 项目结构

```
├── server/
│   ├── index.js          # WebSocket + Express 服务入口
│   ├── translate.js      # DeepSeek 翻译引擎
│   └── correction.js     # 自动纠错引擎
├── src/
│   ├── App.tsx           # 主应用组件
│   ├── main.tsx          # 入口
│   ├── styles.css        # 全局样式
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useSpeechRecognition.ts
│   └── components/
│       ├── SubtitleOverlay.tsx
│       └── TranslationHistory.tsx
├── .env.example         # 环境变量模板
└── package.json
```

## License

MIT
