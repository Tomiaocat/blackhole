const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// 加载游戏配置
const CONFIG_PATH = path.join(__dirname, 'config', 'game.json');
let GAME_CONFIG;
try {
  GAME_CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('游戏配置加载成功');
} catch (err) {
  console.error('加载配置文件失败:', err.message);
  process.exit(1);
}

// 游戏状态
const game = {
  players: new Map(),
  food: [],
  blackholes: [],
  magnets: [],
  leaderboard: [],
  playerIdCounter: 0,
  currentSeasonStart: Date.now()
};

// MySQL 连接
let mysqlPool = null;
if (process.env.DB_HOST) {
  const mysql = require('mysql2/promise');
  mysqlPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blackhole',
    waitForConnections: true,
    connectionLimit: 10
  });
  console.log('MySQL 连接池已创建');
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];

  // API 路由
  if (filePath.startsWith('/api/')) {
    handleApiRequest(req, res, filePath);
    return;
  }

  // 静态文件服务
  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const fullPath = path.join(__dirname, 'client', filePath);
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

// API 处理器
function handleApiRequest(req, res, filePath) {
  const method = req.method;

  if (filePath === '/api/config' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      map: GAME_CONFIG.map,
      food: GAME_CONFIG.food,
      player: GAME_CONFIG.player,
      magnet: GAME_CONFIG.magnet
    }));
    return;
  }

  if (filePath === '/api/token' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { nickname, token } = JSON.parse(body);
        if (!nickname || !token) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: '缺少参数' }));
          return;
        }

        // 检查玩家是否已存在
        let playerData = null;
        if (mysqlPool) {
          const [rows] = await mysqlPool.query(
            'SELECT * FROM current_season_players WHERE token_id = ?',
            [token]
          );
          if (rows.length > 0) {
            playerData = rows[0];
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          playerId: playerData?.player_id || token,
          savedRadius: playerData?.current_radius || 0,
          savedSpeed: playerData?.current_speed || 0
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (filePath === '/api/vectors' && method === 'GET') {
    const vectorsDir = path.join(__dirname, 'client', 'assets', 'vectors');
    fs.readdir(vectorsDir, (err, files) => {
      if (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: '无法读取向量图目录' }));
        return;
      }
      const vectors = files.filter(f => f.endsWith('.svg')).map(f => ({
        name: f.replace('.svg', ''),
        path: `/assets/vectors/${f}`
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(vectors));
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'API not found' }));
}

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`游戏服务器启动在端口 ${PORT}`);
  console.log(`前端页面: http://localhost:${PORT}`);
  console.log(`赛季开始: ${new Date(game.currentSeasonStart).toLocaleString()}`);
});

// 生成随机位置
function randomPosition() {
  return {
    x: Math.random() * GAME_CONFIG.map.width,
    y: Math.random() * GAME_CONFIG.map.height
  };
}

// 根据质量计算半径
function massToRadius(mass) {
  return Math.sqrt(mass / Math.PI) * 2;
}

// 速度计算（考虑加成）
function calculateSpeed(baseSpeed, bonusPercent) {
  return baseSpeed * (1 + bonusPercent / 100);
}

// 生成食物
function generateFood(count) {
  for (let i = 0; i < count; i++) {
    const pos = randomPosition();
    const type = Math.random() < 0.5 ? 'red' : 'yellow';
    game.food.push({
      id: `food_${Date.now()}_${i}`,
      x: pos.x,
      y: pos.y,
      mass: GAME_CONFIG.food.mass,
      radius: GAME_CONFIG.food.radius,
      type: type,
      respawnAt: null
    });
  }
}

// 生成黑洞
function generateBlackholes(count) {
  for (let i = 0; i < count; i++) {
    const pos = randomPosition();
    game.blackholes.push({
      id: `blackhole_${i}`,
      x: pos.x,
      y: pos.y,
      mass: GAME_CONFIG.blackhole.mass,
      radius: GAME_CONFIG.blackhole.radius,
      direction: {
        x: Math.random() - 0.5,
        y: Math.random() - 0.5
      }
    });
  }
}

