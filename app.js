// ============================================================
// 课堂助手 - Classroom Assistant
// Features: Recording, Transcription, Google Drive Library, AI Analysis
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
  const settingsOverlay = $("#settings-overlay");
  const setupForm = $("#setup-form");
  const settingsForm = $("#settings-form");
  const recordBtn = $("#record-btn");
  const recordLabel = $("#record-label");
  const statusIndicator = $("#status-indicator");
  const timerEl = $("#timer");
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
  
  // New UI elements
  const googleLoginBtn = $("#google-login-btn");
  const userInfo = $("#user-info");
  const saveToDriveBtn = $("#save-to-drive-btn");
  const saveToDriveBtnContainer = $("#save-to-drive-btn-container");
  const librarySection = $("#library-section");
  const libraryList = $("#library-list");
  const libraryLoading = $("#library-loading");

  // --- State ---
  let mediaRecorder = null;
  let audioChunks = [];
  let currentAudioBlob = null;
  let recognition = null;
  let isRecording = false;
  let timerInterval = null;
  let timerSeconds = 0;
  let fullTranscript = "";
  
  // Google State
  let isGoogleAuthenticated = false;
  let currentRecordingForDrive = null; 

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
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }
  function formatDuration(s) {
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sc = String(s % 60).padStart(2, "0");
    return m + ":" + sc;
  }

  // --- Setup / Settings ---
  function showSetup() {
    if (!getConfig()) setupOverlay.classList.remove("hidden");
  }

  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      baseUrl: $("#api-base-url").value.trim().replace(/\/+$/, ""),
      apiKey: $("#api-key").value.trim(),
      model: $("#model-name").value.trim(),
      googleClientId: $("#google-client-id").value.trim(),
      useCustomTranslate: $("#use-custom-translate").checked
    };
    if (!cfg.baseUrl || !cfg.apiKey || !cfg.model || !cfg.googleClientId) {
      showToast("请填写所有必填字段", true); return;
    }
    saveConfig(cfg);
    setupOverlay.classList.add("hidden");
    showToast("设置已保存");
    initGoogleApi();
  });

  settingsBtn.addEventListener("click", () => {
    const cfg = getConfig();
    if (cfg) {
      $("#set-api-base-url").value = cfg.baseUrl;
      $("#set-api-key").value = cfg.apiKey;
      $("#set-model-name").value = cfg.model;
      $("#set-google-client-id").value = cfg.googleClientId;
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
      googleClientId: $("#set-google-client-id").value.trim(),
      useCustomTranslate: $("#set-use-custom-translate").checked
    };
    saveConfig(cfg);
    settingsOverlay.classList.add("hidden");
    showToast("设置已更新");
    if (!isGoogleAuthenticated) initGoogleApi();
  });

  // --- Google API Integration ---
  function initGoogleApi() {
    const cfg = getConfig();
    if (!cfg || !cfg.googleClientId) return;

    googleLoginBtn.classList.remove("hidden");
    
    gapi.load('client:auth2', () => {
      gapi.client.init({
        'apiKey': '',
        'clientId': cfg.googleClientId,
        'scope': 'https://www.googleapis.com/auth/drive.appdata',
        'discoveryDocs': ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"]
      }).then(() => {
        // Explicitly init Auth2 for the sign-in button
        gapi.auth2.init({
            'client_id': cfg.googleClientId,
            'cookiepolicy': 'single_host_origin',
            'scope': 'https://www.googleapis.com/auth/drive.appdata'
        }).then(() => {
            console.log("Google Auth2 Initialized");
            googleLoginBtn.onclick = handleAuthClick;
        });
      }, (err) => {
        console.error("Google API Init Error", err);
        showToast("Google API 初始化失败，请检查 Client ID", true);
      });
    });
  }

  async function handleAuthClick() {
    try {
      const authInstance = gapi.auth2.getAuthInstance();
      const response = await authInstance.signIn();
      isGoogleAuthenticated = true;
      googleLoginBtn.classList.add("hidden");
      userInfo.textContent = response.getBasicProfile().getEmail();
      userInfo.classList.remove("hidden");
      loadLibrary();
      showToast("Google 登录成功");
    } catch (err) {
      console.error("Login Error", err);
      showToast("登录失败: " + err.message, true);
    }
  }

  // --- Drive Operations ---
  async function saveRecordingToDrive() {
    if (!currentRecordingForDrive) {
      showToast("没有可保存的录音", true); return;
    }
    if (!isGoogleAuthenticated) {
      showToast("请先登录 Google", true); return;
    }

    saveToDriveBtn.textContent = "保存中...";
    saveToDriveBtn.disabled = true;

    try {
      const { blob, name, transcript, duration } = currentRecordingForDrive;
      const metadata = { name: name + ".webm", mimeType: "audio/webm" };
      
      // Upload Audio
      await gapi.client.drive.files.create({
        parents: ["appDataFolder"],
        resource: metadata,
        requestBody: blob,
        fields: "id"
      });

      // Update Index JSON
      const indexFile = await getRecordingsIndex();
      indexFile.recordings.push({
        id: Date.now(),
        name: name,
        duration: duration,
        transcript: transcript,
        date: new Date().toISOString()
      });

      await gapi.client.drive.files.update({
        fileId: indexFile.fileId,
        resource: { contents: JSON.stringify(indexFile.recordings) },
        fields: "id"
      });

      showToast("已保存到音源库");
      loadLibrary();
    } catch (err) {
      console.error(err);
      showToast("保存到云盘失败: " + err.message, true);
    } finally {
      saveToDriveBtn.textContent = "☁️ 保存到音源库";
      saveToDriveBtn.disabled = false;
    }
  }

  async function getRecordingsIndex() {
    try {
      const res = await gapi.client.drive.files.list({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        q: "name = 'recordings.json' and parents in ['appDataFolder']"
      });
      if (res.result.files.length > 0) {
        const file = res.result.files[0];
        const contentRes = await gapi.client.drive.files.get({ fileId: file.id, alt: 'media' });
        return { fileId: file.id, recordings: JSON.parse(contentRes.body) };
      }
      // Create new index
      const res2 = await gapi.client.drive.files.create({
        parents: ["appDataFolder"],
        resource: { name: 'recordings.json', mimeType: 'application/json' },
        fields: "id"
      });
      return { fileId: res2.result.id, recordings: [] };
    } catch (err) {
      throw new Error("获取音源库索引失败: " + err.message);
    }
  }

  async function loadLibrary() {
    if (!isGoogleAuthenticated) return;
    librarySection.classList.remove("hidden");
    libraryLoading.classList.remove("hidden");
    libraryList.innerHTML = "";

    try {
      const index = await getRecordingsIndex();
      libraryLoading.classList.add("hidden");
      
      if (index.recordings.length === 0) {
        libraryList.innerHTML = "<p class='small-text'>音源库为空，录音后点击“保存到音源库”即可。</p>";
        return;
      }

      index.recordings.forEach(rec => {
        const el = document.createElement("div");
        el.className = "library-item";
        const date = new Date(rec.date).toLocaleDateString();
        el.innerHTML = `
          <div class="recording-meta">
            <span class="recording-name">${rec.name}</span>
            <span class="recording-details">${rec.duration} · ${date}</span>
          </div>
          <div class="recording-actions">
            <button class="btn-lib-action btn-translate" data-id="${rec.id}">🀄 一键汉语</button>
            <button class="btn-lib-action btn-analyze-lib" data-id="${rec.id}">🔍 发送分析</button>
          </div>
        `;
        libraryList.appendChild(el);
      });

      // Bind events
      libraryList.querySelectorAll(".btn-translate").forEach(btn => {
        btn.onclick = () => translateLibraryItem(index.recordings.find(r => r.id == btn.dataset.id));
      });
      libraryList.querySelectorAll(".btn-analyze-lib").forEach(btn => {
        btn.onclick = () => analyzeLibraryItem(index.recordings.find(r => r.id == btn.dataset.id));
      });

    } catch (err) {
      libraryLoading.classList.add("hidden");
      showToast("加载音源库失败: " + err.message, true);
    }
  }

  async function translateLibraryItem(rec) {
    if (!rec) return;
    const cfg = getConfig();
    showToast("正在生成汉语翻译...");
    
    const systemPrompt = "You are a professional translator. Translate the following English transcript into fluent Simplified Chinese.";
    
    try {
      const url = cfg.baseUrl + "/chat/completions";
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: rec.transcript }],
          max_tokens: 4096
        })
      });
      if (!resp.ok) throw new Error("API Error");
      const data = await resp.json();
      analysisResult.textContent = data.choices?.[0]?.message?.content || "翻译失败";
      resultSection.classList.remove("hidden");
      resultSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      showToast("翻译失败: " + err.message, true);
    }
  }

  function analyzeLibraryItem(rec) {
    if (!rec) return;
    manualText.value = rec.transcript;
    manualText.scrollIntoView({ behavior: 'smooth' });
    showToast("已加载录音文本，请点击“发送分析”");
  }

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
    line.innerHTML = `<p class="transcript-en">${enText}</p><p class="transcript-zh loading-zh">翻译中...</p>`;
    transcriptContainer.appendChild(line);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    translateText(enText, line.querySelector(".transcript-zh"));
  }

  function updateLastTranscript(text) {
    const lines = transcriptContainer.querySelectorAll(".transcript-en");
    if (lines.length > 0) lines[lines.length - 1].textContent = text;
  }

  async function translateText(enText, targetEl) {
    const cfg = getConfig();
    if (!cfg) return;
    try {
      let translated = "";
      if (cfg.useCustomTranslate) {
        const resp = await fetch(cfg.baseUrl + "/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey },
          body: JSON.stringify({ model: cfg.model, messages: [{role:"system", content:"Translate to Chinese only."}, {role:"user", content:enText}], max_tokens: 512 })
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
  }

  function onRecordingStopped() {
    if (audioChunks.length === 0) return;
    currentAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const ts = new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/\//g, "-");
    const name = "录音_" + ts;
    
    currentRecordingForDrive = {
      blob: currentAudioBlob,
      name: name,
      transcript: fullTranscript.trim(),
      duration: formatDuration(timerSeconds)
    };

    saveToDriveBtnContainer.classList.remove("hidden");
  }

  saveToDriveBtn.addEventListener("click", saveRecordingToDrive);

  // --- Clear transcript ---
  clearTextBtn.addEventListener("click", () => {
    fullTranscript = "";
    transcriptContainer.innerHTML = '<p class="placeholder">录音开始后，此处将实时显示英文识别结果与中文翻译...</p>';
  });

  // --- Analysis ---
  analyzeBtn.addEventListener("click", async () => {
    const cfg = getConfig();
    if (!cfg) { showToast("请先配置 API 设置", true); return; }

    const text = fullTranscript.trim() || manualText.value.trim();
    if (!text) { showToast("请先录音或粘贴英文文本", true); return; }

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
  const cfg = getConfig();
  if (cfg) {
    googleLoginBtn.classList.remove("hidden");
    initGoogleApi();
  }
  showSetup();
})();
