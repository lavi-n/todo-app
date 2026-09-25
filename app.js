const { useState, useEffect, useRef } = React;
const h = React.createElement;

const WEEKDAY_FULL = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const WEEKDAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const WEEKDAY_ABBR = { mon:1, tue:2, tues:2, wed:3, thu:4, thurs:4, fri:5, sat:6, sun:0 };
const MONTH_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_ABBR = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function weekdayIndex(word) {
  word = word.toLowerCase();
  const i = WEEKDAY_FULL.indexOf(word);
  if (i !== -1) return i;
  return word in WEEKDAY_ABBR ? WEEKDAY_ABBR[word] : -1;
}
function monthIndex(word) {
  word = word.toLowerCase();
  const i = MONTH_FULL.indexOf(word);
  if (i !== -1) return i;
  return word in MONTH_ABBR ? MONTH_ABBR[word] : -1;
}

// Resolve free-text like "tomorrow", "next friday", "dec 25", "3/14" into an actual Date.
// Returns null if no date-ish phrase is found (task is treated as "today").
function parseTaskDate(text, now) {
  const t = text.toLowerCase();
  const today0 = stripTime(now);

  if (/\btoday\b/.test(t) || /\btonight\b/.test(t)) return today0;
  if (/\btomorrow\b|\btmrw\b/.test(t)) return addDays(today0, 1);

  let m = t.match(/\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (m) {
    const idx = weekdayIndex(m[1]);
    let ahead = (idx - today0.getDay() + 7) % 7;
    if (ahead === 0) ahead = 7;
    return addDays(today0, ahead + 7);
  }
  if (/\bnext week\b/.test(t)) return addDays(today0, 7);
  if (/\bnext month\b/.test(t)) return addDays(today0, 30);

  m = t.match(/\bin (\d+) (day|days)\b/);
  if (m) return addDays(today0, parseInt(m[1], 10));
  m = t.match(/\bin (\d+) (week|weeks)\b/);
  if (m) return addDays(today0, parseInt(m[1], 10) * 7);
  m = t.match(/\bin (\d+) (month|months)\b/);
  if (m) return addDays(today0, parseInt(m[1], 10) * 30);

  m = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b/);
  if (m) {
    const idx = weekdayIndex(m[1]);
    if (idx !== -1) {
      const ahead = (idx - today0.getDay() + 7) % 7;
      return addDays(today0, ahead);
    }
  }

  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const mi = monthIndex(m[1]);
    const day = parseInt(m[2], 10);
    let d = new Date(today0.getFullYear(), mi, day);
    if (d < today0) d = new Date(today0.getFullYear() + 1, mi, day);
    return d;
  }

  m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const mo = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    let year = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : today0.getFullYear();
    let d = new Date(year, mo, day);
    if (!m[3] && d < today0) d = new Date(year + 1, mo, day);
    return d;
  }

  m = t.match(/\bon the (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m) {
    const day = parseInt(m[1], 10);
    let d = new Date(today0.getFullYear(), today0.getMonth(), day);
    if (d < today0) d = new Date(today0.getFullYear(), today0.getMonth() + 1, day);
    return d;
  }

  return null;
}
function taskDateKey(text, now) {
  const d = parseTaskDate(text, now);
  return toKey(d || stripTime(now));
}

// "at 3pm", "3:30pm", "15:00" -> "HH:MM" (24h) or null.
function parseTaskTime(text) {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/);
  if (m) {
    let hh = parseInt(m[1], 10) % 12;
    if (m[3] === 'pm') hh += 12;
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    return pad2(hh) + ':' + pad2(mm);
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return pad2(parseInt(m[1], 10)) + ':' + m[2];
  return null;
}
function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return h12 + ':' + pad2(m) + ' ' + period;
}

// All days in a given calendar month, as Date objects (day 1 through the last day).
function monthDaysList(cursor) {
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(y, mo, d));
  return days;
}
// Same days, padded with leading/trailing nulls so they line up into full calendar-grid weeks.
function monthGridCells(cursor) {
  const days = monthDaysList(cursor);
  const leading = days[0].getDay();
  const cells = new Array(leading).fill(null).concat(days);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const PRIORITY_RANK = { high: 3, medium: 2, low: 1 };
function sortTasks(list, sortBy) {
  if (sortBy === 'priority') return [...list].sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
  if (sortBy === 'date') return [...list].sort((a, b) => (a.dateKey + (a.time || '')).localeCompare(b.dateKey + (b.time || '')));
  if (sortBy === 'alpha') return [...list].sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
  return list; // 'input' — leave in the order tasks were added
}

// Detect "every day", "weekly", "every monday", etc. Returns null (one-off) or
// { type: 'daily' | 'weekly' | 'monthly' }.
function parseRecurrence(text) {
  const t = text.toLowerCase();
  if (/\bevery ?day\b|\bdaily\b/.test(t)) return { type: 'daily' };
  if (/\bevery week\b|\bweekly\b/.test(t)) return { type: 'weekly' };
  if (/\bevery month\b|\bmonthly\b/.test(t)) return { type: 'monthly' };
  if (/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)\b/.test(t)) {
    return { type: 'weekly' };
  }
  return null;
}
const RECURRENCE_ORDER = [null, 'daily', 'weekly', 'monthly'];
const RECURRENCE_LABEL = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' };
function nextRecurrenceType(current) {
  const idx = RECURRENCE_ORDER.indexOf(current);
  return RECURRENCE_ORDER[(idx + 1) % RECURRENCE_ORDER.length];
}
function nextOccurrenceKey(dateKey, recurrence) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const cur = new Date(y, mo - 1, d);
  if (recurrence.type === 'daily') return toKey(addDays(cur, 1));
  if (recurrence.type === 'weekly') return toKey(addDays(cur, 7));
  if (recurrence.type === 'monthly') {
    const firstOfNext = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const daysInNext = new Date(firstOfNext.getFullYear(), firstOfNext.getMonth() + 1, 0).getDate();
    const day = Math.min(cur.getDate(), daysInNext);
    return toKey(new Date(firstOfNext.getFullYear(), firstOfNext.getMonth(), day));
  }
  return dateKey;
}