// 生成吸铁石
function spawnMagnet() {
  const pos = randomPosition();
  game.magnets.push({
    id: `magnet_${Date.now()}`,
    x: pos.x,
    y: pos.y,
    radius: 25,
    spawnAt: Date.now(),
    duration: GAME_CONFIG.magnet.duration
  });
  console.log('吸铁石已生成');
}

// 根据经验计算等级和半径
function calculateRadiusFromExp(exp) {
  // 指数成长曲线
  const level = Math.floor(Math.log(exp / 100 + 1) / Math.log(GAME_CONFIG.growthCurve.levelMultiplier)) + 1;
  const baseRadius = GAME_CONFIG.player.initialRadius +
    (level - 1) * GAME_CONFIG.growthCurve.baseRadiusPerLevel;
  return {
    radius: baseRadius,
    mass: Math.PI * baseRadius * baseRadius / 4,
    level: level
  };
}

// 处理玩家加入
function handleJoin(ws, data) {
  const playerId = data.playerId || uuidv4();
  const pos = randomPosition();

  // 计算初始半径（如果有保存数据）
  let initialRadius = GAME_CONFIG.player.initialRadius;
  let speedBonus = 0;
  let magnetActive = false;
  let magnetEndTime = 0;

  if (data.savedRadius && data.savedRadius > 0) {
    initialRadius = data.savedRadius;
    speedBonus = data.savedSpeed || 0;
  }

  const player = {
    id: playerId,
    nickname: data.nickname,
    tokenId: data.token,
    x: pos.x,
    y: pos.y,
    radius: initialRadius,
    mass: Math.PI * initialRadius * initialRadius / 4,
    speed: calculateSpeed(GAME_CONFIG.player.initialSpeed, speedBonus),
    baseSpeed: GAME_CONFIG.player.initialSpeed,
    speedBonus: speedBonus,
    direction: { x: 0, y: 0 },
    lastMoveTime: Date.now(),
    lastActivityTime: Date.now(),
    isMoving: false,
    magnetActive: magnetActive,
    magnetEndTime: magnetEndTime,
    ws: ws,
    joinedAt: Date.now()
  };

  game.players.set(playerId, player);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'welcome',
    playerId: playerId,
    config: {
      map: GAME_CONFIG.map,
      magnet: GAME_CONFIG.magnet
    }
  }));

  // 广播新玩家加入
  broadcast({
    type: 'player_joined',
    player: { id: playerId, nickname: data.nickname }
  }, playerId);

  // 保存到数据库
  savePlayerToDb(player);

  console.log(`玩家加入: ${data.nickname} (${playerId})`);
}

// 保存玩家数据到数据库
async function savePlayerToDb(player) {
  if (!mysqlPool) return;
  try {
    await mysqlPool.query(
      `INSERT INTO current_season_players
       (player_id, nickname, token_id, current_radius, current_speed, joined_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
       current_radius = VALUES(current_radius),
       current_speed = VALUES(current_speed),
       last_active_at = NOW()`,
      [player.id, player.nickname, player.tokenId, player.radius, player.speedBonus]
    );
  } catch (err) {
    console.error('保存玩家数据失败:', err.message);
  }
}

// 处理玩家移动
function handleMove(playerId, data) {
  const player = game.players.get(playerId);
  if (!player) return;

  player.direction = data.direction;
  player.lastMoveTime = Date.now();
  player.lastActivityTime = Date.now();
  player.isMoving = true;

  // 3秒后标记为未移动
  clearTimeout(player.moveTimer);
  player.moveTimer = setTimeout(() => {
    player.isMoving = false;
  }, 3000);
}

// 检查碰撞
function checkCollision(player, target, useMagnet = false) {
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 吸铁石效果：扩大吞噬范围
  const effectiveRadius = useMagnet && player.magnetActive && Date.now() < player.magnetEndTime
    ? player.radius * GAME_CONFIG.magnet.effectRadius
    : player.radius;

  return distance < effectiveRadius && player.mass >= target.mass * GAME_CONFIG.eatMultiplier;
}

