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
  statTime: document.getElementById("stat-time"),
  statLength: document.getElementById("stat-length"),
  statScore: document.getElementById("stat-score"),
  hostRoomCode: document.getElementById("host-room-code"),
  playerCount: document.getElementById("player-count"),
  foodInput: document.getElementById("food-input"),
  botsInput: document.getElementById("bots-input"),
  countdown: document.getElementById("countdown"),
  dashButton: document.getElementById("dash-button"),
  stickZone: document.getElementById("stick-zone"),
  stickVisual: document.getElementById("stick-visual"),
  stickKnob: document.getElementById("stick-knob"),
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
  settings: {
    foodRate: 5,
    bots: 3,
  },
  foods: [],
  snakes: [],
  hostConnections: new Map(),
  countdownIntervalId: 0,
  qrBounds: { x: 0, y: 0, w: 200, h: 200, vx: 0, vy: 0 },
  qrContainer: document.createElement("div"),
  qrCanvas: null,
  peer: null,
  connection: null,
};

const player = {
  name: "P1",
  bodyColor: "#36f59e",
  outlineColor: "#ffffff",
  score: 0,
  angle: 0,
  dashPressed: false,
  lastSentAngle: Number.NaN,
  lastSentDash: null,
  lastInputAt: 0,
  sendLoopId: 0,
  stickPointerId: null,
  stickCenterX: 0,
  stickCenterY: 0,
  stickRadius: 1,
};

class Snake {
  constructor({ id, name, color, outlineColor, isBot = false, connection = null }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.outlineColor = outlineColor;
    this.isBot = isBot;
    this.connection = connection;
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
    if (event.buttons === 0) {
      dashOff(event);
    }
  });

  dom.stickZone.addEventListener("pointerdown", handleStickDown);
  dom.stickZone.addEventListener("pointermove", handleStickMove);
  dom.stickZone.addEventListener("pointerup", handleStickUp);
  dom.stickZone.addEventListener("pointercancel", handleStickUp);

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
  updateRotateOverlay();
}

function setJoinStatus(message, isError = false) {
  dom.joinStatus.textContent = message;
  dom.joinStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function sanitizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
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
  if (document.fullscreenElement || !root.requestFullscreen) {
    return;
  }
  root.requestFullscreen().catch(() => {});
}

function startHosting() {
  if (app.isHost) {
    return;
  }

  app.isHost = true;
  app.gameState = GAME_STATES.LOBBY;
  app.matchStarted = false;
  app.roomCode = generateRoomCode();
  app.foods = [];
  app.snakes = [];
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
  app.peer.on("error", (error) => {
    console.error("Host peer error", error);
  });
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
  const code = sanitizeRoomCode(dom.roomCodeInput.value);
  const name = sanitizeName(dom.usernameInput.value);

  dom.roomCodeInput.value = code;
  dom.usernameInput.value = name;

  if (code.length !== 5) {
    setJoinStatus("Enter a valid 5 character room code.", true);
    return;
  }

  player.name = name;
  player.bodyColor = dom.bodyColorInput.value;
  player.outlineColor = dom.outlineColorInput.value;
  player.score = 0;
  player.angle = 0;
  player.lastSentAngle = Number.NaN;
  player.lastSentDash = null;

  document.body.classList.add("controller-mode");
  setJoinStatus("Connecting...");
  attemptFullscreen();

  destroyPeer();
  app.peer = new Peer();
  app.peer.on("open", () => {
    app.connection = app.peer.connect(code, { reliable: false, serialization: "json" });
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
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "join") {
    app.hostConnections.set(connection.peer, connection);
    spawnSnake({
      id: connection.peer,
      name: sanitizeName(message.payload?.name),
      color: message.payload?.color || "#36f59e",
      outlineColor: message.payload?.outline || "#ffffff",
      isBot: false,
      connection,
    });
    dom.playerCount.textContent = String(app.hostConnections.size);
    connection.send({ type: "joined" });
    return;
  }

  if (message.type === "input") {
    const snake = app.snakes.find((entry) => entry.id === connection.peer);
    if (!snake || snake.isDead) {
      return;
    }
    snake.targetAngle = Number(message.payload?.angle) || 0;
    snake.isDashing = Boolean(message.payload?.dash);
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
    });
  }
}

function handlePlayerMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "reject") {
    stopInputLoop();
    disconnectPlayer(false);
    setJoinStatus(message.payload?.reason || "Could not join this room.", true);
    setView(VIEWS.JOIN);
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
  document.body.classList.remove("controller-mode");
  player.manualDisconnect = true;
  if (app.connection) {
    try {
      app.connection.close();
    } catch (error) {
      console.error(error);
    }
  }
  destroyPeer();
  if (clearStatus) {
    setJoinStatus("");
  }
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
  if (app.connection && app.connection.open) {
    app.connection.send(message);
  }
}

function startInputLoop() {
  stopInputLoop();
  const tick = (now) => {
    if (app.view === VIEWS.CONTROLLER) {
      const angleChanged = Number.isNaN(player.lastSentAngle) || Math.abs(normalizeAngle(player.angle - player.lastSentAngle)) > 0.02;
      const dashChanged = player.dashPressed !== player.lastSentDash;
      const keepAliveDue = now - player.lastInputAt > 100;

      if (angleChanged || dashChanged || keepAliveDue) {
        sendToHost({
          type: "input",
          payload: {
            angle: Math.round(player.angle * 1000) / 1000,
            dash: player.dashPressed,
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
  if (event.pointerId !== player.stickPointerId) {
    return;
  }
  event.preventDefault();
  updateStick(event.clientX, event.clientY);
}

function handleStickUp(event) {
  if (event.pointerId !== player.stickPointerId) {
    return;
  }
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
  if (!app.isHost || app.matchStarted) {
    return;
  }

  const humanSnakes = app.snakes.filter((snake) => !snake.isBot);
  if (humanSnakes.length === 0) {
    return;
  }

  syncSettingsFromInputs();
  app.matchStarted = true;
  app.gameState = GAME_STATES.COUNTDOWN;
  dom.startButton.disabled = true;
  dom.countdown.classList.remove("hidden");
  dom.countdown.textContent = "5";

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
    spawnSnake({
      id: `bot_${index}`,
      name: `CPU ${index + 1}`,
      color: `hsl(${Math.random() * 360}, 100%, 58%)`,
      outlineColor: "#202020",
      isBot: true,
      connection: null,
    });
  }

  const radius = Math.min(app.viewportWidth, app.viewportHeight) * 0.35;
  const angleStep = (Math.PI * 2) / Math.max(app.snakes.length, 1);
  app.snakes.forEach((snake, index) => {
    snake.x = app.viewportWidth / 2 + Math.cos(angleStep * index) * radius;
    snake.y = app.viewportHeight / 2 + Math.sin(angleStep * index) * radius;
    snake.angle = Math.atan2(app.viewportHeight / 2 - snake.y, app.viewportWidth / 2 - snake.x);
    snake.targetAngle = snake.angle;
    snake.body = [];
    snake.score = 0;
    snake.maxLength = 36;
    snake.maxAchievedLength = 36;
    snake.isDead = false;
    snake.isDashing = false;
    snake.invulnerableMs = 2200;
    snake.timeSpawned = performance.now();
  });

  for (let index = 0; index < 120; index += 1) {
    spawnFood();
  }
}

function spawnSnake({ id, name, color, outlineColor, isBot, connection }) {
  app.snakes = app.snakes.filter((snake) => snake.id !== id);
  app.snakes.push(new Snake({ id, name, color, outlineColor, isBot, connection }));
}

function removeClient(peerId) {
  app.hostConnections.delete(peerId);
  app.snakes = app.snakes.filter((snake) => snake.id !== peerId);
  dom.playerCount.textContent = String(app.hostConnections.size);
}

function spawnFood(x, y, size = Math.random() < 0.12 ? 3 : 1) {
  app.foods.push({
    x: x ?? Math.random() * app.viewportWidth,
    y: y ?? Math.random() * app.viewportHeight,
    size,
    color: `hsl(${Math.random() * 360}, 90%, 68%)`,
  });
}

function killSnake(snake) {
  if (snake.isDead) {
    return;
  }

  snake.isDead = true;
  snake.body.forEach((segment, index) => {
    if (index % 12 === 0) {
      spawnFood(segment.x, segment.y, 2);
    }
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
  if (Math.random() < app.settings.foodRate * 0.015 * dt) {
    spawnFood();
  }

  updateSnakes(dt, true);
  handleFoodCollisions();
  handleBodyCollisions();

  app.snakes = app.snakes.filter((snake) => !snake.isDead || snake.isBot);
}

function updateSnakes(dt, activeGame) {
  app.snakes.forEach((snake) => {
    if (snake.isDead) {
      if (snake.isBot && activeGame) {
        reviveBot(snake, dt);
      }
      return;
    }

    snake.invulnerableMs = Math.max(0, snake.invulnerableMs - 16.6667 * dt);

    if (snake.isBot) {
      updateBot(snake, activeGame);
    }

    const angleDiff = normalizeAngle(snake.targetAngle - snake.angle);
    snake.angle += angleDiff * Math.min(0.22 * dt, 1);

    let speed = 1.4;
    if (activeGame && snake.isDashing && snake.maxLength > 18) {
      speed = 2.6;
      snake.dashDrain += dt;
      if (snake.dashDrain >= 7) {
        snake.dashDrain = 0;
        snake.maxLength = Math.max(18, snake.maxLength - 1);
        const tail = snake.body[snake.body.length - 1];
        if (tail) {
          spawnFood(tail.x, tail.y, 1);
        }
      }
    } else {
      snake.dashDrain = 0;
    }

    snake.x = wrap(snake.x + Math.cos(snake.angle) * speed * dt, app.viewportWidth);
    snake.y = wrap(snake.y + Math.sin(snake.angle) * speed * dt, app.viewportHeight);

    snake.body.unshift({ x: snake.x, y: snake.y });
    while (snake.body.length > snake.maxLength) {
      snake.body.pop();
    }

    if (!activeGame) {
      bumpQr(snake);
    }
  });
}

function updateBot(snake, activeGame) {
  if (!activeGame) {
    if (Math.random() < 0.03) {
      snake.targetAngle += (Math.random() - 0.5) * 0.7;
    }
    return;
  }

  let closestFood = null;
  let closestDistance = Infinity;
  for (const food of app.foods) {
    const distance = wrappedDistance(snake.x, snake.y, food.x, food.y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestFood = food;
    }
  }

  if (closestFood) {
    snake.targetAngle = Math.atan2(closestFood.y - snake.y, closestFood.x - snake.x);
  }
  snake.isDashing = closestDistance < 70 && snake.maxLength > 52;
}

function reviveBot(snake, dt) {
  snake.respawnMs = (snake.respawnMs || 2200) - 16.6667 * dt;
  if (snake.respawnMs > 0) {
    return;
  }

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
}

function bumpQr(snake) {
  if (!app.qrCanvas) {
    return;
  }

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
    if (snake.isDead) {
      return;
    }

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
    if (source.isDead || source.invulnerableMs > 0) {
      continue;
    }

    for (let j = 0; j < app.snakes.length; j += 1) {
      const target = app.snakes[j];
      if (target.isDead || target.id === source.id) {
        continue;
      }

      for (let k = 10; k < target.body.length; k += 1) {
        const segment = target.body[k];
        if (wrappedDistance(source.x, source.y, segment.x, segment.y) < 2.4) {
          killSnake(source);
          break;
        }
      }

      if (source.isDead) {
        break;
      }
    }
  }
}

function drawBackground() {
  ctx.fillStyle = "#040404";
  ctx.fillRect(0, 0, app.viewportWidth, app.viewportHeight);

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
  if (!app.qrCanvas) {
    return;
  }

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
    if (snake.isDead) {
      return;
    }

    const flashing = snake.invulnerableMs > 0 && Math.floor(timestamp / 110) % 2 === 0;
    const fill = flashing ? "#ffffff" : snake.color;
    const stroke = flashing ? "#ffffff" : snake.outlineColor;

    for (let index = snake.body.length - 1; index >= 0; index -= 1) {
      const segment = snake.body[index];
      const previous = index < snake.body.length - 1 ? snake.body[index + 1] : segment;
      if (Math.abs(segment.x - previous.x) > app.viewportWidth / 2 || Math.abs(segment.y - previous.y) > app.viewportHeight / 2) {
        continue;
      }

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
  if (Number.isNaN(value)) {
    return fallback;
  }
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

init();


