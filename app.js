
const GAME_STATES = {
  MENU: "menu",
  LOBBY: "lobby",
  COUNTDOWN: "countdown",
  PLAYING: "playing",
};

const VIEWS = {
  MENU: "menu",
  JOIN: "join",
  CONTROLLER: "controller",
  DEATH: "death",
};

const dom = {
  canvas: document.getElementById("game-canvas"),
  mainMenu: document.getElementById("main-menu"),
  joinScreen: document.getElementById("join-screen"),
  controllerScreen: document.getElementById("controller-screen"),
  deathScreen: document.getElementById("death-screen"),
  rotateOverlay: document.getElementById("rotate-overlay"),
  hostHud: document.getElementById("host-hud"),
  hostCodeCard: document.getElementById("host-code-card"),
  hostLobbyCard: document.getElementById("host-lobby-card"),
  hostButton: document.getElementById("host-button"),
  joinButton: document.getElementById("join-button"),
  backToMenuButton: document.getElementById("back-to-menu-button"),
  connectButton: document.getElementById("connect-button"),
  respawnButton: document.getElementById("respawn-button"),
  deathMenuButton: document.getElementById("death-menu-button"),
  startButton: document.getElementById("start-button"),
  roomCodeInput: document.getElementById("room-code-input"),
  usernameInput: document.getElementById("username-input"),
  bodyColorInput: document.getElementById("body-color-input"),
  outlineColorInput: document.getElementById("outline-color-input"),
  joinStatus: document.getElementById("join-status"),
  mobileScore: document.getElementById("mobile-score"),
  mobileStats: document.getElementById("mobile-stats"),
  statTime: document.getElementById("stat-time"),
  statLength: document.getElementById("stat-length"),
  statScore: document.getElementById("stat-score"),
  hostRoomCode: document.getElementById("host-room-code"),
  playerCount: document.getElementById("player-count"),
  foodInput: document.getElementById("food-input"),
  botsInput: document.getElementById("bots-input"),
  countdown: document.getElementById("countdown"),
  dashZone: document.getElementById("dash-zone"),
  dashButton: document.getElementById("dash-button"),
  stickZone: document.getElementById("stick-zone"),
  stickVisual: document.getElementById("stick-visual"),
  stickKnob: document.getElementById("stick-knob"),
  adminPanel: document.getElementById("admin-panel"),
  adminCloseButton: document.getElementById("admin-close-button"),
  adminStandardSpeed: document.getElementById("admin-standard-speed"),
  adminDashSpeed: document.getElementById("admin-dash-speed"),
  adminDashEnabled: document.getElementById("admin-dash-enabled"),
  adminHideUi: document.getElementById("admin-hide-ui"),
  adminFlatBlack: document.getElementById("admin-flat-black"),
  adminAddBot: document.getElementById("admin-add-bot"),
  adminSnakeList: document.getElementById("admin-snake-list"),
};

const ctx = dom.canvas.getContext("2d", { alpha: false });

const app = {
  isHost: false,
  gameState: GAME_STATES.MENU,
  view: VIEWS.MENU,
  roomCode: "",
  matchStarted: false,
  hostLoopStarted: false,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  dpr: Math.max(window.devicePixelRatio || 1, 1),
  lastFrameTime: 0,
  countdownIntervalId: 0,
  nextBotId: 1,
  settings: {
    foodRate: 5,
    bots: 3,
    normalSpeed: 1.4,
    dashSpeed: 2.6,
    dashEnabled: true,
    hideGameUi: false,
    flatBlack: false,
  },
  foods: [],
  snakes: [],
  hostConnections: new Map(),
  peer: null,
  connection: null,
  qrContainer: document.createElement("div"),
  qrCanvas: null,
  qrBounds: { x: 0, y: 0, w: 200, h: 200, vx: 0, vy: 0 },
};

const player = {
  name: "P1",
  bodyColor: "#36f59e",
  outlineColor: "#ffffff",
  isAdmin: false,
  manualDisconnect: false,
  score: 0,
  angle: 0,
  dashPressed: false,
  dashAllowed: true,
  hideUi: false,
  adminPanelOpen: false,
  lastSentAngle: Number.NaN,
  lastSentDash: null,
  lastInputAt: 0,
  sendLoopId: 0,
  stickPointerId: null,
  stickCenterX: 0,
  stickCenterY: 0,
  stickRadius: 1,
  adminGestureActive: false,
  adminGestureStartY: 0,
};