// 更新游戏状态
function updateGame() {
  const now = Date.now();

  // 更新玩家位置和衰减
  game.players.forEach((player, playerId) => {
    // 检查吸铁石状态
    if (player.magnetActive && now > player.magnetEndTime) {
      player.magnetActive = false;
      broadcast({
        type: 'magnet_expired',
        playerId: playerId
      });
    }

    // 检查是否需要衰减
    if (!player.isMoving && now - player.lastActivityTime > GAME_CONFIG.player.decay.startDelay) {
      const decayTime = now - player.lastActivityTime - GAME_CONFIG.player.decay.startDelay;
      const decaySeconds = decayTime / 1000;

      // 半径衰减
      const radiusDecay = (GAME_CONFIG.player.decay.radiusDecay.percent / 100) +
        GAME_CONFIG.player.decay.radiusDecay.fixed / player.radius;
      player.radius *= (1 - radiusDecay * decaySeconds);
      player.mass = Math.PI * player.radius * player.radius / 4;

      // 速度衰减（当半径小于50%时）
      if (player.radius < GAME_CONFIG.player.initialRadius * GAME_CONFIG.player.decay.speedDecayThreshold) {
        const speedDecay = (GAME_CONFIG.player.decay.speedDecay.percent / 100) +
          GAME_CONFIG.player.decay.speedDecay.fixed / player.baseSpeed;
        player.speed = calculateSpeed(player.baseSpeed, player.speedBonus * (1 - speedDecay * decaySeconds));
      }
    }

    // 玩家移动
    if (player.direction.x !== 0 || player.direction.y !== 0) {
      player.x += player.direction.x * player.speed;
      player.y += player.direction.y * player.speed;

      // 边界限制
      player.x = Math.max(player.radius, Math.min(GAME_CONFIG.map.width - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(GAME_CONFIG.map.height - player.radius, player.y));
    }
  });

  // 更新黑洞位置
  game.blackholes.forEach(blackhole => {
    const speed = 0.5;
    blackhole.x += blackhole.direction.x * speed;
    blackhole.y += blackhole.direction.y * speed;

    if (blackhole.x <= 0 || blackhole.x >= GAME_CONFIG.map.width) {
      blackhole.direction.x *= -1;
    }
    if (blackhole.y <= 0 || blackhole.y >= GAME_CONFIG.map.height) {
      blackhole.direction.y *= -1;
    }
  });

  // 检查玩家与食物的碰撞
  game.players.forEach(player => {
    game.food = game.food.filter(food => {
      if (food.respawnAt && now < food.respawnAt) return true;

      if (checkCollision(player, food)) {
        // 应用星星效果
        if (food.type === 'red') {
          // 红星星：增加半径加成
          player.radiusBonus = (player.radiusBonus || 0) + GAME_CONFIG.food.types.red.value;
          player.radius = GAME_CONFIG.player.initialRadius *
            (1 + player.radiusBonus / 100);
          player.mass = Math.PI * player.radius * player.radius / 4;
        } else if (food.type === 'yellow') {
          // 黄星星：增加速度加成
          player.speedBonus = (player.speedBonus || 0) + GAME_CONFIG.food.types.yellow.value;
          player.speed = calculateSpeed(player.baseSpeed, player.speedBonus);
        }

        // 标记食物重生
        food.respawnAt = now + GAME_CONFIG.food.respawnDelay;
        food.x = -1000; // 移出屏幕

        return false;
      }
      return true;
    });
  });

  // 检查玩家与吸铁石的碰撞
  game.players.forEach((player, playerId) => {
    game.magnets = game.magnets.filter(magnet => {
      const dx = player.x - magnet.x;
      const dy = player.y - magnet.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < player.radius + magnet.radius) {
        // 激活吸铁石效果
        player.magnetActive = true;
        player.magnetEndTime = now + GAME_CONFIG.magnet.duration;

        broadcast({
          type: 'magnet_activated',
          playerId: playerId,
          duration: GAME_CONFIG.magnet.duration
        });

        return false;
      }
      return true;
    });
  });

  // 检查玩家与黑洞的碰撞
  game.blackholes.forEach(blackhole => {
    game.players.forEach((player, playerId) => {
      if (checkCollision(blackhole, player)) {
        handlePlayerDeath(playerId, null);
      }
    });
  });

  // 检查玩家之间的碰撞
  const players = Array.from(game.players.values());
  players.forEach(player => {
    players.forEach(other => {
      if (player.id !== other.id && checkCollision(player, other)) {
        // 大的吞噬小的
        if (player.mass >= other.mass) {
          // A 获得 B 的 30% 半径加成
          const stolenBonus = (other.radiusBonus || 0) * 0.3;
          player.radiusBonus = (player.radiusBonus || 0) + stolenBonus;
          player.radius = GAME_CONFIG.player.initialRadius * (1 + player.radiusBonus / 100);
          player.mass = Math.PI * player.radius * player.radius / 4;

          handlePlayerDeath(other.id, player.id);
        }
      }
    });
  });

  // 补充食物
  while (game.food.filter(f => !f.respawnAt || f.respawnAt < now).length < GAME_CONFIG.food.totalCount) {
    const pos = randomPosition();
    const type = Math.random() < 0.5 ? 'red' : 'yellow';
    game.food.push({
      id: `food_${Date.now()}_${Math.random()}`,
      x: pos.x,
      y: pos.y,
      mass: GAME_CONFIG.food.mass,
      radius: GAME_CONFIG.food.radius,
      type: type,
      respawnAt: null
    });
  }

  // 更新排行榜
  game.leaderboard = Array.from(game.players.values())
    .map(p => ({ id: p.id, nickname: p.nickname, radius: p.radius, mass: p.mass }))
    .sort((a, b) => b.radius - a.radius)
    .slice(0, 10);

  // 更新排名到数据库
  game.leaderboard.forEach((entry, index) => {
    if (mysqlPool) {
      mysqlPool.query(
        'UPDATE current_season_players SET current_rank = ? WHERE player_id = ?',
        [index + 1, entry.id]
      ).catch(() => {});
    }
  });
}

