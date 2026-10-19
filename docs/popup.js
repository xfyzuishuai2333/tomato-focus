// ================= 番茄专注 · Tomato Focus =================
// 核心功能：计时器 + 统计 + 设置持久化

const STORAGE_KEY = 'tomato_focus_v1';
const STATS_KEY = 'tomato_focus_stats_v1';

// 默认设置
const DEFAULT_SETTINGS = {
  workDuration: 25,
  shortDuration: 5,
  longDuration: 15,
  autoBreak: true,
  notify: true
};

// 状态
let settings = { ...DEFAULT_SETTINGS };
let currentMode = 'work'; // work | short | long
let timeLeft = 25 * 60;   // 秒
let totalTime = 25 * 60;
let isRunning = false;
let timerInterval = null;
let pomodorosToday = 0;
let streakDays = 0;

// ================= 存储 =================
function loadSettings() {
  try {
    const store = getStore();
    const saved = JSON.parse(store.getItem(STORAGE_KEY) || 'null');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) { /* ignore */ }
}

function saveSettings() {
  try {
    const store = getStore();
    store.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}

function loadStats() {
  try {
    const store = getStore();
    const saved = JSON.parse(store.getItem(STATS_KEY) || 'null');
    if (saved) {
      const today = new Date().toDateString();
      if (saved.lastDate === today) {
        pomodorosToday = saved.pomodoros || 0;
        streakDays = saved.streak || 0;
      } else {
        // 新的一天，检查是否连续
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (saved.lastDate === yesterday.toDateString() && saved.pomodoros > 0) {
          streakDays = (saved.streak || 0) + 1;
        } else if (saved.lastDate !== today) {
          streakDays = 0;
        }
        pomodorosToday = 0;
      }
    }
  } catch (e) { /* ignore */ }
}

function saveStats() {
  try {
    const store = getStore();
    store.setItem(STATS_KEY, JSON.stringify({
      lastDate: new Date().toDateString(),
      pomodoros: pomodorosToday,
      streak: streakDays
    }));
  } catch (e) { /* ignore */ }
}

function getStore() {
  // 扩展环境用 chrome.storage，网页环境用 localStorage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return {
      getItem: (k) => localStorage.getItem(k), // popup 里 chrome.storage 是异步的，简化用 localStorage
      setItem: (k, v) => localStorage.setItem(k, v)
    };
  }
  return localStorage;
}

// ================= 计时器 =================
function getDuration(mode) {
  switch (mode) {
    case 'work': return settings.workDuration * 60;
    case 'short': return settings.shortDuration * 60;
    case 'long': return settings.longDuration * 60;
    default: return 25 * 60;
  }
}

function setMode(mode) {
  currentMode = mode;
  timeLeft = getDuration(mode);
  totalTime = timeLeft;
  updateDisplay();
  updateModeButtons();
  updateRingColor();
}

function startTimer() {
  if (isRunning) {
    pauseTimer();
    return;
  }
  isRunning = true;
  document.getElementById('tfStartBtn').textContent = '⏸ 暂停';
  document.getElementById('tfStatus').textContent = currentMode === 'work' ? '专注中...' : '休息中...';

  timerInterval = setInterval(() => {
    timeLeft--;
    updateDisplay();
    updateRingProgress();

    if (timeLeft <= 0) {
      completeSession();
    }
  }, 1000);
}

function pauseTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  document.getElementById('tfStartBtn').textContent = '▶ 继续';
  document.getElementById('tfStatus').textContent = '已暂停';
}

function resetTimer() {
  isRunning = false;
  clearInterval(timerInterval);
  timeLeft = getDuration(currentMode);
  totalTime = timeLeft;
  document.getElementById('tfStartBtn').textContent = '▶ 开始';
  document.getElementById('tfStatus').textContent = '准备开始';
  updateDisplay();
  updateRingProgress();
}

