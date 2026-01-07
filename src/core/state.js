// ============================================================================
// GAME STATE
// ============================================================================

// Scene objects
export const sceneObjects = {
    camera: null,
    scene: null,
    renderer: null,
    composer: null,
    controls: null,
    boardMesh: null,
    railMesh: null,
    railMaterials: [],  // Store rail materials for glow effect
    manualPad: null,
    kickerRamp: null,
    labelRenderer: null,  // CSS2DRenderer for name labels
    labelScene: null  // Scene for name labels
}

// Board state
// Spawn position (corner of map)
export const SPAWN_POSITION = { x: -10, y: 0.5 + 0.07, z: -10 }  // Corner spawn, y = FLOOR_Y + BOARD_HALF_HEIGHT
export let boardTransform = {
    position: { x: SPAWN_POSITION.x, y: SPAWN_POSITION.y, z: SPAWN_POSITION.z },
    rotation: { x: 0, y: 0, z: 0 }
}
// Target rotations for visual updates (updated by physics, applied to mesh at BOARD_REFRESH_RATE)
export let boardTargetRotation = {
    x: 0,
    y: 0,
    z: 0
}
export let boardVelocity = { x: 0, y: 0, z: 0 }
export let angularVelocity = { x: 0, z: 0 }
export const physics = {
    isOnFloor: false,
    previousIsOnFloor: true,
    isProcessingLanding: false,  // Prevent multiple simultaneous landing handlers
    isGrinding: false,  // Whether board is currently grinding on rail
    railGrindDirection: 0,  // Direction along rail (1 or -1)
    wasGrinding: false,  // Track if we were grinding in previous frame (for landing shake)
    currentSurface: null,  // 'floor', 'pad', 'ramp', or null
    surfaceNormal: null,  // Normal vector of current surface (for ramp alignment)
    isInManual: false,  // Whether board is in manual/nose manual state
    manualBalance: 0.5,  // Balance position (0.0 = bottom, 1.0 = top, 0.5 = center)
    manualBalanceDirection: 1,  // Direction of balance movement (-1 = down, 1 = up)
    manualPitch: 0,  // Manual pitch angle (relative to board's orientation)
    targetManualPitch: 0,  // Target manual pitch angle (for smooth interpolation)
    manualEntryPitch: 0,  // Pitch angle when entering manual (used as center/base angle)
    alignedRotationX: 0  // Base rotation.x from surface alignment (manual pitch added on top)
}

// Smooth snapping state
export const snap = {
    snapTargetZ: null,  // Target z rotation for A/D snapping
    snapStartRotationZ: null,  // Rotation.z when snap starts (for tracking snap rotation)
    previousSnapRotationZ: null,  // Previous rotation during snap (for tracking snap delta)
    snapRotationAccumulator: 0,  // Accumulated rotation during snap (for flip completion detection)
    shuvSnapStartRotationY: null,  // Board rotation.y when shuv snap starts
    shuvSnapRotationAccumulator: 0  // Accumulated rotation during shuv snap
}

// Board materials and audio
export const audio = {
    originalMaterials: [],  // Store original materials for color restoration
    failAudio: null,  // Audio object for fail sound
    popSounds: [],  // Array of pop sound effects
    landSounds: [],  // Array of land sound effects
    catchSounds: [],  // Array of catch sound effects
    redFlashTimeout: null  // Timeout for restoring color
}

// Input state
export const keys = {}
export const previousKeys = {}  // Track previous frame's key states for release detection
export const input = {
    mouseDeltaX: 0,
    smoothedMouseDeltaX: 0,  // Smoothed mouse delta for rotation
    currentMouseSpeed: 0,  // Track mouse movement speed for wind sound
    isPointerLocked: false,
    isRightMouseHeld: false,  // Track if right mouse button is held
    isLeftMouseHeld: false,  // Track if left mouse button is held
    fixedCameraAngle: 0,  // Stored camera angle when right mouse is held
    airborneCameraRotationVelocity: 0,  // Camera rotation velocity when entering air (locked during flight)
    scrollDelta: 0  // Accumulated scroll wheel delta
}

// Trick detection state
export let trickStats = {
    flips: 0,  // Full 360-degree rotations from A/D keys
    body180s: 0,   // Number of 180-degree camera rotations
    shuvs: 0,     // Number of 180-degree board spins in right-click mode
    wasFakie: false  // Whether the board was going backward when player jumped
}
export const tricks = {
    airStartRotationZ: 0,  // Board rotation.z when entering air
    airStartCameraAngle: 0,  // Camera angle when entering air
    cumulativeRotationZ: 0,  // Cumulative rotation change for A/D tracking (signed)
    cumulativeRotationZAbs: 0,  // Absolute cumulative rotation for A/D tracking
    rotationDirectionZ: 0,  // Direction of rotation (-1 or 1)
    previousRotationZ: 0,  // Previous frame's rotation.z for A/D tracking
    previousFlipCount: 0,  // Previous flip count to detect boundary crossings
    previousCameraAngle: 0,  // Previous frame's camera angle
    cumulativeCameraRotation: 0,  // Cumulative camera rotation for 180 tracking (signed)
    cumulativeCameraRotationAbs: 0,  // Absolute cumulative camera rotation
    cameraRotationDirection: 0,  // Direction of camera rotation (-1 or 1)
    boardRotationOnRightClickStart: 0,  // Board rotation.y when right-click starts (in air)
    cumulativeBoardRotationRightClick: 0,  // Cumulative board rotation while right-click is held (in air)
    boardRotationDirectionRightClick: 0,  // Direction of board rotation during right-click
    previousBoardYRightClick: 0  // Previous board rotation.y for frame-by-frame tracking
}
export const ui = {
    trickDisplayElement: null,  // UI element for displaying trick stats
    trickNameDisplayElement: null,  // UI element for displaying trick name on landing
    trickComboDisplayElement: null,  // UI element for displaying trick combo
    tricksData: null,  // Loaded tricks data from tricks.json
    settingsMenu: null,  // Settings menu element
    manualBalanceBar: null,  // UI element for manual balance bar
    manualBalanceLine: null,  // UI element for balance line indicator
    menuState: 'menu'  // 'menu' | 'hosting' | 'joining' | 'inGame'
}

// Room state
export const room = {
    code: null,
    isHost: false,
    gameStarted: false,
    players: [], // Array of { id, name? }
    maxPlayers: 4
}

// Player display name
export let displayName = ''

// Trick combo tracking
export const trickCombo = {
    tricks: [],  // Array of trick names in the combo
    isActive: false,  // Whether combo tracking is active
    resetTimeout: null  // Timeout for delayed combo reset
}

// Physics timing
export const timing = {
    accumulatedTime: 0,
    lastTime: performance.now()
}

// Board visual update timing (separate from physics)
export const boardVisualTiming = {
    accumulatedTime: 0,
    lastUpdateTime: performance.now()
}

