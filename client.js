window.__ModuleLoader__.load({
  id: '@byteheng/dsh-2048',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'game-2048';
    const LOCALE_NS = 'game2048';
    const STATE_KEY = 'dsh.game2048.state.v1';
    const BEST_KEY = 'dsh.game2048.best.v1';

    // #region game-core
    const SIZE = 4;
    const CELL_COUNT = SIZE * SIZE;

    const MOVE_SPECS = {
      left: { axis: 'row', start: 0, step: 1 },
      right: { axis: 'row', start: SIZE - 1, step: -1 },
      up: { axis: 'col', start: 0, step: 1 },
      down: { axis: 'col', start: SIZE - 1, step: -1 },
    };

    const KEY_DIRECTION = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      a: 'left',
      d: 'right',
      w: 'up',
      s: 'down',
    };

    function emptyGrid() {
      return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    }

    function tilesToGrid(tiles) {
      const grid = emptyGrid();
      for (const tile of tiles) {
        if (tile.row >= 0 && tile.row < SIZE && tile.col >= 0 && tile.col < SIZE) {
          grid[tile.row][tile.col] = tile;
        }
      }
      return grid;
    }

    function maxTileValue(tiles) {
      let max = 0;
      for (const tile of tiles) max = Math.max(max, tile.value);
      return max;
    }

    function maxTileId(tiles) {
      let max = 0;
      for (const tile of tiles) max = Math.max(max, tile.id);
      return max;
    }

    function hasMoves(tiles) {
      if (tiles.length < CELL_COUNT) return true;
      const grid = tilesToGrid(tiles);
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          const tile = grid[row][col];
          if (!tile) return true;
          if (col + 1 < SIZE && grid[row][col + 1] && grid[row][col + 1].value === tile.value) return true;
          if (row + 1 < SIZE && grid[row + 1][col] && grid[row + 1][col].value === tile.value) return true;
        }
      }
      return false;
    }

    function spawnRandomTile(tiles, random = Math.random, nextId = maxTileId(tiles) + 1) {
      const occupied = new Set(tiles.map((tile) => `${tile.row}:${tile.col}`));
      const empty = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          if (!occupied.has(`${row}:${col}`)) empty.push({ row, col });
        }
      }
      if (empty.length === 0) return { tiles, nextId };
      const pick = empty[Math.min(empty.length - 1, Math.floor(Math.max(0, random()) * empty.length))];
      const value = random() < 0.9 ? 2 : 4;
      return {
        tiles: [
          ...tiles,
          { id: nextId, row: pick.row, col: pick.col, value, isNew: true, isMerged: false },
        ],
        nextId: nextId + 1,
      };
    }

    function moveTiles(tiles, direction, random = Math.random, nextId = maxTileId(tiles) + 1) {
      const spec = MOVE_SPECS[direction];
      if (!spec) return { tiles, scoreDelta: 0, moved: false, nextId };
      const grid = tilesToGrid(tiles);
      const nextTiles = [];
      let moved = false;
      let scoreDelta = 0;
      let cursor = Math.max(nextId, maxTileId(tiles) + 1);

      for (let line = 0; line < SIZE; line += 1) {
        const positions = [];
        for (let index = 0; index < SIZE; index += 1) {
          positions.push({
            row: spec.axis === 'row' ? line : spec.start + spec.step * index,
            col: spec.axis === 'col' ? line : spec.start + spec.step * index,
          });
        }

        const lineTiles = [];
        for (const position of positions) {
          const tile = grid[position.row][position.col];
          if (tile) lineTiles.push(tile);
        }

        let target = 0;
        for (let index = 0; index < lineTiles.length;) {
          const first = lineTiles[index];
          const second = lineTiles[index + 1];
          const position = positions[target];

          if (second && second.value === first.value) {
            const value = first.value * 2;
            nextTiles.push({
              id: cursor,
              row: position.row,
              col: position.col,
              value,
              isNew: false,
              isMerged: true,
            });
            cursor += 1;
            scoreDelta += value;
            moved = true;
            index += 2;
          } else {
            if (first.row !== position.row || first.col !== position.col) moved = true;
            nextTiles.push({
              id: first.id,
              row: position.row,
              col: position.col,
              value: first.value,
              isNew: false,
              isMerged: false,
            });
            index += 1;
          }
          target += 1;
        }
      }

      if (!moved) return { tiles, scoreDelta: 0, moved: false, nextId: cursor };
      const spawned = spawnRandomTile(nextTiles, random, cursor);
      return { tiles: spawned.tiles, scoreDelta, moved: true, nextId: spawned.nextId };
    }

    function newGameState(best = 0, random = Math.random) {
      let tiles = [];
      let nextId = 1;
      let spawned = spawnRandomTile(tiles, random, nextId);
      tiles = spawned.tiles;
      nextId = spawned.nextId;
      spawned = spawnRandomTile(tiles, random, nextId);
      return {
        tiles: spawned.tiles,
        score: 0,
        best: Math.max(0, best | 0),
        nextId: spawned.nextId,
        winDismissed: false,
      };
    }

    function restoreSavedState(raw, fallbackBest = 0) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!parsed || !Array.isArray(parsed.tiles) || parsed.tiles.length === 0 || parsed.tiles.length > CELL_COUNT) {
        return null;
      }

      const ids = new Set();
      const cells = new Set();
      const tiles = [];
      let highestId = 0;

      for (const candidate of parsed.tiles) {
        if (!candidate || typeof candidate !== 'object') return null;
        const { id, row, col, value } = candidate;
        if (!Number.isInteger(id) || id < 1 || ids.has(id)) return null;
        if (!Number.isInteger(row) || row < 0 || row >= SIZE) return null;
        if (!Number.isInteger(col) || col < 0 || col >= SIZE) return null;
        if (!Number.isInteger(value) || value < 2 || value > 1073741824) return null;
        if ((value & (value - 1)) !== 0) return null;
        const cell = `${row}:${col}`;
        if (cells.has(cell)) return null;
        ids.add(id);
        cells.add(cell);
        highestId = Math.max(highestId, id);
        tiles.push({ id, row, col, value, isNew: false, isMerged: false });
      }

      const score = Number.isFinite(parsed.score) && parsed.score >= 0 ? Math.floor(parsed.score) : 0;
      const storedBest = Number.isFinite(parsed.best) && parsed.best >= 0 ? Math.floor(parsed.best) : 0;
      return {
        tiles,
        score,
        best: Math.max(fallbackBest, storedBest, maxTileValue(tiles)),
        nextId: highestId + 1,
        winDismissed: parsed.winDismissed === true,
      };
    }
    // #endregion game-core

    const EN = {
      panel: '2048',
      title: '2048',
      kicker: 'DSH · MINI GAME',
      subtitle: 'Merge matching tiles and chase 2048.',
      score: 'Score',
      best: 'Best',
      undo: 'Undo',
      newGame: 'New game',
      hint: 'Arrow keys / WASD / swipe',
      boardAria: '2048 board. Use the arrow keys, W A S D, or swipe to move the tiles.',
      autosave: 'Progress is saved on this device.',
      restartTitle: 'Start over?',
      restartBody: 'Your current board and score will be cleared.',
      cancel: 'Cancel',
      restart: 'Start over',
      winEyebrow: 'Milestone',
      winTitle: '2048 reached!',
      winBody: 'You built the 2048 tile. Keep going for an even bigger number.',
      keepGoing: 'Keep going',
      overEyebrow: 'Game over',
      overTitle: 'No moves left',
      overBody: 'The board is locked. Start a fresh run and beat your best.',
      finalScore: 'Final score',
      tryAgain: 'Try again',
      movePad: 'Move tiles',
      moveUp: 'Move up',
      moveLeft: 'Move left',
      moveDown: 'Move down',
      moveRight: 'Move right',
    };

    const ZH = {
      panel: '2048',
      title: '2048',
      kicker: 'DSH · 小游戏',
      subtitle: '合并相同数字，一路拼到 2048。',
      score: '分数',
      best: '最高分',
      undo: '撤销',
      newGame: '新游戏',
      hint: '方向键 / WASD / 滑动',
      boardAria: '2048 棋盘。用方向键、WASD 或滑动来移动方块。',
      autosave: '进度自动保存在本机。',
      restartTitle: '重新开始？',
      restartBody: '当前棋盘和分数会被清空。',
      cancel: '取消',
      restart: '重新开始',
      winEyebrow: '里程碑',
      winTitle: '拼出 2048 了！',
      winBody: '你合成了 2048 方块，还可以继续挑战更大的数字。',
      keepGoing: '继续挑战',
      overEyebrow: '本局结束',
      overTitle: '没有可移动的方块了',
      overBody: '棋盘已经锁住，再来一局刷新最高分吧。',
      finalScore: '本局得分',
      tryAgain: '再来一局',
      movePad: '移动方块',
      moveUp: '向上移动',
      moveLeft: '向左移动',
      moveDown: '向下移动',
      moveRight: '向右移动',
    };

    const CSS = `
      .g2048-page {
        box-sizing: border-box;
        min-height: 100%;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: clamp(20px, 4vh, 44px) clamp(16px, 4vw, 40px) 36px;
        overflow: auto;
        color: var(--dsw-alias-label-primary);
        background-color: var(--dsw-alias-bg-base);
        background-image:
          radial-gradient(760px 360px at 50% -120px, color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent), transparent 72%),
          linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-bg-layer-1) 45%, transparent), transparent 230px);
      }

      .g2048-shell {
        width: min(100%, 516px);
        margin-block: auto;
        display: flex;
        flex-direction: column;
        gap: clamp(14px, 2.2vh, 20px);
      }

      .g2048-hero {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 18px;
        flex-wrap: wrap;
      }

      .g2048-brand { flex: 1 1 230px; min-width: 0; }

      .g2048-kicker {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 8px;
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .16em;
        text-transform: uppercase;
      }

      .g2048-kicker::before {
        content: "";
        width: 18px;
        height: 2px;
        border-radius: 999px;
        background: var(--dsw-alias-brand-primary);
      }

      .g2048-title {
        margin: 0;
        color: var(--dsw-alias-label-primary);
        font-size: clamp(3rem, 8vw, 4.35rem);
        font-weight: 900;
        line-height: .88;
        letter-spacing: -.085em;
        font-variant-numeric: tabular-nums;
      }

      @supports ((-webkit-background-clip: text) or (background-clip: text)) {
        .g2048-title {
          background-image: linear-gradient(118deg, var(--dsw-alias-label-primary) 28%, #d8844d 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
      }

      .g2048-subtitle {
        margin: 10px 0 0;
        max-width: 27em;
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
        line-height: 1.55;
      }

      .g2048-scores { display: flex; gap: 8px; flex: 0 0 auto; }

      .g2048-score {
        min-width: 88px;
        padding: 9px 13px 8px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 14px;
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 12px 24px -22px rgba(0, 0, 0, .7);
      }

      .g2048-score-best {
        border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, var(--dsw-alias-border-l1));
      }

      .g2048-score-label {
        display: block;
        color: var(--dsw-alias-label-secondary);
        font-size: 9px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: .13em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .g2048-score-value {
        display: block;
        margin-top: 3px;
        color: var(--dsw-alias-label-primary);
        font-size: 22px;
        font-weight: 800;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        animation: g2048-score-pop 180ms cubic-bezier(.2, .9, .3, 1.3);
      }

      .g2048-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px 14px;
        flex-wrap: wrap;
        margin-top: -2px;
      }

      .g2048-hint {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 1.4;
        white-space: nowrap;
      }

      .g2048-keycaps { display: inline-flex; gap: 3px; }

      .g2048-keycap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 19px;
        height: 19px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 5px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 1;
        box-shadow: 0 1px 0 var(--dsw-alias-border-l1);
      }

      .g2048-actions { display: flex; align-items: center; gap: 8px; }

      .g2048-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 34px;
        padding: 0 13px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 12px;
        font-weight: 650;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
      }

      .g2048-btn:hover:not(:disabled) {
        border-color: var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
      }

      .g2048-btn:active:not(:disabled) { transform: translateY(1px); }

      .g2048-btn:disabled { opacity: .42; cursor: default; }

      .g2048-btn-primary {
        border-color: transparent;
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-base);
      }

      .g2048-btn-primary:hover:not(:disabled) {
        border-color: transparent;
        background: color-mix(in srgb, var(--dsw-alias-label-primary) 86%, var(--dsw-alias-bg-base));
      }

      .g2048-btn:focus-visible,
      .g2048-board:focus-visible,
      .g2048-dpad button:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }

      .g2048-board-wrap { position: relative; width: 100%; }

      .g2048-board {
        --gap: 10px;
        position: relative;
        width: 100%;
        aspect-ratio: 1;
        padding: var(--gap);
        box-sizing: border-box;
        border-radius: 22px;
        background:
          linear-gradient(150deg, rgba(255, 255, 255, .16), transparent 38%),
          linear-gradient(150deg, #bba99a 0%, #a58b79 100%);
        box-shadow:
          0 22px 44px -22px rgba(47, 30, 17, .55),
          0 2px 0 rgba(255, 255, 255, .18) inset,
          0 0 0 1px rgba(71, 49, 32, .18);
        touch-action: none;
        outline: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .g2048-grid,
      .g2048-tiles {
        position: absolute;
        inset: var(--gap);
      }

      .g2048-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(4, 1fr);
        gap: var(--gap);
      }

      .g2048-cell {
        border-radius: clamp(8px, 2.3vw, 12px);
        background: rgba(250, 246, 240, .28);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12);
      }

      .g2048-tiles { pointer-events: none; }

      .g2048-tile {
        position: absolute;
        top: 0;
        left: 0;
        width: calc((100% - 3 * var(--gap)) / 4);
        height: calc((100% - 3 * var(--gap)) / 4);
        transition: transform 120ms cubic-bezier(.2, .8, .25, 1);
        will-change: transform;
      }

      .g2048-tile-face {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        padding: 0 4px;
        border-radius: clamp(8px, 2.3vw, 12px);
        color: #776e65;
        font-size: clamp(1.4rem, 5.6vw, 2.05rem);
        font-weight: 850;
        line-height: 1;
        letter-spacing: -.055em;
        font-variant-numeric: tabular-nums;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, .3),
          0 2px 0 rgba(60, 38, 20, .08);
      }

      .g2048-tile[data-digits="3"] .g2048-tile-face {
        font-size: clamp(1.1rem, 4.6vw, 1.68rem);
      }

      .g2048-tile[data-digits="4"] .g2048-tile-face {
        font-size: clamp(.92rem, 3.85vw, 1.4rem);
      }

      .g2048-tile[data-digits="5"] .g2048-tile-face {
        font-size: clamp(.78rem, 3.25vw, 1.18rem);
      }

      .g2048-tile.g2048-v2 .g2048-tile-face { background: #eee4da; }
      .g2048-tile.g2048-v4 .g2048-tile-face { background: #ede0c8; }
      .g2048-tile.g2048-v8 .g2048-tile-face { background: #f2b179; color: #fffaf5; }
      .g2048-tile.g2048-v16 .g2048-tile-face { background: #f59563; color: #fffaf5; }
      .g2048-tile.g2048-v32 .g2048-tile-face { background: #f67c5f; color: #fffaf5; }
      .g2048-tile.g2048-v64 .g2048-tile-face { background: #f65e3b; color: #fffaf5; }
      .g2048-tile.g2048-v128 .g2048-tile-face { background: #eccb6e; color: #fffaf5; box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 18px rgba(236, 203, 110, .18); }
      .g2048-tile.g2048-v256 .g2048-tile-face { background: #eac85f; color: #fffaf5; box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 22px rgba(234, 200, 95, .24); }
      .g2048-tile.g2048-v512 .g2048-tile-face { background: #e9c34d; color: #fffaf5; box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 26px rgba(233, 195, 77, .3); }
      .g2048-tile.g2048-v1024 .g2048-tile-face { background: #e7bd37; color: #fffaf5; box-shadow: inset 0 1px 0 rgba(255,255,255,.42), 0 0 30px rgba(231, 189, 55, .36); }
      .g2048-tile.g2048-v2048 .g2048-tile-face {
        background: linear-gradient(145deg, #f5d76e, #e7b72c);
        color: #fffdf7;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.55), 0 0 0 2px rgba(255, 230, 145, .32), 0 0 38px rgba(244, 203, 71, .55);
      }
      .g2048-tile.g2048-v4096 .g2048-tile-face { background: linear-gradient(145deg, #5c5147, #37312b); color: #fff6e7; }
      .g2048-tile.g2048-v-super .g2048-tile-face {
        background: linear-gradient(145deg, #292521, #4b3b2d);
        color: #ffe0a3;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 0 34px rgba(255, 185, 91, .3);
      }

      .g2048-tile[data-new="true"] .g2048-tile-face {
        animation: g2048-appear 180ms cubic-bezier(.2, .9, .3, 1.3) both;
      }

      .g2048-tile[data-merged="true"] .g2048-tile-face {
        animation: g2048-merge 220ms cubic-bezier(.2, .9, .3, 1.25) both;
      }

      .g2048-overlay {
        position: absolute;
        z-index: 10;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(18px, 5vw, 34px);
        box-sizing: border-box;
        border-radius: 22px;
        background: rgba(34, 26, 19, .38);
        background: color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent);
        -webkit-backdrop-filter: blur(6px);
        backdrop-filter: blur(6px);
        animation: g2048-fade 180ms ease both;
      }

      .g2048-overlay-card {
        width: min(100%, 310px);
        padding: clamp(20px, 4vw, 27px);
        box-sizing: border-box;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 18px;
        background: var(--dsw-alias-bg-layer-1);
        box-shadow: 0 28px 70px -26px rgba(0, 0, 0, .65);
        text-align: center;
        animation: g2048-card-in 220ms cubic-bezier(.2, .9, .3, 1.15) both;
      }

      .g2048-overlay-eyebrow {
        margin: 0 0 8px;
        color: var(--dsw-alias-brand-primary);
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .17em;
        text-transform: uppercase;
      }

      .g2048-overlay-title {
        margin: 0;
        color: var(--dsw-alias-label-primary);
        font-size: clamp(20px, 4.4vw, 26px);
        font-weight: 800;
        line-height: 1.15;
        letter-spacing: -.035em;
      }

      .g2048-overlay-copy {
        margin: 10px 0 0;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.6;
      }

      .g2048-overlay-copy strong {
        color: var(--dsw-alias-label-primary);
        font-size: 18px;
        font-variant-numeric: tabular-nums;
      }

      .g2048-overlay-actions {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 18px;
      }

      .g2048-dialog-actions {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 20px;
      }

      .g2048-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 38px;
      }

      .g2048-autosave {
        margin: 0;
        color: var(--dsw-alias-label-secondary);
        font-size: 10px;
        line-height: 1.5;
        opacity: .82;
      }

      .g2048-dpad {
        display: none;
        grid-template-columns: repeat(3, 34px);
        grid-template-rows: repeat(3, 30px);
        gap: 5px;
        flex: 0 0 auto;
      }

      .g2048-dpad button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
        touch-action: manipulation;
      }

      .g2048-dpad button:active {
        background: var(--dsw-alias-bg-layer-2);
        transform: translateY(1px);
      }

      .g2048-dpad-up { grid-area: 1 / 2; }
      .g2048-dpad-left { grid-area: 2 / 1; }
      .g2048-dpad-down { grid-area: 2 / 2; }
      .g2048-dpad-right { grid-area: 2 / 3; }

      .g2048-sr {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @keyframes g2048-appear {
        from { opacity: 0; transform: scale(.35); }
        to { opacity: 1; transform: scale(1); }
      }

      @keyframes g2048-merge {
        0% { transform: scale(.86); }
        58% { transform: scale(1.13); }
        100% { transform: scale(1); }
      }

      @keyframes g2048-score-pop {
        from { opacity: .35; transform: translateY(3px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes g2048-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes g2048-card-in {
        from { opacity: 0; transform: translateY(10px) scale(.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @media (max-width: 680px) {
        .g2048-page {
          padding: 18px 14px 26px;
          align-items: flex-start;
        }

        .g2048-shell {
          margin-block: 0;
          gap: 14px;
        }

        .g2048-hero { align-items: flex-start; gap: 14px; }
        .g2048-subtitle { margin-top: 8px; }
        .g2048-scores { width: 100%; }
        .g2048-score { flex: 1; }
        .g2048-score-value { font-size: 20px; }
        .g2048-toolbar { margin-top: 0; }
        .g2048-hint { order: 2; width: 100%; }
        .g2048-board { --gap: 8px; border-radius: 18px; }
        .g2048-overlay { border-radius: 18px; }
      }

      @media (hover: none), (max-width: 680px) {
        .g2048-dpad { display: grid; }
      }

      @media (prefers-reduced-motion: reduce) {
        .g2048-tile { transition: none; }
        .g2048-tile-face,
        .g2048-overlay,
        .g2048-overlay-card,
        .g2048-score-value { animation: none !important; }
      }
    `;

    function readBest() {
      try {
        const value = Number(window.localStorage.getItem(BEST_KEY));
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
      } catch {
        return 0;
      }
    }

    function loadGame() {
      const best = readBest();
      try {
        const raw = window.localStorage.getItem(STATE_KEY);
        if (raw) {
          const restored = restoreSavedState(raw, best);
          if (restored) return restored;
        }
      } catch {
        // A blocked or full localStorage should never prevent playing.
      }
      return newGameState(best, Math.random);
    }

    function saveGame(game) {
      try {
        const payload = {
          version: 1,
          tiles: game.tiles.map(({ id, row, col, value }) => ({ id, row, col, value })),
          score: game.score,
          best: game.best,
          winDismissed: game.winDismissed,
        };
        window.localStorage.setItem(STATE_KEY, JSON.stringify(payload));
        window.localStorage.setItem(BEST_KEY, String(game.best));
      } catch {
        // Persistence is a convenience; the in-memory game remains authoritative.
      }
    }

    function tileTransform(row, col) {
      const x = col === 0 ? '0%' : `calc(${col * 100}% + ${col} * var(--gap))`;
      const y = row === 0 ? '0%' : `calc(${row * 100}% + ${row} * var(--gap))`;
      return `translate(${x}, ${y})`;
    }

    function tileTone(value) {
      if (value <= 2048) return `g2048-v${value}`;
      if (value === 4096) return 'g2048-v4096';
      return 'g2048-v-super';
    }

    function ScoreCard({ label, value, best }) {
      return h(
        'div',
        { className: `g2048-score${best ? ' g2048-score-best' : ''}` },
        h('span', { className: 'g2048-score-label' }, label),
        h('strong', { key: String(value), className: 'g2048-score-value' }, value),
      );
    }

    function SidebarIcon({ size, active }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': true,
          focusable: false,
          style: { display: 'block', opacity: active ? 1 : 0.82 },
        },
        h('rect', { x: 1.5, y: 1.5, width: 9, height: 9, rx: 2.2, fill: 'currentColor' }),
        h('rect', { x: 13.5, y: 1.5, width: 9, height: 9, rx: 2.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, opacity: 0.48 }),
        h('rect', { x: 1.5, y: 13.5, width: 9, height: 9, rx: 2.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, opacity: 0.48 }),
        h('rect', { x: 13.5, y: 13.5, width: 9, height: 9, rx: 2.2, fill: 'currentColor', opacity: 0.62 }),
      );
    }

    function Game2048(props) {
      const { t, usePanelInfo } = props;
      const [game, setGame] = React.useState(loadGame);
      const gameRef = React.useRef(game);
      gameRef.current = game;

      const [history, setHistory] = React.useState([]);
      const historyRef = React.useRef(history);
      historyRef.current = history;

      const [confirmRestart, setConfirmRestart] = React.useState(false);
      const touchRef = React.useRef(null);
      const active = usePanelInfo((info) => info.activePanelId === PANEL_ID);

      const gameOver = !hasMoves(game.tiles);
      const highest = maxTileValue(game.tiles);
      const showWin = highest >= 2048 && !game.winDismissed && !gameOver;
      const canUndo = history.length > 0;

      function commit(next) {
        gameRef.current = next;
        setGame(next);
      }

      function remember(snapshot) {
        const next = [...historyRef.current.slice(-19), snapshot];
        historyRef.current = next;
        setHistory(next);
      }

      function move(direction) {
        if (confirmRestart) return;
        const current = gameRef.current;
        if (!hasMoves(current.tiles)) return;
        if (maxTileValue(current.tiles) >= 2048 && !current.winDismissed) return;

        const result = moveTiles(current.tiles, direction, Math.random, current.nextId);
        if (!result.moved) return;

        remember({
          tiles: current.tiles,
          score: current.score,
          nextId: current.nextId,
          winDismissed: current.winDismissed,
        });

        const score = current.score + result.scoreDelta;
        commit({
          ...current,
          tiles: result.tiles,
          score,
          best: Math.max(current.best, score, maxTileValue(result.tiles)),
          nextId: result.nextId,
        });
      }

      function undo() {
        if (confirmRestart) return;
        const previous = historyRef.current[historyRef.current.length - 1];
        if (!previous) return;
        const remaining = historyRef.current.slice(0, -1);
        historyRef.current = remaining;
        setHistory(remaining);
        const current = gameRef.current;
        commit({
          ...current,
          tiles: previous.tiles,
          score: previous.score,
          nextId: previous.nextId,
          winDismissed: previous.winDismissed,
        });
      }

      function restart() {
        const next = newGameState(gameRef.current.best, Math.random);
        historyRef.current = [];
        setHistory([]);
        setConfirmRestart(false);
        commit(next);
      }

      function requestRestart() {
        if (gameRef.current.score === 0) restart();
        else setConfirmRestart(true);
      }

      function keepPlaying() {
        commit({ ...gameRef.current, winDismissed: true });
      }

      const moveRef = React.useRef(move);
      moveRef.current = move;

      React.useEffect(() => {
        if (!active) return undefined;
        function onKeyDown(event) {
          if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
          const target = event.target;
          if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

          if (confirmRestart) {
            if (event.key === 'Escape') {
              event.preventDefault();
              setConfirmRestart(false);
            }
            return;
          }

          if (showWin) {
            if (event.key === 'Enter') {
              event.preventDefault();
              keepPlaying();
            }
            return;
          }

          if (gameOver) return;
          const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
          const direction = KEY_DIRECTION[key];
          if (!direction) return;
          event.preventDefault();
          moveRef.current(direction);
        }

        window.addEventListener('keydown', onKeyDown, { passive: false });
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [active, confirmRestart, showWin, gameOver]);

      React.useEffect(() => {
        const timer = window.setTimeout(() => saveGame(game), 90);
        return () => window.clearTimeout(timer);
      }, [game]);

      function onTouchStart(event) {
        if (event.touches.length !== 1) {
          touchRef.current = null;
          return;
        }
        touchRef.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }

      function onTouchEnd(event) {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
        else move(dy > 0 ? 'down' : 'up');
      }

      function dpadButton(direction, glyph, className, label) {
        return h(
          'button',
          {
            type: 'button',
            className,
            'aria-label': label,
            onClick: () => move(direction),
          },
          glyph,
        );
      }

      const cells = [];
      for (let index = 0; index < CELL_COUNT; index += 1) {
        cells.push(h('div', { key: index, className: 'g2048-cell' }));
      }

      const tiles = [...game.tiles]
        .sort((left, right) => left.id - right.id)
        .map((tile) => h(
          'div',
          {
            key: tile.id,
            className: `g2048-tile ${tileTone(tile.value)}`,
            'data-digits': String(tile.value).length,
            'data-new': tile.isNew ? 'true' : undefined,
            'data-merged': tile.isMerged ? 'true' : undefined,
            'aria-hidden': true,
            style: { transform: tileTransform(tile.row, tile.col) },
          },
          h('div', { className: 'g2048-tile-face' }, tile.value),
        ));

      let overlay = null;
      if (confirmRestart) {
        overlay = h(
          'div',
          {
            className: 'g2048-overlay',
            role: 'alertdialog',
            'aria-modal': 'true',
            'aria-labelledby': 'g2048-restart-title',
          },
          h(
            'div',
            { className: 'g2048-overlay-card' },
            h('p', { className: 'g2048-overlay-eyebrow' }, t('restartTitle')),
            h('h2', { id: 'g2048-restart-title', className: 'g2048-overlay-title' }, t('restartTitle')),
            h('p', { className: 'g2048-overlay-copy' }, t('restartBody')),
            h(
              'div',
              { className: 'g2048-dialog-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'g2048-btn',
                  autoFocus: true,
                  onClick: () => setConfirmRestart(false),
                },
                t('cancel'),
              ),
              h(
                'button',
                { type: 'button', className: 'g2048-btn g2048-btn-primary', onClick: restart },
                t('restart'),
              ),
            ),
          ),
        );
      } else if (showWin) {
        overlay = h(
          'div',
          {
            className: 'g2048-overlay',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'g2048-win-title',
          },
          h(
            'div',
            { className: 'g2048-overlay-card' },
            h('p', { className: 'g2048-overlay-eyebrow' }, t('winEyebrow')),
            h('h2', { id: 'g2048-win-title', className: 'g2048-overlay-title' }, t('winTitle')),
            h('p', { className: 'g2048-overlay-copy' }, t('winBody')),
            h(
              'div',
              { className: 'g2048-overlay-actions' },
              h(
                'button',
                { type: 'button', className: 'g2048-btn g2048-btn-primary', onClick: keepPlaying, autoFocus: true },
                t('keepGoing'),
              ),
            ),
          ),
        );
      } else if (gameOver) {
        overlay = h(
          'div',
          {
            className: 'g2048-overlay',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'g2048-over-title',
          },
          h(
            'div',
            { className: 'g2048-overlay-card' },
            h('p', { className: 'g2048-overlay-eyebrow' }, t('overEyebrow')),
            h('h2', { id: 'g2048-over-title', className: 'g2048-overlay-title' }, t('overTitle')),
            h(
              'p',
              { className: 'g2048-overlay-copy' },
              t('overBody'),
              h('br'),
              t('finalScore'),
              ' ',
              h('strong', null, game.score),
            ),
            h(
              'div',
              { className: 'g2048-overlay-actions' },
              h(
                'button',
                { type: 'button', className: 'g2048-btn g2048-btn-primary', onClick: restart, autoFocus: true },
                t('tryAgain'),
              ),
            ),
          ),
        );
      }

      const liveMessage = showWin
        ? t('winTitle')
        : gameOver
          ? t('overTitle')
          : `${t('score')} ${game.score}, ${t('best')} ${game.best}`;

      return h(
        'div',
        { className: 'g2048-page' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'g2048-shell' },
          h(
            'header',
            { className: 'g2048-hero' },
            h(
              'div',
              { className: 'g2048-brand' },
              h('span', { className: 'g2048-kicker' }, t('kicker')),
              h('h1', { className: 'g2048-title' }, t('title')),
              h('p', { className: 'g2048-subtitle' }, t('subtitle')),
            ),
            h(
              'div',
              { className: 'g2048-scores' },
              h(ScoreCard, { label: t('score'), value: game.score }),
              h(ScoreCard, { label: t('best'), value: game.best, best: true }),
            ),
          ),
          h(
            'div',
            { className: 'g2048-toolbar' },
            h(
              'span',
              { className: 'g2048-hint' },
              h(
                'span',
                { className: 'g2048-keycaps', 'aria-hidden': true },
                h('span', { className: 'g2048-keycap' }, '←'),
                h('span', { className: 'g2048-keycap' }, '↑'),
                h('span', { className: 'g2048-keycap' }, '↓'),
                h('span', { className: 'g2048-keycap' }, '→'),
              ),
              t('hint'),
            ),
            h(
              'div',
              { className: 'g2048-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'g2048-btn',
                  disabled: !canUndo,
                  onClick: undo,
                },
                t('undo'),
              ),
              h(
                'button',
                { type: 'button', className: 'g2048-btn g2048-btn-primary', onClick: requestRestart },
                t('newGame'),
              ),
            ),
          ),
          h(
            'div',
            { className: 'g2048-board-wrap' },
            h(
              'div',
              {
                className: 'g2048-board',
                role: 'group',
                tabIndex: 0,
                'aria-label': t('boardAria'),
                onTouchStart,
                onTouchEnd,
              },
              h('div', { className: 'g2048-grid', 'aria-hidden': true }, cells),
              h('div', { className: 'g2048-tiles' }, tiles),
              overlay,
            ),
          ),
          h(
            'footer',
            { className: 'g2048-footer' },
            h('p', { className: 'g2048-autosave' }, t('autosave')),
            h(
              'div',
              { className: 'g2048-dpad', role: 'group', 'aria-label': t('movePad') },
              dpadButton('up', '↑', 'g2048-dpad-up', t('moveUp')),
              dpadButton('left', '←', 'g2048-dpad-left', t('moveLeft')),
              dpadButton('down', '↓', 'g2048-dpad-down', t('moveDown')),
              dpadButton('right', '→', 'g2048-dpad-right', t('moveRight')),
            ),
          ),
          h('p', { className: 'g2048-sr', 'aria-live': 'polite' }, liveMessage),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(LOCALE_NS);
        ctx.effect(() => ctx.locale.register(LOCALE_NS, 'en', EN), 'game2048: English dictionary');
        ctx.effect(() => ctx.locale.register(LOCALE_NS, 'zh', ZH), 'game2048: Chinese dictionary');

        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: PANEL_ID, locale: LOCALE_NS },
          Game2048,
        ));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: LOCALE_NS,
            label: () => t('panel'),
          },
          SidebarIcon,
        ));
      },
    };
  },
});
