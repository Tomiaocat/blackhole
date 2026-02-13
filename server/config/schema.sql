-- 赛季排名表
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

-- 当前赛季玩家状态表
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
