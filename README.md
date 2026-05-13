# 黑洞大作战（Blackhole Battle）

多人在线实时对战的黑洞吞噬类 `.io` 游戏。操控你的黑洞在 4000×4000 的广阔地图中吞噬食物、击败对手、争夺排行榜首位。支持最多 100 人同时在线，每小时赛季重置，永不停歇的竞技体验。

**项目亮点：** 全栈 JavaScript 实现，PixiJS 高性能渲染 + Node.js WebSocket 实时通信，Docker 一键部署，MySQL 可选持久化。

---

## 功能特性

- **吞噬成长** — 吞噬红色星星增加体型，吞噬黄色星星提升移速，击杀其他玩家获取其 30% 半径
- **多人实时对战** — 最多 100 名玩家同屏竞技，服务端 30 FPS 广播游戏状态
- **赛季系统** — 每小时自动重置赛季，所有玩家回到初始状态，MySQL 记录历史排名
- **道具系统** — 磁铁道具每 30 秒刷新，拾取后 15 秒内吞噬范围 +2000%
- **NPC 黑洞** — 地图中游荡 3 个巨型黑洞（质量 5000），碰到即死
- **等级系统** — 吞噬积累经验值升级，每级获得 +10 半径加成
- **实时排行榜** — 每秒更新 Top 10 排名，展示当前最强玩家
- **自动登录** — 客户端生成 Token 存入 localStorage，刷新页面无需重新登录
- **随机头像** — 从服务器获取随机矢量头像，区分每位玩家

---

## 技术架构

```
┌─────────────────────────────────────────────────────┐
│                      客户端 (Browser)                 │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  PixiJS   │  │  Vite     │  │  Vanilla JS      │  │
│  │  渲染引擎  │  │  构建工具  │  │  游戏逻辑 (ESM)  │  │
│  └───────────┘  └───────────┘  └──────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP + WebSocket
┌───────────────────────▼─────────────────────────────┐
│                   服务端 (Node.js)                    │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  HTTP API │  │  WebSocket│  │  游戏循环 (30FPS) │  │
│  │  RESTful  │  │  ws 模块   │  │  碰撞/重生/赛季  │  │
│  └───────────┘  └───────────┘  └──────────────────┘  │
│                        │                             │
│                ┌───────▼───────┐                     │
│                │  MySQL (可选)  │                     │
│                │  赛季排名持久化 │                     │
│                └───────────────┘                     │
└─────────────────────────────────────────────────────┘
```

---

## 项目结构

```
blackhole/
├── client/                     # 前端
│   ├── index.html              # 入口页面（含内嵌 CSS）
│   ├── src/main.js             # 游戏客户端逻辑（PixiJS 渲染、输入处理、UI）
│   ├── assets/vectors/         # 玩家头像素材（PNG）
│   └── package.json            # pixi.js ^8.1.0, vite ^5.2.0
│
├── server/                     # 后端
│   ├── index.js                # 主服务（HTTP + WebSocket + 游戏循环）
│   ├── config/
│   │   ├── game.json           # 游戏平衡性参数配置
│   │   └── schema.sql          # MySQL 建表脚本
│   ├── scripts/init-db.js      # 数据库初始化脚本
│   ├── Dockerfile              # 生产环境镜像（node:20-alpine）
│   └── package.json            # ws, mysql2, uuid, sharp, potrace
│
├── shared/                     # 前后端共享
│   └── constants.js            # GAME_CONFIG + MESSAGE_TYPES
│
├── scripts/                    # 资源处理工具
│   ├── extract-sprites.js      # 从精灵表提取单独 PNG
│   └── fix-svg-colors.js       # 修复 SVG 填充颜色
│
├── docker-compose.yml          # Docker Compose 编排
├── package.json                # 根级脚本（dev/build/start）
├── .env.example                # 环境变量模板
└── LICENSE                     # Apache License 2.0
```

---

## 快速开始

### 环境要求

- **Node.js** >= 18
- **Docker** & **Docker Compose**（容器化部署时需要）
- **MySQL** >= 5.7（可选，用于赛季排名持久化）

### 本地开发

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd blackhole

# 2. 一键安装所有依赖（根目录 + client + server）
npm run install:all

# 3. 启动开发环境（同时启动前端 Vite + 后端 Node.js）
npm run dev
```

- 前端开发服务器：`http://localhost:5173`
- 后端 API 服务器：`http://localhost:3000`

开发模式下 Vite 提供热重载，后端使用 `--watch` 自动重启。

### Docker 部署

```bash
# 构建并启动（后台运行）
docker-compose up -d

# 访问游戏
# http://localhost:3000
```

Docker 模式下，服务端同时提供静态文件服务和 API/WebSocket，无需单独部署前端。

### 配置数据库（可选）

如果需要赛季排名持久化功能：

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env 填入 MySQL 连接信息
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=blackhole

