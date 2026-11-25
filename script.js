/* =========================================
   1. State & LocalStorage Persistence
   ========================================= */
const STORAGE_KEYS = {
    GOALS: "focusmate_goals_v3",
    MINUTES: "focusmate_minutes_v3",
    SESSIONS: "focusmate_sessions_v3",
    ACTIVE_GOAL: "focusmate_active_goal_v3",
    HISTORY: "focusmate_history_v3",
    DARK_MODE: "focusmate_darkmode_v3"
};

function getDateKey(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const defaultGoals = [
    { id: "init-1", text: "Practice Algorithms", completed: false, minutesSpent: 0, sessions: 0 },
    { id: "init-2", text: "Submit Assignment", completed: false, minutesSpent: 0, sessions: 0 },
    { id: "init-3", text: "Review Technical Docs", completed: false, minutesSpent: 0, sessions: 0 }
];

function loadFromStorage(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

let goals = loadFromStorage(STORAGE_KEYS.GOALS, defaultGoals);
let totalFocusMinutes = Number(loadFromStorage(STORAGE_KEYS.MINUTES, 0)) || 0;
let completedSessions = Number(loadFromStorage(STORAGE_KEYS.SESSIONS, 0)) || 0;
let activeGoalId = loadFromStorage(STORAGE_KEYS.ACTIVE_GOAL, "init-1");
let dailyHistory = loadFromStorage(STORAGE_KEYS.HISTORY, {});

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
        localStorage.setItem(STORAGE_KEYS.MINUTES, JSON.stringify(totalFocusMinutes));
        localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(completedSessions));
        localStorage.setItem(STORAGE_KEYS.ACTIVE_GOAL, JSON.stringify(activeGoalId));
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(dailyHistory));
    } catch (e) {
        console.warn("Storage write failed.", e);
    }
}

/* =========================================
   2. In-App Toast & Web Audio API Chime
   ========================================= */
const toastContainer = document.getElementById("toastContainer");

function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
}

function playCompletionChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            const start = ctx.currentTime + idx * 0.14;
            gain.gain.setValueAtTime(0.14, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.45);
        });
    } catch (e) {}
}

/* =========================================
   3. Drift-Free SVG Circular Timer & Shortcuts
   ========================================= */
const timerDisplay = document.getElementById("timerDisplay");
const timerStatusText = document.getElementById("timerStatusText");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const modeButtons = document.querySelectorAll(".mode-btn");
const customMinutesInput = document.getElementById("customMinutesInput");
const applyCustomBtn = document.getElementById("applyCustomBtn");
const ringProgress = document.getElementById("ringProgress");

const RING_CIRCUMFERENCE = 2 * Math.PI * 102;
ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;

let currentMode = "focus";
let selectedDuration = 25 * 60;
let remainingTime = selectedDuration;
let timer = null;
let endTime = null;
let lastRecordedSecond = selectedDuration;

function formatTime(secondsLeft) {
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const s = String(secondsLeft % 60).padStart(2, "0");
    return `${m}:${s}`;
}

function updateTimerDisplay(secondsLeft) {
    const formatted = formatTime(secondsLeft);
    timerDisplay.textContent = formatted;
    document.title = timer !== null ? `${formatted} — FocusMate` : "FocusMate | Study Timer & Analytics";

    const progressRatio = selectedDuration > 0 ? secondsLeft / selectedDuration : 0;
    const offset = RING_CIRCUMFERENCE * (1 - progressRatio);
    ringProgress.style.strokeDashoffset = offset;
}

function switchMode(mode, minutes) {
    currentMode = mode;
    modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    ringProgress.classList.toggle("break-mode", mode !== "focus");
    selectedDuration = minutes * 60;
    customMinutesInput.value = minutes;
    resetTimerState();
}