function hexToHsl(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
// A color's ideal lightness differs by theme: richer/darker looks right against a
// near-black surface, lighter/softer looks right against a near-white one.
const ACCENT_LIGHTNESS = { light: 62, dark: 40 };
function accentForTheme(customAccent, theme) {
  if (!customAccent) return theme === 'dark' ? '#f2f2f2' : '#111111';
  return hslToHex(customAccent.h, customAccent.s, ACCENT_LIGHTNESS[theme]);
}
// Pick a legible foreground (for text/icons drawn on top of a solid accent-colored
// background) based on how light or dark that accent actually ended up being.
function fgForColor(hex) {
  return hexToHsl(hex).l > 55 ? '#141414' : '#fafafa';
}

// A standard color palette, shared by the theme picker and tag colors —
// no raw color-dropper anywhere, just pick from a fixed, curated set.
const STANDARD_COLORS = [
  '#e5484d', '#ff6f61', '#f76b15', '#f5a623', '#eab308', '#84cc16',
  '#3ddc97', '#2ea043', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#0047ab', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#6b7280', '#9f1239', '#1e3a8a', '#4d7c0f'
];
const STANDARD_COLOR_NAMES = [
  'Red', 'Coral', 'Orange', 'Amber', 'Yellow', 'Lime',
  'Mint', 'Green', 'Emerald', 'Teal', 'Cyan', 'Sky',
  'Blue', 'Cobalt', 'Indigo', 'Violet', 'Purple', 'Fuchsia',
  'Pink', 'Rose', 'Gray', 'Maroon', 'Navy', 'Olive'
];

// The theme picker's colors: all 24 standard colors, plus a plain minimalist
// (no-color) theme.
const THEMES = STANDARD_COLORS.map((hex, i) => {
  const hs = hexToHsl(hex);
  return { id: 'c' + i, label: STANDARD_COLOR_NAMES[i], hue: hs.h, sat: hs.s };
}).concat([
  { id: 'minimal', label: 'Minimal', special: 'minimal' }
]);
function computeEffectiveAccent(activeTheme, theme) {
  if (!activeTheme || activeTheme.special === 'minimal') return accentForTheme(null, theme);
  return accentForTheme({ h: activeTheme.hue, s: activeTheme.sat }, theme);
}
function swatchBackground(t, theme) {
  if (t.special === 'minimal') return 'linear-gradient(135deg, #ffffff 50%, #111111 50%)';
  return accentForTheme({ h: t.hue, s: t.sat }, theme);
}

const SUN_SVG = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>';
const MOON_SVG = '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>';
const CHEVRON_LEFT_SVG = '<path d="M15 5l-7 7 7 7"/>';
const CHEVRON_RIGHT_SVG = '<path d="M9 5l7 7-7 7"/>';
const DAY_SVG = '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><path d="M8 3v3M16 3v3"/><circle cx="12" cy="14" r="2.2" fill="currentColor" stroke="none"/>';
const WEEK_SVG = '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><path d="M8 3v3M16 3v3"/><path d="M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2M15 17h2"/>';
const MONTH_SVG = '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><path d="M8 3v3M16 3v3"/><path d="M6.5 13h1M10 13h1M13.5 13h1M17 13h1M6.5 16.5h1M10 16.5h1M13.5 16.5h1M17 16.5h1"/>';
const PLANNED_SVG = '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><path d="M8 3v3M16 3v3"/><path d="M7 14h4M7 17h7"/>';
const DONE_SVG = '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>';
const IMPORTANT_SVG = '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8z"/>';
const REPEAT_SVG = '<path d="M17 2.5l4 4-4 4"/><path d="M3 11.5v-2a4 4 0 0 1 4-4h14"/><path d="M7 21.5l-4-4 4-4"/><path d="M21 12.5v2a4 4 0 0 1-4 4H3"/>';
const NOTE_SVG = '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M7.5 8h9M7.5 12h9M7.5 16h5"/>';
const SEARCH_SVG = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.3-4.3"/>';
const BACK_SVG = '<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>';
const TRASH_SVG = '<path d="M4 7h16"/><path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7"/><path d="M6.5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13"/><path d="M10 11v6M14 11v6"/>';
const RESTORE_SVG = '<path d="M9 14l-4-4 4-4"/><path d="M5 10h10a5 5 0 0 1 0 10h-2"/>';
const SNOOZE_SVG = '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M8.5 2.5l-3 2M15.5 2.5l3 2"/>';

function Icon(svg, filled, className) {
  return h('svg', { viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round', strokeLinejoin: 'round', className: className, dangerouslySetInnerHTML: { __html: svg } });
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('today');
  const [theme, setTheme] = useState('light'); // 'light' | 'dark'
  const [themeId, setThemeId] = useState('minimal');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [subtaskInputs, setSubtaskInputs] = useState({});
  const [confirmAction, setConfirmAction] = useState(null); // null | { message, onConfirm }
  const [trash, setTrash] = useState([]);
  const [sortBy, setSortBy] = useState('input'); // 'input' | 'date' | 'priority' | 'alpha'
  const [monthCursor, setMonthCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [monthDisplay, setMonthDisplay] = useState('list'); // 'list' | 'calendar'
  const [plannedDisplay, setPlannedDisplay] = useState('list'); // 'list' | 'calendar'
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [tags, setTags] = useState([
    { id: 'work', name: 'Work', color: '#4c8dff' },
    { id: 'personal', name: 'Personal', color: '#2ea043' },
    { id: 'groceries', name: 'Groceries', color: '#f5a623' }
  ]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [snoozeOpen, setSnoozeOpen] = useState({});
  const [toast, setToast] = useState(null); // null | { message, onUndo }
  const toastTimer = useRef(null);
  const loaded = useRef(false);

  function showToast(message, onUndo) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }
  function dismissToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }

  // Load once on mount, then keep saving to this browser's own storage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('todo-tasks');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { setTasks(parsed); } // old format, pre-trash/tags
        else {
          setTasks(parsed.tasks || []);
          setTrash(parsed.trash || []);
          if (parsed.tags) setTags(parsed.tags);
        }
      }
    } catch (e) {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem('todo-tasks', JSON.stringify({ tasks, trash, tags })); } catch (e) {}
  }, [tasks, trash, tags]);

  const activeTheme = THEMES.find(t => t.id === themeId);
  const effectiveAccent = computeEffectiveAccent(activeTheme, theme);
  const accentFg = fgForColor(effectiveAccent);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', effectiveAccent);
    document.documentElement.style.setProperty('--accent-fg', accentFg);
  }, [theme, effectiveAccent, accentFg]);

  const now = new Date();
  const todayKey = toKey(stripTime(now));

  function addTask() {
    const text = input.trim();
    if (!text) return;
    const dateKey = taskDateKey(text, now);
    const recurrence = parseRecurrence(text);
    const time = parseTaskTime(text);
    setTasks(prev => [...prev, {
      id: Date.now() + Math.random(), text, note: '', done: false,
      important: false, priority: null, dateKey, time, recurrence, subtasks: []
    }]);
    setInput('');
    setView(dateKey === todayKey ? 'today' : 'planned');
  }
  function toggleTask(id) {
    const before = tasks.find(t => t.id === id);
    setTasks(prev => {
      const task = prev.find(t => t.id === id);
      const completing = task && !task.done;
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const updated = { ...t, done: !t.done };
        if (completing && updated.subtasks && updated.subtasks.length) {
          updated.subtasks = updated.subtasks.map(s => ({ ...s, done: true }));
        }
        return updated;
      });
      // Completing a recurring task schedules its next occurrence instead of just disappearing.
      if (completing && task.recurrence) {
        next.push({
          ...task,
          id: Date.now() + Math.random(),
          done: false,
          subtasks: (task.subtasks || []).map(s => ({ ...s, done: false })),
          dateKey: nextOccurrenceKey(task.dateKey, task.recurrence)
        });
      }
      return next;
    });
    if (before && !before.done) {
      showToast('Marked done', () => {
        setTasks(prev => prev.map(t => t.id === id ? before : t));
      });
    }
  }
  function toggleImportant(id) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, important: !t.important } : t));
  }
  function setPriority(id, level) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, priority: level } : t));
  }
  function cycleRecurrence(id) {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const nextType = nextRecurrenceType(t.recurrence ? t.recurrence.type : null);
      return { ...t, recurrence: nextType ? { type: nextType } : null };
    }));
  }
  function updateNote(id, note) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, note } : t));
  }
  function setTaskTime(id, time) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, time: time || null } : t));
  }
  function snoozeTaskByDays(id, days) {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const [y, mo, d] = t.dateKey.split('-').map(Number);
      return { ...t, dateKey: toKey(addDays(new Date(y, mo - 1, d), days)) };
    }));
  }
  function snoozeTaskToDate(id, dateStr) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, dateKey: dateStr } : t));
  }
  function setSubtaskInput(id, val) {
    setSubtaskInputs(prev => ({ ...prev, [id]: val }));
  }
  function addSubtask(id) {
    const text = (subtaskInputs[id] || '').trim();
    if (!text) return;
    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now() + Math.random(), text, done: false }] }
      : t));
    setSubtaskInput(id, '');
  }
  function toggleSubtask(taskId, subId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const nextSubtasks = (task.subtasks || []).map(s => s.id === subId ? { ...s, done: !s.done } : s);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: nextSubtasks } : t));
    const allDone = nextSubtasks.length > 0 && nextSubtasks.every(s => s.done);
    if (allDone && !task.done) {
      toggleTask(taskId);
    }
  }
  function deleteSubtask(taskId, subId) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== subId) }
      : t));
  }
  function toggleExpanded(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }
  function toggleTaskTag(taskId, tagId, forceOn) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const cur = t.tags || [];
      const has = cur.includes(tagId);
      if (forceOn && has) return t;
      const next = forceOn ? [...cur, tagId] : (has ? cur.filter(x => x !== tagId) : [...cur, tagId]);
      return { ...t, tags: next };
    }));
  }
  function createTag(taskId) {
    const name = newTagName.trim();
    if (!name) return;
    const id = 'tag-' + Date.now() + Math.floor(Math.random() * 1000);
    setTags(prev => [...prev, { id, name, color: newTagColor }]);
    if (taskId) toggleTaskTag(taskId, id, true);
    setNewTagName('');
  }
  function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    setTasks(prev => {
      if (task) setTrash(tr => [{ ...task, deletedAt: Date.now() }, ...tr]);
      return prev.filter(t => t.id !== id);
    });
    if (task) {
      showToast('Task deleted', () => {
        setTrash(tr => tr.filter(t => t.id !== id));
        setTasks(ts => [...ts, task]);
      });
    }
  }
  function restoreTask(id) {
    setTrash(prev => {
      const item = prev.find(t => t.id === id);
      if (item) {
        const { deletedAt, ...rest } = item;
        setTasks(ts => [...ts, rest]);
      }
      return prev.filter(t => t.id !== id);
    });
  }
  function purgeTask(id) {
    setTrash(prev => prev.filter(t => t.id !== id));
  }
  function timeAgo(ts) {
    const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }
  function matchesSearch(t) {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (t.text.toLowerCase().includes(q)) return true;
    if ((t.note || '').toLowerCase().includes(q)) return true;
    if ((t.subtasks || []).some(s => s.text.toLowerCase().includes(q))) return true;
    return false;
  }

  // Reset a pending confirmation whenever the context it applied to changes.
  useEffect(() => { setConfirmAction(null); }, [view, search]);
  useEffect(() => { setSelectedDayKey(null); }, [view, monthCursor]);

  // Clicking outside a task's own row minimizes it (closes its note/subtask
  // panel and its snooze menu), regardless of what's focused.
  useEffect(() => {
    function handleOutsideClick(e) {
      const li = e.target.closest && e.target.closest('li[data-task-id]');
      const clickedId = li ? li.getAttribute('data-task-id') : null;
      const shrink = prev => {
        let changed = false;
        const next = { ...prev };
        Object.keys(prev).forEach(id => {
          if (prev[id] && id !== clickedId) { next[id] = false; changed = true; }
        });
        return changed ? next : prev;
      };
      setExpanded(shrink);
      setSnoozeOpen(shrink);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Auto-purge trash older than 30 days.
  useEffect(() => {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    setTrash(prev => {
      const kept = prev.filter(t => Date.now() - t.deletedAt < THIRTY_DAYS_MS);
      return kept.length === prev.length ? prev : kept;
    });
  }, [trash]);

  const visible = sortTasks((view === 'done' ? tasks.filter(t => t.done)
    : view === 'important' ? tasks.filter(t => t.important && !t.done)
    : view === 'planned' ? tasks.filter(t => !t.done)
    : view === 'week' || view === 'month' || view === 'trash' ? []
    : tasks.filter(t => t.dateKey <= todayKey && !t.done)
  ).filter(matchesSearch), sortBy);

  const weekKeySet = new Set(rangeDays(7).map(d => d.key));
  const monthKeySet = new Set(monthDaysList(monthCursor).map(d => toKey(d)));
  const navItems = [
    { key: 'today', label: 'My Day', svg: DAY_SVG, count: tasks.filter(t => t.dateKey <= todayKey && !t.done).length },
    { key: 'week', label: 'Week', svg: WEEK_SVG, count: tasks.filter(t => weekKeySet.has(t.dateKey)).length },
    { key: 'month', label: 'Month', svg: MONTH_SVG, count: tasks.filter(t => monthKeySet.has(t.dateKey)).length },
    { key: 'planned', label: 'Planned', svg: PLANNED_SVG, count: tasks.filter(t => !t.done).length },
    { key: 'important', label: 'Important', svg: IMPORTANT_SVG, count: tasks.filter(t => t.important && !t.done).length },
    { key: 'done', label: 'Done', svg: DONE_SVG, count: tasks.filter(t => t.done).length },
    { key: 'trash', label: 'Trash', svg: TRASH_SVG, count: trash.length }
  ];

  function taskItem(t, viewCtx) {
    const isOpen = !!expanded[t.id];
    const isOverdue = t.dateKey < todayKey;
    const showTag = viewCtx === 'done' || viewCtx === 'planned' || viewCtx === 'important' || viewCtx === 'search' || (viewCtx === 'today' && isOverdue);
    const tagLabel = isOverdue ? 'Overdue' : (t.dateKey === todayKey ? 'Today' : 'Later');
    const subtasks = t.subtasks || [];
    const subtasksDone = subtasks.filter(s => s.done).length;
    const taskTags = (t.tags || []).map(id => tags.find(tag => tag.id === id)).filter(Boolean);
    const isSnoozeOpen = !!snoozeOpen[t.id];

    function handleCheckboxClick() {
      if (!t.done && subtasks.length > 0 && subtasksDone < subtasks.length) {
        setConfirmAction({
          message: "Some subtasks aren't finished yet. Complete this task anyway?",
          confirmLabel: 'Complete anyway',
          danger: false,
          onConfirm: () => { toggleTask(t.id); setConfirmAction(null); }
        });
      } else {
        toggleTask(t.id);
      }
    }
    function closeSnooze() { setSnoozeOpen(prev => ({ ...prev, [t.id]: false })); }

    return h('li', { key: t.id, 'data-task-id': String(t.id), className: t.done ? 'done-item' : '' },
      h('div', { className: 'task-row' },
        h('div', {
          className: 'checkbox' + (t.done ? ' checked' : ''),
          onClick: handleCheckboxClick
        }, t.done ? '✓' : ''),
        h('span', { className: 'task-text', onClick: () => toggleExpanded(t.id) },
          h('span', { className: 'task-text-label' }, t.text),
          showTag
            ? h('span', { className: 'page-tag' + (isOverdue ? ' overdue' : '') }, tagLabel)
            : null,
          t.time ? h('span', { className: 'time-tag' }, formatTime(t.time)) : null,
          subtasks.length > 0 ? h('span', { className: 'subtask-progress' }, `${subtasksDone}/${subtasks.length}`) : null,
          taskTags.map(tag => h('span', {
            key: tag.id, className: 'tag-pill',
            style: { background: `color-mix(in srgb, ${tag.color} 22%, var(--card))`, color: tag.color }
          }, tag.name))
        ),
        h('button', {
          className: 'star-btn' + (t.important ? ' active' : ''),
          title: t.important ? 'Important' : 'Mark important',
          onClick: () => toggleImportant(t.id)
        }, Icon(IMPORTANT_SVG, !!t.important)),
        h('select', {
          className: 'priority-select' + (t.priority ? ' has-' + t.priority : ''),
          title: 'Priority',
          value: t.priority || 'none',
          onChange: e => setPriority(t.id, e.target.value === 'none' ? null : e.target.value)
        },
          h('option', { value: 'none' }, 'None'),
          h('option', { value: 'low' }, 'Low'),
          h('option', { value: 'medium' }, 'Medium'),
          h('option', { value: 'high' }, 'High')
        ),
        h('button', {
          className: 'recur-btn' + (t.recurrence ? ' active' : ''),
          title: t.recurrence ? RECURRENCE_LABEL[t.recurrence.type] : 'Make recurring',
          onClick: () => cycleRecurrence(t.id)
        }, Icon(REPEAT_SVG)),
        h('button', {
          className: 'snooze-btn' + (isSnoozeOpen ? ' active' : ''),
          title: 'Snooze',
          onClick: () => setSnoozeOpen(prev => ({ ...prev, [t.id]: !prev[t.id] }))
        }, Icon(SNOOZE_SVG)),
        h('button', {
          className: 'note-btn' + (isOpen || t.note ? ' active' : ''),
          title: 'Notes, subtasks & tags',
          onClick: () => toggleExpanded(t.id)
        }, Icon(NOTE_SVG)),
        h('button', { className: 'delete-btn', title: 'Delete', onClick: () => deleteTask(t.id) }, Icon(TRASH_SVG))
      ),
      isSnoozeOpen
        ? h('div', { className: 'snooze-menu' },
            [{ label: '1 day', days: 1 }, { label: '2 days', days: 2 }, { label: '3 days', days: 3 }, { label: '1 week', days: 7 }].map(opt =>
              h('button', {
                key: opt.days, className: 'snooze-option',
                onClick: () => { snoozeTaskByDays(t.id, opt.days); closeSnooze(); }
              }, opt.label)
            ),
            h('input', {
              type: 'date',
              className: 'snooze-date-input',
              title: 'Pick a date',
              onChange: e => { if (e.target.value) { snoozeTaskToDate(t.id, e.target.value); closeSnooze(); } }
            })
          )
        : null,
      subtasks.length > 0
        ? h('div', { className: 'subtasks-list' },
            subtasks.map(s => h('div', { key: s.id, className: 'subtask-row' },
              h('div', {
                className: 'subtask-checkbox' + (s.done ? ' checked' : ''),
                onClick: () => toggleSubtask(t.id, s.id)
              }, s.done ? '✓' : ''),
              h('span', { className: 'subtask-text' + (s.done ? ' done' : '') }, s.text),
              h('button', { className: 'subtask-delete', title: 'Delete subtask', onClick: () => deleteSubtask(t.id, s.id) }, Icon(TRASH_SVG))
            ))
          )
        : null,
      isOpen
        ? h('div', { className: 'note-editor' },
            h('textarea', {
              value: t.note || '', placeholder: 'Add a note…', autoFocus: true,
              onChange: e => updateNote(t.id, e.target.value)
            }),
            h('label', { className: 'due-time-row' },
              'Due time',
              h('input', {
                type: 'time', value: t.time || '',
                onChange: e => setTaskTime(t.id, e.target.value)
              })
            ),
            h('div', { className: 'subtask-add-row' },
              h('input', {
                type: 'text', placeholder: 'Add subtask', value: subtaskInputs[t.id] || '',
                onChange: e => setSubtaskInput(t.id, e.target.value),
                onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(t.id); } }
              }),
              h('button', { className: 'subtask-add-btn', title: 'Add subtask', onClick: () => addSubtask(t.id) }, '+')
            ),
            h('div', { className: 'tags-section' },
              h('div', { className: 'tags-label' }, 'Tags'),
              h('div', { className: 'tag-chip-row' },
                tags.map(tag => {
                  const active = (t.tags || []).includes(tag.id);
                  return h('button', {
                    key: tag.id,
                    className: 'tag-chip' + (active ? ' active' : ''),
                    style: active
                      ? { background: tag.color, borderColor: tag.color, color: fgForColor(tag.color) }
                      : { borderColor: tag.color, color: tag.color },
                    onClick: () => toggleTaskTag(t.id, tag.id)
                  }, tag.name);
                })
              ),
              h('div', { className: 'new-tag-row' },
                h('input', {
                  type: 'text', placeholder: 'New tag name', value: newTagName,
                  onChange: e => setNewTagName(e.target.value),
                  onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); createTag(t.id); } }
                }),
                h('button', { className: 'subtask-add-btn', title: 'Create tag', onClick: () => createTag(t.id) }, '+')
              ),
              h('div', { className: 'tag-color-grid' },
                STANDARD_COLORS.map((c, i) => h('button', {
                  key: c,
                  className: 'tag-color-swatch' + (newTagColor === c ? ' active' : ''),
                  style: { background: c },
                  title: STANDARD_COLOR_NAMES[i],
                  onClick: () => setNewTagColor(c)
                }))
              )
            )
          )
        : (t.note ? h('div', { className: 'note-preview' }, t.note.split('\n')[0]) : null)
    );
  }

  function rangeDays(numDays) {
    const start = stripTime(now);
    const days = [];
    for (let i = 0; i < numDays; i++) {
      const d = addDays(start, i);
      days.push({ key: toKey(d), date: d });
    }
    return days;
  }

  // Week's rolling 7-day list (today + next 6 days).
  function weekListView() {
    const sections = rangeDays(7)
      .map(day => ({ day, dayTasks: sortTasks(tasks.filter(t => t.dateKey === day.key).filter(matchesSearch), sortBy) }))
      .filter(({ dayTasks }) => dayTasks.length > 0);

    if (sections.length === 0) return h(React.Fragment, null, h('ul', null), h('div', { className: 'empty' }, 'Nothing here.'));

    return h('div', { className: 'range-wrap' },
      sections.map(({ day, dayTasks }) =>
        h('div', { key: day.key, className: 'week-day' + (day.key === todayKey ? ' is-today' : '') },
          h('div', { className: 'week-day-header' },
            WEEKDAY_SHORT[day.date.getDay()] + ', ' + MONTH_SHORT[day.date.getMonth()] + ' ' + day.date.getDate(),
            h('span', { className: 'week-day-count' }, '\u00A0\u2014\u00A0' + dayTasks.length + (dayTasks.length === 1 ? ' task' : ' tasks'))
          ),
          h('ul', { className: 'week-list' }, dayTasks.map(t => taskItem(t, 'range')))
        )
      )
    );
  }

  // Month's day-by-day list, scoped to the actual calendar month (monthCursor), skipping empty days.
  // Prev/next month navigation, shared by Month's list mode and the calendar grid.
  function monthNavHeader() {
    return h('div', { className: 'calendar-nav' },
      h('button', { className: 'calendar-nav-btn', title: 'Previous month', onClick: () => setMonthCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)) }, Icon(CHEVRON_LEFT_SVG)),
      h('span', { className: 'calendar-month-label' }, MONTH_FULL[monthCursor.getMonth()][0].toUpperCase() + MONTH_FULL[monthCursor.getMonth()].slice(1) + ' ' + monthCursor.getFullYear()),
      h('button', { className: 'calendar-nav-btn', title: 'Next month', onClick: () => setMonthCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)) }, Icon(CHEVRON_RIGHT_SVG))
    );
  }

  function monthListView(taskFilterFn) {
    const sections = monthDaysList(monthCursor)
      .map(date => {
        const key = toKey(date);
        return { date, key, dayTasks: sortTasks(tasks.filter(t => t.dateKey === key && taskFilterFn(t)).filter(matchesSearch), sortBy) };
      })
      .filter(({ dayTasks }) => dayTasks.length > 0);

    if (sections.length === 0) return h(React.Fragment, null, monthNavHeader(), h('ul', null), h('div', { className: 'empty' }, 'Nothing here.'));

    return h(React.Fragment, null,
      monthNavHeader(),
      h('div', { className: 'range-wrap' },
        sections.map(({ date, key, dayTasks }) =>
          h('div', { key: key, className: 'week-day' + (key === todayKey ? ' is-today' : '') },
            h('div', { className: 'week-day-header' },
              WEEKDAY_SHORT[date.getDay()] + ', ' + MONTH_SHORT[date.getMonth()] + ' ' + date.getDate(),
              h('span', { className: 'week-day-count' }, '\u00A0\u2014\u00A0' + dayTasks.length + (dayTasks.length === 1 ? ' task' : ' tasks'))
            ),
            h('ul', { className: 'week-list' }, dayTasks.map(t => taskItem(t, 'range')))
          )
        )
      )
    );
  }

  // Shared calendar-grid renderer used by both Month and Planned's calendar mode.
  function calendarView(taskFilterFn) {
    const cells = monthGridCells(monthCursor);
    const dayTasksFor = key => sortTasks(tasks.filter(t => t.dateKey === key && taskFilterFn(t)).filter(matchesSearch), sortBy);
    const selectedTasks = selectedDayKey ? dayTasksFor(selectedDayKey) : [];

    return h(React.Fragment, null,
      monthNavHeader(),
      h('div', { className: 'calendar-grid' },
        WEEKDAY_SHORT.map(d => h('div', { key: d, className: 'calendar-weekday' }, d[0])),
        cells.map((date, i) => {
          if (!date) return h('div', { key: 'blank' + i, className: 'calendar-cell empty' });
          const key = toKey(date);
          const count = dayTasksFor(key).length;
          return h('button', {
            key: key,
            className: 'calendar-cell' + (key === todayKey ? ' is-today' : '') + (key === selectedDayKey ? ' selected' : ''),
            onClick: () => setSelectedDayKey(k => k === key ? null : key)
          }, String(date.getDate()), count > 0 ? h('span', { className: 'calendar-dot' }) : null);
        })
      ),
      selectedDayKey
        ? h('div', { className: 'calendar-day-panel' },
            h('div', { className: 'week-day-header' },
              (() => { const [y, mo, d] = selectedDayKey.split('-').map(Number); const dd = new Date(y, mo - 1, d); return WEEKDAY_SHORT[dd.getDay()] + ', ' + MONTH_SHORT[dd.getMonth()] + ' ' + dd.getDate(); })()
            ),
            selectedTasks.length === 0
              ? h('div', { className: 'empty' }, 'Nothing here.')
              : h('ul', { className: 'week-list' }, selectedTasks.map(t => taskItem(t, 'range')))
          )
        : h('div', { className: 'empty' }, 'Tap a day to see its tasks.')
    );
  }

  function trashView() {
    if (trash.length === 0) return h('div', { className: 'empty' }, 'Trash is empty.');
    return h('ul', null, trash.map(t => h('li', { key: t.id, className: 'trash-item' },
      h('div', { className: 'task-row' },
        h('span', { className: 'task-text' }, h('span', { className: 'trash-text' }, t.text), h('span', { className: 'time-tag' }, timeAgo(t.deletedAt))),
        h('button', { className: 'restore-btn', title: 'Restore', onClick: () => restoreTask(t.id) }, Icon(RESTORE_SVG)),
        h('button', { className: 'delete-btn', title: 'Delete forever', onClick: () => purgeTask(t.id) }, Icon(TRASH_SVG))
      )
    )));
  }

  const monthTasksAll = tasks.filter(t => monthKeySet.has(t.dateKey)).filter(matchesSearch);
  const plannedMonthTasks = monthTasksAll.filter(t => !t.done);

  const weekIds = tasks.filter(t => weekKeySet.has(t.dateKey)).filter(matchesSearch).map(t => t.id);

  // Searching looks across every task everywhere, ignoring which view is selected.
  const isSearching = search.trim().length > 0;
  const searchResults = isSearching
    ? (() => {
        const all = tasks.filter(matchesSearch);
        const undone = sortTasks(all.filter(t => !t.done), sortBy);
        const done = sortTasks(all.filter(t => t.done), sortBy);
        return undone.concat(done);
      })()
    : [];

  const deleteAllIds = isSearching ? searchResults.map(t => t.id)
    : view === 'week' ? weekIds
    : view === 'month' ? monthTasksAll.map(t => t.id)
    : view === 'planned' && plannedDisplay === 'calendar' ? plannedMonthTasks.map(t => t.id)
    : visible.map(t => t.id);

  const searchBar = h('div', { className: 'search-row page-search' },
    Icon(SEARCH_SVG, false, 'search-icon'),
    h('input', {
      type: 'text', className: 'search-input', placeholder: 'Search all tasks',
      value: search, onChange: e => setSearch(e.target.value)
    }),
    search ? h('button', { className: 'search-clear', onClick: () => setSearch('') }, '✕') : null
  );

  const deleteAllBtn = (view !== 'trash' && deleteAllIds.length > 0)
    ? h('button', {
        className: 'delete-all-btn',
        onClick: () => setConfirmAction({
          message: 'Are you sure you want to delete this?',
          onConfirm: () => {
            const ids = new Set(deleteAllIds);
            setTasks(prev => {
              const removed = prev.filter(t => ids.has(t.id));
              if (removed.length) {
                const stamped = removed.map(t => ({ ...t, deletedAt: Date.now() }));
                setTrash(tr => stamped.concat(tr));
              }
              return prev.filter(t => !ids.has(t.id));
            });
            setConfirmAction(null);
          }
        })
      }, 'Delete all')
    : null;

  const emptyTrashBtn = (view === 'trash' && trash.length > 0)
    ? h('button', {
        className: 'delete-all-btn',
        onClick: () => setConfirmAction({
          message: "Permanently delete all trash? This can't be undone.",
          onConfirm: () => { setTrash([]); setConfirmAction(null); }
        })
      }, 'Empty trash')
    : null;

  const deleteAllModal = confirmAction
    ? h('div', { className: 'modal-overlay', onClick: () => setConfirmAction(null) },
        h('div', { className: 'modal-card', onClick: e => e.stopPropagation() },
          h('p', { className: 'modal-text' }, confirmAction.message),
          h('div', { className: 'modal-actions' },
            h('button', { className: 'modal-cancel-btn', onClick: () => setConfirmAction(null) }, 'Cancel'),
            h('button', {
              className: 'modal-confirm-btn' + (confirmAction.danger === false ? ' safe' : ''),
              onClick: confirmAction.onConfirm
            }, confirmAction.confirmLabel || 'Delete')
          )
        )
      )
    : null;

  const toastEl = toast
    ? h('div', { className: 'toast' },
        h('span', null, toast.message),
        toast.onUndo ? h('button', {
          className: 'toast-undo',
          onClick: () => { toast.onUndo(); dismissToast(); }
        }, 'Undo') : null
      )
    : null;

  // Searching replaces the whole app with its own page: no sidebar, no nav, no
  // theme panel, no add-task row — just the query, the results, and a way back.
  if (isSearching) {
    return h(React.Fragment, null,
      h('div', { className: 'search-page' },
        h('div', { className: 'search-page-header' },
          h('button', { className: 'back-btn', title: 'Back', onClick: () => setSearch('') }, Icon(BACK_SVG)),
          searchBar
        ),
        h('h1', null, `Results for \u201c${search.trim()}\u201d`),
        h('ul', null, searchResults.map(t => taskItem(t, 'search'))),
        searchResults.length === 0 ? h('div', { className: 'empty' }, 'No matching tasks.') : null,
        h('div', { className: 'footer-row' },
          h('div', { className: 'footer' },
            searchResults.length === 0 ? '' : `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}`),
          deleteAllBtn
        )
      ),
      deleteAllModal,
      toastEl
    );
  }

  return h(React.Fragment, null,
    searchBar,
    h('div', { className: 'shell' },
    h('div', { className: 'sidebar' },
      navItems.map(item => h('button', {
        key: item.key,
        className: 'nav-btn' + (view === item.key ? ' active' : ''),
        onClick: () => setView(item.key)
      }, Icon(item.svg), item.label, item.count > 0 ? h('span', { className: 'nav-count' }, item.count) : null)),
      h('div', { className: 'theme-panel' },
        h('div', { className: 'theme-row-top' },
          h('span', { className: 'theme-label' }, 'Theme'),
          h('button', {
            className: 'mode-btn',
            title: theme === 'dark' ? 'Dark \u2014 click for Light' : 'Light \u2014 click for Dark',
            onClick: () => setTheme(t => t === 'dark' ? 'light' : 'dark')
          }, Icon(theme === 'dark' ? SUN_SVG : MOON_SVG, false))
        ),
        h('div', { className: 'swatch-grid' },
          THEMES.map(t => h('button', {
            key: t.id,
            className: 'swatch' + (themeId === t.id ? ' active' : ''),
            style: { background: swatchBackground(t, theme) },
            title: t.label,
            onClick: () => setThemeId(t.id)
          }))
        )
      )
    ),
    h('div', { className: 'main' },
      h('h1', null, view === 'trash' ? 'Trash' : 'To Do'),
      view === 'trash' ? null : h('div', { className: 'add-row' },
        h('input', {
          type: 'text', value: input, placeholder: 'Add a task',
          onChange: e => setInput(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter') addTask(); }
        }),
        h('button', { className: 'add-btn', onClick: addTask }, 'Add')
      ),
      (view === 'month' || view === 'planned')
        ? h('div', { className: 'view-toggle' },
            ['list', 'calendar'].map(mode => h('button', {
              key: mode,
              className: 'view-toggle-btn' + ((view === 'month' ? monthDisplay : plannedDisplay) === mode ? ' active' : ''),
              onClick: () => view === 'month' ? setMonthDisplay(mode) : setPlannedDisplay(mode)
            }, mode === 'list' ? 'List' : 'Calendar'))
          )
        : null,
      view === 'trash' ? null : h('div', { className: 'sort-row' },
        'Sort:',
        h('select', {
          value: sortBy,
          onChange: e => setSortBy(e.target.value)
        },
          h('option', { value: 'input' }, 'Order added'),
          h('option', { value: 'date' }, 'Date'),
          h('option', { value: 'priority' }, 'Priority'),
          h('option', { value: 'alpha' }, 'Alphabetical')
        )
      ),
      view === 'trash' ? trashView()
        : view === 'week' ? weekListView()
        : view === 'month' ? (monthDisplay === 'list' ? monthListView(() => true) : calendarView(() => true))
        : view === 'planned' && plannedDisplay === 'calendar' ? calendarView(t => !t.done)
        : h(React.Fragment, null,
            h('ul', null,
              visible.map(t => taskItem(t, view))
            ),
            visible.length === 0 ? h('div', { className: 'empty' }, 'Nothing here.') : null
          ),
      h('div', { className: 'footer-row' },
        h('div', { className: 'footer' },
          view === 'trash' ? (trash.length === 0 ? '' : `${trash.length} item${trash.length === 1 ? '' : 's'}`)
            : view === 'week' ? (weekIds.length === 0 ? '' : `${weekIds.length} task${weekIds.length === 1 ? '' : 's'}`)
            : view === 'month' ? (monthTasksAll.length === 0 ? '' : `${monthTasksAll.length} task${monthTasksAll.length === 1 ? '' : 's'}`)
            : view === 'planned' && plannedDisplay === 'calendar' ? (plannedMonthTasks.length === 0 ? '' : `${plannedMonthTasks.length} task${plannedMonthTasks.length === 1 ? '' : 's'}`)
            : (visible.length === 0 ? '' : view === 'done' ? `${visible.length} completed` : `${visible.length} task${visible.length === 1 ? '' : 's'}`)),
        view === 'trash' ? emptyTrashBtn : deleteAllBtn
      )
    )
    ),
    deleteAllModal,
    toastEl
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
