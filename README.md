# 黑洞大作战

黑洞吞噬类多人在线游戏

## 技术栈

- **前端**: PixiJS + Vite
- **后端**: Node.js + WebSocket
- **部署**: Docker

## 快速开始

### 环境要求
- Node.js >= 18
- Docker & Docker Compose

### 本地开发

```bash
# 安装依赖
npm run install:all

# 启动开发环境
npm run dev
```

访问 http://localhost:5173

### Docker 部署

```bash
docker-compose up -d
```

访问 http://localhost:3000

## 游戏规则

1. 玩家控制一个黑洞
2. 吞噬比自身小的物体来增大
3. 被更大的黑洞吞噬则死亡
4. 排行榜实时更新

## 项目结构

```
blackhole/
├── client/         # 前端 (PixiJS + Vite)
├── server/         # 后端 (Node.js + ws)
├── shared/         # 共享常量
└── docker-compose.yml
```
