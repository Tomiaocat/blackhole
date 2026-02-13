const WebSocket = require('ws');
const { GAME_CONFIG, MESSAGE_TYPES } = require('../shared/constants.js');

// 游戏状态
const game = {
  players: new Map(),
  food: [],
  blackholes: [],
  leaderboard: [],
  playerIdCounter: 0
};

// 创建WebSocket服务器
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

console.log(`游戏服务器启动在端口 ${process.env.PORT || 3000}`);

// 生成随机位置
function randomPosition() {
  return {
    x: Math.random() * GAME_CONFIG.MAP_WIDTH,
    y: Math.random() * GAME_CONFIG.MAP_HEIGHT
  };
}

// 根据质量计算半径
function massToRadius(mass) {
  return Math.sqrt(mass / Math.PI) * 2;
}

// 计算移动速度
function getSpeed(mass) {
  const speed = GAME_CONFIG.SPEED_BASE * Math.pow(mass, -0.4);
  return Math.max(speed, GAME_CONFIG.SPEED_MIN);
}

// 生成食物
function generateFood(count) {
  for (let i = 0; i < count; i++) {
    const pos = randomPosition();
    game.food.push({
      id: `food_${i}`,
      x: pos.x,
      y: pos.y,
      mass: GAME_CONFIG.FOOD_MASS,
      radius: GAME_CONFIG.FOOD_RADIUS
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
      mass: GAME_CONFIG.BLACKHOLE_MASS,
      radius: GAME_CONFIG.BLACKHOLE_RADIUS,
      direction: {
        x: Math.random() - 0.5,
        y: Math.random() - 0.5
      }
    });
  }
}

// 处理玩家加入
function handleJoin(ws, data) {
  const playerId = `player_${++game.playerIdCounter}`;
  const pos = randomPosition();

  const player = {
    id: playerId,
    nickname: data.nickname,
    x: pos.x,
    y: pos.y,
    mass: GAME_CONFIG.INITIAL_MASS,
    radius: GAME_CONFIG.INITIAL_RADIUS,
    direction: { x: 0, y: 0 },
    lastMoveTime: Date.now(),
    ws: ws
  };

  game.players.set(playerId, player);

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.WELCOME,
    playerId: playerId
  }));

  // 广播新玩家加入
  broadcast({
    type: MESSAGE_TYPES.PLAYER_JOINED,
    player: {
      id: playerId,
      nickname: data.nickname
    }
  }, playerId);

  console.log(`玩家加入: ${data.nickname} (${playerId})`);
}

// 处理玩家移动
function handleMove(playerId, data) {
  const player = game.players.get(playerId);
  if (!player) return;

  player.direction = data.direction;
  player.lastMoveTime = Date.now();
}

// 检查碰撞
function checkCollision(player, target) {
  const dx = player.x - target.x;
  const dy = player.y - target.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 吞噬条件：距离小于玩家半径且玩家质量足够大
  return distance < player.radius && player.mass >= target.mass * GAME_CONFIG.EAT_MULTIPLIER;
}

