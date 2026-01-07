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
    cubeMesh: null,
    railMesh: null,
    railMaterials: []  // Store rail materials for glow effect
}

// Cube state
export let cubeTransform = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
}
export let cubeVelocity = { x: 0, y: 0, z: 0 }
export let angularVelocity = { z: 0 }
export const physics = {
    isOnFloor: false,
    previousIsOnFloor: true,
    isProcessingLanding: false,  // Prevent multiple simultaneous landing handlers
    isGrinding: false,  // Whether board is currently grinding on rail
    railGrindDirection: 0  // Direction along rail (1 or -1)
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
    airborneCameraRotationVelocity: 0  // Camera rotation velocity when entering air (locked during flight)
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
    tricksData: null  // Loaded tricks data from tricks.json
}

// Physics timing
export const timing = {
    accumulatedTime: 0,
    lastTime: performance.now()
}

