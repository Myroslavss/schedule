// script.js
// Рендеринг розкладу (десктоп-сітка + мобільний список по днях),
// перемикання парний/непарний тиждень, виділення поточного дня,
// збереження вибору тижня в localStorage.

(function () {
  "use strict";

  const DAYS = [
    { key: "monday", label: "Понеділок", short: "Пн" },
    { key: "tuesday", label: "Вівторок", short: "Вт" },
    { key: "wednesday", label: "Середа", short: "Ср" },
    { key: "thursday", label: "Четвер", short: "Чт" },
    { key: "friday", label: "П'ятниця", short: "Пт" },
  ];

  const PAIR_NUMBERS = Object.keys(PAIR_TIMES)
    .map(Number)
    .sort((a, b) => a - b);

  const STORAGE_KEY = "schedule:week";

  const state = {
    week: loadWeek(),
    activeDay: todayKey() || "monday",
  };

  const gridView = document.getElementById("grid-view");
  const listView = document.getElementById("list-view");
  const dayNav = document.getElementById("day-nav");
  const weekToggle = document.querySelector(".week-toggle");

  document.getElementById("group-name").textContent = "Група " + GROUP_NAME;

  function init() {
    buildWeekToggle();
    buildDayNav();
    buildGridSkeleton();
    buildListSkeleton();
    render();

    window.addEventListener("resize", debounce(render, 150));
  }

  // ------------------------------------------------------------------
  // Week toggle
  // ------------------------------------------------------------------

  function buildWeekToggle() {
    weekToggle.querySelectorAll(".week-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setWeek(btn.dataset.week);
      });
    });
    updateWeekToggleUI();
  }

  function setWeek(week) {
    if (week !== "odd" && week !== "even") return;
    state.week = week;
    try {
      localStorage.setItem(STORAGE_KEY, week);
    } catch (e) {
      /* localStorage unavailable — ignore, toggle still works this session */
    }
    updateWeekToggleUI();
    render();
  }

  function updateWeekToggleUI() {
    weekToggle.dataset.active = state.week;
    weekToggle.querySelectorAll(".week-toggle__btn").forEach((btn) => {
      const active = btn.dataset.week === state.week;
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  function loadWeek() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "odd" || saved === "even") return saved;
    } catch (e) {
      /* ignore */
    }
    return "odd";
  }

  // ------------------------------------------------------------------
  // Day nav (mobile)
  // ------------------------------------------------------------------

  function buildDayNav() {
    const today = todayKey();
    dayNav.querySelectorAll(".day-nav__btn").forEach((btn) => {
      if (btn.dataset.day === today) {
        btn.dataset.isToday = "true";
      }
      btn.addEventListener("click", () => {
        state.activeDay = btn.dataset.day;
        render();
      });
    });
  }

  function updateDayNavUI() {
    dayNav.querySelectorAll(".day-nav__btn").forEach((btn) => {
      btn.setAttribute(
        "aria-current",
        String(btn.dataset.day === state.activeDay)
      );
    });
  }

  // ------------------------------------------------------------------
  // Desktop grid — built once, then filled per render
  // ------------------------------------------------------------------

  function buildGridSkeleton() {
    const corner = document.createElement("div");
    corner.className = "grid__corner";
    gridView.appendChild(corner);

    DAYS.forEach((day, i) => {
      const head = document.createElement("div");
      head.className = "grid__day-head";
      head.textContent = day.label;
      head.dataset.day = day.key;
      head.style.gridColumn = String(i + 2);
      if (day.key === todayKey()) head.dataset.isToday = "true";
      gridView.appendChild(head);
    });

    PAIR_NUMBERS.forEach((pair, rowIdx) => {
      const row = rowIdx + 2; // row 1 is the header

      const timeCell = document.createElement("div");
      timeCell.className = "grid__time";
      timeCell.style.gridRow = String(row);
      timeCell.innerHTML =
        '<span class="grid__time-pair">' +
        pair +
        '</span><span class="grid__time-range">' +
        PAIR_TIMES[pair] +
        "</span>";
      gridView.appendChild(timeCell);

      DAYS.forEach((day, colIdx) => {
        const cell = document.createElement("div");
        cell.className = "grid__cell";
        cell.dataset.day = day.key;
        cell.dataset.pair = String(pair);
        cell.style.gridRow = String(row);
        cell.style.gridColumn = String(colIdx + 2);
        if (day.key === todayKey()) cell.classList.add("grid__cell--today");
        gridView.appendChild(cell);
      });
    });
  }

  function fillGrid() {
    const daySchedule = schedules[state.week];

    DAYS.forEach((day) => {
      const lessons = daySchedule[day.key] || [];
      const byPair = new Map(lessons.map((l) => [l.pair, l]));

      PAIR_NUMBERS.forEach((pair) => {
        const cell = gridView.querySelector(
          '.grid__cell[data-day="' + day.key + '"][data-pair="' + pair + '"]'
        );
        cell.innerHTML = "";
        const lesson = byPair.get(pair);
        if (lesson) {
          cell.appendChild(renderCard(lesson));
        } else {
          const dash = document.createElement("div");
          dash.className = "grid__cell--empty";
          cell.appendChild(dash);
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // Mobile list — one panel per day
  // ------------------------------------------------------------------

  function buildListSkeleton() {
    DAYS.forEach((day) => {
      const panel = document.createElement("div");
      panel.className = "list-day";
      panel.dataset.day = day.key;
      listView.appendChild(panel);
    });
  }

  function fillList() {
    const daySchedule = schedules[state.week];

    DAYS.forEach((day) => {
      const panel = listView.querySelector(
        '.list-day[data-day="' + day.key + '"]'
      );
      panel.classList.toggle("is-active", day.key === state.activeDay);
      panel.innerHTML = "";

      const lessons = daySchedule[day.key] || [];
      const byPair = new Map(lessons.map((l) => [l.pair, l]));

      PAIR_NUMBERS.forEach((pair) => {
        const lesson = byPair.get(pair);
        // Компактно ховаємо повністю порожні пари в кінці дня,
        // але показуємо порожній слот, якщо він оточений заняттями.
        if (!lesson && !hasLaterLesson(byPair, pair)) return;

        const slot = document.createElement("div");
        slot.className = "list-slot" + (lesson ? "" : " list-slot--empty");

        const time = document.createElement("div");
        time.className = "list-slot__time";
        time.innerHTML =
          '<div class="list-slot__pair">' +
          pair +
          '</div><div class="list-slot__range">' +
          PAIR_TIMES[pair] +
          "</div>";
        slot.appendChild(time);

        if (lesson) {
          slot.appendChild(renderCard(lesson));
        } else {
          const empty = document.createElement("div");
          empty.className = "empty-slot";
          empty.textContent = "Немає пари";
          slot.appendChild(empty);
        }

        panel.appendChild(slot);
      });

      if (!panel.children.length) {
        const empty = document.createElement("p");
        empty.className = "empty-slot";
        empty.style.border = "none";
        empty.textContent = "У цей день пар немає.";
        panel.appendChild(empty);
      }
    });

    updateDayNavUI();
  }

  function hasLaterLesson(byPair, fromPair) {
    return PAIR_NUMBERS.some((p) => p >= fromPair && byPair.has(p));
  }

  // ------------------------------------------------------------------
  // Shared card renderer
  // ------------------------------------------------------------------

  const TYPE_LABEL = {
    lecture: "Лекція",
    practice: "Практична",
    military: "Військова кафедра",
  };

  function renderCard(lesson) {
    const card = document.createElement("div");
    card.className = "card card--" + (lesson.type || "practice");

    const type = document.createElement("span");
    type.className = "card__type";
    type.textContent = TYPE_LABEL[lesson.type] || "Заняття";
    card.appendChild(type);

    const subject = document.createElement("div");
    subject.className = "card__subject";
    subject.textContent = lesson.subject;
    card.appendChild(subject);

    if (lesson.groupSplit) {
      const group = document.createElement("span");
      group.className =
        "card__group-badge " + groupBadgeClass(lesson.groupSplit);
      group.textContent = lesson.groupSplit;
      card.appendChild(group);
    }

    if (lesson.note) {
      const note = document.createElement("div");
      note.className = "card__note";
      note.textContent = lesson.note;
      card.appendChild(note);
    }

    if (Array.isArray(lesson.streams) && lesson.streams.length) {
      const streams = document.createElement("div");
      streams.className = "card__streams";
      lesson.streams.forEach((stream) => {
        streams.appendChild(renderStream(stream));
      });
      card.appendChild(streams);
    } else if (lesson.teacher || lesson.room) {
      const meta = document.createElement("div");
      meta.className = "card__meta";
      if (lesson.teacher) {
        const t = document.createElement("span");
        t.textContent = lesson.teacher;
        meta.appendChild(t);
      }
      if (lesson.room) {
        const r = document.createElement("span");
        r.textContent = formatRoom(lesson.room);
        meta.appendChild(r);
      }
      card.appendChild(meta);
    }

    return card;
  }

  function renderStream(stream) {
    const row = document.createElement("div");
    row.className = "stream stream--" + streamColorKey(stream.label);

    const label = document.createElement("span");
    label.className = "stream__label";
    label.textContent = stream.label;
    row.appendChild(label);

    const meta = document.createElement("span");
    meta.className = "stream__meta";
    const parts = [];
    if (stream.teacher) parts.push(stream.teacher);
    if (stream.room) parts.push(formatRoom(stream.room));
    meta.textContent = parts.join(" · ");
    row.appendChild(meta);

    return row;
  }

  function formatRoom(room) {
    return room === "онлайн" ? "онлайн" : "ауд. " + room;
  }

  // Стабільний колір підгрупи за номером у назві ("Група 1" → g1, "Група 2" → g2, ін. → g3).
  function groupBadgeClass(label) {
    const match = String(label).match(/\d+/);
    const n = match ? Number(match[0]) : 0;
    return "card__group-badge--g" + (((n - 1) % 3) + 1 || 1);
  }

  // Колір потоку за ключовим словом у назві (C#, Java), інакше — нейтральний.
  function streamColorKey(label) {
    const l = String(label).toLowerCase();
    if (l.includes("c#") || l.includes("c-sharp")) return "csharp";
    if (l.includes("java")) return "java";
    return "default";
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function todayKey() {
    const map = { 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday" };
    return map[new Date().getDay()] || null;
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  function render() {
    fillGrid();
    fillList();
  }

  init();
})();