// 处理玩家死亡
function handlePlayerDeath(playerId, killerId) {
  const player = game.players.get(playerId);
  if (!player) return;

  player.ws.send(JSON.stringify({
    type: 'player_died',
    playerId: playerId,
    killerId: killerId,
    respawnDelay: GAME_CONFIG.respawnDelay
  }));

  // 保存最高记录
  if (mysqlPool) {
    mysqlPool.query(
      `INSERT INTO season_rankings
       (player_id, nickname, max_radius, max_rank, season_start, season_end)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       max_radius = GREATEST(max_radius, VALUES(max_radius)),
       max_rank = LEAST(IFNULL(max_rank, 999), VALUES(max_rank))`,
      [player.id, player.nickname, player.radius, game.leaderboard.findIndex(p => p.id === playerId) + 1,
       new Date(game.currentSeasonStart).toISOString(), new Date().toISOString()]
    ).catch(() => {});
  }

  // 延迟重生
  setTimeout(() => {
    if (!game.players.has(playerId)) return;

    const pos = randomPosition();
    player.x = pos.x;
    player.y = pos.y;
    player.radius = GAME_CONFIG.player.initialRadius;
    player.mass = Math.PI * player.radius * player.radius / 4;
    player.baseSpeed = GAME_CONFIG.player.initialSpeed;
    player.speedBonus = 0;
    player.radiusBonus = 0;
    player.magnetActive = false;
    player.direction = { x: 0, y: 0 };
    player.lastActivityTime = Date.now();
    player.isMoving = false;

    player.ws.send(JSON.stringify({
      type: 'respawn',
      playerId: playerId,
      x: player.x,
      y: player.y,
      radius: player.radius
    }));

    console.log(`玩家 ${player.nickname} 重生`);
  }, GAME_CONFIG.respawnDelay);

  broadcast({
    type: 'player_left',
    playerId: playerId,
    killerId: killerId
  });

  game.players.delete(playerId);
}