class Snake {
  constructor({ id, name, color, outlineColor, isBot = false, connection = null, isAdmin = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.outlineColor = outlineColor;
    this.isBot = isBot;
    this.connection = connection;
    this.isAdmin = isAdmin;
    this.x = Math.random() * app.viewportWidth;
    this.y = Math.random() * app.viewportHeight;
    this.angle = Math.random() * Math.PI * 2;
    this.targetAngle = this.angle;
    this.body = [];
    this.maxLength = 36;
    this.maxAchievedLength = 36;
    this.score = 0;
    this.isDead = false;
    this.isDashing = false;
    this.dashDrain = 0;
    this.invulnerableMs = 1800;
    this.timeSpawned = performance.now();
    this.respawnMs = 2200;
    this.botTargetFood = null;
    this.botRetargetMs = 0;
    this.botStallMs = 0;
    this.botLastTargetDistance = Infinity;
    this.botDashCooldownMs = randomRange(1200, 2600);
    this.botDashBurstMs = 0;
    this.botWanderMs = 0;
    this.botWanderAngle = this.angle;
  }
}

function init() {
  bindEvents();
  const initialCode = new URLSearchParams(window.location.search).get("code");
  if (initialCode) {
    dom.roomCodeInput.value = sanitizeRoomCode(initialCode);
    setView(VIEWS.JOIN);
  } else {
    setView(VIEWS.MENU);
  }
  resizeCanvas();
  updateRotateOverlay();
  syncPlayerUiFromConfig();
}

function bindEvents() {
  dom.hostButton.addEventListener("click", startHosting);
  dom.joinButton.addEventListener("click", () => setView(VIEWS.JOIN));
  dom.backToMenuButton.addEventListener("click", () => setView(VIEWS.MENU));
  dom.connectButton.addEventListener("click", connectToHost);
  dom.respawnButton.addEventListener("click", requestRespawn);
  dom.deathMenuButton.addEventListener("click", disconnectPlayer);
  dom.startButton.addEventListener("click", startCountdown);
  dom.foodInput.addEventListener("input", syncSettingsFromInputs);
  dom.botsInput.addEventListener("input", syncSettingsFromInputs);

  const dashOn = (event) => {
    event.preventDefault();
    if (!player.dashAllowed) return;
    player.dashPressed = true;
    dom.dashButton.classList.add("is-active");
  };
  const dashOff = (event) => {
    event.preventDefault();
    player.dashPressed = false;
    dom.dashButton.classList.remove("is-active");
  };

  dom.dashButton.addEventListener("pointerdown", dashOn);
  dom.dashButton.addEventListener("pointerup", dashOff);
  dom.dashButton.addEventListener("pointercancel", dashOff);
  dom.dashButton.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) dashOff(event);
  });

  dom.stickZone.addEventListener("pointerdown", handleStickDown);
  dom.stickZone.addEventListener("pointermove", handleStickMove);
  dom.stickZone.addEventListener("pointerup", handleStickUp);
  dom.stickZone.addEventListener("pointercancel", handleStickUp);

  dom.adminCloseButton.addEventListener("click", closeAdminPanel);
  dom.adminAddBot.addEventListener("click", () => sendAdminMessage({ type: "admin-add-bot" }));
  dom.adminStandardSpeed.addEventListener("input", sendAdminSettings);
  dom.adminDashSpeed.addEventListener("input", sendAdminSettings);
  dom.adminDashEnabled.addEventListener("change", sendAdminSettings);
  dom.adminHideUi.addEventListener("change", sendAdminSettings);
  dom.adminFlatBlack.addEventListener("change", sendAdminSettings);
  dom.adminSnakeList.addEventListener("click", handleAdminListClick);

  document.addEventListener("touchstart", handleAdminGestureStart, { passive: true });
  document.addEventListener("touchmove", handleAdminGestureMove, { passive: true });
  document.addEventListener("touchend", handleAdminGestureEnd, { passive: true });
  document.addEventListener("touchcancel", handleAdminGestureEnd, { passive: true });

  window.addEventListener("resize", () => {
    resizeCanvas();
    updateRotateOverlay();
  });
  window.addEventListener("orientationchange", updateRotateOverlay);
}

function setView(view) {
  app.view = view;
  dom.mainMenu.classList.toggle("hidden", view !== VIEWS.MENU);
  dom.joinScreen.classList.toggle("hidden", view !== VIEWS.JOIN);
  dom.controllerScreen.classList.toggle("hidden", view !== VIEWS.CONTROLLER);
  dom.deathScreen.classList.toggle("hidden", view !== VIEWS.DEATH);
  if (view !== VIEWS.CONTROLLER && view !== VIEWS.DEATH) closeAdminPanel();
  updateRotateOverlay();
}

function setJoinStatus(message, isError = false) {
  dom.joinStatus.textContent = message;
  dom.joinStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function sanitizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function parseRoomEntry(rawValue) {
  const cleaned = sanitizeRoomCode(rawValue);
  const isAdmin = cleaned.endsWith("ADM") && cleaned.length > 5;
  const code = isAdmin ? cleaned.slice(0, -3) : cleaned;
  return { code: code.slice(0, 5), isAdmin };
}

function sanitizeName(value) {
  const cleaned = String(value || "").toUpperCase().replace(/[^A-Z0-9 _-]/g, "").trim().slice(0, 12);
  return cleaned || "P1";
}

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function attemptFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root.requestFullscreen().catch(() => {});
}

function startHosting() {
  if (app.isHost) return;

  app.isHost = true;
  app.gameState = GAME_STATES.LOBBY;
  app.matchStarted = false;
  app.roomCode = generateRoomCode();
  app.foods = [];
  app.snakes = [];
  app.nextBotId = 1;
  syncSettingsFromInputs();

  dom.mainMenu.classList.add("hidden");
  dom.canvas.classList.remove("hidden");
  dom.hostHud.classList.remove("hidden");
  dom.hostRoomCode.textContent = app.roomCode;
  dom.playerCount.textContent = "0";

  createQrCode();
  createHostPeer();
  attemptFullscreen();
  resizeCanvas();
  updateHostHud();

  if (!app.hostLoopStarted) {
    app.hostLoopStarted = true;
    requestAnimationFrame(gameLoop);
  }
}

function syncSettingsFromInputs() {
  app.settings.foodRate = clampNumber(Number(dom.foodInput.value), 1, 10, 5);
  app.settings.bots = clampNumber(Number(dom.botsInput.value), 0, 20, 3);
}

