// 游戏常量定义
const GAME_CONFIG = {
  // 地图大小
  MAP_WIDTH: 4000,
  MAP_HEIGHT: 4000,

  // 初始玩家数据
  INITIAL_MASS: 100,
  INITIAL_RADIUS: 30,

  // 游戏参数
  MIN_MASS: 10,
  MAX_MASS: 10000,

  // 吞噬条件（质量倍数）
  EAT_MULTIPLIER: 1.2,

  // 移动速度（基于质量的速度衰减）
  SPEED_BASE: 5,
  SPEED_MIN: 1,

  // 食物参数
  FOOD_COUNT: 500,
  FOOD_MASS: 10,
  FOOD_RADIUS: 8,

  // 黑洞参数
  BLACKHOLE_MASS: 500,
  BLACKHOLE_RADIUS: 60,
  BLACKHOLE_SPAWN_COUNT: 5,

  // 帧率
  TICK_RATE: 60,
  TICK_INTERVAL: 1000 / 60,

  // 玩家视野
  VIEWPORT_SIZE: 800,

  // 玩家最大数量
  MAX_PLAYERS: 100,

  // 重生时间（秒）
  RESPAWN_TIME: 3
};

// 消息类型定义
const MESSAGE_TYPES = {
  // 客户端 -> 服务端
  JOIN: 'join',
  MOVE: 'move',
  CHAT: 'chat',
  RESPAWN: 'respawn',

  // 服务端 -> 客户端
  WELCOME: 'welcome',
  GAME_STATE: 'game_state',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  PLAYER_DIED: 'player_died',
  LEADERBOARD: 'leaderboard',
  CHAT_MESSAGE: 'chat_message',
  ERROR: 'error'
};

module.exports = { GAME_CONFIG, MESSAGE_TYPES };
