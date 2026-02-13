// 使用全局 PIXI 对象

// 生成或获取 token
function getOrCreateToken() {
  let token = localStorage.getItem('blackhole_token');
  if (!token) {
    token = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem('blackhole_token', token);
  }
  return token;
}

// 游戏状态
const gameState = {
  connected: false,
  playerId: null,
  nickname: '',
  token: getOrCreateToken(),
  players: new Map(),
  food: [],
  blackholes: [],
  magnets: [],
  viewport: { x: 0, y: 0 },
  camera: { x: 0, y: 0 },
  magnetActive: false,
  magnetTimer: 0,
  vectors: [],
  selectedVector: null
};

// PixiJS 应用
const app = new PIXI.Application();
let socket = null;
let playerSprite = null;
let foodSprites = new Map();
let playerSprites = new Map();
let magnetSprites = new Map();
let magnetTimerText = null;

// 初始化游戏
async function init() {
  // 获取向量图列表
  await loadVectors();

  // 创建应用
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0f,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
  });

  document.getElementById('game-container').appendChild(app.canvas);

  // 绘制网格背景
  drawGrid();

  // 事件监听
  setupEventListeners();

  // 窗口大小调整
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
  });

  // 检查是否有保存的昵称
  const savedNickname = localStorage.getItem('blackhole_nickname');
  if (savedNickname) {
    document.getElementById('nickname').value = savedNickname;
  }
}

// 加载向量图列表
async function loadVectors() {
  try {
    const response = await fetch('/api/vectors');
    if (response.ok) {
      gameState.vectors = await response.json();
      if (gameState.vectors.length > 0) {
        showVectorSelector();
      }
    }
  } catch (err) {
    console.log('无法加载向量图列表:', err.message);
  }
}

// 显示向量图选择器
function showVectorSelector() {
  // 如果已经有选择的向量图，直接返回
  const savedVector = localStorage.getItem('blackhole_vector');
  if (savedVector) {
    gameState.selectedVector = savedVector;
    return;
  }

  // 在登录界面添加向量图选择
  const loginScreen = document.getElementById('login-screen');
  const vectorContainer = document.createElement('div');
  vectorContainer.id = 'vector-selector';
  vectorContainer.style.cssText = 'display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 400px; margin: 1rem 0;';

  gameState.vectors.forEach(vector => {
    const btn = document.createElement('button');
    btn.textContent = vector.name;
    btn.style.cssText = 'padding: 0.5rem 1rem; border: 2px solid #8a2be2; border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; transition: all 0.3s;';
    btn.onclick = () => selectVector(vector, btn);
    vectorContainer.appendChild(btn);
  });

  // 插入到 nickname input 之前
  const nicknameInput = document.getElementById('nickname');
  loginScreen.insertBefore(vectorContainer, nicknameInput);
}

// 选择向量图
function selectVector(vector, btn) {
  gameState.selectedVector = vector.path;
  localStorage.setItem('blackhole_vector', vector.path);

  // 高亮选中的按钮
  document.querySelectorAll('#vector-selector button').forEach(b => {
    b.style.borderColor = '#8a2be2';
    b.style.background = 'rgba(255,255,255,0.1)';
  });
  btn.style.borderColor = '#da70d6';
  btn.style.background = 'rgba(218,112,214,0.3)';
}

// 绘制网格背景
function drawGrid() {
  const graphics = new PIXI.Graphics();

  const gridSize = 50;
  const mapWidth = 4000;
  const mapHeight = 4000;

  graphics.setStrokeStyle({ width: 1, color: 0x1a1a2e, alpha: 0.5 });

  for (let x = 0; x <= mapWidth; x += gridSize) {
    graphics.moveTo(x, 0);
    graphics.lineTo(x, mapHeight);
  }

  for (let y = 0; y <= mapHeight; y += gridSize) {
    graphics.moveTo(0, y);
    graphics.lineTo(mapWidth, y);
  }

  graphics.stroke();

  // 绘制边界
  graphics.setStrokeStyle({ width: 4, color: 0x8a2be2, alpha: 0.8 });
  graphics.rect(0, 0, mapWidth, mapHeight);
  graphics.stroke();

  app.stage.addChild(graphics);
}