function createQrCode() {
  app.qrContainer.innerHTML = "";
  new QRCode(app.qrContainer, {
    text: `${window.location.origin}${window.location.pathname}?code=${app.roomCode}`,
    width: 200,
    height: 200,
    colorDark: "#000000",
    colorLight: "#ffffff",
  });
  app.qrCanvas = app.qrContainer.querySelector("canvas");
}

function createHostPeer() {
  destroyPeer();
  app.peer = new Peer(app.roomCode);
  app.peer.on("connection", wireHostConnection);
  app.peer.on("error", (error) => console.error("Host peer error", error));
}

function wireHostConnection(connection) {
  connection.on("data", (message) => handleHostMessage(connection, message));
  connection.on("close", () => removeClient(connection.peer));
  connection.on("error", (error) => {
    console.error("Host connection error", error);
    removeClient(connection.peer);
  });
}

function connectToHost() {
  const entry = parseRoomEntry(dom.roomCodeInput.value);
  const name = sanitizeName(dom.usernameInput.value);

  dom.roomCodeInput.value = entry.isAdmin ? `${entry.code}ADM` : entry.code;
  dom.usernameInput.value = name;

  if (entry.code.length !== 5) {
    setJoinStatus("Enter a valid 5 character room code.", true);
    return;
  }

  player.name = name;
  player.bodyColor = dom.bodyColorInput.value;
  player.outlineColor = dom.outlineColorInput.value;
  player.isAdmin = entry.isAdmin;
  player.manualDisconnect = false;
  player.score = 0;
  player.angle = 0;
  player.dashPressed = false;
  player.lastSentAngle = Number.NaN;
  player.lastSentDash = null;

  document.body.classList.add("controller-mode");
  setJoinStatus("Connecting...");
  attemptFullscreen();

  destroyPeer();
  app.peer = new Peer();
  app.peer.on("open", () => {
    app.connection = app.peer.connect(entry.code, { reliable: false, serialization: "json" });
    wirePlayerConnection();
  });
  app.peer.on("error", (error) => {
    console.error("Player peer error", error);
    setJoinStatus("Could not connect to the room.", true);
  });
}

function wirePlayerConnection() {
  app.connection.on("open", () => {
    sendToHost({
      type: "join",
      payload: {
        name: player.name,
        color: player.bodyColor,
        outline: player.outlineColor,
        admin: player.isAdmin,
      },
    });
    dom.mobileScore.textContent = "0";
    setJoinStatus("Connected.");
    setView(VIEWS.CONTROLLER);
    startInputLoop();
  });

  app.connection.on("data", handlePlayerMessage);
  app.connection.on("close", () => {
    stopInputLoop();
    document.body.classList.remove("controller-mode");
    if (player.manualDisconnect) {
      player.manualDisconnect = false;
      return;
    }
    setJoinStatus("Disconnected from host.", true);
    setView(VIEWS.JOIN);
  });
  app.connection.on("error", (error) => {
    console.error("Player connection error", error);
    setJoinStatus("Connection failed.", true);
  });
}
function handleHostMessage(connection, message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "join") {
    app.hostConnections.set(connection.peer, connection);
    const snake = spawnSnake({
      id: connection.peer,
      name: sanitizeName(message.payload?.name),
      color: message.payload?.color || "#36f59e",
      outlineColor: message.payload?.outline || "#ffffff",
      isBot: false,
      connection,
      isAdmin: Boolean(message.payload?.admin),
    });

    if (app.gameState === GAME_STATES.PLAYING) {
      snake.invulnerableMs = 2400;
      snake.body = [];
      snake.timeSpawned = performance.now();
    }

    dom.playerCount.textContent = String(app.hostConnections.size);
    connection.send({
      type: "joined",
      payload: {
        isAdmin: snake.isAdmin,
        config: playerConfigPayload(),
      },
    });
    sendAdminSnapshots();
    return;
  }

  if (message.type === "input") {
    const snake = app.snakes.find((entry) => entry.id === connection.peer);
    if (!snake || snake.isDead) return;
    snake.targetAngle = Number(message.payload?.angle) || 0;
    snake.isDashing = app.settings.dashEnabled && Boolean(message.payload?.dash);
    return;
  }

  if (message.type === "respawn") {
    spawnSnake({
      id: connection.peer,
      name: sanitizeName(message.payload?.name),
      color: message.payload?.color || "#36f59e",
      outlineColor: message.payload?.outline || "#ffffff",
      isBot: false,
      connection,
      isAdmin: isAdminConnection(connection.peer),
    });
    sendAdminSnapshots();
    return;
  }

  if (message.type === "admin-update-settings" && isAdminConnection(connection.peer)) {
    applyAdminSettings(message.payload || {});
    return;
  }

  if (message.type === "admin-remove-snake" && isAdminConnection(connection.peer)) {
    removeSnakeById(message.payload?.id);
    return;
  }

  if (message.type === "admin-add-bot" && isAdminConnection(connection.peer)) {
    addBot();
  }
}

function handlePlayerMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "joined") {
    player.isAdmin = Boolean(message.payload?.isAdmin);
    applyRemotePlayerConfig(message.payload?.config);
    return;
  }

  if (message.type === "config") {
    applyRemotePlayerConfig(message.payload);
    return;
  }

  if (message.type === "admin-state" && player.isAdmin) {
    applyAdminSnapshot(message.payload);
    return;
  }

  if (message.type === "score") {
    player.score = message.payload?.score || 0;
    dom.mobileScore.textContent = String(player.score);
    return;
  }

  if (message.type === "death") {
    stopInputLoop();
    dom.statTime.textContent = `${message.payload?.time || 0}s`;
    dom.statLength.textContent = String(message.payload?.maxLen || 0);
    dom.statScore.textContent = String(message.payload?.score || 0);
    setView(VIEWS.DEATH);
  }
}

