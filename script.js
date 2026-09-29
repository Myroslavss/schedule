// script.js
// Рендеринг розкладу (десктоп-сітка + мобільний список по днях),
// перемикання парний/непарний тиждень, автовизначення поточного тижня,
// плавні свайпи між днями на мобільній версії, виділення поточного дня.

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

  // Понеділок будь-якого ВІДОМОГО НЕПАРНОГО тижня (формат YYYY-MM-DD).
  // ⚠️ Перевір за своїм розкладом і за потреби зміни цю дату.
  const ODD_WEEK_ANCHOR = "2026-08-31";

  // Параметри свайпу
  const SWIPE_LOCK_DISTANCE = 8; // px руху, після яких визначаємо напрям жесту
  const SWIPE_COMMIT_MIN = 50; // мінімальна відстань для перемикання, px
  const SWIPE_COMMIT_RATIO = 0.25; // або частка ширини екрана
  const SWIPE_VELOCITY = 0.4; // px/ms — швидкий "фліком" теж перемикає
  const EDGE_RESISTANCE = 0.25; // "гумка" на краях (Пн вправо / Пт вліво)
  const OUT_DURATION = 150; // ms, виїзд поточного дня
  const IN_DURATION = 220; // ms, заїзд нового дня
  const SNAP_DURATION = 200; // ms, повернення на місце

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const CURRENT_WEEK = getCurrentWeekType();

  const state = {
    week: CURRENT_WEEK,
    activeDay: todayKey() || "monday",
  };

  let animating = false;

  const gridView = document.getElementById("grid-view");
  const listView = document.getElementById("list-view");
  const dayNav = document.getElementById("day-nav");
  const weekToggle = document.querySelector(".week-toggle");
  const contentEl = document.querySelector(".content");

  document.getElementById("group-name").textContent = "Група " + GROUP_NAME;

  function init() {
    buildWeekToggle();
    buildDayNav();
    buildGridSkeleton();
    buildListSkeleton();
    initSwipe();
    render();

    window.addEventListener("resize", debounce(render, 150));
  }

  // ------------------------------------------------------------------
  // Визначення парності тижня
  // ------------------------------------------------------------------

  // У сб/нд показуємо вже наступний тиждень (як і activeDay = понеділок).
  function getCurrentWeekType(now) {
    const d = now ? new Date(now) : new Date();
    d.setHours(0, 0, 0, 0);

    const dow = d.getDay(); // 0 = нд, 6 = сб
    if (dow === 6) d.setDate(d.getDate() + 2);
    else if (dow === 0) d.setDate(d.getDate() + 1);

    // Понеділок цього тижня
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));

    const parts = ODD_WEEK_ANCHOR.split("-").map(Number);
    const anchor = new Date(parts[0], parts[1] - 1, parts[2]);

    // Math.round — щоб перехід на літній/зимовий час не ламав різницю
    const weeks = Math.round((monday - anchor) / (7 * 24 * 60 * 60 * 1000));

    return weeks % 2 === 0 ? "odd" : "even";
  }

  // ------------------------------------------------------------------
  // Week toggle
  // ------------------------------------------------------------------

  function buildWeekToggle() {
    weekToggle.querySelectorAll(".week-toggle__btn").forEach((btn) => {
      if (btn.dataset.week === CURRENT_WEEK) {
        btn.dataset.isCurrent = "true";
        btn.title = "Поточний тиждень";
      }
      btn.addEventListener("click", () => {
        setWeek(btn.dataset.week);
      });
    });
    updateWeekToggleUI();
  }

  function setWeek(week) {
    if (week !== "odd" && week !== "even") return;
    state.week = week;
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
        if (animating) return;
        const from = dayIndex(state.activeDay);
        const to = dayIndex(btn.dataset.day);
        if (to === from) return;
        setDay(btn.dataset.day, to > from ? 1 : -1);
      });
    });
  }

  function updateDayNavUI() {
    dayNav.querySelectorAll(".day-nav__btn").forEach((btn) => {
      const active = btn.dataset.day === state.activeDay;
      btn.setAttribute("aria-current", String(active));
      if (active) {
        // Якщо nav прокручується — тримаємо активний день у видимій зоні
        btn.scrollIntoView({ inline: "nearest", block: "nearest" });
      }
    });
  }

  // ------------------------------------------------------------------
  // Перемикання дня + анімації (mobile)
  // ------------------------------------------------------------------

  function dayIndex(key) {
    return DAYS.findIndex((d) => d.key === key);
  }

  function isListVisible() {
    return getComputedStyle(listView).display !== "none";
  }

  function activePanel() {
    return listView.querySelector(".list-day.is-active");
  }

  // dir: 1 — наступний день (новий заїжджає справа), -1 — попередній (зліва)
  function canShift(dir) {
    const next = dayIndex(state.activeDay) + dir;
    return next >= 0 && next < DAYS.length;
  }

  function setDay(key, dir) {
    state.activeDay = key;
    render();
    if (dir && isListVisible() && !reducedMotion.matches) {
      enterAnimation(dir);
    }
  }

  function enterAnimation(dir) {
    const panel = activePanel();
    if (!panel) return;
    const distance = Math.min(panel.offsetWidth * 0.3, 120) * dir;
    animating = true;
    const anim = panel.animate(
      [
        { transform: "translateX(" + distance + "px)", opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: IN_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    anim.onfinish = anim.oncancel = () => {
      animating = false;
    };
  }

  // ------------------------------------------------------------------
  // Свайпи між днями (mobile): картка йде за пальцем
  // ------------------------------------------------------------------

  function initSwipe() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let mode = "idle"; // idle | pending | drag | ignore
    let panel = null;
    let width = 1;

    function currentOffset(dx) {
      const dir = dx < 0 ? 1 : -1;
      return canShift(dir) ? dx : dx * EDGE_RESISTANCE;
    }

    contentEl.addEventListener(
      "touchstart",
      (e) => {
        if (animating || e.touches.length !== 1 || !isListVisible()) {
          mode = "ignore";
          return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = performance.now();
        mode = "pending";
      },
      { passive: true }
    );

    contentEl.addEventListener(
      "touchmove",
      (e) => {
        if (mode === "idle" || mode === "ignore") return;

        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (mode === "pending") {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK_DISTANCE) return;
          if (Math.abs(dx) <= Math.abs(dy)) {
            mode = "ignore"; // це вертикальний скрол
            return;
          }
          panel = activePanel();
          if (!panel) {
            mode = "ignore";
            return;
          }
          width = panel.offsetWidth || 1;
          mode = "drag";
        }

        const offset = currentOffset(dx);
        panel.style.transform = "translateX(" + offset + "px)";
        panel.style.opacity = String(1 - Math.min(Math.abs(offset) / width, 1) * 0.5);
      },
      { passive: true }
    );

    contentEl.addEventListener(
      "touchend",
      (e) => {
        const wasDrag = mode === "drag";
        mode = "idle";
        if (!wasDrag || !panel) return;

        const dx = e.changedTouches[0].clientX - startX;
        const dt = Math.max(performance.now() - startTime, 1);
        const dir = dx < 0 ? 1 : -1;
        const distance = Math.abs(dx);
        const fast = distance > 20 && distance / dt > SWIPE_VELOCITY;
        const far = distance > Math.max(SWIPE_COMMIT_MIN, width * SWIPE_COMMIT_RATIO);
        const commit = canShift(dir) && (far || fast);

        const el = panel;
        panel = null;
        const offset = currentOffset(dx);
        const opacity = 1 - Math.min(Math.abs(offset) / width, 1) * 0.5;

        if (reducedMotion.matches) {
          el.style.transform = "";
          el.style.opacity = "";
          if (commit) setDay(DAYS[dayIndex(state.activeDay) + dir].key, 0);
          return;
        }

        if (commit) {
          animating = true;
          const target = dir === 1 ? -width : width;
          const out = el.animate(
            [
              { transform: "translateX(" + offset + "px)", opacity: opacity },
              { transform: "translateX(" + target + "px)", opacity: 0 },
            ],
            { duration: OUT_DURATION, easing: "ease-in", fill: "forwards" }
          );
          out.onfinish = () => {
            out.cancel();
            el.style.transform = "";
            el.style.opacity = "";
            animating = false;
            setDay(DAYS[dayIndex(state.activeDay) + dir].key, dir);
          };
        } else {
          // Повертаємо на місце
          el.style.transform = "";
          el.style.opacity = "";
          animating = true;
          const back = el.animate(
            [
              { transform: "translateX(" + offset + "px)", opacity: opacity },
              { transform: "translateX(0)", opacity: 1 },
            ],
            { duration: SNAP_DURATION, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
          );
          back.onfinish = back.oncancel = () => {
            animating = false;
          };
        }
      },
      { passive: true }
    );

    contentEl.addEventListener(
      "touchcancel",
      () => {
        if (mode === "drag" && panel) {
          panel.style.transform = "";
          panel.style.opacity = "";
        }
        mode = "idle";
        panel = null;
      },
      { passive: true }
    );
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