// 设置事件监听
function setupEventListeners() {
  const startBtn = document.getElementById('start-btn');
  const nicknameInput = document.getElementById('nickname');

  startBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    if (nickname) {
      localStorage.setItem('blackhole_nickname', nickname);
      startGame(nickname);
    }
  });

  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const nickname = nicknameInput.value.trim();
      if (nickname) {
        localStorage.setItem('blackhole_nickname', nickname);
        startGame(nickname);
      }
    }
  });

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;
  app.stage.on('pointermove', handleInput);
}

// 处理玩家输入
function handleInput(event) {
  if (!gameState.connected || !gameState.playerId) return;

  const rect = app.canvas.getBoundingClientRect();
  const mouseX = event.global.x - rect.left;
  const mouseY = event.global.y - rect.top;

  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const dx = mouseX - centerX;
  const dy = mouseY - centerY;

  const length = Math.sqrt(dx * dx + dy * dy);
  if (length > 0) {
    socket.send(JSON.stringify({
      type: 'move',
      direction: {
        x: dx / length,
        y: dy / length
      }
    }));
  }
}

// 开始游戏
function startGame(nickname) {
  gameState.nickname = nickname;

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('ui-overlay').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';

  connectToServer();
}

// 连接服务器
function connectToServer() {
  socket = new WebSocket(`ws://${window.location.host}`);

  socket.onopen = async () => {
    console.log('Connected to server');
    gameState.connected = true;

    // 先请求 token 验证和保存数据
    try {
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: gameState.nickname,
          token: gameState.token
        })
      });
      const data = await response.json();

      // 发送加入消息
      socket.send(JSON.stringify({
        type: 'join',
        playerId: data.playerId,
        nickname: gameState.nickname,
        token: gameState.token,
        savedRadius: data.savedRadius,
        savedSpeed: data.savedSpeed
      }));
    } catch (err) {
      // 如果失败，仍然发送加入请求
      socket.send(JSON.stringify({
        type: 'join',
        nickname: gameState.nickname,
        token: gameState.token
      }));
    }

    app.ticker.add(gameLoop);
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  socket.onclose = () => {
    console.log('Disconnected from server');
    gameState.connected = false;
    app.ticker.remove(gameLoop);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// 处理服务器消息
function handleServerMessage(data) {
  switch (data.type) {
    case 'welcome':
      gameState.playerId = data.playerId;
      console.log('Welcome! Player ID:', gameState.playerId);
      break;

    case 'game_state':
      updateGameState(data.state);
      break;

    case 'player_joined':
      console.log('Player joined:', data.player.nickname);
      break;

    case 'player_left':
      console.log('Player left:', data.playerId);
      removePlayer(data.playerId);
      break;

    case 'leaderboard':
      updateLeaderboard(data.leaderboard);
      break;

    case 'player_died':
      if (data.playerId === gameState.playerId) {
        handleDeath(data.respawnDelay);
      }
      break;

    case 'respawn':
      if (data.playerId === gameState.playerId) {
        handleRespawn(data);
      }
      break;

    case 'magnet_activated':
      if (data.playerId === gameState.playerId) {
        handleMagnetActivated(data.duration);
      }
      break;

    case 'magnet_expired':
      if (data.playerId === gameState.playerId) {
        handleMagnetExpired();
      }
      break;

    case 'season_changed':
      console.log('New season started');
      break;

    default:
      console.log('Unknown message type:', data.type);
  }
}

// 处理吸铁石激活
function handleMagnetActivated(duration) {
  gameState.magnetActive = true;
  gameState.magnetTimer = duration;

  // 添加倒计时显示
  if (!magnetTimerText) {
    magnetTimerText = new PIXI.Text({
      text: '磁铁: 15s',
      style: {
        fontFamily: 'Arial',
        fontSize: 20,
        fill: 0x00ff00,
        fontWeight: 'bold'
      }
    });
    magnetTimerText.x = 20;
    magnetTimerText.y = 80;
    document.getElementById('ui-overlay').appendChild(magnetTimerText);
  }

  // 倒计时
  const countdown = setInterval(() => {
    gameState.magnetTimer -= 1000;
    if (gameState.magnetTimer > 0 && magnetTimerText) {
      magnetTimerText.text = `磁铁: ${Math.ceil(gameState.magnetTimer / 1000)}s`;
    } else {
      clearInterval(countdown);
    }
  }, 1000);
}

// 处理吸铁石过期
function handleMagnetExpired() {
  gameState.magnetActive = false;
  if (magnetTimerText) {
    magnetTimerText.text = '磁铁: 已过期';
    setTimeout(() => {
      if (magnetTimerText) magnetTimerText.text = '';
    }, 2000);
  }
}

// 更新游戏状态
function updateGameState(state) {
  // 更新食物
  state.food.forEach(f => {
    if (!foodSprites.has(f.id)) {
      const sprite = createFoodSprite(f);
      foodSprites.set(f.id, sprite);
      app.stage.addChild(sprite);
    }
  });

  const foodIds = new Set(state.food.map(f => f.id));
  foodSprites.forEach((sprite, id) => {
    if (!foodIds.has(id)) {
      sprite.destroy();
      foodSprites.delete(id);
    }
  });

  state.food.forEach(f => {
    const sprite = foodSprites.get(f.id);
    if (sprite) {
      sprite.x = f.x;
      sprite.y = f.y;
      sprite.foodType = f.type; // 标记星星类型
    }
  });

  // 更新吸铁石
  state.magnets.forEach(m => {
    if (!magnetSprites.has(m.id)) {
      const sprite = createMagnetSprite(m);
      magnetSprites.set(m.id, sprite);
      app.stage.addChild(sprite);
    }
  });

  const magnetIds = new Set(state.magnets.map(m => m.id));
  magnetSprites.forEach((sprite, id) => {
    if (!magnetIds.has(id)) {
      sprite.destroy();
      magnetSprites.delete(id);
    }
  });

  state.magnets.forEach(m => {
    const sprite = magnetSprites.get(m.id);
    if (sprite) {
      sprite.x = m.x;
      sprite.y = m.y;
    }
  });

  // 更新玩家
  state.players.forEach(p => {
    if (p.id === gameState.playerId) {
      if (!playerSprite) {
        playerSprite = createPlayerSprite(p);
        app.stage.addChild(playerSprite);
      }
      playerSprite.x = p.x;
      playerSprite.y = p.y;
      playerSprite.radius = p.radius;
      playerSprite.magnetActive = p.magnetActive;

      gameState.camera.x = p.x - window.innerWidth / 2;
      gameState.camera.y = p.y - window.innerHeight / 2;

      document.getElementById('score').textContent = `分数: ${Math.floor(p.mass)}`;
      document.getElementById('mass').textContent = `半径: ${Math.floor(p.radius)}`;
    } else {
      if (!playerSprites.has(p.id)) {
        const sprite = createPlayerSprite(p);
        playerSprites.set(p.id, sprite);
        app.stage.addChild(sprite);
      }
      const sprite = playerSprites.get(p.id);
      sprite.x = p.x;
      sprite.y = p.y;
      sprite.radius = p.radius;
    }
  });

  const playerIds = new Set(state.players.map(p => p.id));
  playerSprites.forEach((sprite, id) => {
    if (!playerIds.has(id)) {
      sprite.destroy();
      playerSprites.delete(id);
    }
  });

  // 更新黑洞
  state.blackholes.forEach(b => {
    // 黑洞已经在初始绘制中创建，不需要动态更新
  });

  app.stage.position.set(-gameState.camera.x, -gameState.camera.y);
}

// 创建食物精灵
function createFoodSprite(food) {
  const graphics = new PIXI.Graphics();

  const colors = {
    'red': 0xff6b6b,
    'yellow': 0xffe66d
  };
  const color = colors[food.type] || 0xff6b6b;

  // 外圈发光
  graphics.circle(0, 0, food.radius + 3);
  graphics.fill({ color: color, alpha: 0.3 });

  // 主体
  graphics.circle(0, 0, food.radius);
  graphics.fill(color);
  graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

  graphics.x = food.x;
  graphics.y = food.y;
  graphics.foodType = food.type;

  return graphics;
}

// 创建吸铁石精灵
function createMagnetSprite(magnet) {
  const graphics = new PIXI.Graphics();

  // 磁铁形状（U形）
  graphics.setStrokeStyle({ width: 4, color: 0x00ffff });
  graphics.moveTo(-15, -10);
  graphics.lineTo(-15, 15);
  graphics.lineTo(-5, 15);
  graphics.lineTo(-5, -10);
  graphics.moveTo(5, -10);
  graphics.lineTo(5, 15);
  graphics.lineTo(15, 15);
  graphics.lineTo(15, -10);
  graphics.stroke();

  // 中心点
  graphics.circle(0, 0, 5);
  graphics.fill(0x00ffff);

  graphics.x = magnet.x;
  graphics.y = magnet.y;

  return graphics;
}

// 创建玩家精灵
function createPlayerSprite(player) {
  const container = new PIXI.Container();

  // 外圈发光（吸铁石激活时）
  if (player.magnetActive || (gameState.playerId && player.id === gameState.playerId && gameState.magnetActive)) {
    const glow = new PIXI.Graphics();
    glow.circle(0, 0, player.radius + 10);
    glow.fill({ color: 0x00ffff, alpha: 0.3 });
    container.addChild(glow);
  }

  const graphics = new PIXI.Graphics();

  // 黑洞效果
  graphics.circle(0, 0, player.radius);
  graphics.fill(0x1a1a2e);
  graphics.stroke({ width: 3, color: 0x8a2be2 });

  // 内圈
  graphics.circle(0, 0, player.radius * 0.7);
  graphics.fill({ color: 0x2a2a4e, alpha: 0.5 });

  container.addChild(graphics);

  // 玩家名字
  const text = new PIXI.Text({
    text: player.nickname,
    style: {
      fontFamily: 'Arial',
      fontSize: Math.max(12, player.radius * 0.4),
      fill: 0xffffff,
      align: 'center'
    }
  });
  text.anchor.set(0.5);
  text.y = -player.radius - 15;

  container.addChild(text);

  container.x = player.x;
  container.y = player.y;
  container.radius = player.radius;

  return container;
}

// 移除玩家
function removePlayer(playerId) {
  const sprite = playerSprites.get(playerId);
  if (sprite) {
    sprite.destroy();
    playerSprites.delete(playerId);
  }
}

// 更新排行榜
function updateLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';

  leaderboard.forEach((entry, index) => {
    const li = document.createElement('li');
    li.textContent = `${entry.nickname}: ${entry.radius}`;

    if (entry.id === gameState.playerId) {
      li.classList.add('me');
    }

    list.appendChild(li);
  });
}