# 3. 服务启动时会自动执行 init-db.js 创建表结构
```

未配置数据库时，服务端以「无持久化模式」运行，游戏功能不受影响，仅赛季排名不保存。

---

## 游戏规则

### 基本玩法

1. 玩家操控一个黑洞，通过鼠标/触屏控制移动方向
2. 吞噬地图中的**红色星星**增加体型（半径），吞噬**黄色星星**提升移动速度
3. 当你的黑洞比另一个玩家大 **1.1 倍**以上时，可以吞噬对方
4. 被吞噬的玩家 5 秒后重生为初始大小
5. 击杀其他玩家可获得其 **30% 半径**和 **+0.10 速度**加成

### 食物系统

| 类型 | 占比 | 效果 | 刷新时间 |
|------|------|------|----------|
| 红色星星 | 75% | 增加半径（加权随机：1-5 分） | 15 秒 |
| 黄色星星 | 25% | 移动速度 +3 | 15 秒 |

红色星星分数分布：1 分 (60%)、2 分 (20%)、3 分 (10%)、4 分 (6%)、5 分 (4%)

### 磁铁道具

- 每 30 秒在地图上刷新一个磁铁（最多同时存在 5 个）
- 拾取后 **15 秒内**吞噬范围扩大 21 倍（+2000%），仅对食物生效
- 到期自动消失

### NPC 黑洞

- 地图中始终存在 **3 个**巨型黑洞
- 质量 5000，半径 80，碰到即死
- 以缓慢速度随机移动，碰壁反弹

### 赛季机制

- 每 **1 小时**为一个赛季
- 赛季结束时所有玩家重置为初始状态
- 历史排名写入 MySQL（需配置数据库）

---

## 配置说明

游戏平衡性参数位于 `server/config/game.json`：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `map.width` / `map.height` | 4000 | 地图尺寸（像素） |
| `food.totalCount` | 2000 | 地图上同时存在的食物总数 |
| `food.respawnDelay` | 15000 | 食物被吞噬后的重生时间（毫秒） |
| `food.ratio.red` | 75 | 红色星星占比（%） |
| `food.ratio.yellow` | 25 | 黄色星星占比（%） |
| `player.initialRadius` | 30 | 玩家初始半径 |
| `player.initialSpeed` | 3 | 玩家初始速度 |
| `player.levelUp.baseExp` | 100 | 升级基础经验值 |
| `player.levelUp.radiusBonus` | 10 | 每级半径加成 |
| `blackhole.spawnCount` | 3 | NPC 黑洞数量 |
| `blackhole.mass` | 5000 | NPC 黑洞质量 |
| `magnet.spawnInterval` | 30000 | 磁铁刷新间隔（毫秒） |
| `magnet.duration` | 15000 | 磁铁效果持续时间（毫秒） |
| `magnet.effectRadius` | 21 | 磁铁效果倍数 |
| `eatMultiplier` | 1.1 | 吞噬所需的质量倍数 |
| `respawnDelay` | 5000 | 玩家死亡后重生延迟（毫秒） |
| `seasonDuration` | 3600000 | 赛季时长（毫秒，默认 1 小时） |

---

## API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/config` | 获取游戏配置（地图、食物、磁铁参数） |
| `POST` | `/api/token` | 注册/验证玩家 Token。请求体：`{nickname, token}`，返回：`{success, playerId, savedRadius, savedSpeed}` |
| `GET` | `/api/vectors` | 获取可用头像列表 |
| `GET` | `/health` | 健康检查（Docker healthcheck 使用） |

### WebSocket 消息

连接地址：`ws://localhost:3000`

**客户端 → 服务端：**

| 类型 | 数据 | 说明 |
|------|------|------|
| `join` | `{playerId, nickname, token, savedRadius, savedSpeed}` | 加入游戏 |
| `move` | `{direction: {x, y}}` | 移动方向（归一化向量） |

**服务端 → 客户端：**

| 类型 | 数据 | 说明 |
|------|------|------|
| `welcome` | `{playerId, config}` | 玩家加入确认，返回 ID 和配置 |
| `game_state` | `{state: {players, food, magnets, blackholes}}` | 游戏状态（30 FPS 广播） |
| `player_joined` | `{player: {id, nickname}}` | 新玩家加入通知 |
| `player_left` | `{playerId, killerId?}` | 玩家离开/被击杀 |
| `player_died` | `{playerId, killerId, respawnDelay}` | 玩家死亡通知 |
| `respawn` | `{playerId, x, y, radius}` | 玩家重生通知 |
| `leaderboard` | `{leaderboard[]}` | Top 10 排行榜（每秒更新） |
| `magnet_activated` | `{playerId, duration}` | 磁铁效果激活 |
| `magnet_expired` | `{playerId}` | 磁铁效果到期 |
| `season_changed` | `{newSeasonStart}` | 赛季重置通知 |

---

## 数据库（可选）

MySQL 表结构（`server/config/schema.sql`）：

### season_rankings — 赛季历史排名

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGINT PK | 自增主键 |
| `player_id` | VARCHAR(64) | 玩家 Token ID |
| `nickname` | VARCHAR(64) | 玩家昵称 |
| `max_radius` | DECIMAL(10,2) | 本赛季最大半径 |
| `max_rank` | INT | 本赛季最高排名 |
| `season_start` / `season_end` | BIGINT | 赛季起止时间戳 |

### current_season_players — 当前赛季活跃玩家

| 字段 | 类型 | 说明 |
|------|------|------|
| `player_id` | VARCHAR(64) PK | 玩家 ID |
| `nickname` | VARCHAR(64) | 玩家昵称 |
| `current_radius` | DECIMAL(10,2) | 当前半径 |
| `current_speed` | DECIMAL(10,2) | 当前速度加成 |
| `current_rank` | INT | 当前排名 |
| `last_active_at` | TIMESTAMP | 最后活跃时间 |

---

## 许可证

[Apache License 2.0](LICENSE)