function requestRespawn() {
  if (!app.connection || !app.connection.open) {
    setJoinStatus("The host is no longer available.", true);
    setView(VIEWS.JOIN);
    return;
  }

  sendToHost({
    type: "respawn",
    payload: {
      name: player.name,
      color: player.bodyColor,
      outline: player.outlineColor,
    },
  });
  dom.mobileScore.textContent = "0";
  setView(VIEWS.CONTROLLER);
  startInputLoop();
}

function disconnectPlayer(clearStatus = true) {
  stopInputLoop();
  player.manualDisconnect = true;
  player.adminPanelOpen = false;
  document.body.classList.remove("controller-mode");
  if (app.connection) {
    try {
      app.connection.close();
    } catch (error) {
      console.error(error);
    }
  }
  destroyPeer();
  if (clearStatus) setJoinStatus("");
  closeAdminPanel();
  setView(VIEWS.MENU);
}

function destroyPeer() {
  if (app.peer) {
    try {
      app.peer.destroy();
    } catch (error) {
      console.error(error);
    }
  }
  app.peer = null;
  app.connection = null;
  app.hostConnections.clear();
}

function sendToHost(message) {
  if (app.connection && app.connection.open) app.connection.send(message);
}

function sendAdminMessage(message) {
  if (!player.isAdmin || !app.connection || !app.connection.open) return;
  app.connection.send(message);
}

function startInputLoop() {
  stopInputLoop();
  const tick = (now) => {
    if (app.view === VIEWS.CONTROLLER && !player.adminPanelOpen) {
      const angleChanged = Number.isNaN(player.lastSentAngle) || Math.abs(normalizeAngle(player.angle - player.lastSentAngle)) > 0.02;
      const dashChanged = player.dashPressed !== player.lastSentDash;
      const keepAliveDue = now - player.lastInputAt > 100;

      if (angleChanged || dashChanged || keepAliveDue) {
        sendToHost({
          type: "input",
          payload: {
            angle: round3(player.angle),
            dash: player.dashPressed && player.dashAllowed,
          },
        });
        player.lastInputAt = now;
        player.lastSentAngle = player.angle;
        player.lastSentDash = player.dashPressed;
      }
    }
    player.sendLoopId = requestAnimationFrame(tick);
  };

  player.sendLoopId = requestAnimationFrame(tick);
}

function stopInputLoop() {
  if (player.sendLoopId) {
    cancelAnimationFrame(player.sendLoopId);
    player.sendLoopId = 0;
  }
}

function handleStickDown(event) {
  event.preventDefault();
  player.stickPointerId = event.pointerId;
  dom.stickZone.setPointerCapture(event.pointerId);
  cacheStickMetrics();
  updateStick(event.clientX, event.clientY);
}

function handleStickMove(event) {
  if (event.pointerId !== player.stickPointerId) return;
  event.preventDefault();
  updateStick(event.clientX, event.clientY);
}

function handleStickUp(event) {
  if (event.pointerId !== player.stickPointerId) return;
  event.preventDefault();
  player.stickPointerId = null;
  dom.stickKnob.style.transform = "translate(-50%, -50%)";
}

function cacheStickMetrics() {
  const rect = dom.stickVisual.getBoundingClientRect();
  player.stickCenterX = rect.left + rect.width / 2;
  player.stickCenterY = rect.top + rect.height / 2;
  player.stickRadius = rect.width * 0.33;
}