function resetTimerState() {
    clearInterval(timer);
    timer = null;
    endTime = null;
    remainingTime = selectedDuration;
    lastRecordedSecond = selectedDuration;
    startPauseBtn.textContent = "Start";
    timerStatusText.textContent = currentMode === "focus" ? "Ready to focus" : "Ready for break";
    updateTimerDisplay(remainingTime);
}

function startTimer() {
    if (timer !== null) return;
    endTime = Date.now() + remainingTime * 1000;
    startPauseBtn.textContent = "Pause";
    timerStatusText.textContent = currentMode === "focus" ? "Deep focus in progress..." : "Resting...";

    timer = setInterval(() => {
        const now = Date.now();
        const currentRemaining = Math.max(0, Math.ceil((endTime - now) / 1000));

        if (currentMode === "focus") {
            const elapsed = lastRecordedSecond - currentRemaining;
            if (elapsed >= 60) {
                const minsToAdd = Math.floor(elapsed / 60);
                totalFocusMinutes += minsToAdd;
                lastRecordedSecond -= minsToAdd * 60;

                const todayKey = getDateKey(0);
                dailyHistory[todayKey] = (dailyHistory[todayKey] || 0) + minsToAdd;

                if (activeGoalId) {
                    goals = goals.map((g) =>
                        g.id === activeGoalId ? { ...g, minutesSpent: (g.minutesSpent || 0) + minsToAdd } : g
                    );
                }

                saveState();
                renderGoals();
            }
        }

        remainingTime = currentRemaining;
        updateTimerDisplay(remainingTime);

        if (remainingTime === 0) {
            clearInterval(timer);
            timer = null;
            playCompletionChime();

            if (currentMode === "focus") {
                completedSessions += 1;
                if (activeGoalId) {
                    goals = goals.map((g) =>
                        g.id === activeGoalId ? { ...g, sessions: (g.sessions || 0) + 1 } : g
                    );
                }
                saveState();
                renderGoals();
                showToast("Focus session complete! Switching to a 5-min break.");
                switchMode("short", 5);
            } else {
                showToast("Break finished! Ready for your next 25-min focus block.");
                switchMode("focus", 25);
            }
        }
    }, 250);
}

function pauseTimer() {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    startPauseBtn.textContent = "Resume";
    timerStatusText.textContent = "Paused";
    updateTimerDisplay(remainingTime);
}

startPauseBtn.addEventListener("click", () => {
    if (timer === null) startTimer();
    else pauseTimer();
});

resetBtn.addEventListener("click", resetTimerState);

modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        switchMode(btn.dataset.mode, Number(btn.dataset.minutes) || 25);
    });
});

applyCustomBtn.addEventListener("click", () => {
    const mins = Math.min(120, Math.max(1, Number(customMinutesInput.value) || 25));
    customMinutesInput.value = mins;
    selectedDuration = mins * 60;
    resetTimerState();
    showToast(`Timer duration set to ${mins} mins.`);
});

document.addEventListener("keydown", (e) => {
    const tag = document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.code === "Space") {
        e.preventDefault();
        if (timer === null) startTimer();
        else pauseTimer();
    } else if (e.key.toLowerCase() === "r") {
        resetTimerState();
    }
});

/* =========================================
   4. Goal CRUD, Active Task & Clear Completed
   ========================================= */
const goalForm = document.getElementById("goalForm");
const goalInput = document.getElementById("goalInput");
const goalList = document.getElementById("goalList");
const activeTaskText = document.getElementById("activeTaskText");
const clearCompletedBtn = document.getElementById("clearCompletedBtn");

