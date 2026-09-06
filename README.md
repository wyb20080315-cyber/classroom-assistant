# 🎓 课堂助手 Classroom Assistant

纯前端课堂辅助网站：英语课程录音 → 实时翻译字幕 → AI 课后分析。无需后端，部署到任意静态托管平台即可使用。

---

## 📦 部署到 Vercel 并获得公网网址

> 以下步骤无需任何编程经验，只需 5 分钟。

### 第 1 步：将项目上传到 GitHub

1. 打开 [GitHub 网站](https://github.com)，登录你的账号（没有账号先注册）。
2. 点击右上角 **"+ "** → **New repository**。
3. Repository name 填写 `classroom-assistant`，Visibility 选 **Public**，点击 **Create repository**。
4. 回到创建好的仓库页面，找到 **"Upload existing files"** 链接，点击它。
5. 把 `classroom-assistant` 文件夹里的 **所有文件**（`index.html`、`style.css`、`app.js`、`README.md`）拖到上传区域。
6. 等待上传完成后，点击页面底部的 **Commit changes** 按钮。

### 第 2 步：部署到 Vercel

1. 打开 [Vercel 网站](https://vercel.com)，用 GitHub 账号登录。
2. 点击 **Add New...** → **Project**。
3. 在 Import Git Repository 列表中，找到你的 `classroom-assistant` 仓库，点击 **Import**。
4. 点击 **Deploy** 按钮（无需修改任何设置）。
5. 等待约 30 秒，部署完成后 Vercel 会给你一个网址，形如 `https://classroom-assistant-xxxxx.vercel.app`。
6. **复制这个网址**，这就是你的课堂助手网站！可以在手机或电脑上打开使用。

### 其他方式：Netlify 部署

1. 打开 [Netlify Drop](https://app.netlify.com/drop)。
2. 把 `classroom-assistant` 整个文件夹拖到页面上。
3. 等待上传完成，Netlify 会自动给你一个网址。

---

## 📘 使用说明

### 一、首次打开网站

首次打开网站时，会自动弹出设置面板，需要填写以下三项：

| 字段 | 说明 | 在哪里获取 |
|------|------|-----------|
| **API Base URL** | 大模型接口的地址 | 登录你的 API 服务商后台（如中转站、DeepSeek 等平台），找到 API 文档中的 Base URL，通常是 `https://xxx/v1` 格式 |
| **API Key** | 调用 API 的密钥 | 在 API 服务商后台的 "API Keys" 页面创建并复制 |
| **Model 名称** | 模型的名字 | 在 API 服务商文档中查看，常见值：`deepseek-chat`、`gpt-4o-mini`、`qwen-plus` 等 |

**常用 API 服务商参考：**

| 服务商 | Base URL 示例 |
|--------|--------------|
| OpenAI 官方 | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 中转站 | 由你的中转站提供 |

填写完成后点击 **"保存并开始使用"**，设置会自动保存在你的浏览器本地。

### 二、主界面功能

进入主界面后，你会看到以下功能区：

| 功能区 | 操作 |
|--------|------|
| **🎤 开始/停止录音** | 点击红色大圆按钮开始录音，再点一次停止。录音时会有计时器 |
| **⬇ 下载录音** | 停止录音后出现，点击可下载 .webm 格式的录音文件 |
| **📝 识别文本与翻译** | 录音时实时显示英文识别结果和中文翻译，自动滚动 |
| **✏️ 手动输入** | 可选：如果录音时未开启识别，可在此粘贴英文文本 |
| **🔍 发送分析** | 将识别的英文（或手动粘贴的文本）发送给 AI 模型，生成中文总结 |
| **📊 分析结果** | AI 返回的课程总结、术语表、难点解析等 |
| **⚙️ 齿轮图标** | 随时修改 API 配置 |

### 三、使用流程

1. **录音**：把设备放在课堂前方，点击"开始录音"，页面下方会实时显示中文翻译字幕。
2. **停止**：课程结束后点击"停止录音"，录音文件自动生成并提供下载。
3. **分析**：点击"发送分析"，将识别的文本发送给配置的 AI 模型，页面显示中文总结、术语和难点。
4. **复制**：点击分析结果旁的"复制"按钮，可将分析结果保存到备忘录或笔记软件中。

### 四、隐私说明

**所有 API 密钥仅保存在你的浏览器本地（localStorage），不会上传到任何服务器。** 更换浏览器或清除浏览器数据后需要重新配置。

---

## ❓ 常见问题

### Q：浏览器不支持语音识别怎么办？
A：请使用 **Google Chrome** 浏览器（桌面版或 Android 版）。Safari 和 Firefox 对 Web Speech API 支持不完整。

### Q：API 调用失败怎么办？
A：
1. 点击 ⚙️ 设置，检查 API Base URL 是否以 `/v1` 结尾。
2. 检查 API Key 是否正确复制，不要有多余空格。
3. 检查 Model 名称是否与该 API 支持的模型一致。
4. 如果提示 CORS 错误，说明你的中转站未开启跨域支持，请联系中转站管理员或使用支持跨域的接口。

### Q：免费翻译效果不好怎么办？
A：在设置中开启 **"使用自定义模型进行实时翻译"**，会使用你配置的大模型进行翻译，效果更佳但会消耗 API 额度。

### Q：录音文件怎么播放？
A：下载的 `.webm` 文件可以用 Chrome、Edge 浏览器直接打开播放，也可用 VLC 播放器播放。

---

## 🛠 技术说明

- **技术栈**：纯 HTML + CSS + JavaScript，无任何后端依赖
- **录音**：浏览器 MediaRecorder API
- **语音识别**：浏览器 Web Speech API（推荐 Chrome）
- **翻译**：默认使用 MyMemory 免费 API，也可使用自定义大模型
- **分析**：调用用户配置的 OpenAI 兼容 API（Chat Completions 格式）
- **部署**：任何静态文件托管平台（Vercel、Netlify、GitHub Pages 等）