function updateStick(clientX, clientY) {
  const dx = clientX - player.stickCenterX;
  const dy = clientY - player.stickCenterY;
  const distance = Math.hypot(dx, dy) || 1;
  const ratio = Math.min(1, player.stickRadius / distance);
  const x = dx * ratio;
  const y = dy * ratio;
  player.angle = Math.atan2(y, x);
  dom.stickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function startCountdown() {
  if (!app.isHost || app.matchStarted) return;
  const humanSnakes = app.snakes.filter((snake) => !snake.isBot);
  if (humanSnakes.length === 0) return;

  syncSettingsFromInputs();
  app.matchStarted = true;
  app.gameState = GAME_STATES.COUNTDOWN;
  dom.startButton.disabled = true;
  dom.countdown.classList.remove("hidden");
  dom.countdown.textContent = "5";
  updateHostHud();

  let count = 5;
  clearInterval(app.countdownIntervalId);
  app.countdownIntervalId = window.setInterval(() => {
    count -= 1;
    if (count > 0) {
      dom.countdown.textContent = String(count);
      return;
    }

    clearInterval(app.countdownIntervalId);
    dom.countdown.classList.add("hidden");
    beginMatch();
  }, 1000);
}

function beginMatch() {
  app.gameState = GAME_STATES.PLAYING;
  app.foods = [];
  app.snakes = app.snakes.filter((snake) => !snake.isBot);

  for (let index = 0; index < app.settings.bots; index += 1) {
    addBot(false);
  }

  app.snakes.forEach((snake) => {
    snake.body = [];
    snake.score = 0;
    snake.maxLength = 36;
    snake.maxAchievedLength = 36;
    snake.isDead = false;
    snake.isDashing = false;
    snake.invulnerableMs = 2200;
    snake.timeSpawned = performance.now();
  });

  for (let index = 0; index < 120; index += 1) spawnFood();

  updateHostHud();
  broadcastPlayerConfig();
  sendAdminSnapshots();
}

function spawnSnake({ id, name, color, outlineColor, isBot = false, connection = null, isAdmin = false }) {
  app.snakes = app.snakes.filter((snake) => snake.id !== id);
  const snake = new Snake({ id, name, color, outlineColor, isBot, connection, isAdmin });
  app.snakes.push(snake);
  return snake;
}

function addBot(refreshAdmin = true) {
  const botId = `bot_${app.nextBotId++}`;
  spawnSnake({
    id: botId,
    name: `CPU ${botId.split("_")[1]}`,
    color: `hsl(${Math.random() * 360}, 100%, 58%)`,
    outlineColor: "#202020",
    isBot: true,
  });
  if (refreshAdmin) sendAdminSnapshots();
}

function removeClient(peerId) {
  app.hostConnections.delete(peerId);
  app.snakes = app.snakes.filter((snake) => snake.id !== peerId);
  dom.playerCount.textContent = String(app.hostConnections.size);
  sendAdminSnapshots();
}

function removeSnakeById(id) {
  if (!id) return;
  const snake = app.snakes.find((entry) => entry.id === id);
  if (!snake) return;

  if (!snake.isBot && snake.connection?.open) {
    try {
      snake.connection.close();
    } catch (error) {
      console.error(error);
    }
  }

  app.snakes = app.snakes.filter((entry) => entry.id !== id);
  app.hostConnections.delete(id);
  dom.playerCount.textContent = String(app.hostConnections.size);
  sendAdminSnapshots();
}

function spawnFood(x, y, size = Math.random() < 0.12 ? 3 : 1) {
  app.foods.push({
    id: `food_${Math.random().toString(36).slice(2, 9)}`,
    x: x ?? Math.random() * app.viewportWidth,
    y: y ?? Math.random() * app.viewportHeight,
    size,
    color: `hsl(${Math.random() * 360}, 90%, 68%)`,
  });
}

function killSnake(snake) {
  if (snake.isDead) return;
  snake.isDead = true;
  snake.body.forEach((segment, index) => {
    if (index % 12 === 0) spawnFood(segment.x, segment.y, 2);
  });

  if (!snake.isBot && snake.connection?.open) {
    snake.connection.send({
      type: "death",
      payload: {
        time: Math.max(1, Math.round((performance.now() - snake.timeSpawned) / 1000)),
        maxLen: snake.maxAchievedLength,
        score: snake.score,
      },
    });
  }

  sendAdminSnapshots();
}
function gameLoop(timestamp) {
  const dt = Math.min(((timestamp - app.lastFrameTime) / 16.6667) || 1, 2);
  app.lastFrameTime = timestamp;

  drawBackground();

  if (app.gameState === GAME_STATES.LOBBY || app.gameState === GAME_STATES.COUNTDOWN) {
    drawQr();
    updateSnakes(dt, false);
  }

  if (app.gameState === GAME_STATES.PLAYING) {
    updatePlayingState(dt);
  }

  drawFoods();
  drawSnakes(timestamp);
  requestAnimationFrame(gameLoop);
}

function updatePlayingState(dt) {
  if (Math.random() < app.settings.foodRate * 0.015 * dt) spawnFood();
  updateSnakes(dt, true);
  handleFoodCollisions();
  handleBodyCollisions();
}

function updateSnakes(dt, activeGame) {
  const frameMs = 16.6667 * dt;
  app.snakes.forEach((snake) => {
    if (snake.isDead) {
      if (snake.isBot && activeGame) reviveBot(snake, frameMs);
      return;
    }

    snake.invulnerableMs = Math.max(0, snake.invulnerableMs - frameMs);
    if (snake.isBot) updateBot(snake, activeGame, frameMs);
    if (!app.settings.dashEnabled) snake.isDashing = false;

    const turnRate = snake.isDashing ? 0.085 : 0.12;
    const maxTurn = turnRate * dt;
    const angleDiff = normalizeAngle(snake.targetAngle - snake.angle);
    snake.angle += clampNumber(angleDiff, -maxTurn, maxTurn, 0);

    let speed = app.settings.normalSpeed;
    if (activeGame && app.settings.dashEnabled && snake.isDashing && snake.maxLength > 18) {
      speed = app.settings.dashSpeed;
      snake.dashDrain += dt;
      if (snake.dashDrain >= 7) {
        snake.dashDrain = 0;
        snake.maxLength = Math.max(18, snake.maxLength - 1);
        const tail = snake.body[snake.body.length - 1];
        if (tail) spawnFood(tail.x, tail.y, 1);
      }
    } else {
      snake.dashDrain = 0;
    }

    snake.x = wrap(snake.x + Math.cos(snake.angle) * speed * dt, app.viewportWidth);
    snake.y = wrap(snake.y + Math.sin(snake.angle) * speed * dt, app.viewportHeight);
    snake.body.unshift({ x: snake.x, y: snake.y });
    while (snake.body.length > snake.maxLength) snake.body.pop();

    if (!activeGame) bumpQr(snake);
  });
}

function updateBot(snake, activeGame, frameMs) {
  snake.botDashCooldownMs = Math.max(0, snake.botDashCooldownMs - frameMs);
  snake.botDashBurstMs = Math.max(0, snake.botDashBurstMs - frameMs);
  snake.botRetargetMs = Math.max(0, snake.botRetargetMs - frameMs);
  snake.botWanderMs = Math.max(0, snake.botWanderMs - frameMs);

  if (!activeGame) {
    if (snake.botWanderMs <= 0) {
      snake.botWanderAngle += (Math.random() - 0.5) * 1.0;
      snake.botWanderMs = randomRange(300, 900);
    }
    snake.targetAngle = snake.botWanderAngle;
    snake.isDashing = false;
    return;
  }

  if (!snake.botTargetFood || snake.botRetargetMs <= 0) {
    snake.botTargetFood = pickBotFoodTarget(snake);
    snake.botRetargetMs = randomRange(240, 480);
    snake.botStallMs = 0;
    snake.botLastTargetDistance = Infinity;
  }

  const targetFood = app.foods.find((food) => food.id === snake.botTargetFood);
  if (!targetFood) {
    snake.botTargetFood = null;
    snake.targetAngle = snake.angle;
    snake.isDashing = false;
    return;
  }

  const desiredAngle = Math.atan2(targetFood.y - snake.y, targetFood.x - snake.x);
  const angleToFood = Math.abs(normalizeAngle(desiredAngle - snake.angle));
  const distanceToFood = wrappedDistance(snake.x, snake.y, targetFood.x, targetFood.y);

  if (distanceToFood >= snake.botLastTargetDistance - 1) snake.botStallMs += frameMs;
  else snake.botStallMs = Math.max(0, snake.botStallMs - frameMs * 0.5);
  snake.botLastTargetDistance = distanceToFood;

  if ((distanceToFood < 34 && angleToFood > 0.65) || snake.botStallMs > 700) {
    snake.botTargetFood = pickBotFoodTarget(snake, targetFood.id);
    snake.botRetargetMs = randomRange(220, 420);
    snake.botStallMs = 0;
    snake.botLastTargetDistance = Infinity;
    snake.botWanderAngle += (Math.random() - 0.5) * 1.5;
  }

  snake.targetAngle = targetFood ? desiredAngle : snake.botWanderAngle;

  if (
    app.settings.dashEnabled &&
    snake.botDashBurstMs <= 0 &&
    snake.botDashCooldownMs <= 0 &&
    distanceToFood > 90 &&
    distanceToFood < 220 &&
    angleToFood < 0.16 &&
    Math.random() < 0.02 * dtMultiplier(frameMs)
  ) {
    snake.botDashBurstMs = randomRange(180, 320);
    snake.botDashCooldownMs = randomRange(1600, 3200);
  }

  snake.isDashing = snake.botDashBurstMs > 0;
}

function pickBotFoodTarget(snake, excludedId = "") {
  let bestFood = null;
  let bestScore = Infinity;

  for (const food of app.foods) {
    if (food.id === excludedId) continue;
    const distance = wrappedDistance(snake.x, snake.y, food.x, food.y);
    const angle = Math.abs(normalizeAngle(Math.atan2(food.y - snake.y, food.x - snake.x) - snake.angle));
    if (distance < 28 && angle > 0.7) continue;
    const score = distance + angle * 120 + (angle > 1.2 ? 120 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestFood = food;
    }
  }

  return bestFood ? bestFood.id : null;
}

function reviveBot(snake, frameMs) {
  snake.respawnMs -= frameMs;
  if (snake.respawnMs > 0) return;
  snake.isDead = false;
  snake.respawnMs = 2200;
  snake.x = Math.random() * app.viewportWidth;
  snake.y = Math.random() * app.viewportHeight;
  snake.angle = Math.random() * Math.PI * 2;
  snake.targetAngle = snake.angle;
  snake.body = [];
  snake.maxLength = 36;
  snake.maxAchievedLength = 36;
  snake.score = 0;
  snake.invulnerableMs = 1800;
  snake.botTargetFood = null;
  snake.botStallMs = 0;
  snake.botLastTargetDistance = Infinity;
  sendAdminSnapshots();
}

function bumpQr(snake) {
  if (!app.qrCanvas) return;

  let testX = snake.x;
  let testY = snake.y;
  if (snake.x < app.qrBounds.x) testX = app.qrBounds.x;
  else if (snake.x > app.qrBounds.x + app.qrBounds.w) testX = app.qrBounds.x + app.qrBounds.w;
  if (snake.y < app.qrBounds.y) testY = app.qrBounds.y;
  else if (snake.y > app.qrBounds.y + app.qrBounds.h) testY = app.qrBounds.y + app.qrBounds.h;

  if (Math.hypot(snake.x - testX, snake.y - testY) < 4) {
    app.qrBounds.vx += Math.cos(snake.angle) * 1.6;
    app.qrBounds.vy += Math.sin(snake.angle) * 1.6;
  }
}

function handleFoodCollisions() {
  app.snakes.forEach((snake) => {
    if (snake.isDead) return;

    for (let index = app.foods.length - 1; index >= 0; index -= 1) {
      const food = app.foods[index];
      if (wrappedDistance(snake.x, snake.y, food.x, food.y) < 4 + food.size) {
        snake.maxLength += food.size > 2 ? 6 : 2;
        snake.maxAchievedLength = Math.max(snake.maxAchievedLength, snake.maxLength);
        snake.score += food.size > 2 ? 5 : 1;
        app.foods.splice(index, 1);
        if (!snake.isBot && snake.connection?.open) {
          snake.connection.send({ type: "score", payload: { score: snake.score } });
        }
      }
    }
  });
}

function handleBodyCollisions() {
  for (let i = 0; i < app.snakes.length; i += 1) {
    const source = app.snakes[i];
    if (source.isDead || source.invulnerableMs > 0) continue;

    for (let j = 0; j < app.snakes.length; j += 1) {
      const target = app.snakes[j];
      if (target.isDead || target.id === source.id) continue;

      for (let k = 10; k < target.body.length; k += 1) {
        const segment = target.body[k];
        if (wrappedDistance(source.x, source.y, segment.x, segment.y) < 2.4) {
          killSnake(source);
          break;
        }
      }

      if (source.isDead) break;
    }
  }
}

function drawBackground() {
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, app.viewportWidth, app.viewportHeight);
  if (app.settings.flatBlack) return;

  const gap = 28;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x < app.viewportWidth; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, app.viewportHeight);
    ctx.stroke();
  }
  for (let y = 0; y < app.viewportHeight; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(app.viewportWidth, y + 0.5);
    ctx.stroke();
  }
}

