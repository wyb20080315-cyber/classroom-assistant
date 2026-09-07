// ============================================================
// 课堂助手 - Classroom Assistant
// Features: Recording, Transcription, Local Storage, AI Analysis
// Translation Logic: Queued Async Translation to prevent blocking
// ============================================================

(function () {
  "use strict";

  // --- Storage & Config ---
  const STORAGE_KEY = "classroom_assistant_config";

  function getConfig() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function saveConfig(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }

  // --- DOM Refs ---
  const $ = (sel) => document.querySelector(sel);
  const setupOverlay = $("#setup-overlay");
  const setupClose = $("#setup-close");
  const settingsOverlay = $("#settings-overlay");
  const setupForm = $("#setup-form");
  const settingsForm = $("#settings-form");
  const recordBtn = $("#record-btn");
  const recordLabel = $("#record-label");
  const statusIndicator = $("#status-indicator");
  const timerEl = $("#timer");
  const transcriptContainer = $("#transcript-container");
  const analyzeBtn = $("#analyze-btn");
  const analyzeLoading = $("#analyze-loading");
  const resultSection = $("#result-section");
  const analysisResult = $("#analysis-result");
  const errorToast = $("#error-toast");
  const clearTextBtn = $("#clear-text");
  const copyResultBtn = $("#copy-result");
  const settingsBtn = $("#settings-btn");
  const closeSettingsBtn = $("#close-settings");
  const recordingsSection = $("#recordings-section");
  const recordingsList = $("#recordings-list");
  const analysisFileInput = $("#analysis-file");
  const fileNameDisplay = $("#file-name-display");

  // --- State ---
  let mediaRecorder = null;
  let audioChunks = [];
  let recognition = null;
  let isRecording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let fullTranscript = "";
  let recordings = [];
  
  // Translation Queue
  let translationQueue = [];
  let isProcessingQueue = false;

  // --- Toast ---
  let toastTimer = null;
  function showToast(msg, isError) {
    errorToast.textContent = msg;
    errorToast.className = "toast" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { errorToast.className = "toast hidden"; }, 5000);
  }

  // --- Timer ---
  function startTimer() {
    timerSeconds = 0;
    timerEl.classList.remove("hidden");
    timerInterval = setInterval(() => {
      timerSeconds++;
      const m = String(Math.floor(timerSeconds / 60)).padStart(2, "0");
      const s = String(timerSeconds % 60).padStart(2, "0");
      timerEl.textContent = m + ":" + s;
    }, 1000);
  }
  function stopTimer() { 
    clearInterval(timerInterval); 
    timerInterval = null;
    timerSeconds = 0;
    timerEl.textContent = "00:00";
  }
  function formatDuration(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sc = String(s % 60).padStart(2, "0");
    return m + ":" + sc;
  }

  // --- Setup / Settings ---
  function showSetup() {
    if (!getConfig()) setupOverlay.classList.remove("hidden");
  }

  setupClose.addEventListener("click", () => {
    setupOverlay.classList.add("hidden");
    showToast("已跳过设置，翻译和分析功能将不可用");
  });

  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      baseUrl: $("#api-base-url").value.trim().replace(/\/+$/, ""),
      apiKey: $("#api-key").value.trim(),
      model: $("#model-name").value.trim(),
      useCustomTranslate: $("#use-custom-translate").checked
    };
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      showToast("请填写所有必填字段", true); return;
    }
    saveConfig(cfg);
    setupOverlay.classList.add("hidden");
    showToast("设置已保存");
  });

  settingsBtn.addEventListener("click", () => {
    const cfg = getConfig();
    if (cfg) {
      $("#set-api-base-url").value = cfg.baseUrl;
      $("#set-api-key").value = cfg.apiKey;
      $("#set-model-name").value = cfg.model;
      $("#set-use-custom-translate").checked = cfg.useCustomTranslate;
    } else {
      $("#set-api-base-url").value = "";
      $("#set-api-key").value = "";
      $("#set-model-name").value = "";
      $("#set-use-custom-translate").checked = false;
    }
    settingsOverlay.classList.remove("hidden");
  });

  closeSettingsBtn.addEventListener("click", () => settingsOverlay.classList.add("hidden"));

  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      baseUrl: $("#set-api-base-url").value.trim().replace(/\/+$/, ""),
      apiKey: $("#set-api-key").value.trim(),
      model: $("#set-model-name").value.trim(),
      useCustomTranslate: $("#set-use-custom-translate").checked
    };
    saveConfig(cfg);
    settingsOverlay.classList.add("hidden");
    showToast("设置已更新");
  });

  // --- Speech Recognition ---
  function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  function initRecognition() {
    const SR = getSpeechRecognition();
    if (!SR) {
      showToast("浏览器不支持语音识别，请使用 Chrome", true);
      return null;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event) => {
      let interim = "", finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (finalText) {
        fullTranscript += finalText + " ";
        addTranscriptLine(finalText.trim());
      }
      if (interim) updateLastTranscript(interim.trim());
    };

    rec.onerror = (e) => { if (e.error === "not-allowed") showToast("请允许麦克风权限", true); };
    rec.onend = () => { if (isRecording) { try { rec.start(); } catch(e){} } };

    return rec;
  }

  function addTranscriptLine(enText) {
    const ph = transcriptContainer.querySelector(".placeholder");
    if (ph) ph.remove();

    const line = document.createElement("div");
    line.className = "transcript-line";
    
    const zhP = document.createElement("p");
    zhP.className = "transcript-zh loading-zh";
    zhP.textContent = "翻译中...";
    line.appendChild(zhP);

    transcriptContainer.appendChild(line);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

    // Add to queue instead of immediate translation
    translationQueue.push({ text: enText, element: zhP });
    processTranslationQueue();
  }

  function updateLastTranscript(text) {
    // For interim results, we don't update the UI immediately to avoid flickering
    // The final result will trigger the translation queue
  }

  async function processTranslationQueue() {
    if (isProcessingQueue || translationQueue.length === 0) return;
    isProcessingQueue = true;

    const cfg = getConfig();
    if (!cfg) {
      // If no config, clear the queue and mark all as unavailable
      while (translationQueue.length > 0) {
        const item = translationQueue.shift();
        item.element.textContent = "[未配置 API]";
        item.element.classList.remove("loading-zh");
      }
      isProcessingQueue = false;
      return;
    }

    // Process all items in the queue
    const promises = translationQueue.map(item => translateText(item.text, item.element));
    await Promise.all(promises);
    
    translationQueue = [];
    isProcessingQueue = false;
  }

  async function translateText(enText, targetEl) {
    const cfg = getConfig();
    try {
      let translated = "";
      if (cfg.useCustomTranslate) {
        const resp = await fetch(cfg.baseUrl + "/chat/completions", {
          method: "POST", 
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
          body: JSON.stringify({ 
            model: cfg.model, 
            messages: [{role:"system", content:"Translate to Simplified Chinese only."}, {role:"user", content:enText}], 
            max_tokens: 512,
            temperature: 0.3
          })
        });
        if (!resp.ok) throw new Error("API Error");
        const data = await resp.json();
        translated = data.choices?.[0]?.message?.content || "";
      } else {
        const resp = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(enText) + "&langpair=en|zh-CN");
        if (!resp.ok) throw new Error("Network Error");
        const data = await resp.json();
        translated = data.responseData?.translatedText || "";
      }
      targetEl.textContent = translated.trim();
      targetEl.classList.remove("loading-zh");
    } catch (err) {
      targetEl.textContent = "[翻译失败]";
      targetEl.classList.remove("loading-zh");
    }
  }

  // --- Recording ---
  recordBtn.addEventListener("click", async () => {
    if (!isRecording) await startRecording();
    else stopRecording();
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = onRecordingStopped;
      mediaRecorder.start(1000);

      recognition = initRecognition();
      if (recognition) try { recognition.start(); } catch(e){}

      isRecording = true;
      recordBtn.classList.add("recording");
      recordLabel.textContent = "停止录音";
      statusIndicator.textContent = "录音中";
      statusIndicator.className = "status-dot active";
      startTimer();
    } catch (err) {
      showToast("无法访问麦克风: " + err.message, true);
    }
  }

  function stopRecording() {
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (recognition) { recognition.stop(); recognition = null; }

    recordBtn.classList.remove("recording");
    recordLabel.textContent = "开始录音";
    statusIndicator.textContent = "已停止";
    statusIndicator.className = "status-dot inactive";
    stopTimer();
    
    // Ensure any remaining queued translations are processed
    processTranslationQueue();
  }

  function onRecordingStopped() {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-");
    const name = "录音_" + ts;
    const size = formatFileSize(blob.size);
    const duration = formatDuration(timerSeconds);

    const rec = { id: Date.now(), name, size, duration, url };
    recordings.unshift(rec);
    renderRecordings();
  }

  function renderRecordings() {
    if (recordings.length === 0) {
      recordingsSection.classList.add("hidden");
      return;
    }
    recordingsSection.classList.remove("hidden");
    recordingsList.innerHTML = "";
    recordings.forEach(rec => {
      const el = document.createElement("div");
      el.className = "recording-item";
      el.innerHTML = `
        <div class="recording-meta">
          <span class="recording-name">${rec.name}.mp4</span>
          <span class="recording-details">${rec.duration} · ${rec.size}</span>
        </div>
        <div class="recording-actions">
          <a class="btn-download-item" href="${rec.url}" download="${rec.name}.mp4">⬇ 下载</a>
          <button class="btn-delete" data-id="${rec.id}">✕ 删除</button>
        </div>
      `;
      recordingsList.appendChild(el);
    });

    recordingsList.querySelectorAll(".btn-delete").forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const rec = recordings.find(r => r.id === id);
        if (rec) URL.revokeObjectURL(rec.url);
        recordings = recordings.filter(r => r.id !== id);
        renderRecordings();
      };
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // --- Clear transcript ---
  clearTextBtn.addEventListener("click", () => {
    fullTranscript = "";
    transcriptContainer.innerHTML = '<p class="placeholder">录音开始后，此处将实时显示中文翻译字幕...</p>';
    translationQueue = []; // Clear translation queue as well
  });

  // --- File Analysis ---
  analysisFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      fileNameDisplay.textContent = file.name;
    }
  });

  analyzeBtn.addEventListener("click", async () => {
    const cfg = getConfig();
    if (!cfg) { showToast("请先配置 API 设置", true); return; }

    const file = analysisFileInput.files[0];
    if (!file) { showToast("请先选择一个文件", true); return; }

    let text = "";
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      text = await file.text();
    } else {
      showToast("AI 分析仅支持 TXT 文本文件", true);
      return;
    }

    if (!text.trim()) { showToast("文件内容为空", true); return; }

    analyzeLoading.classList.remove("hidden");
    analyzeBtn.disabled = true;
    resultSection.classList.add("hidden");

    const systemPrompt = `你是一位英语教学助手。请对以下英文课程内容进行分析和总结，要求：
1. **课程要点总结**：用中文概括课程的主要内容
2. **关键术语列表**：列出英文术语、中文翻译和解释
3. **难点解析**：用通俗中文解释难点
4. **学习建议**：给出复习建议`;

    try {
      const resp = await fetch(cfg.baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, messages: [{role:"system", content: systemPrompt}, {role:"user", content: text}], max_tokens: 4096 })
      });
      if (!resp.ok) throw new Error("API 请求失败 (HTTP " + resp.status + ")");
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        analysisResult.textContent = content;
        resultSection.classList.remove("hidden");
      } else throw new Error("模型返回空结果");
    } catch (err) {
      showToast(err.message, true);
    } finally {
      analyzeLoading.classList.add("hidden");
      analyzeBtn.disabled = false;
    }
  });

  // --- Copy result ---
  copyResultBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(analysisResult.textContent).then(() => showToast("已复制"));
  });

  // --- Init ---
  renderRecordings();
  showSetup();
})();