// 更新游戏状态
function updateGame() {
  // 更新玩家位置
  game.players.forEach((player, playerId) => {
    if (player.direction.x !== 0 || player.direction.y !== 0) {
      const speed = getSpeed(player.mass);
      player.x += player.direction.x * speed;
      player.y += player.direction.y * speed;

      // 边界限制
      player.x = Math.max(player.radius, Math.min(GAME_CONFIG.MAP_WIDTH - player.radius, player.x));
      player.y = Math.max(player.radius, Math.min(GAME_CONFIG.MAP_HEIGHT - player.radius, player.y));
    }
  });

  // 更新黑洞位置
  game.blackholes.forEach(blackhole => {
    // 黑洞缓慢移动
    const speed = 0.5;
    blackhole.x += blackhole.direction.x * speed;
    blackhole.y += blackhole.direction.y * speed;

    // 边界反弹
    if (blackhole.x <= 0 || blackhole.x >= GAME_CONFIG.MAP_WIDTH) {
      blackhole.direction.x *= -1;
    }
    if (blackhole.y <= 0 || blackhole.y >= GAME_CONFIG.MAP_HEIGHT) {
      blackhole.direction.y *= -1;
    }
  });

  // 检查玩家与食物的碰撞
  game.players.forEach(player => {
    game.food = game.food.filter(food => {
      if (checkCollision(player, food)) {
        player.mass += food.mass * 0.5; // 吞噬食物获得质量
        player.radius = massToRadius(player.mass);
        return false; // 移除食物
      }
      return true;
    });
  });

  // 检查玩家与黑洞的碰撞
  game.blackholes.forEach(blackhole => {
    game.players.forEach((player, playerId) => {
      if (checkCollision(blackhole, player)) {
        // 玩家被黑洞吞噬
        player.ws.send(JSON.stringify({
          type: MESSAGE_TYPES.PLAYER_DIED,
          playerId: playerId,
          killerId: blackhole.id
        }));

        game.players.delete(playerId);
        console.log(`玩家 ${player.nickname} 被黑洞吞噬`);
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
          player.mass += other.mass * 0.5;
          player.radius = massToRadius(player.mass);

          other.ws.send(JSON.stringify({
            type: MESSAGE_TYPES.PLAYER_DIED,
            playerId: other.id,
            killerId: player.id
          }));

          game.players.delete(other.id);
          console.log(`玩家 ${other.nickname} 被 ${player.nickname} 吞噬`);
        }
      }
    });
  });

  // 补充食物
  while (game.food.length < GAME_CONFIG.FOOD_COUNT) {
    const pos = randomPosition();
    game.food.push({
      id: `food_${Date.now()}_${Math.random()}`,
      x: pos.x,
      y: pos.y,
      mass: GAME_CONFIG.FOOD_MASS,
      radius: GAME_CONFIG.FOOD_RADIUS
    });
  }

  // 更新排行榜
  game.leaderboard = Array.from(game.players.values())
    .map(p => ({ id: p.id, nickname: p.nickname, mass: p.mass }))
    .sort((a, b) => b.mass - a.mass)
    .slice(0, 10);
}

// 广播游戏状态
function broadcastGameState() {
  const state = {
    type: MESSAGE_TYPES.GAME_STATE,
    state: {
      players: Array.from(game.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        x: p.x,
        y: p.y,
        mass: p.mass,
        radius: p.radius
      })),
      food: game.food,
      blackholes: game.blackholes
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
    type: MESSAGE_TYPES.LEADERBOARD,
    leaderboard: game.leaderboard
  };

  game.players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify(message));
    }
  });
}

// 广播消息给所有玩家（可选排除某个玩家）
function broadcast(message, excludePlayerId = null) {
  const data = JSON.stringify(message);
  game.players.forEach((player, playerId) => {
    if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(data);
    }
  });
}

// 处理WebSocket连接
wss.on('connection', (ws) => {
  console.log('新连接');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case MESSAGE_TYPES.JOIN:
          handleJoin(ws, message);
          break;
        case MESSAGE_TYPES.MOVE:
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
      game.players.delete(player[0]);
      broadcast({
        type: MESSAGE_TYPES.PLAYER_LEFT,
        playerId: player[0]
      });
      console.log(`玩家离开: ${player[1].nickname}`);
    }
  });
});

// 初始化游戏
generateFood(GAME_CONFIG.FOOD_COUNT);
generateBlackholes(GAME_CONFIG.BLACKHOLE_SPAWN_COUNT);

// 游戏循环
setInterval(() => {
  updateGame();
  broadcastGameState();
}, GAME_CONFIG.TICK_INTERVAL);

// 排行榜更新（较低频率）
setInterval(() => {
  broadcastLeaderboard();
}, 1000);

// 健康检查端点
wss.on('listening', () => {
  console.log('服务器就绪');
});