// 处理死亡
function handleDeath(respawnDelay) {
  const countdown = Math.ceil(respawnDelay / 1000);

  // 显示倒计时
  const overlay = document.createElement('div');
  overlay.id = 'death-overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100; color: #fff; font-size: 2rem;';
  overlay.innerHTML = `<h2>你被吞噬了！</h2><p>${countdown}秒后复活...</p>`;
  document.body.appendChild(overlay);

  // 倒计时
  let remaining = countdown;
  const timer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      overlay.querySelector('p').textContent = `${remaining}秒后复活...`;
    } else {
      clearInterval(timer);
    }
  }, 1000);

  // 延迟后移除遮罩
  setTimeout(() => {
    const oldOverlay = document.getElementById('death-overlay');
    if (oldOverlay) oldOverlay.remove();
  }, respawnDelay);

  // 隐藏玩家
  if (playerSprite) {
    playerSprite.visible = false;
  }
}

// 处理重生
function handleRespawn(data) {
  const overlay = document.getElementById('death-overlay');
  if (overlay) overlay.remove();

  if (playerSprite) {
    playerSprite.visible = true;
    playerSprite.x = data.x;
    playerSprite.y = data.y;
    playerSprite.radius = data.radius;
  }

  gameState.magnetActive = false;
  if (magnetTimerText) {
    magnetTimerText.text = '';
  }
}

// 游戏循环
function gameLoop() {
  // 客户端预测和插值逻辑可以在这里添加
}

// 启动
init();
