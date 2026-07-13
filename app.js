(() => {
  "use strict";

  const MAX_FINGERS = 8;
  const MIN_FINGERS = 2;
  const LOCK_DELAY_MS = 650;
  const READY_DELAY_MS = 500;
  const MOVE_TOLERANCE_PX = 26;
  const SELECTION_DURATION_MS = 1700;
  const WINNER_HOLD_MS = 750;

  const game = document.getElementById("game");
  const touchLayer = document.getElementById("touchLayer");
  const statusText = document.getElementById("status");
  const promptScreen = document.getElementById("promptScreen");
  const promptText = document.getElementById("promptText");
  const nextRoundButton = document.getElementById("nextRound");

  const touches = new Map();
  let gameState = "collecting";
  let readyTimer = null;
  let selectionTimers = [];
  let promptDeckIds = [];
  let promptDeckSignature = "";
  let lastPromptId = null;

  const THEMES = [
    { a: "#59C7FF", b: "#7B61FF", angle: "145deg" }, // light blue → purple
    { a: "#55D6BE", b: "#4EA8DE", angle: "145deg" }, // green → light blue
    { a: "#FFD166", b: "#FF7A45", angle: "145deg" }, // yellow → orange
    { a: "#FF4F87", b: "#FF7A45", angle: "145deg" }, // pink → orange
    { a: "#A78BFA", b: "#F472B6", angle: "145deg" }, // purple → pink
    { a: "#2DD4BF", b: "#3B82F6", angle: "145deg" }, // teal → blue
    { a: "#FF8FAB", b: "#C77DFF", angle: "145deg" }, // pink → purple
    { a: "#7BDFF2", b: "#B2F7A1", angle: "145deg" }  // light blue → green
  ];

  function applyRandomTheme() {
    let previousIndex = -1;

    try {
      previousIndex = Number.parseInt(
        localStorage.getItem("crashoutThemeIndex") || "-1",
        10
      );
    } catch {
      previousIndex = -1;
    }

    let themeIndex = secureRandomIndex(THEMES.length);

    if (THEMES.length > 1 && themeIndex === previousIndex) {
      const offset = 1 + secureRandomIndex(THEMES.length - 1);
      themeIndex = (themeIndex + offset) % THEMES.length;
    }

    const theme = THEMES[themeIndex];
    const root = document.documentElement;

    root.style.setProperty("--bg-a", theme.a);
    root.style.setProperty("--bg-b", theme.b);
    root.style.setProperty("--bg-angle", theme.angle);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme.a);

    try {
      localStorage.setItem("crashoutThemeIndex", String(themeIndex));
    } catch {
      // Theme rotation still works when storage is unavailable.
    }
  }

  const effectiveMax = MAX_FINGERS;

  function setStatus(message) {
    statusText.textContent = message;
  }

  function vibrate(pattern) {
    if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }

  function createFinger(pointerId, x, y) {
    const element = document.createElement("div");
    element.className = "finger";
    element.dataset.pointerId = String(pointerId);
    element.style.setProperty("--x", `${x}px`);
    element.style.setProperty("--y", `${y}px`);
    touchLayer.appendChild(element);

    const touch = {
      pointerId,
      x,
      y,
      anchorX: x,
      anchorY: y,
      locked: false,
      element,
      lockTimer: null
    };

    touches.set(pointerId, touch);
    scheduleLock(touch);
    updateStatus();
  }

  function scheduleLock(touch) {
    window.clearTimeout(touch.lockTimer);
    touch.lockTimer = window.setTimeout(() => {
      if (!touches.has(touch.pointerId) || gameState !== "collecting") return;

      touch.locked = true;
      touch.element.classList.add("is-locked");
      vibrate(22);
      updateStatus();
      evaluateReadyState();
    }, LOCK_DELAY_MS);
  }

  function resetFingerLock(touch, x, y) {
    touch.locked = false;
    touch.anchorX = x;
    touch.anchorY = y;
    touch.element.classList.remove("is-locked");
    scheduleLock(touch);
    cancelReadyTimer();
  }

  function moveFinger(pointerId, x, y) {
    const touch = touches.get(pointerId);
    if (!touch || gameState !== "collecting") return;

    touch.x = x;
    touch.y = y;
    touch.element.style.setProperty("--x", `${x}px`);
    touch.element.style.setProperty("--y", `${y}px`);

    if (!touch.locked) {
      const distance = Math.hypot(x - touch.anchorX, y - touch.anchorY);
      if (distance > MOVE_TOLERANCE_PX) {
        resetFingerLock(touch, x, y);
      }
    }
  }

  function removeFinger(pointerId) {
    const touch = touches.get(pointerId);
    if (!touch) return;

    window.clearTimeout(touch.lockTimer);
    touch.element.remove();
    touches.delete(pointerId);

    if (gameState === "selecting") {
      abortSelection("Keep every finger down until the winner is picked");
      return;
    }

    cancelReadyTimer();
    updateStatus();
    evaluateReadyState();
  }

  function updateStatus() {
    if (gameState !== "collecting") return;

    const count = touches.size;
    const lockedCount = [...touches.values()].filter((touch) => touch.locked).length;

    if (count === 0) {
      setStatus("Put 2–5 fingers down");
    } else if (count < MIN_FINGERS) {
      setStatus("Add at least one more finger");
    } else if (lockedCount < count) {
      setStatus(`Hold still · ${lockedCount}/${count} locked`);
    } else {
      setStatus(`${count} locked · choosing victim`);
    }
  }

  function evaluateReadyState() {
    if (gameState !== "collecting") return;

    const activeTouches = [...touches.values()];
    const everyoneLocked =
      activeTouches.length >= MIN_FINGERS &&
      activeTouches.every((touch) => touch.locked);

    if (!everyoneLocked) {
      cancelReadyTimer();
      return;
    }

    if (readyTimer) return;

    readyTimer = window.setTimeout(() => {
      readyTimer = null;

      const stillReady =
        gameState === "collecting" &&
        touches.size >= MIN_FINGERS &&
        [...touches.values()].every((touch) => touch.locked);

      if (stillReady) {
        beginSelection();
      }
    }, READY_DELAY_MS);
  }

  function cancelReadyTimer() {
    if (readyTimer) {
      window.clearTimeout(readyTimer);
      readyTimer = null;
    }
  }

  function secureRandomIndex(length) {
    if (length <= 1) return 0;

    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % length);
    const values = new Uint32Array(1);

    do {
      crypto.getRandomValues(values);
    } while (values[0] >= limit);

    return values[0] % length;
  }

  function beginSelection() {
    gameState = "selecting";
    document.body.classList.add("is-selecting");
    setStatus("Do not lift your finger");
    vibrate([28, 35, 28]);

    const activeTouches = [...touches.values()];
    const winner = activeTouches[secureRandomIndex(activeTouches.length)];

    activeTouches.forEach((touch) => touch.element.classList.add("is-cycling"));

    const revealTimer = window.setTimeout(() => {
      if (gameState !== "selecting") return;

      activeTouches.forEach((touch) => {
        touch.element.classList.remove("is-cycling");

        if (touch.pointerId === winner.pointerId) {
          touch.element.classList.add("is-winner");
        } else {
          touch.element.classList.add("is-eliminated");
        }
      });

      setStatus("CRASHOUT");
      vibrate([45, 45, 90]);

      const expandTimer = window.setTimeout(() => {
        if (gameState !== "selecting") return;
        winner.element.classList.add("is-expanding");

        const promptTimer = window.setTimeout(() => {
          showPrompt();
        }, 380);

        selectionTimers.push(promptTimer);
      }, WINNER_HOLD_MS);

      selectionTimers.push(expandTimer);
    }, SELECTION_DURATION_MS);

    selectionTimers.push(revealTimer);
  }

  function abortSelection(message) {
    selectionTimers.forEach((timer) => window.clearTimeout(timer));
    selectionTimers = [];
    document.body.classList.remove("is-selecting");
    gameState = "collecting";

    touches.forEach((touch) => {
      window.clearTimeout(touch.lockTimer);
      touch.element.remove();
    });
    touches.clear();

    setStatus(message);
    vibrate([25, 35, 25]);

    window.setTimeout(() => {
      if (gameState === "collecting" && touches.size === 0) {
        updateStatus();
      }
    }, 1400);
  }

  function shufflePromptIds(ids) {
    const shuffled = [...ids];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = secureRandomIndex(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index]
      ];
    }

    if (
      shuffled.length > 1 &&
      lastPromptId &&
      shuffled[0] === lastPromptId
    ) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }

    return shuffled;
  }

  function getPromptSignature(prompts) {
    return prompts.map((prompt) => prompt.id).join("|");
  }

  function savePromptDeck() {
    try {
      localStorage.setItem(
        "crashoutPromptDeckIds",
        JSON.stringify(promptDeckIds)
      );
      localStorage.setItem(
        "crashoutPromptDeckSignature",
        promptDeckSignature
      );
      localStorage.setItem(
        "crashoutLastPromptId",
        lastPromptId || ""
      );
    } catch {
      // Storage is optional. The deck still works for the current session.
    }
  }

  function loadPromptDeck(prompts) {
    const availableIds = prompts.map((prompt) => prompt.id);
    const availableIdSet = new Set(availableIds);
    const currentSignature = getPromptSignature(prompts);

    let storedDeck = [];
    let storedSignature = "";
    let storedLastPromptId = null;

    try {
      storedDeck = JSON.parse(
        localStorage.getItem("crashoutPromptDeckIds") || "[]"
      );
      storedSignature =
        localStorage.getItem("crashoutPromptDeckSignature") || "";
      storedLastPromptId =
        localStorage.getItem("crashoutLastPromptId") || null;
    } catch {
      storedDeck = [];
      storedSignature = "";
      storedLastPromptId = null;
    }

    const deckIsValid =
      Array.isArray(storedDeck) &&
      storedSignature === currentSignature &&
      storedDeck.every((id) => availableIdSet.has(id)) &&
      new Set(storedDeck).size === storedDeck.length;

    promptDeckSignature = currentSignature;
    lastPromptId = storedLastPromptId;

    promptDeckIds = deckIsValid
      ? storedDeck
      : shufflePromptIds(availableIds);

    savePromptDeck();
  }

  function choosePrompt() {
    const prompts = Array.isArray(window.CRASHOUT_PROMPTS)
      ? window.CRASHOUT_PROMPTS
      : [];

    if (prompts.length === 0) {
      return {
        id: "fallback",
        text: "The question bank did not load. Refresh and try again.",
        tags: ["fallback"]
      };
    }

    const currentSignature = getPromptSignature(prompts);

    if (
      promptDeckSignature !== currentSignature ||
      promptDeckIds.length === 0
    ) {
      promptDeckSignature = currentSignature;
      promptDeckIds = shufflePromptIds(
        prompts.map((prompt) => prompt.id)
      );
    }

    const promptById = new Map(
      prompts.map((prompt) => [prompt.id, prompt])
    );

    let selectedId = promptDeckIds.shift();
    let selected = promptById.get(selectedId);

    if (!selected) {
      promptDeckIds = shufflePromptIds(
        prompts.map((prompt) => prompt.id)
      );
      selectedId = promptDeckIds.shift();
      selected = promptById.get(selectedId);
    }

    lastPromptId = selectedId;
    savePromptDeck();

    return selected;
  }

  function showPrompt() {
    gameState = "prompt";
    document.body.classList.remove("is-selecting");

    const prompt = choosePrompt();
    promptText.textContent = prompt.text;
    promptScreen.classList.add("is-visible");
    promptScreen.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("is-prompt");

    touches.forEach((touch) => {
      window.clearTimeout(touch.lockTimer);
      touch.element.remove();
    });
    touches.clear();
  }

  function resetRound() {
    selectionTimers.forEach((timer) => window.clearTimeout(timer));
    selectionTimers = [];
    cancelReadyTimer();

    promptScreen.classList.remove("is-visible");
    promptScreen.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("is-prompt");
    document.body.classList.remove("is-selecting");

    touches.forEach((touch) => {
      window.clearTimeout(touch.lockTimer);
      touch.element.remove();
    });
    touches.clear();

    gameState = "collecting";
    updateStatus();
  }

  touchLayer.addEventListener("pointerdown", (event) => {
    if (gameState !== "collecting") return;
    if (touches.has(event.pointerId)) return;

    if (touches.size >= effectiveMax) {
      setStatus("This phone cannot register another finger");
      vibrate(35);
      return;
    }

    event.preventDefault();
    touchLayer.setPointerCapture?.(event.pointerId);
    createFinger(event.pointerId, event.clientX, event.clientY);
  });

  touchLayer.addEventListener("pointermove", (event) => {
    if (!touches.has(event.pointerId)) return;
    event.preventDefault();
    moveFinger(event.pointerId, event.clientX, event.clientY);
  });

  ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
    touchLayer.addEventListener(eventName, (event) => {
      if (!touches.has(event.pointerId)) return;
      event.preventDefault();
      removeFinger(event.pointerId);
    });
  });

  nextRoundButton.addEventListener("click", resetRound);


  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState !== "prompt") {
      abortSelection("Round reset");
    }
  });

  applyRandomTheme();

  const startupPrompts = Array.isArray(window.CRASHOUT_PROMPTS)
    ? window.CRASHOUT_PROMPTS
    : [];
  loadPromptDeck(startupPrompts);

  updateStatus();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {
        // Offline support is optional during local development.
      });
    });
  }
})();
