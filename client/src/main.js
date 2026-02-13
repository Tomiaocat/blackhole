import * as PIXI from 'pixi.js';

// 游戏状态
const gameState = {
  connected: false,
  playerId: null,
  nickname: '',
  players: new Map(),
  food: [],
  blackholes: [],
  viewport: { x: 0, y: 0 },
  camera: { x: 0, y: 0 }
};

// 配置（应该从服务端获取，这里先写死）
const CONFIG = {
  SERVER_URL: 'ws://localhost:3000',
  MAP_WIDTH: 4000,
  MAP_HEIGHT: 4000,
  BACKGROUND_COLOR: 0x0a0a0f,
  GRID_SIZE: 50
};

// PixiJS 应用
const app = new PIXI.Application();
let socket = null;
let playerSprite = null;
let foodSprites = new Map();
let playerSprites = new Map();

// 初始化游戏
async function init() {
  // 创建应用
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: CONFIG.BACKGROUND_COLOR,
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
}

// 绘制网格背景
function drawGrid() {
  const graphics = new PIXI.Graphics();

  // 绘制网格线
  graphics.setStrokeStyle({ width: 1, color: 0x1a1a2e, alpha: 0.5 });

  for (let x = 0; x <= CONFIG.MAP_WIDTH; x += CONFIG.GRID_SIZE) {
    graphics.moveTo(x, 0);
    graphics.lineTo(x, CONFIG.MAP_HEIGHT);
  }

  for (let y = 0; y <= CONFIG.MAP_HEIGHT; y += CONFIG.GRID_SIZE) {
    graphics.moveTo(0, y);
    graphics.lineTo(CONFIG.MAP_WIDTH, y);
  }

  graphics.stroke();

  // 绘制边界
  graphics.setStrokeStyle({ width: 4, color: 0x8a2be2, alpha: 0.8 });
  graphics.rect(0, 0, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
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
      startGame(nickname);
    }
  });

  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const nickname = nicknameInput.value.trim();
      if (nickname) {
        startGame(nickname);
      }
    }
  });

  // 鼠标/触摸移动
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

  // 计算相对于屏幕中心的方向
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  const dx = mouseX - centerX;
  const dy = mouseY - centerY;

  // 归一化并发送移动指令
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

  // 隐藏登录界面
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('ui-overlay').style.display = 'block';
  document.getElementById('leaderboard').style.display = 'block';

  // 连接服务器
  connectToServer();
}

// 连接服务器
function connectToServer() {
  socket = new WebSocket(CONFIG.SERVER_URL);

  socket.onopen = () => {
    console.log('Connected to server');
    gameState.connected = true;

    // 发送加入消息
    socket.send(JSON.stringify({
      type: 'join',
      nickname: gameState.nickname
    }));

    // 启动游戏循环
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
        handleDeath();
      }
      break;

    default:
      console.log('Unknown message type:', data.type);
  }
}

// 更新游戏状态
function updateGameState(state) {
  // 更新食物
  state.food.forEach(f => {
    if (!foodSprites.has(f.id)) {
      const sprite = createFoodSprite(f);
      foodSprites.set(f.id, sprite);
    }
  });

  // 移除消失的食物
  const foodIds = new Set(state.food.map(f => f.id));
  foodSprites.forEach((sprite, id) => {
    if (!foodIds.has(id)) {
      sprite.destroy();
      foodSprites.delete(id);
    }
  });

  // 更新食物位置
  state.food.forEach(f => {
    const sprite = foodSprites.get(f.id);
    if (sprite) {
      sprite.x = f.x;
      sprite.y = f.y;
    }
  });

  // 更新玩家
  state.players.forEach(p => {
    if (p.id === gameState.playerId) {
      // 本地玩家
      if (!playerSprite) {
        playerSprite = createPlayerSprite(p);
        app.stage.addChild(playerSprite);
      }
      playerSprite.x = p.x;
      playerSprite.y = p.y;

      // 更新相机
      gameState.camera.x = p.x - window.innerWidth / 2;
      gameState.camera.y = p.y - window.innerHeight / 2;

      // 更新UI
      document.getElementById('score').textContent = `分数: ${Math.floor(p.mass)}`;
      document.getElementById('mass').textContent = `质量: ${p.mass}`;
    } else {
      // 其他玩家
      if (!playerSprites.has(p.id)) {
        const sprite = createPlayerSprite(p);
        playerSprites.set(p.id, sprite);
        app.stage.addChild(sprite);
      }
      const sprite = playerSprites.get(p.id);
      sprite.x = p.x;
      sprite.y = p.y;
      sprite.mass = p.mass;
    }
  });

  // 移除离开的玩家
  const playerIds = new Set(state.players.map(p => p.id));
  playerSprites.forEach((sprite, id) => {
    if (!playerIds.has(id)) {
      sprite.destroy();
      playerSprites.delete(id);
    }
  });

  // 更新容器位置
  app.stage.position.set(-gameState.camera.x, -gameState.camera.y);
}

// 创建食物精灵
function createFoodSprite(food) {
  const graphics = new PIXI.Graphics();

  // 随机颜色
  const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da];
  const color = colors[Math.floor(Math.random() * colors.length)];

  graphics.circle(0, 0, food.radius);
  graphics.fill(color);
  graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

  graphics.x = food.x;
  graphics.y = food.y;

  return graphics;
}

// 创建玩家精灵
function createPlayerSprite(player) {
  const graphics = new PIXI.Graphics();

  // 黑洞效果
  graphics.circle(0, 0, player.radius);
  graphics.fill(0x1a1a2e);
  graphics.stroke({ width: 3, color: 0x8a2be2 });

  // 内圈发光效果
  graphics.circle(0, 0, player.radius * 0.7);
  graphics.fill({ color: 0x2a2a4e, alpha: 0.5 });

  graphics.x = player.x;
  graphics.y = player.y;

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

  graphics.addChild(text);

  return graphics;
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
    li.textContent = `${entry.nickname}: ${Math.floor(entry.mass)}`;

    if (entry.id === gameState.playerId) {
      li.classList.add('me');
    }

    list.appendChild(li);
  });
}

// 处理死亡
function handleDeath() {
  alert('你被吞噬了！点击确定重新开始');

  // 重置状态
  playerSprite.destroy();
  playerSprite = null;
  gameState.playerId = null;

  // 显示登录界面
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('ui-overlay').style.display = 'none';
  document.getElementById('leaderboard').style.display = 'none';

  // 重新连接
  connectToServer();
}

// 游戏循环
function gameLoop() {
  // 这里可以添加客户端预测、插值等逻辑
}

// 启动
init();