function generateUniqueId() {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function updateActiveTaskBanner() {
    const active = goals.find((g) => g.id === activeGoalId);
    activeTaskText.textContent = active ? active.text : "Select a goal from your list →";
}

function renderGoals() {
    goalList.innerHTML = "";
    const hasCompleted = goals.some((g) => g.completed);
    clearCompletedBtn.classList.toggle("hidden", !hasCompleted);

    if (goals.length === 0) {
        goalList.innerHTML = `<p class="empty-msg">No goals yet. Add a study objective above.</p>`;
        updateActiveTaskBanner();
        updateAnalyticsUI();
        return;
    }

    goals.forEach((goal) => {
        const item = document.createElement("div");
        const isActive = goal.id === activeGoalId;
        item.className = `goal-item ${goal.completed ? "completed" : ""} ${isActive ? "active-focus" : ""}`;

        const mins = goal.minutesSpent || 0;
        const sess = goal.sessions || 0;
        const timeBadge = mins > 0 || sess > 0 ? `<span class="goal-time-tag">🍅 ${sess} · ${mins}m</span>` : "";

        item.innerHTML = `
            <div class="goal-left">
                <input type="checkbox" ${goal.completed ? "checked" : ""}>
                <span class="goal-text">${escapeHTML(goal.text)}</span>
            </div>
            <div class="goal-right">
                ${timeBadge}
                <button type="button" class="delete-btn" title="Remove goal">&times;</button>
            </div>
        `;

        item.addEventListener("click", (e) => {
            if (e.target.type === "checkbox" || e.target.classList.contains("delete-btn")) return;
            activeGoalId = goal.id;
            saveState();
            renderGoals();
        });

        item.querySelector("input[type='checkbox']").addEventListener("change", () => toggleGoal(goal.id));
        item.querySelector(".delete-btn").addEventListener("click", () => deleteGoal(goal.id));

        goalList.appendChild(item);
    });

    updateActiveTaskBanner();
    updateAnalyticsUI();
}

function addGoal(text) {
    const newGoal = { id: generateUniqueId(), text: text.trim(), completed: false, minutesSpent: 0, sessions: 0 };
    goals.push(newGoal);
    if (!activeGoalId) activeGoalId = newGoal.id;
    saveState();
    renderGoals();
}

function toggleGoal(id) {
    goals = goals.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g));
    const toggled = goals.find((g) => g.id === id);
    if (toggled && toggled.completed && activeGoalId === id) {
        const nextUnfinished = goals.find((g) => !g.completed);
        activeGoalId = nextUnfinished ? nextUnfinished.id : null;
    }
    saveState();
    renderGoals();
}

function deleteGoal(id) {
    goals = goals.filter((g) => g.id !== id);
    if (activeGoalId === id) {
        activeGoalId = goals.length > 0 ? goals[0].id : null;
    }
    saveState();
    renderGoals();
}

clearCompletedBtn.addEventListener("click", () => {
    goals = goals.filter((g) => !g.completed);
    if (!goals.some((g) => g.id === activeGoalId)) {
        activeGoalId = goals.length > 0 ? goals[0].id : null;
    }
    saveState();
    renderGoals();
    showToast("Cleared all completed goals.");
});

goalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = goalInput.value.trim();
    if (text) {
        addGoal(text);
        goalInput.value = "";
    }
});

/* =========================================
   5. Analytics, 7-Day Chart, Sample & Export
   ========================================= */
const completedStatsText = document.getElementById("completedStats");
const totalTimeStatsText = document.getElementById("totalTimeStats");
const sessionCountStatsText = document.getElementById("sessionCountStats");
const goalProgressBar = document.getElementById("goalProgressBar");
const streakBadge = document.getElementById("streakBadge");
const weeklyBarChart = document.getElementById("weeklyBarChart");
const weeklyTotalText = document.getElementById("weeklyTotalText");

