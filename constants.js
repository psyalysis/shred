// ============================================================================
// CONSTANTS
// ============================================================================

// Physics constants
export const PHYSICS_FPS = 60
export const PHYSICS_DELTA_TIME = 1 / PHYSICS_FPS

// Game constants
export const GRAVITY = -0.0035
export const JUMP_IMPULSE = 0.1
export const ROTATION_SPEED = 0.2
export const ALIGNMENT_TORQUE = 0.075
export const ALIGNMENT_DAMPING = 0.85  // Stronger damping when aligning on floor
export const ALIGNMENT_SNAP_THRESHOLD = 0.065  // Snap directly when close enough
export const FLOOR_Y = -0.5
export const CUBE_HALF_HEIGHT = 0.07

// Movement constants
export const FORWARD_SPEED = 0.04  // Halved for 60 FPS
export const FRICTION = 0.92  // Higher friction for quick deceleration
export const MIN_VELOCITY = 0.0001

// Camera follow constants
export const CAMERA_FOLLOW_DISTANCE = 3
export const CAMERA_FOLLOW_HEIGHT = 2

// Mouse steering constants
export const MOUSE_STEERING_SENSITIVITY = 0.0010  // Halved for 60 FPS
export const RIGHT_CLICK_ROTATION_SENSITIVITY = 0.0025  // Sensitivity for board rotation during right-click in air
export const MOUSE_SMOOTHING = 0.25  // Smoothing factor for mouse movements (lower = smoother)
export const AIR_TURNING_RESISTANCE = 0.97  // Air resistance damping for turning in air (higher = less resistance)

// Snap constants
export const SNAP_SPEED = 0.15  // Speed of smooth snapping rotation

// Graphics constants
export const PIXELATION_LEVEL = 2  // Higher value = more pixelated (lower resolution)

// Audio constants
export const SFX_VOLUME = 0.1  // Volume for all sound effects (0.0 to 1.0)