// 广播游戏状态
function broadcastGameState() {
  const state = {
    type: 'game_state',
    state: {
      players: Array.from(game.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        x: p.x,
        y: p.y,
        radius: p.radius,
        mass: p.mass,
        magnetActive: p.magnetActive
      })),
      food: game.food.filter(f => !f.respawnAt || f.respawnAt < Date.now()).map(f => ({
        id: f.id,
        x: f.x,
        y: f.y,
        radius: f.radius,
        type: f.type
      })),
      magnets: game.magnets.map(m => ({
        id: m.id,
        x: m.x,
        y: m.y,
        radius: m.radius,
        remainingTime: m.spawnAt ? Math.max(0, (m.spawnAt + m.duration) - Date.now()) : 0
      })),
      blackholes: game.blackholes.map(b => ({
        id: b.id,
        x: b.x,
        y: b.y,
        radius: b.radius
      }))
    }
  };

  game.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(state));
    }
  });
}

// 广播排行榜
function broadcastLeaderboard() {
  const message = {
    type: 'leaderboard',
    leaderboard: game.leaderboard.map((entry, index) => ({
      id: entry.id,
      nickname: entry.nickname,
      radius: Math.floor(entry.radius),
      rank: index + 1
    }))
  };

  game.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  });
}

// 广播消息
function broadcast(message, excludePlayerId = null) {
  const data = JSON.stringify(message);
  game.players.forEach((player, playerId) => {
    if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

// 处理 WebSocket 连接
wss.on('connection', (ws) => {
  console.log('新连接');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'join':
          handleJoin(ws, message);
          break;
        case 'move':
          const player = Array.from(game.players.entries())
            .find(([_, p]) => p.ws === ws);
          if (player) {
            handleMove(player[0], message);
          }
          break;
      }
    } catch (error) {
      console.error('消息处理错误:', error);
    }
  });

  ws.on('close', () => {
    const player = Array.from(game.players.entries())
      .find(([_, p]) => p.ws === ws);

    if (player) {
      // 保存最终数据
      savePlayerToDb(player[1]);

      game.players.delete(player[0]);
      broadcast({
        type: 'player_left',
        playerId: player[0]
      });
      console.log(`玩家离开: ${player[1].nickname}`);
    }
  });
});

// 初始化游戏
generateFood(GAME_CONFIG.food.totalCount);
generateBlackholes(GAME_CONFIG.blackhole.spawnCount);

// 定时生成吸铁石
setInterval(() => {
  if (game.magnets.length < 5) {
    spawnMagnet();
  }
}, GAME_CONFIG.magnet.spawnInterval);

// 定时清理过期的吸铁石
setInterval(() => {
  const now = Date.now();
  game.magnets = game.magnets.filter(m => (m.spawnAt + m.duration) > now);
}, 10000);

// 游戏循环
setInterval(() => {
  updateGame();
  broadcastGameState();
}, 1000 / 30); // 30 FPS

// 排行榜更新
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// 赛季检查（每小时）
setInterval(() => {
  const elapsed = Date.now() - game.currentSeasonStart;
  if (elapsed >= GAME_CONFIG.seasonDuration) {
    startNewSeason();
  }
}, 60000);

// 开始新赛季
async function startNewSeason() {
  console.log('开始新赛季');

  // 保存旧赛季数据
  if (mysqlPool) {
    try {
      await mysqlPool.query(
        `INSERT INTO season_rankings
         (player_id, nickname, max_radius, max_rank, season_start, season_end)
         SELECT player_id, nickname, current_radius, current_rank, ?, NOW()
         FROM current_season_players`,
        [new Date(game.currentSeasonStart).toISOString()]
      );
    } catch (err) {
      console.error('保存赛季数据失败:', err.message);
    }
  }

  // 重置游戏状态
  game.currentSeasonStart = Date.now();
  game.players.forEach(player => {
    player.radius = GAME_CONFIG.player.initialRadius;
    player.mass = Math.PI * player.radius * player.radius / 4;
    player.baseSpeed = GAME_CONFIG.player.initialSpeed;
    player.speedBonus = 0;
    player.radiusBonus = 0;
    player.magnetActive = false;

    player.ws.send(JSON.stringify({
      type: 'season_changed',
      newSeasonStart: game.currentSeasonStart
    }));
  });

  console.log('新赛季已开始');
}
