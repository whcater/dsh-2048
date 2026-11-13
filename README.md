# dsh-2048

一个挂在 DeepSeek Harness 左侧菜单里的 2048 小游戏插件（bundle）。

## 功能

- 侧边栏新增 `2048` 面板图标，点开即玩
- 键盘方向键 / WASD / 滑动 三种操作方式
- 分数与最高分本地持久化
- 一步撤销、重新开始
- 达成 2048 后可继续挑战
- 中英双语界面，自动跟随 Harness 主题（浅色 / 深色）

## 安装

### 方式一：Web 插件页

在 DSH Web 界面左侧打开 **插件（Plugins）**，安装 bundle：

```
@byteheng/dsh-2048
```

安装后启用 bundle，侧边栏会出现 2048 图标。

### 方式二：命令行

```sh
dsh plugin add @byteheng/dsh-2048
```

然后在你的 profile 的 bundle 列表里启用它（或通过 Web 插件页开启）。

## 使用

打开侧边栏的 **2048** 面板：

- **方向键 / WASD**：移动方块
- **滑动**：在棋盘上滑动
- **撤销**：回退上一步
- **新游戏**：重新开局

## 开发

```sh
# 跑核心逻辑测试（需要 Node）
node test-core.mjs
```

发布到 npm：

```sh
npm publish --access public
```

## License

MIT
