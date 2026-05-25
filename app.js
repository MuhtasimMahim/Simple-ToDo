/* ==========================================================================
   Simple ToDo - App Core
   Architecture:
   - Storage: localStorage for tasks + settings
   - Views: single-page tabs (Todo / Add / Settings)
   - AI: Groq chat completion API with JSON-only extraction
   - PWA: service worker registered for offline shell caching
   ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    tasks: "simpletodo.tasks.v1",
    settings: "simpletodo.settings.v1",
  };

  const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_MODEL = "llama-3.1-8b-instant";

  const state = {
    tasks: [],
    filter: "all",
    currentView: "todo",
    parsedDraft: null,
    editingTaskId: null,
    settings: {
      apiKey: "",
      themeMode: "system",
    },
  };

  const dom = {
    appShell: document.getElementById("appShell"),
    views: Array.from(document.querySelectorAll(".view")),
    navButtons: Array.from(document.querySelectorAll(".nav-btn")),
    filterChips: Array.from(document.querySelectorAll(".filter-chip")),
    taskList: document.getElementById("taskList"),
    emptyState: document.getElementById("emptyState"),
    quickThemeToggle: document.getElementById("quickThemeToggle"),
    themeToggleIcon: document.getElementById("themeToggleIcon"),
    clockDate: document.getElementById("clockDate"),
    clockTime: document.getElementById("clockTime"),

    noticeInput: document.getElementById("noticeInput"),
    parseNoticeBtn: document.getElementById("parseNoticeBtn"),
    previewPanel: document.getElementById("previewPanel"),
    addTaskBtn: document.getElementById("addTaskBtn"),
    previewTitle: document.getElementById("previewTitle"),
    previewDate: document.getElementById("previewDate"),
    previewStart: document.getElementById("previewStart"),
    previewEnd: document.getElementById("previewEnd"),
    previewLocation: document.getElementById("previewLocation"),
    previewNote: document.getElementById("previewNote"),

    apiKeyInput: document.getElementById("apiKeyInput"),
    saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
    clearApiKeyBtn: document.getElementById("clearApiKeyBtn"),
    themePills: Array.from(document.querySelectorAll(".theme-pill")),
    exportBtn: document.getElementById("exportBtn"),
    importFileInput: document.getElementById("importFileInput"),
    clearTasksBtn: document.getElementById("clearTasksBtn"),

    editModal: document.getElementById("editModal"),
    editTitle: document.getElementById("editTitle"),
    editDate: document.getElementById("editDate"),
    editStart: document.getElementById("editStart"),
    editEnd: document.getElementById("editEnd"),
    editLocation: document.getElementById("editLocation"),
    editNote: document.getElementById("editNote"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    saveEditBtn: document.getElementById("saveEditBtn"),

    toastRoot: document.getElementById("toastRoot"),
  };

  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  init();

  function init() {
    loadState();
    applyTheme(state.settings.themeMode);
    bindEvents();
    updateClock();
    setInterval(updateClock, 1000);
    switchView("todo");
    renderFilters();
    renderTasks();
    renderSettings();
    registerServiceWorker();
  }

  function bindEvents() {
    dom.navButtons.forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.target));
    });

    dom.filterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.filter = chip.dataset.filter;
        renderFilters();
        renderTasks();
      });
    });

    dom.quickThemeToggle.addEventListener("click", () => {
      const resolved = resolveTheme(state.settings.themeMode);
      const nextMode = resolved === "dark" ? "light" : "dark";
      state.settings.themeMode = nextMode;
      applyTheme(nextMode);
      saveSettings();
      renderThemePills();
      showToast(`Theme set to ${nextMode}`);
    });

    dom.parseNoticeBtn.addEventListener("click", handleParseNoticeClick);
    dom.addTaskBtn.addEventListener("click", handleAddFromPreview);
    dom.noticeInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        handleParseNoticeClick();
      }
    });

    dom.saveApiKeyBtn.addEventListener("click", () => {
      const nextKey = dom.apiKeyInput.value.trim();
      state.settings.apiKey = nextKey;
      saveSettings();
      showToast(nextKey ? "Groq API key saved locally" : "API key is empty");
    });

    dom.clearApiKeyBtn.addEventListener("click", () => {
      state.settings.apiKey = "";
      dom.apiKeyInput.value = "";
      saveSettings();
      showToast("API key cleared");
    });

    dom.themePills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const mode = pill.dataset.theme;
        state.settings.themeMode = mode;
        applyTheme(mode);
        saveSettings();
        renderThemePills();
      });
    });

    dom.exportBtn.addEventListener("click", exportTasksAsJson);
    dom.importFileInput.addEventListener("change", handleImportFileChange);

    dom.clearTasksBtn.addEventListener("click", () => {
      if (!window.confirm("Clear every saved task? This cannot be undone.")) return;
      state.tasks = [];
      saveTasks();
      renderTasks();
      showToast("All tasks cleared");
    });

    dom.taskList.addEventListener("click", handleTaskListClick);
    dom.taskList.addEventListener("change", handleTaskListChange);

    dom.cancelEditBtn.addEventListener("click", closeEditModal);
    dom.saveEditBtn.addEventListener("click", saveTaskEdits);
    dom.editModal.addEventListener("click", (event) => {
      if (event.target && event.target.dataset.closeModal === "true") {
        closeEditModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !dom.editModal.hidden) {
        closeEditModal();
      }
    });

    systemThemeQuery.addEventListener("change", () => {
      if (state.settings.themeMode === "system") {
        applyTheme("system");
      }
    });
  }

  function switchView(nextView) {
    state.currentView = nextView;
    dom.views.forEach((view) => {
      view.classList.toggle("is-active", view.dataset.view === nextView);
    });
    dom.navButtons.forEach((button) => {
      const active = button.dataset.target === nextView;
      button.classList.toggle("is-active", active);
    });
  }

  function renderFilters() {
    dom.filterChips.forEach((chip) => {
      const active = chip.dataset.filter === state.filter;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-selected", String(active));
    });
  }

  function loadState() {
    state.tasks = readJson(STORAGE_KEYS.tasks, []);
    const savedSettings = readJson(STORAGE_KEYS.settings, {});
    state.settings = {
      ...state.settings,
      ...savedSettings,
    };
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(state.tasks));
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  }

  function readJson(key, fallbackValue) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (error) {
      console.warn("Failed to parse localStorage key:", key, error);
      return fallbackValue;
    }
  }

  function renderSettings() {
    dom.apiKeyInput.value = state.settings.apiKey || "";
    renderThemePills();
    renderQuickThemeIcon();
  }

  function renderThemePills() {
    dom.themePills.forEach((pill) => {
      pill.classList.toggle("is-active", pill.dataset.theme === state.settings.themeMode);
      pill.setAttribute("aria-checked", String(pill.dataset.theme === state.settings.themeMode));
    });
  }

  function applyTheme(mode) {
    const resolved = resolveTheme(mode);
    document.body.dataset.theme = resolved;
    renderQuickThemeIcon();
  }

  function resolveTheme(mode) {
    if (mode === "system") {
      return systemThemeQuery.matches ? "dark" : "light";
    }
    return mode;
  }

  function renderQuickThemeIcon() {
    if (!dom.themeToggleIcon) return;
    const resolved = resolveTheme(state.settings.themeMode);
    dom.themeToggleIcon.textContent = resolved === "dark" ? "🌙" : "☀️";
  }

  function updateClock() {
    const now = new Date();
    const dateFormat = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const timeFormat = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    dom.clockDate.textContent = dateFormat.format(now);
    dom.clockTime.textContent = timeFormat.format(now);
  }

  function getVisibleTasks() {
    const sorted = [...state.tasks].sort(sortByUpcomingDate);
    if (state.filter === "all") return sorted;
    if (state.filter === "done") return sorted.filter((task) => task.done);
    return sorted.filter((task) => !task.done);
  }

  function renderTasks() {
    const tasks = getVisibleTasks();
    dom.taskList.innerHTML = "";
    dom.emptyState.hidden = tasks.length > 0;

    tasks.forEach((task) => {
      const card = document.createElement("li");
      card.className = `task-card${task.done ? " is-done" : ""}`;
      card.dataset.taskId = task.id;

      const metaText = buildMetaLine(task);
      const noteHtml = task.note ? `<p class="task-note">${escapeHtml(task.note)}</p>` : "";

      card.innerHTML = `
        <input class="task-check" type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark done" />
        <div class="task-main">
          <p class="task-title">${escapeHtml(task.title || "Untitled task")}</p>
          <p class="task-meta">${escapeHtml(metaText)}</p>
          ${noteHtml}
        </div>
        <div class="task-actions">
          <button class="mini-btn" type="button" data-action="edit">Edit</button>
          <button class="mini-btn is-danger" type="button" data-action="delete">Delete</button>
        </div>
      `;
      dom.taskList.append(card);
    });
  }

  function buildMetaLine(task) {
    const parts = [];
    const dateText = formatDateForUI(task.date);
    const timeText = formatTimeRange(task.startTime, task.endTime);
    if (dateText) parts.push(dateText);
    if (timeText) parts.push(timeText);
    if (task.location) parts.push(task.location);
    if (parts.length === 0) return "No schedule yet";
    return parts.join(" - ");
  }

  function formatDateForUI(rawDate) {
    if (!rawDate) return "";
    const parsed = parseFlexibleDate(rawDate);
    if (!parsed) return rawDate;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(parsed);
  }

  function formatTimeRange(start, end) {
    const s = (start || "").trim();
    const e = (end || "").trim();
    if (s && e) return `${s}-${e}`;
    if (s) return s;
    if (e) return `until ${e}`;
    return "";
  }

  function sortByUpcomingDate(a, b) {
    const aKey = getTaskSortKey(a);
    const bKey = getTaskSortKey(b);
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (aKey.hasSchedule !== bKey.hasSchedule) return aKey.hasSchedule ? 1 : -1;
    if (aKey.timestamp !== bKey.timestamp) return aKey.timestamp - bKey.timestamp;
    return (a.createdAt || 0) - (b.createdAt || 0);
  }

  function getTaskSortKey(task) {
    const dateObj = parseFlexibleDate(task.date, task.startTime);
    if (!dateObj) {
      return {
        hasSchedule: false,
        timestamp: 0,
      };
    }
    return {
      hasSchedule: true,
      timestamp: dateObj.getTime(),
    };
  }

  function parseFlexibleDate(rawDate, rawTime) {
    if (!rawDate || typeof rawDate !== "string") return null;
    const cleanedDate = rawDate.replace(/\(.*?\)/g, "").trim();
    const normalizedTime = normalizeTime(rawTime || "");
    const timePart = normalizedTime || "00:00";

    const tryIso = new Date(`${cleanedDate}T${timePart}`);
    if (!Number.isNaN(tryIso.getTime())) return tryIso;

    const slash = cleanedDate.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
    if (slash) {
      const month = Number(slash[1]);
      const day = Number(slash[2]);
      const year = slash[3] ? normalizeYear(Number(slash[3])) : new Date().getFullYear();
      const rebuilt = `${year}-${pad2(month)}-${pad2(day)}T${timePart}`;
      const parsed = new Date(rebuilt);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const weekdayDate = parseNextWeekdayDate(cleanedDate, timePart);
    if (weekdayDate) return weekdayDate;

    return null;
  }

  function parseNextWeekdayDate(rawText, timePart) {
    const text = String(rawText || "").toLowerCase();
    if (!text) return null;

    const weekdayMap = {
      sunday: 0,
      sun: 0,
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      tues: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      thur: 4,
      thurs: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6,
    };

    const weekdayKey = Object.keys(weekdayMap).find((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
    if (!weekdayKey) return null;

    const targetDay = weekdayMap[weekdayKey];
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDay = base.getDay();

    let offset = (targetDay - currentDay + 7) % 7;
    // Treat weekday-only entries as the next occurrence, not "today".
    if (offset === 0) offset = 7;

    base.setDate(base.getDate() + offset);

    const [hourStr, minuteStr] = String(timePart || "00:00").split(":");
    base.setHours(Number(hourStr) || 0, Number(minuteStr) || 0, 0, 0);
    return base;
  }

  function normalizeYear(year) {
    if (year < 100) return 2000 + year;
    return year;
  }

  function normalizeTime(value) {
    const v = String(value || "").trim();
    if (!v) return "";
    const hit = v.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!hit) return "";
    const hour = Math.min(Math.max(Number(hit[1]), 0), 23);
    const minute = Math.min(Math.max(Number(hit[2] || 0), 0), 59);
    return `${pad2(hour)}:${pad2(minute)}`;
  }

  function pad2(num) {
    return String(num).padStart(2, "0");
  }

  function handleTaskListClick(event) {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    const row = event.target.closest("[data-task-id]");
    if (!row) return;
    const taskId = row.dataset.taskId;

    if (actionButton.dataset.action === "edit") {
      openEditModal(taskId);
    }
    if (actionButton.dataset.action === "delete") {
      deleteTask(taskId);
    }
  }

  function handleTaskListChange(event) {
    if (!event.target.classList.contains("task-check")) return;
    const row = event.target.closest("[data-task-id]");
    if (!row) return;
    const task = state.tasks.find((item) => item.id === row.dataset.taskId);
    if (!task) return;
    task.done = event.target.checked;
    task.updatedAt = Date.now();
    saveTasks();
    renderTasks();
  }

  function deleteTask(taskId) {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    saveTasks();
    renderTasks();
    showToast("Task deleted");
  }

  function openEditModal(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    state.editingTaskId = taskId;
    dom.editTitle.value = task.title || "";
    dom.editDate.value = task.date || "";
    dom.editStart.value = task.startTime || "";
    dom.editEnd.value = task.endTime || "";
    dom.editLocation.value = task.location || "";
    dom.editNote.value = task.note || "";
    dom.editModal.hidden = false;
    dom.editTitle.focus();
  }

  function closeEditModal() {
    dom.editModal.hidden = true;
    state.editingTaskId = null;
  }

  function saveTaskEdits() {
    if (!state.editingTaskId) return;
    const task = state.tasks.find((item) => item.id === state.editingTaskId);
    if (!task) return;
    task.title = dom.editTitle.value.trim() || "Untitled task";
    task.date = dom.editDate.value.trim();
    task.startTime = normalizeTime(dom.editStart.value.trim());
    task.endTime = normalizeTime(dom.editEnd.value.trim());
    task.location = dom.editLocation.value.trim();
    task.note = dom.editNote.value.trim();
    task.updatedAt = Date.now();
    saveTasks();
    closeEditModal();
    renderTasks();
    showToast("Task updated");
  }

  async function handleParseNoticeClick() {
    const rawText = dom.noticeInput.value.trim();
    if (!rawText) {
      showToast("Paste notice text first");
      dom.noticeInput.focus();
      return;
    }
    if (!state.settings.apiKey) {
      showToast("Add your Groq API key in Settings");
      switchView("settings");
      return;
    }

    setParsingState(true);
    try {
      const parsed = await parseNoticeWithAI(rawText);
      state.parsedDraft = parsed;
      fillPreview(parsed);
      dom.previewPanel.hidden = false;
      dom.addTaskBtn.disabled = false;
      showToast("Notice parsed successfully");
    } catch (error) {
      console.error(error);
      showToast(error.message || "Failed to parse notice");
    } finally {
      setParsingState(false);
    }
  }

  function setParsingState(isParsing) {
    dom.parseNoticeBtn.disabled = isParsing;
  }

  function fillPreview(parsed) {
    dom.previewTitle.value = parsed.title || "";
    dom.previewDate.value = parsed.date || "";
    dom.previewStart.value = parsed.startTime || "";
    dom.previewEnd.value = parsed.endTime || "";
    dom.previewLocation.value = parsed.location || "";
    dom.previewNote.value = parsed.note || "";
  }

  function readPreviewDraft() {
    return {
      title: dom.previewTitle.value.trim(),
      date: dom.previewDate.value.trim(),
      startTime: normalizeTime(dom.previewStart.value.trim()),
      endTime: normalizeTime(dom.previewEnd.value.trim()),
      location: dom.previewLocation.value.trim(),
      note: dom.previewNote.value.trim(),
    };
  }

  function handleAddFromPreview() {
    if (dom.addTaskBtn.disabled) return;
    const draft = readPreviewDraft();
    if (!draft.title) {
      draft.title = generateFallbackTitle(`${draft.location}\n${draft.note}`) || "Campus event";
    }
    const newTask = {
      id: createId(),
      ...draft,
      done: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.tasks.push(newTask);
    saveTasks();
    renderTasks();
    resetAddForm();
    switchView("todo");
    showToast("Task added to list");
  }

  function resetAddForm() {
    state.parsedDraft = null;
    dom.previewPanel.hidden = true;
    dom.addTaskBtn.disabled = true;
    dom.noticeInput.value = "";
    dom.previewTitle.value = "";
    dom.previewDate.value = "";
    dom.previewStart.value = "";
    dom.previewEnd.value = "";
    dom.previewLocation.value = "";
    dom.previewNote.value = "";
  }

  function exportTasksAsJson() {
    const payload = {
      app: "Simple ToDo",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `simpletodo-export-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Tasks exported");
  }

  async function handleImportFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incomingTasks = Array.isArray(parsed) ? parsed : parsed.tasks;
      if (!Array.isArray(incomingTasks)) {
        throw new Error("Invalid JSON format. Expecting task array.");
      }
      const cleaned = incomingTasks.map(cleanTaskRecord).filter(Boolean);
      state.tasks = cleaned;
      saveTasks();
      renderTasks();
      showToast(`Imported ${cleaned.length} tasks`);
    } catch (error) {
      showToast(error.message || "Import failed");
    } finally {
      dom.importFileInput.value = "";
    }
  }

  function cleanTaskRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: String(raw.id || createId()),
      title: String(raw.title || "Untitled task"),
      date: String(raw.date || ""),
      startTime: normalizeTime(raw.startTime || ""),
      endTime: normalizeTime(raw.endTime || ""),
      location: String(raw.location || ""),
      note: String(raw.note || ""),
      done: Boolean(raw.done),
      createdAt: Number(raw.createdAt || Date.now()),
      updatedAt: Number(raw.updatedAt || Date.now()),
    };
  }

  async function parseNoticeWithAI(text) {
    const systemPrompt = [
      "You extract structured event data from raw university notices.",
      "Return one JSON object only.",
      "No markdown, no extra words, no code fences.",
      "Output keys exactly:",
      '{"title":"","date":"","startTime":"","endTime":"","location":"","note":""}',
      "Rules:",
      "- If title is missing, generate a concise title under 5 words.",
      "- Keep date as given if unsure.",
      "- Keep times in HH:MM if possible.",
      "- Put all leftover details into note.",
      "- Never omit required keys.",
    ].join("\n");

    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.settings.apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || `Groq API error (${response.status})`;
      throw new Error(message);
    }
    const messageContent = data?.choices?.[0]?.message?.content;
    if (!messageContent) {
      throw new Error("Empty AI response");
    }
    const parsed = tryParseJsonObject(messageContent);
    if (!parsed) {
      throw new Error("AI returned invalid JSON");
    }

    return normalizeAiResult(parsed, text);
  }

  function tryParseJsonObject(rawContent) {
    const text = String(rawContent || "").trim();
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) return null;
      const snippet = text.slice(start, end + 1);
      try {
        const fallback = JSON.parse(snippet);
        return fallback && typeof fallback === "object" ? fallback : null;
      } catch {
        return null;
      }
    }
  }

  function normalizeAiResult(obj, sourceText) {
    const normalized = {
      title: sanitizeField(obj.title),
      date: sanitizeField(obj.date),
      startTime: normalizeTime(sanitizeField(obj.startTime)),
      endTime: normalizeTime(sanitizeField(obj.endTime)),
      location: sanitizeField(obj.location),
      note: sanitizeField(obj.note),
    };
    if (!normalized.title) {
      normalized.title = generateFallbackTitle(sourceText);
    }
    return normalized;
  }

  function sanitizeField(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/\s+/g, " ").trim();
  }

  function generateFallbackTitle(sourceText) {
    const text = String(sourceText || "");
    const patterns = [
      { regex: /\b(bbq|party)\b/i, title: "Department BBQ" },
      { regex: /\bseminar\b/i, title: "Seminar session" },
      { regex: /\bworkshop\b/i, title: "Workshop event" },
      { regex: /\bexam\b/i, title: "Exam schedule" },
      { regex: /\breport\b/i, title: "Report deadline" },
      { regex: /\bmeeting\b/i, title: "Department meeting" },
      { regex: /\borientation\b/i, title: "Orientation event" },
    ];
    for (const item of patterns) {
      if (item.regex.test(text)) return item.title;
    }
    return "Campus event";
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `task_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    dom.toastRoot.append(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("SW registration failed:", error);
      });
    });
  }
})();