function completeSession() {
  isRunning = false;
  clearInterval(timerInterval);

  if (currentMode === 'work') {
    pomodorosToday++;
    saveStats();
    updateStats();

    // 通知
    if (settings.notify) {
      showNotification('🍅 番茄完成！', '干得漂亮，休息一下吧。');
    }

    // 自动进入休息
    if (settings.autoBreak) {
      const nextMode = pomodorosToday % 4 === 0 ? 'long' : 'short';
      setMode(nextMode);
      startTimer();
      return;
    }
  } else {
    if (settings.notify) {
      showNotification('☕ 休息结束', '准备好下一个番茄了吗？');
    }
    setMode('work');
  }

  document.getElementById('tfStartBtn').textContent = '▶ 开始';
  document.getElementById('tfStatus').textContent = '已完成';
}

// ================= 显示更新 =================
function updateDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  document.getElementById('tfTime').textContent =
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateRingProgress() {
  const ring = document.querySelector('.tf-ring-fill');
  const circumference = 2 * Math.PI * 90; // r=90
  const progress = timeLeft / totalTime;
  const offset = circumference * (1 - progress);
  ring.style.strokeDashoffset = offset;
}

function updateRingColor() {
  const ring = document.querySelector('.tf-ring-fill');
  ring.classList.remove('break', 'long');
  if (currentMode === 'short') ring.classList.add('break');
  if (currentMode === 'long') ring.classList.add('long');
}

function updateModeButtons() {
  document.querySelectorAll('.tf-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === currentMode);
  });
}

function updateStats() {
  document.getElementById('tfTodayPomodoros').textContent = pomodorosToday;
  document.getElementById('tfTodayMinutes').textContent = pomodorosToday * settings.workDuration;
  document.getElementById('tfStreak').textContent = streakDays;
}

// ================= 通知 =================
function showNotification(title, body) {
  // 扩展环境
  if (typeof chrome !== 'undefined' && chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: body
    });
    return;
  }
  // 网页环境 - 尝试 Web Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') new Notification(title, { body: body });
    });
  }
}

// ================= 事件绑定 =================
function bindEvents() {
  // 模式切换
  document.querySelectorAll('.tf-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isRunning) {
        setMode(btn.dataset.mode);
      }
    });
  });

  // 开始/暂停
  document.getElementById('tfStartBtn').addEventListener('click', startTimer);

  // 重置
  document.getElementById('tfResetBtn').addEventListener('click', resetTimer);

  // 设置变更
  document.getElementById('tfWorkDuration').addEventListener('change', e => {
    settings.workDuration = parseInt(e.target.value);
    saveSettings();
    if (currentMode === 'work' && !isRunning) resetTimer();
    updateStats();
  });

  document.getElementById('tfShortDuration').addEventListener('change', e => {
    settings.shortDuration = parseInt(e.target.value);
    saveSettings();
    if (currentMode === 'short' && !isRunning) resetTimer();
  });

  document.getElementById('tfLongDuration').addEventListener('change', e => {
    settings.longDuration = parseInt(e.target.value);
    saveSettings();
    if (currentMode === 'long' && !isRunning) resetTimer();
  });

  document.getElementById('tfAutoBreak').addEventListener('change', e => {
    settings.autoBreak = e.target.checked;
    saveSettings();
  });

  document.getElementById('tfNotify').addEventListener('change', e => {
    settings.notify = e.target.checked;
    saveSettings();
    if (settings.notify && 'Notification' in window) {
      Notification.requestPermission();
    }
  });
}

// ================= 初始化 =================
function init() {
  loadSettings();
  loadStats();

  // 应用设置到 UI
  document.getElementById('tfWorkDuration').value = settings.workDuration;
  document.getElementById('tfShortDuration').value = settings.shortDuration;
  document.getElementById('tfLongDuration').value = settings.longDuration;
  document.getElementById('tfAutoBreak').checked = settings.autoBreak;
  document.getElementById('tfNotify').checked = settings.notify;

  setMode('work');
  updateStats();
  bindEvents();

  // 请求通知权限
  if (settings.notify && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

document.addEventListener('DOMContentLoaded', init);
