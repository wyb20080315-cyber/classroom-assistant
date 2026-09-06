// ============================================================
// 课堂助手 - Classroom Assistant
// Pure frontend app: recording, transcription, translation, analysis
// ============================================================

(function () {
  "use strict";

  // --- Storage helpers ---
  const STORAGE_KEY = "classroom_assistant_config";

  function getConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const setupOverlay = $("#setup-overlay");
  const settingsOverlay = $("#settings-overlay");
  const setupForm = $("#setup-form");
  const settingsForm = $("#settings-form");
  const recordBtn = $("#record-btn");
  const recordLabel = $("#record-label");
  const statusIndicator = $("#status-indicator");
  const timerEl = $("#timer");
  const downloadSection = $("#download-section");
  const downloadLink = $("#download-link");
  const fileName = $("#file-name");
  const fileSize = $("#file-size");
  const transcriptContainer = $("#transcript-container");
  const manualText = $("#manual-text");
  const analyzeBtn = $("#analyze-btn");
  const analyzeLoading = $("#analyze-loading");
  const resultSection = $("#result-section");
  const analysisResult = $("#analysis-result");
  const errorToast = $("#error-toast");
  const clearTextBtn = $("#clear-text");
  const copyResultBtn = $("#copy-result");
  const settingsBtn = $("#settings-btn");
  const closeSettingsBtn = $("#close-settings");

  // --- State ---
  let mediaRecorder = null;
  let audioChunks = [];
  let recognition = null;
  let isRecording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let fullTranscript = "";
  let translationQueue = [];
  let isTranslating = false;

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
  }
  function formatDuration(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sc = String(s % 60).padStart(2, "0");
    return m + ":" + sc;
  }

  // --- Setup / Settings ---
  function showSetup() {
    const cfg = getConfig();
    if (!cfg) {
      setupOverlay.classList.remove("hidden");
    }
  }

  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      baseUrl: $("#api-base-url").value.trim().replace(/\/+$/, ""),
      apiKey: $("#api-key").value.trim(),
      model: $("#model-name").value.trim(),
      useCustomTranslate: $("#use-custom-translate").checked
    };
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
      showToast("请填写所有必填字段", true);
      return;
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
      showToast("你的浏览器不支持语音识别，请使用 Chrome 浏览器", true);
      return null;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript;
        } else {
          interim += res[0].transcript;
        }
      }
      if (finalText) {
        fullTranscript += finalText + " ";
        addTranscriptLine(finalText.trim());
      }
      // Update last line with interim
      if (interim) {
        updateLastTranscript(interim.trim());
      }
    };

    rec.onerror = (event) => {
      if (event.error === "not-allowed") {
        showToast("请允许麦克风权限", true);
      } else if (event.error !== "no-speech") {
        // Silent retry for no-speech
      }
    };

    rec.onend = () => {
      // Auto-restart if still recording
      if (isRecording) {
        try { rec.start(); } catch (e) { /* ignore */ }
      }
    };

    return rec;
  }

  function addTranscriptLine(enText) {
    // Remove placeholder
    const ph = transcriptContainer.querySelector(".placeholder");
    if (ph) ph.remove();

    const line = document.createElement("div");
    line.className = "transcript-line";

    const enP = document.createElement("p");
    enP.className = "transcript-en";
    enP.textContent = enText;
    line.appendChild(enP);

    const zhP = document.createElement("p");
    zhP.className = "transcript-zh loading-zh";
    zhP.textContent = "翻译中...";
    line.appendChild(zhP);

    transcriptContainer.appendChild(line);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

    // Queue translation
    translateText(enText, zhP);
  }

  function updateLastTranscript(text) {
    const lines = transcriptContainer.querySelectorAll(".transcript-en");
    if (lines.length > 0) {
      lines[lines.length - 1].textContent = text;
    }
  }

  // --- Translation ---
  async function translateText(enText, targetEl) {
    const cfg = getConfig();
    if (!cfg) return;

    if (cfg.useCustomTranslate) {
      // Use custom model API
      try {
        const url = cfg.baseUrl + "/chat/completions";
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg.apiKey
          },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: "system", content: "You are a translator. Translate the following English text to Simplified Chinese. Only output the translation, nothing else." },
              { role: "user", content: enText }
            ],
            max_tokens: 512,
            temperature: 0.3
          })
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        const translated = data.choices?.[0]?.message?.content || "翻译失败";
        targetEl.textContent = translated.trim();
        targetEl.classList.remove("loading-zh");
      } catch (err) {
        targetEl.textContent = "[翻译失败: " + err.message + "]";
      }
    } else {
      // Use MyMemory free API
      try {
        const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(enText) + "&langpair=en|zh-CN";
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();
        const translated = data.responseData?.translatedText || "翻译失败";
        targetEl.textContent = translated;
        targetEl.classList.remove("loading-zh");
      } catch (err) {
        targetEl.textContent = "[免费翻译不可用，建议在设置中开启自定义模型翻译]";
      }
    }
  }

  // --- Recording ---
  recordBtn.addEventListener("click", async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start MediaRecorder
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = onRecordingStopped;
      mediaRecorder.start(1000); // collect every second

      // Start speech recognition
      recognition = initRecognition();
      if (recognition) {
        try { recognition.start(); } catch (e) { /* already started */ }
      }

      isRecording = true;
      recordBtn.classList.add("recording");
      recordLabel.textContent = "停止录音";
      statusIndicator.textContent = "录音中";
      statusIndicator.className = "status-dot active";
      startTimer();

    } catch (err) {
      if (err.name === "NotAllowedError") {
        showToast("请允许麦克风权限后再试", true);
      } else {
        showToast("无法访问麦克风: " + err.message, true);
      }
    }
  }

  function stopRecording() {
    isRecording = false;

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    if (recognition) {
      recognition.stop();
      recognition = null;
    }

    recordBtn.classList.remove("recording");
    recordLabel.textContent = "开始录音";
    statusIndicator.textContent = "已停止";
    statusIndicator.className = "status-dot inactive";
    stopTimer();
  }

  function onRecordingStopped() {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = "recording_" + ts + ".webm";

    downloadLink.href = url;
    downloadLink.download = name;
    fileName.textContent = name;
    fileSize.textContent = "(" + formatFileSize(blob.size) + ")";
    downloadSection.classList.remove("hidden");
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // --- Clear transcript ---
  clearTextBtn.addEventListener("click", () => {
    fullTranscript = "";
    transcriptContainer.innerHTML = '<p class="placeholder">录音开始后，此处将实时显示英文识别结果与中文翻译...</p>';
  });

  // --- Analysis ---
  analyzeBtn.addEventListener("click", async () => {
    const cfg = getConfig();
    if (!cfg) {
      showToast("请先配置 API 设置", true);
      return;
    }

    const text = fullTranscript.trim() || manualText.value.trim();
    if (!text) {
      showToast("请先录音或粘贴英文文本", true);
      return;
    }

    analyzeLoading.classList.remove("hidden");
    analyzeBtn.disabled = true;
    resultSection.classList.add("hidden");

    const systemPrompt = `你是一位英语教学助手。请对以下英文课程内容进行分析和总结，要求：

1. **课程要点总结**：用中文概括课程的主要内容（200-300字）
2. **关键术语列表**：列出课程中出现的英文专业术语，并给出中文翻译和简要解释
3. **难点解析**：指出课程中较难理解的知识点，用通俗易懂的中文解释
4. **学习建议**：给出针对性的复习或深入学习的建议

请用清晰的中文输出，格式工整。`;

    try {
      const url = cfg.baseUrl + "/chat/completions";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
          ],
          max_tokens: 4096,
          temperature: 0.7
        })
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        let errorMsg = "API 请求失败 (HTTP " + resp.status + ")";
        if (resp.status === 401) errorMsg = "API Key 无效，请检查设置";
        else if (resp.status === 403) errorMsg = "API 被拒绝，请检查权限";
        else if (resp.status === 429) errorMsg = "请求过于频繁，请稍后再试";
        else if (resp.status === 0 || resp.status === 404) {
          errorMsg = "无法连接到 API。请检查 Base URL 是否正确，或中转站是否允许跨域请求 (CORS)。";
        }
        throw new Error(errorMsg + (errText ? " 详情: " + errText.slice(0, 200) : ""));
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;

      if (content) {
        analysisResult.textContent = content;
        resultSection.classList.remove("hidden");
      } else {
        throw new Error("模型返回空结果");
      }

    } catch (err) {
      showToast(err.message, true);
    } finally {
      analyzeLoading.classList.add("hidden");
      analyzeBtn.disabled = false;
    }
  });

  // --- Copy result ---
  copyResultBtn.addEventListener("click", () => {
    const text = analysisResult.textContent;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("已复制到剪贴板");
      }).catch(() => {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast("已复制到剪贴板");
      });
    }
  });

  // --- Init ---
  showSetup();
})();