function renderWeeklyChart() {
    const days = [];
    const today = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = getDateKey(-i);
        const mins = i === 0 ? Math.max(dailyHistory[key] || 0, totalFocusMinutes) : (dailyHistory[key] || 0);
        days.push({ label: dayNames[d.getDay()], mins, isToday: i === 0 });
    }

    const maxMins = Math.max(25, ...days.map((d) => d.mins));
    const sevenDaySum = days.reduce((acc, d) => acc + d.mins, 0);
    weeklyTotalText.textContent = `7-day total: ${sevenDaySum}m`;

    weeklyBarChart.innerHTML = days.map((d) => {
        const heightPct = Math.round((d.mins / maxMins) * 100);
        return `
            <div class="bar-col ${d.isToday ? "today" : ""}">
                <span class="bar-val">${d.mins > 0 ? d.mins : ""}</span>
                <div class="bar-fill" style="height: ${Math.max(4, heightPct)}%;"></div>
                <span class="bar-day">${d.label}</span>
            </div>
        `;
    }).join("");
}

function updateAnalyticsUI() {
    const total = goals.length;
    const completedCount = goals.filter((g) => g.completed).length;
    const pct = total === 0 ? 0 : Math.round((completedCount / total) * 100);

    completedStatsText.textContent = `${completedCount} / ${total} (${pct}%)`;
    goalProgressBar.style.width = `${pct}%`;
    totalTimeStatsText.textContent = `${totalFocusMinutes} ${totalFocusMinutes === 1 ? "min" : "mins"}`;
    sessionCountStatsText.textContent = `${completedSessions} Pomodoro ${completedSessions === 1 ? "session" : "sessions"} completed`;
    streakBadge.textContent = `🔥 ${completedSessions} streak`;

    renderWeeklyChart();
}

document.getElementById("loadSampleBtn").addEventListener("click", () => {
    const sampleOffsets = [
        { offset: -6, mins: 50 },
        { offset: -5, mins: 75 },
        { offset: -4, mins: 25 },
        { offset: -3, mins: 100 },
        { offset: -2, mins: 50 },
        { offset: -1, mins: 125 },
        { offset: 0, mins: 75 }
    ];
    sampleOffsets.forEach(({ offset, mins }) => {
        dailyHistory[getDateKey(offset)] = mins;
    });
    totalFocusMinutes = 75;
    completedSessions = 3;
    goals = [
        { id: "sample-1", text: "Practice Algorithms", completed: true, minutesSpent: 50, sessions: 2 },
        { id: "sample-2", text: "Review System Architecture", completed: false, minutesSpent: 25, sessions: 1 },
        { id: "sample-3", text: "Update Portfolio README", completed: false, minutesSpent: 0, sessions: 0 }
    ];
    activeGoalId = "sample-2";
    saveState();
    renderGoals();
    showToast("Loaded 7-day sample study telemetry.");
});

document.getElementById("exportJsonBtn").addEventListener("click", () => {
    const payload = {
        exportedAt: new Date().toISOString(),
        summary: { totalFocusMinutes, completedSessions },
        dailyHistory,
        goals
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focusmate-analytics-${getDateKey(0)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Analytics exported as JSON.");
});

document.getElementById("resetStatsBtn").addEventListener("click", () => {
    if (confirm("Reset today's timer, completed goals, and focus minutes?")) {
        resetTimerState();
        totalFocusMinutes = 0;
        completedSessions = 0;
        dailyHistory[getDateKey(0)] = 0;
        goals = goals.map((g) => ({ ...g, completed: false, minutesSpent: 0, sessions: 0 }));
        saveState();
        renderGoals();
        showToast("Today's progress has been reset.");
    }
});

/* =========================================
   6. Dark Mode Toggle
   ========================================= */
const darkModeBtn = document.getElementById("darkModeBtn");

function initDarkMode() {
    const isDark = loadFromStorage(STORAGE_KEYS.DARK_MODE, false) === true;
    if (isDark) {
        document.body.classList.add("dark-mode");
        darkModeBtn.textContent = "☀️";
    }
}

darkModeBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-mode");
    darkModeBtn.textContent = isDark ? "☀️" : "🌙";
    try {
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, JSON.stringify(isDark));
    } catch (e) {}
});

/* Initialize */
initDarkMode();
updateTimerDisplay(remainingTime);
renderGoals();