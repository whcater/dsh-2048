import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const start = source.indexOf('// #region game-core');
const end = source.indexOf('// #endregion game-core');
assert.ok(start >= 0 && end > start, 'game-core region is present');

const body = source.slice(start, end);
const core = new Function(`${body}\nreturn {
  SIZE, CELL_COUNT, moveTiles, newGameState, spawnRandomTile,
  hasMoves, maxTileValue, restoreSavedState, tilesToGrid,
};`)();

const zero = () => 0;
const tile = (id, row, col, value) => ({ id, row, col, value, isNew: false, isMerged: false });

assert.equal(core.SIZE, 4);
assert.equal(core.CELL_COUNT, 16);

const fresh = core.newGameState(120, zero);
assert.equal(fresh.tiles.length, 2);
assert.equal(fresh.score, 0);
assert.equal(fresh.best, 120);
assert.equal(fresh.winDismissed, false);
assert.equal(new Set(fresh.tiles.map((entry) => `${entry.row}:${entry.col}`)).size, 2);
assert.ok(fresh.tiles.every((entry) => entry.value === 2));

const merged = core.moveTiles([
  tile(1, 0, 0, 2),
  tile(2, 0, 1, 2),
  tile(3, 0, 2, 4),
], 'left', zero, 4);
assert.equal(merged.moved, true);
assert.equal(merged.scoreDelta, 4);
assert.equal(merged.tiles.find((entry) => entry.row === 0 && entry.col === 0).value, 4);
assert.equal(merged.tiles.find((entry) => entry.row === 0 && entry.col === 1).value, 4);
assert.equal(merged.tiles.find((entry) => entry.row === 0 && entry.col === 2).value, 2);
assert.equal(merged.tiles.find((entry) => entry.value === 4 && entry.isMerged === true).id, 4);

const doubleMerge = core.moveTiles([
  tile(1, 0, 0, 2),
  tile(2, 0, 1, 2),
  tile(3, 0, 2, 2),
  tile(4, 0, 3, 2),
], 'left', zero, 5);
assert.equal(doubleMerge.scoreDelta, 8);
assert.deepEqual(
  doubleMerge.tiles.filter((entry) => entry.row === 0).map((entry) => entry.value),
  [4, 4, 2],
);

const right = core.moveTiles([
  tile(1, 0, 0, 2),
  tile(2, 0, 1, 2),
], 'right', zero, 3);
assert.equal(right.scoreDelta, 4);
assert.equal(right.tiles.find((entry) => entry.row === 0 && entry.col === 3).value, 4);
assert.equal(right.tiles.find((entry) => entry.row === 0 && entry.col === 0).value, 2);

const noMove = core.moveTiles([
  tile(1, 0, 0, 2),
  tile(2, 0, 1, 4),
], 'left', zero, 3);
assert.equal(noMove.moved, false);
assert.equal(noMove.tiles.length, 2);
assert.equal(noMove.nextId, 3);

const down = core.moveTiles([
  tile(1, 0, 0, 2),
  tile(2, 1, 0, 2),
], 'down', zero, 3);
assert.equal(down.scoreDelta, 4);
assert.equal(down.tiles.find((entry) => entry.row === 3 && entry.col === 0).value, 4);

const full = [];
let id = 1;
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 4; col += 1) {
    full.push(tile(id, row, col, (row + col) % 2 === 0 ? 2 : 4));
    id += 1;
  }
}
assert.equal(core.hasMoves(full), false);
full[0] = { ...full[0], value: full[1].value };
assert.equal(core.hasMoves(full), true);

const restored = core.restoreSavedState(JSON.stringify({
  score: 42,
  best: 100,
  tiles: [tile(7, 0, 0, 8), tile(9, 1, 1, 16)],
  winDismissed: false,
}), 0);
assert.equal(restored.score, 42);
assert.equal(restored.best, 100);
assert.equal(restored.nextId, 10);
assert.equal(restored.tiles.length, 2);
assert.equal(restored.tiles[0].isNew, false);

assert.equal(core.restoreSavedState('{', 0), null);
assert.equal(core.restoreSavedState(JSON.stringify({
  tiles: [tile(1, 0, 0, 6)],
}), 0), null);
assert.equal(core.restoreSavedState(JSON.stringify({
  tiles: [tile(1, 0, 0, 2), tile(2, 0, 0, 4)],
}), 0), null);

console.log('2048 core: all assertions passed');
