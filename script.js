const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const gameOverElement = document.getElementById('gameOver');

// Particle System
class Particle {
    constructor(x, y, color, velocity, size, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity;
        this.size = size;
        this.life = life;
        this.opacity = 1;
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.life--;
        this.opacity = this.life / 100;
        return this.life > 0;
    }

    draw() {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

const particles = [];
let lastFrameTime = 0;
const targetFPS = 60;

// --- Game Constants ---
const BG_GRID_COLOR = 'rgba(0, 255, 255, 0.05)';
const BG_PULSE_SPEED = 0.005;
let bgPulsePhase = 0;
const GRID_SIZE = 20; // Size of each square in the grid
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;
const GAME_SPEED = 150; // Milliseconds between updates (lower is faster)

// Neon Colors
const BACKGROUND_COLOR = '#000';
const SNAKE_COLOR = '#0ff'; // Cyan
const SNAKE_GLOW = 'rgba(0, 255, 255, 0.7)';
const FOOD_COLOR = '#f0f'; // Magenta
const FOOD_GLOW = 'rgba(255, 0, 255, 0.7)';
const OBSTACLE_COLOR = '#ff0'; // Yellow
const OBSTACLE_GLOW = 'rgba(255, 255, 0, 0.7)';
const POWERUP_COLOR = '#ffa500'; // Orange
const POWERUP_GLOW = 'rgba(255, 165, 0, 0.7)';
const POWERUP_DURATION = 5000; // 5 seconds
const POWERUP_SPAWN_CHANCE = 0.1; // 10% chance to spawn instead of food

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// --- Game State Variables ---
let snake;
let food;
let powerUp; // Power-up object { x, y, active, timer }
let obstacles;
let dx; // Horizontal velocity
let dy; // Vertical velocity
let changingDirection; // Prevent rapid direction changes
let score;
let highScore;
let gameRunning;
let gameLoopTimeout;
let currentSpeed;
let obstacleInterval; // Timer for adding new obstacles
let powerUpActiveTimeout; // Timer for power-up duration

// --- Game Initialization ---
function initializeGame() {
    // Load high score from local storage
    highScore = localStorage.getItem('neonSnakeHighScore') || 0;
    highScoreElement.textContent = highScore;

    // Initial snake position (center)
    snake = [
        { x: Math.floor(CANVAS_WIDTH / 2 / GRID_SIZE) * GRID_SIZE, y: Math.floor(CANVAS_HEIGHT / 2 / GRID_SIZE) * GRID_SIZE },
        { x: (Math.floor(CANVAS_WIDTH / 2 / GRID_SIZE) - 1) * GRID_SIZE, y: Math.floor(CANVAS_HEIGHT / 2 / GRID_SIZE) * GRID_SIZE },
        { x: (Math.floor(CANVAS_WIDTH / 2 / GRID_SIZE) - 2) * GRID_SIZE, y: Math.floor(CANVAS_HEIGHT / 2 / GRID_SIZE) * GRID_SIZE }
    ];
    // Initial movement direction (right)
    dx = GRID_SIZE;
    dy = 0;
    score = 0;
    scoreElement.textContent = score;
    changingDirection = false;
    gameRunning = true;
    currentSpeed = GAME_SPEED; // Reset speed
    gameOverElement.style.display = 'none';
    obstacles = []; // Start with no obstacles
    powerUp = null; // No power-up initially
    if (powerUpActiveTimeout) clearTimeout(powerUpActiveTimeout); // Clear any existing power-up timer

    createFoodOrPowerUp(); // Decide whether to spawn food or power-up
    createObstacles(3); // Start with 3 obstacles
    // Start obstacle generation interval
    if (obstacleInterval) clearInterval(obstacleInterval);
    obstacleInterval = setInterval(() => createObstacles(1), 5000); // Add 1 obstacle every 5 seconds

    main(); // Start the game loop
}

// --- Drawing Functions ---
function drawRect(x, y, color, glowColor) {
    ctx.fillStyle = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
    // Reset shadow for other elements if needed, or set globally before drawing loop
    ctx.shadowBlur = 0; // Reset after drawing each element to avoid unwanted glows
}

function drawSnakePart(snakePart) {
    drawRect(snakePart.x, snakePart.y, SNAKE_COLOR, SNAKE_GLOW);
}

function drawSnake() {
    snake.forEach((part, i) => {
        // Make head different from body
        if (i === 0) {
            ctx.fillStyle = '#fff'; // White head
            ctx.shadowColor = SNAKE_GLOW;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(
                part.x + GRID_SIZE/2, 
                part.y + GRID_SIZE/2,
                GRID_SIZE/2, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
        } else {
            // Body segments with fading trail effect
            const fade = 0.7 + (0.3 * (i / snake.length));
            ctx.globalAlpha = fade;
            drawRect(part.x, part.y, SNAKE_COLOR, SNAKE_GLOW);
            ctx.globalAlpha = 1;
        }
    });
}

function drawFood() {
    if (food) { // Only draw if food exists
        drawRect(food.x, food.y, FOOD_COLOR, FOOD_GLOW);
    }
}

function drawPowerUp() {
    if (powerUp) { // Only draw if power-up exists
        drawRect(powerUp.x, powerUp.y, POWERUP_COLOR, POWERUP_GLOW);
    }
}

function drawObstacles() {
    obstacles.forEach(obstacle => {
        drawRect(obstacle.x, obstacle.y, OBSTACLE_COLOR, OBSTACLE_GLOW);
    });
}

// --- Movement & Game Logic ---
function moveSnake() {
    if (!gameRunning) return;

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head); // Add new head

    // Check if food is eaten
    const didEatFood = food && snake[0].x === food.x && snake[0].y === food.y;
    if (didEatFood) {
        score += 10;
        scoreElement.textContent = score;
        createParticles(food.x + GRID_SIZE/2, food.y + GRID_SIZE/2, FOOD_COLOR, 20);
        food = null;
        createFoodOrPowerUp();
    }
    // Check if power-up is eaten
    else if (powerUp && snake[0].x === powerUp.x && snake[0].y === powerUp.y) {
        score += 5;
        scoreElement.textContent = score;
        createParticles(powerUp.x + GRID_SIZE/2, powerUp.y + GRID_SIZE/2, POWERUP_COLOR, 30);
        activatePowerUp();
        powerUp = null;
        createFoodOrPowerUp();
    } else {
        snake.pop(); // Remove tail segment if nothing eaten
    }
}

function drawBackgroundGrid() {
    ctx.strokeStyle = BG_GRID_COLOR;
    ctx.lineWidth = 0.5;
    
    // Draw vertical lines
    for (let x = 0; x <= canvas.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = 0; y <= canvas.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function clearCanvas() {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawBackgroundGrid();
    
    // Update background pulse effect
    bgPulsePhase += BG_PULSE_SPEED;
    const pulseValue = 0.05 + (Math.sin(bgPulsePhase) * 0.02);
    ctx.fillStyle = `rgba(0, 255, 255, ${pulseValue})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function checkCollision() {
    const head = snake[0];

    // Check wall collision
    if (head.x < 0 || head.x >= CANVAS_WIDTH || head.y < 0 || head.y >= CANVAS_HEIGHT) {
        return true;
    }

    // Check self collision (ignore head)
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    // Check obstacle collision
    for (let i = 0; i < obstacles.length; i++) {
        if (head.x === obstacles[i].x && head.y === obstacles[i].y) {
            return true;
        }
    }

    return false;
}

// Decides whether to create food or a power-up
function createFoodOrPowerUp() {
    if (powerUp) return; // Don't spawn if a power-up already exists

    if (Math.random() < POWERUP_SPAWN_CHANCE) {
        createPowerUp();
        food = null; // Ensure no food exists when power-up spawns
    } else {
        createFood();
        powerUp = null; // Ensure no power-up exists when food spawns
    }
}


function createItem(itemType) { // itemType can be 'food', 'powerUp', or 'obstacle'
    let newItemX, newItemY;
    let validPosition = false;
    let attempts = 0;
    while (!validPosition && attempts < 100) { // Increased attempts
        newItemX = Math.floor(Math.random() * (CANVAS_WIDTH / GRID_SIZE)) * GRID_SIZE;
        newItemY = Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE)) * GRID_SIZE;

        const onSnake = snake.some(part => part.x === newItemX && part.y === newItemY);
        const onObstacle = obstacles.some(obs => obs.x === newItemX && obs.y === newItemY);
        const onFood = food && food.x === newItemX && food.y === newItemY;
        const onPowerUp = powerUp && powerUp.x === newItemX && powerUp.y === newItemY;
        // Prevent spawning too close to head, especially for obstacles
        const tooCloseToHead = itemType === 'obstacle' && Math.abs(snake[0].x - newItemX) < GRID_SIZE * 3 && Math.abs(snake[0].y - newItemY) < GRID_SIZE * 3;

        validPosition = !onSnake && !onObstacle && !onFood && !onPowerUp && !tooCloseToHead;
        attempts++;
    }

    if (validPosition) {
        return { x: newItemX, y: newItemY };
    }
    return null; // Return null if no valid position found
}

function createFood() {
    const newFoodPos = createItem('food');
    if (newFoodPos) {
        food = newFoodPos;
    }
    // Consider what to do if createItem returns null (e.g., try again later)
}

function createPowerUp() {
    const newPowerUpPos = createItem('powerUp');
    if (newPowerUpPos) {
        powerUp = newPowerUpPos;
    }
}


function createObstacles(count) {
    for (let i = 0; i < count; i++) {
        // Directly try to create and add an obstacle in each iteration
        const newObstaclePos = createItem('obstacle');
        if (newObstaclePos) {
            obstacles.push(newObstaclePos);
        }
        // If createItem returns null (no valid spot found after attempts),
        // we simply don't add an obstacle in this iteration.
    }
}

function activatePowerUp() {
    if (powerUpActiveTimeout) clearTimeout(powerUpActiveTimeout); // Clear previous timer if any

    currentSpeed = GAME_SPEED / 2; // Double the speed
    // Set a timer to deactivate the power-up
    powerUpActiveTimeout = setTimeout(() => {
        currentSpeed = GAME_SPEED; // Reset speed
        powerUpActiveTimeout = null;
    }, POWERUP_DURATION);
}


function gameOver() {
    gameRunning = false;
    clearTimeout(gameLoopTimeout);
    clearInterval(obstacleInterval);
    if (powerUpActiveTimeout) clearTimeout(powerUpActiveTimeout);

    // Create explosion effect from snake head
    if (snake.length > 0) {
        const head = snake[0];
        createParticles(head.x + GRID_SIZE/2, head.y + GRID_SIZE/2, SNAKE_COLOR, 50);
    }

    // Update High Score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('neonSnakeHighScore', highScore);
        highScoreElement.textContent = highScore;
    }

    gameOverElement.style.display = 'block';
}

// --- Main Game Loop ---
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].update()) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles() {
    particles.forEach(particle => particle.draw());
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 1;
        particles.push(new Particle(
            x, y,
            color,
            {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            },
            Math.random() * 3 + 2,
            Math.random() * 30 + 30
        ));
    }
}

function main() {
    if (!gameRunning) return;

    const now = performance.now();
    const deltaTime = now - lastFrameTime;
    
    if (deltaTime >= currentSpeed) {
        lastFrameTime = now - (deltaTime % currentSpeed);
        
        changingDirection = false;
        clearCanvas();
        drawFood();
        drawPowerUp();
        drawObstacles();
        moveSnake();
        
        if (checkCollision()) {
            gameOver();
            return;
        }
        
        drawSnake();
    }
    
    updateParticles();
    drawParticles();
    
    requestAnimationFrame(main);
}

// --- Event Listeners ---
function changeDirection(event) {
    const LEFT_KEY = 37;
    const RIGHT_KEY = 39;
    const UP_KEY = 38;
    const DOWN_KEY = 40;
    const ENTER_KEY = 13; // For restart

    if (!gameRunning && event.keyCode === ENTER_KEY) {
        initializeGame();
        return;
    }

    if (!gameRunning || changingDirection) return;
    changingDirection = true;

    const keyPressed = event.keyCode;
    const goingUp = dy === -GRID_SIZE;
    const goingDown = dy === GRID_SIZE;
    const goingRight = dx === GRID_SIZE;
    const goingLeft = dx === -GRID_SIZE;

    if (keyPressed === LEFT_KEY && !goingRight) {
        dx = -GRID_SIZE;
        dy = 0;
    }
    if (keyPressed === UP_KEY && !goingDown) {
        dx = 0;
        dy = -GRID_SIZE;
    }
    if (keyPressed === RIGHT_KEY && !goingLeft) {
        dx = GRID_SIZE;
        dy = 0;
    }
    if (keyPressed === DOWN_KEY && !goingUp) {
        dx = 0;
        dy = GRID_SIZE;
    }
}

document.addEventListener('keydown', changeDirection);

// --- Start Game ---
initializeGame();
