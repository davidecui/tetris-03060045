/* ================================================================
   Tetris Web — Game Engine
   Pure client-side Tetris rendered on an HTML5 Canvas.
   ================================================================ */

(() => {
  "use strict";

  // ───────── Constants ─────────
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30; // px per cell on the game canvas
  const PREVIEW_CELL = 24;
  const COLORS = {
    I: "#22d3ee",
    O: "#facc15",
    T: "#a78bfa",
    S: "#4ade80",
    Z: "#f87171",
    J: "#60a5fa",
    L: "#fb923c",
  };
  const GHOST_ALPHA = 0.18;

  // Tetromino shapes — each piece has 4 rotation states (SRS-ish).
  // Stored as arrays of [row, col] offsets from the piece origin.
  const SHAPES = {
    I: [
      [[0,0],[0,1],[0,2],[0,3]],
      [[0,0],[1,0],[2,0],[3,0]],
      [[0,0],[0,1],[0,2],[0,3]],
      [[0,0],[1,0],[2,0],[3,0]],
    ],
    O: [
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
      [[0,0],[0,1],[1,0],[1,1]],
    ],
    T: [
      [[0,1],[1,0],[1,1],[1,2]],
      [[0,0],[1,0],[1,1],[2,0]],
      [[0,0],[0,1],[0,2],[1,1]],
      [[0,1],[1,0],[1,1],[2,1]],
    ],
    S: [
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,0],[1,0],[1,1],[2,1]],
      [[0,1],[0,2],[1,0],[1,1]],
      [[0,0],[1,0],[1,1],[2,1]],
    ],
    Z: [
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,1],[1,0],[1,1],[2,0]],
      [[0,0],[0,1],[1,1],[1,2]],
      [[0,1],[1,0],[1,1],[2,0]],
    ],
    J: [
      [[0,0],[1,0],[1,1],[1,2]],
      [[0,0],[0,1],[1,0],[2,0]],
      [[0,0],[0,1],[0,2],[1,2]],
      [[0,0],[1,0],[2,0],[2,-1]],
    ],
    L: [
      [[0,2],[1,0],[1,1],[1,2]],
      [[0,0],[1,0],[2,0],[2,1]],
      [[0,0],[0,1],[0,2],[1,0]],
      [[0,0],[0,1],[1,1],[2,1]],
    ],
  };

  const PIECE_NAMES = Object.keys(SHAPES);

  // Wall-kick offsets to try when rotating (simplified).
  const KICKS = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
  ];

  // Scoring table
  const LINE_SCORES = [0, 100, 300, 500, 800];
  const LINES_PER_LEVEL = 10;

  // ───────── DOM References ─────────
  const gameCanvas  = document.getElementById("game-canvas");
  const nextCanvas  = document.getElementById("next-canvas");
  const holdCanvas  = document.getElementById("hold-canvas");
  const ctx         = gameCanvas.getContext("2d");
  const nextCtx     = nextCanvas.getContext("2d");
  const holdCtx     = holdCanvas.getContext("2d");
  const scoreEl     = document.getElementById("score");
  const levelEl     = document.getElementById("level");
  const linesEl     = document.getElementById("lines");
  const overlayPause    = document.getElementById("overlay-pause");
  const overlayGameOver = document.getElementById("overlay-gameover");
  const finalScoreEl    = document.getElementById("final-score-display");

  // ───────── Game State ─────────
  const State = { PLAYING: 0, PAUSED: 1, GAME_OVER: 2 };

  let board      = [];
  let current    = null;   // { type, rotation, row, col }
  let nextPiece  = null;
  let holdPiece  = null;
  let canHold    = true;
  let score      = 0;
  let level      = 1;
  let lines      = 0;
  let state      = State.PLAYING;
  let dropTimer  = 0;
  let lastTime   = 0;
  let bag        = [];

  // ───────── Helpers ─────────

  /** Return the drop interval in ms for the current level. */
  function dropInterval() {
    return Math.max(80, 1000 - (level - 1) * 80);
  }

  /** Create an empty board (ROWS × COLS), each cell = null or a color string. */
  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  /** 7-bag random generator: shuffles all 7 pieces, deals them, repeats. */
  function randomPiece() {
    if (bag.length === 0) {
      bag = [...PIECE_NAMES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  }

  /** Get the cell positions for a piece at its current rotation. */
  function cells(piece) {
    return SHAPES[piece.type][piece.rotation].map(([r, c]) => [
      piece.row + r,
      piece.col + c,
    ]);
  }

  /** Check whether a piece in a given position/rotation is valid. */
  function isValid(piece) {
    return cells(piece).every(
      ([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !board[r][c]
    );
  }

  /** Create a new piece object at the spawn position. */
  function spawnPiece(type) {
    return { type, rotation: 0, row: 0, col: Math.floor((COLS - 3) / 2) };
  }

  // ───────── Core Game Logic ─────────

  function init() {
    board     = createBoard();
    bag       = [];
    nextPiece = randomPiece();
    holdPiece = null;
    canHold   = true;
    current   = spawnPiece(randomPiece());
    score     = 0;
    level     = 1;
    lines     = 0;
    dropTimer = 0;
    lastTime  = 0;
    state     = State.PLAYING;
    overlayPause.classList.add("hidden");
    overlayGameOver.classList.add("hidden");
    updateStats();
  }

  function lock() {
    cells(current).forEach(([r, c]) => {
      if (r >= 0 && r < ROWS) board[r][c] = COLORS[current.type];
    });
    canHold = true;
    clearRows();
    spawnNext();
  }

  function spawnNext() {
    current = spawnPiece(nextPiece);
    nextPiece = randomPiece();
    if (!isValid(current)) {
      state = State.GAME_OVER;
      finalScoreEl.textContent = `Score: ${score}`;
      overlayGameOver.classList.remove("hidden");
    }
  }

  function clearRows() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((cell) => cell !== null)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        r++; // re-check this row index
      }
    }
    if (cleared > 0) {
      score += LINE_SCORES[cleared] * level;
      lines += cleared;
      const newLevel = Math.floor(lines / LINES_PER_LEVEL) + 1;
      if (newLevel !== level) {
        level = newLevel;
        bumpStat(levelEl);
      }
      bumpStat(scoreEl);
      bumpStat(linesEl);
      updateStats();
    }
  }

  function moveLeft() {
    const test = { ...current, col: current.col - 1 };
    if (isValid(test)) current.col--;
  }

  function moveRight() {
    const test = { ...current, col: current.col + 1 };
    if (isValid(test)) current.col++;
  }

  function moveDown() {
    const test = { ...current, row: current.row + 1 };
    if (isValid(test)) {
      current.row++;
      return true;
    }
    return false;
  }

  function hardDrop() {
    while (moveDown()) { score += 2; }
    lock();
    updateStats();
  }

  function rotate() {
    const nextRot = (current.rotation + 1) % 4;
    for (const [dc, dr] of KICKS) {
      const test = { ...current, rotation: nextRot, col: current.col + dc, row: current.row + dr };
      if (isValid(test)) {
        current.rotation = nextRot;
        current.col += dc;
        current.row += dr;
        return;
      }
    }
  }

  function hold() {
    if (!canHold) return;
    canHold = false;
    const type = current.type;
    if (holdPiece) {
      current = spawnPiece(holdPiece);
      holdPiece = type;
    } else {
      holdPiece = type;
      spawnNext();
    }
  }

  /** Get the ghost (landing preview) row for the current piece. */
  function ghostRow() {
    let test = { ...current };
    while (true) {
      const next = { ...test, row: test.row + 1 };
      if (!isValid(next)) return test.row;
      test = next;
    }
  }

  // ───────── Rendering ─────────

  function drawCell(context, x, y, size, color, alpha = 1) {
    const gap = 1;
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(x + gap, y + gap, size - gap * 2, size - gap * 2);
    // highlight
    context.fillStyle = "rgba(255,255,255,0.18)";
    context.fillRect(x + gap, y + gap, size - gap * 2, 3);
    context.fillRect(x + gap, y + gap, 3, size - gap * 2);
    context.globalAlpha = 1;
  }

  function drawBoard() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
    }

    // Locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawCell(ctx, c * CELL, r * CELL, CELL, board[r][c]);
        }
      }
    }

    if (state !== State.PLAYING || !current) return;

    // Ghost piece
    const gr = ghostRow();
    const ghost = { ...current, row: gr };
    cells(ghost).forEach(([r, c]) => {
      if (r >= 0) drawCell(ctx, c * CELL, r * CELL, CELL, COLORS[current.type], GHOST_ALPHA);
    });

    // Active piece
    cells(current).forEach(([r, c]) => {
      if (r >= 0) drawCell(ctx, c * CELL, r * CELL, CELL, COLORS[current.type]);
    });
  }

  function drawPreview(context, canvas, type) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;
    const shape = SHAPES[type][0];
    const minR = Math.min(...shape.map(([r]) => r));
    const maxR = Math.max(...shape.map(([r]) => r));
    const minC = Math.min(...shape.map(([, c]) => c));
    const maxC = Math.max(...shape.map(([, c]) => c));
    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    const offsetX = (canvas.width - w * PREVIEW_CELL) / 2;
    const offsetY = (canvas.height - h * PREVIEW_CELL) / 2;
    shape.forEach(([r, c]) => {
      drawCell(
        context,
        offsetX + (c - minC) * PREVIEW_CELL,
        offsetY + (r - minR) * PREVIEW_CELL,
        PREVIEW_CELL,
        COLORS[type]
      );
    });
  }

  function render() {
    drawBoard();
    drawPreview(nextCtx, nextCanvas, nextPiece);
    drawPreview(holdCtx, holdCanvas, holdPiece);
  }

  // ───────── Stats UI ─────────

  function updateStats() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  function bumpStat(el) {
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 180);
  }

  // ───────── Input ─────────

  const keys = {};

  document.addEventListener("keydown", (e) => {
    if (keys[e.code]) return; // prevent key-repeat flood
    keys[e.code] = true;

    if (e.code === "KeyR") { init(); return; }

    if (state === State.GAME_OVER) return;

    if (e.code === "KeyP") {
      if (state === State.PLAYING) {
        state = State.PAUSED;
        overlayPause.classList.remove("hidden");
      } else if (state === State.PAUSED) {
        state = State.PLAYING;
        overlayPause.classList.add("hidden");
        lastTime = performance.now();
      }
      return;
    }

    if (state !== State.PLAYING) return;

    switch (e.code) {
      case "ArrowLeft":  moveLeft();  break;
      case "ArrowRight": moveRight(); break;
      case "ArrowDown":
        if (moveDown()) score += 1;
        updateStats();
        dropTimer = 0;
        break;
      case "ArrowUp":
      case "Space":
        e.preventDefault();
        rotate();
        break;
      case "KeyC":
        hold();
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // ───────── Auto-repeat (DAS) for left/right/down ─────────
  const DAS_DELAY = 170; // ms before auto-repeat starts
  const DAS_RATE  = 50;  // ms between repeats

  let dasKey = null;
  let dasTimer = 0;
  let dasPhase = "delay"; // "delay" or "repeat"

  function updateDAS(dt) {
    const held = keys["ArrowLeft"] ? "ArrowLeft"
               : keys["ArrowRight"] ? "ArrowRight"
               : keys["ArrowDown"] ? "ArrowDown"
               : null;

    if (held !== dasKey) {
      dasKey = held;
      dasTimer = 0;
      dasPhase = "delay";
    }

    if (!dasKey || state !== State.PLAYING) return;

    dasTimer += dt;
    const threshold = dasPhase === "delay" ? DAS_DELAY : DAS_RATE;

    while (dasTimer >= threshold) {
      dasTimer -= dasPhase === "delay" ? DAS_DELAY : DAS_RATE;
      if (dasPhase === "delay") dasPhase = "repeat";
      switch (dasKey) {
        case "ArrowLeft":  moveLeft();  break;
        case "ArrowRight": moveRight(); break;
        case "ArrowDown":
          if (moveDown()) score += 1;
          updateStats();
          dropTimer = 0;
          break;
      }
    }
  }

  // ───────── Game Loop ─────────

  function loop(time) {
    requestAnimationFrame(loop);

    if (state !== State.PLAYING) {
      render();
      return;
    }

    const dt = lastTime ? time - lastTime : 0;
    lastTime = time;

    updateDAS(dt);

    dropTimer += dt;
    if (dropTimer >= dropInterval()) {
      dropTimer = 0;
      if (!moveDown()) lock();
    }

    render();
  }

  // ───────── Start ─────────
  init();
  requestAnimationFrame(loop);
})();
