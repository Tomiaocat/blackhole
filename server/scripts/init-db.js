const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 加载本地数据库配置
const LOCAL_CONFIG_PATH = path.join(__dirname, '..', 'config', 'local.json');
let LOCAL_CONFIG = null;
try {
  LOCAL_CONFIG = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf-8'));
} catch (err) {
  console.log('未找到本地数据库配置');
}

const config = LOCAL_CONFIG?.database || {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'blackhole'
};

// 验证必需参数
if (!config.host || !config.user || !config.password) {
  console.error('错误: 请在 server/config/local.json 中配置数据库，或设置环境变量:');
  console.error('  DB_HOST - MySQL 主机地址');
  console.error('  DB_USER - MySQL 用户名');
  console.error('  DB_PASSWORD - MySQL 密码');
  process.exit(1);
}

async function initDb() {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database || 'blackhole',
    multipleStatements: true
  });

  const sql = `
    CREATE TABLE IF NOT EXISTS season_rankings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      player_id VARCHAR(64) NOT NULL COMMENT '玩家token ID',
      nickname VARCHAR(64) NOT NULL COMMENT '玩家昵称',
      max_radius DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '最大半径',
      max_rank INT NOT NULL DEFAULT 0 COMMENT '最高排名',
      season_start BIGINT NOT NULL COMMENT '赛季开始时间戳',
      season_end BIGINT NOT NULL COMMENT '赛季结束时间戳',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_player (player_id),
      INDEX idx_season (season_start, season_end)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赛季排名记录';

    CREATE TABLE IF NOT EXISTS current_season_players (
      player_id VARCHAR(64) PRIMARY KEY,
      nickname VARCHAR(64) NOT NULL,
      token_id VARCHAR(64) NOT NULL COMMENT '前端token',
      current_radius DECIMAL(10,2) NOT NULL DEFAULT 0,
      current_speed DECIMAL(10,2) NOT NULL DEFAULT 0,
      current_rank INT DEFAULT 0,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_radius (current_radius DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='当前赛季玩家状态';
  `;

  await connection.query(sql);
  console.log('数据库表创建成功');
  await connection.end();
}

initDb().catch(err => {
  console.error('创建数据库表失败:', err.message);
  process.exit(1);
});