function drawQr() {
  if (!app.qrCanvas) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(app.qrBounds.x - 8, app.qrBounds.y - 8, app.qrBounds.w + 16, app.qrBounds.h + 16);
  ctx.drawImage(app.qrCanvas, app.qrBounds.x, app.qrBounds.y, app.qrBounds.w, app.qrBounds.h);

  app.qrBounds.x += app.qrBounds.vx;
  app.qrBounds.y += app.qrBounds.vy;
  app.qrBounds.vx *= 0.92;
  app.qrBounds.vy *= 0.92;

  if (app.qrBounds.x < 0) {
    app.qrBounds.x = 0;
    app.qrBounds.vx *= -1;
  }
  if (app.qrBounds.x + app.qrBounds.w > app.viewportWidth) {
    app.qrBounds.x = app.viewportWidth - app.qrBounds.w;
    app.qrBounds.vx *= -1;
  }
  if (app.qrBounds.y < 0) {
    app.qrBounds.y = 0;
    app.qrBounds.vy *= -1;
  }
  if (app.qrBounds.y + app.qrBounds.h > app.viewportHeight) {
    app.qrBounds.y = app.viewportHeight - app.qrBounds.h;
    app.qrBounds.vy *= -1;
  }
}

function drawFoods() {
  app.foods.forEach((food) => {
    ctx.fillStyle = food.color;
    ctx.beginPath();
    ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSnakes(timestamp) {
  app.snakes.forEach((snake) => {
    if (snake.isDead) return;

    const flashing = snake.invulnerableMs > 0 && Math.floor(timestamp / 110) % 2 === 0;
    const fill = flashing ? "#ffffff" : snake.color;
    const stroke = flashing ? "#ffffff" : snake.outlineColor;

    for (let index = snake.body.length - 1; index >= 0; index -= 1) {
      const segment = snake.body[index];
      const previous = index < snake.body.length - 1 ? snake.body[index + 1] : segment;
      if (Math.abs(segment.x - previous.x) > app.viewportWidth / 2 || Math.abs(segment.y - previous.y) > app.viewportHeight / 2) continue;
      ctx.beginPath();
      ctx.arc(segment.x, segment.y, 1.35, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(snake.x, snake.y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    if (app.gameState === GAME_STATES.PLAYING) {
      ctx.fillStyle = "#ffffff";
      ctx.font = '8px "Press Start 2P"';
      ctx.textAlign = "center";
      ctx.fillText(snake.name, Math.round(snake.x), Math.round(snake.y) - 10);
    }
  });
}
function updateHostHud() {
  const uiHidden = app.settings.hideGameUi;
  dom.hostHud.classList.toggle("hidden", uiHidden);
  dom.hostLobbyCard.classList.toggle("hidden", app.gameState !== GAME_STATES.LOBBY);
  dom.hostHud.classList.toggle("single-card", app.gameState !== GAME_STATES.LOBBY);
}

function playerConfigPayload() {
  return {
    dashEnabled: app.settings.dashEnabled,
    hideUi: app.settings.hideGameUi,
  };
}

function broadcastPlayerConfig() {
  const payload = playerConfigPayload();
  for (const connection of app.hostConnections.values()) {
    if (connection.open) connection.send({ type: "config", payload });
  }
}

function applyRemotePlayerConfig(payload) {
  player.dashAllowed = payload?.dashEnabled !== false;
  player.hideUi = Boolean(payload?.hideUi);
  if (!player.dashAllowed) {
    player.dashPressed = false;
    dom.dashButton.classList.remove("is-active");
  }
  syncPlayerUiFromConfig();
}

function syncPlayerUiFromConfig() {
  dom.dashZone.classList.toggle("hidden", !player.dashAllowed);
  dom.mobileStats.classList.toggle("hidden", player.hideUi);
}

function applyAdminSettings(partial) {
  app.settings.normalSpeed = clampNumber(Number(partial.normalSpeed ?? app.settings.normalSpeed), 0.6, 3.2, app.settings.normalSpeed);
  app.settings.dashSpeed = clampNumber(Number(partial.dashSpeed ?? app.settings.dashSpeed), 1.2, 4.4, app.settings.dashSpeed);
  app.settings.dashEnabled = Boolean(partial.dashEnabled ?? app.settings.dashEnabled);
  app.settings.hideGameUi = Boolean(partial.hideGameUi ?? app.settings.hideGameUi);
  app.settings.flatBlack = Boolean(partial.flatBlack ?? app.settings.flatBlack);
  updateHostHud();
  broadcastPlayerConfig();
  sendAdminSnapshots();
}

function sendAdminSettings() {
  sendAdminMessage({
    type: "admin-update-settings",
    payload: {
      normalSpeed: dom.adminStandardSpeed.value,
      dashSpeed: dom.adminDashSpeed.value,
      dashEnabled: dom.adminDashEnabled.checked,
      hideGameUi: dom.adminHideUi.checked,
      flatBlack: dom.adminFlatBlack.checked,
    },
  });
}

function isAdminConnection(peerId) {
  const snake = app.snakes.find((entry) => entry.id === peerId);
  return Boolean(snake?.isAdmin);
}

function sendAdminSnapshots() {
  const payload = {
    settings: {
      normalSpeed: app.settings.normalSpeed,
      dashSpeed: app.settings.dashSpeed,
      dashEnabled: app.settings.dashEnabled,
      hideGameUi: app.settings.hideGameUi,
      flatBlack: app.settings.flatBlack,
    },
    snakes: app.snakes.filter((snake) => !snake.isDead).map((snake) => ({ id: snake.id, name: snake.name, isBot: snake.isBot })),
  };

  for (const snake of app.snakes) {
    if (!snake.isAdmin || !snake.connection?.open) continue;
    snake.connection.send({ type: "admin-state", payload });
  }
}

function applyAdminSnapshot(snapshot) {
  if (!snapshot) return;
  dom.adminStandardSpeed.value = String(snapshot.settings?.normalSpeed ?? app.settings.normalSpeed);
  dom.adminDashSpeed.value = String(snapshot.settings?.dashSpeed ?? app.settings.dashSpeed);
  dom.adminDashEnabled.checked = snapshot.settings?.dashEnabled !== false;
  dom.adminHideUi.checked = Boolean(snapshot.settings?.hideGameUi);
  dom.adminFlatBlack.checked = Boolean(snapshot.settings?.flatBlack);
  renderAdminSnakeList(snapshot.snakes || []);
}

function renderAdminSnakeList(snakes) {
  dom.adminSnakeList.innerHTML = "";
  snakes.forEach((snake) => {
    const row = document.createElement("div");
    row.className = "admin-snake-row";

    const meta = document.createElement("div");
    meta.className = "admin-snake-meta";
    const name = document.createElement("p");
    name.className = "admin-snake-name";
    name.textContent = snake.name;
    const kind = document.createElement("p");
    kind.className = "admin-snake-kind";
    kind.textContent = snake.isBot ? "Bot" : "Player";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button-secondary admin-remove";
    button.textContent = "Remove";
    button.dataset.snakeId = snake.id;

    meta.append(name, kind);
    row.append(meta, button);
    dom.adminSnakeList.append(row);
  });
}

function handleAdminListClick(event) {
  const button = event.target.closest("button[data-snake-id]");
  if (!button) return;
  sendAdminMessage({ type: "admin-remove-snake", payload: { id: button.dataset.snakeId } });
}

function handleAdminGestureStart(event) {
  if (!player.isAdmin) return;
  if (app.view !== VIEWS.CONTROLLER && app.view !== VIEWS.DEATH) return;
  if (event.touches.length === 2) {
    player.adminGestureActive = true;
    player.adminGestureStartY = averageTouchY(event.touches);
  }
}

function handleAdminGestureMove(event) {
  if (!player.adminGestureActive || event.touches.length !== 2) return;
  const delta = averageTouchY(event.touches) - player.adminGestureStartY;
  if (delta > 70) {
    openAdminPanel();
    player.adminGestureActive = false;
  }
}

function handleAdminGestureEnd() {
  player.adminGestureActive = false;
}

function averageTouchY(touches) {
  return (touches[0].clientY + touches[1].clientY) / 2;
}

function openAdminPanel() {
  if (!player.isAdmin) return;
  player.adminPanelOpen = true;
  dom.adminPanel.classList.remove("hidden");
}

function closeAdminPanel() {
  player.adminPanelOpen = false;
  dom.adminPanel.classList.add("hidden");
}

function resizeCanvas() {
  app.viewportWidth = window.innerWidth;
  app.viewportHeight = window.innerHeight;
  app.dpr = Math.max(window.devicePixelRatio || 1, 1);

  dom.canvas.width = Math.floor(app.viewportWidth * app.dpr);
  dom.canvas.height = Math.floor(app.viewportHeight * app.dpr);
  dom.canvas.style.width = `${app.viewportWidth}px`;
  dom.canvas.style.height = `${app.viewportHeight}px`;
  ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);

  app.qrBounds.x = app.viewportWidth / 2 - app.qrBounds.w / 2;
  app.qrBounds.y = app.viewportHeight / 2 - app.qrBounds.h / 2;
  cacheStickMetrics();
}

function updateRotateOverlay() {
  const isController = app.view === VIEWS.CONTROLLER;
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  dom.rotateOverlay.classList.toggle("hidden", !(isController && isPortrait));
}

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function wrap(value, max) {
  if (value < 0) return value + max;
  if (value > max) return value - max;
  return value;
}

function normalizeAngle(value) {
  let angle = value;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function wrappedDistance(ax, ay, bx, by) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > app.viewportWidth / 2) dx = app.viewportWidth - dx;
  if (dy > app.viewportHeight / 2) dy = app.viewportHeight - dy;
  return Math.hypot(dx, dy);
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function dtMultiplier(frameMs) {
  return frameMs / 16.6667;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

init();
