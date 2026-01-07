// ============================================================================
// CONSTANTS
// ============================================================================

// Physics constants
export const PHYSICS_FPS = 60
export const PHYSICS_DELTA_TIME = 1 / PHYSICS_FPS

// Game constants
export const GRAVITY = -0.0035
export const JUMP_IMPULSE = 0.1
export const KICKFLIP_A_D_ROTATION_SPEED = 0.2  // A/D keys rotation speed for kickflip (barrel roll)
export const SHUV_A_D_ROTATION_SPEED = 0.125  // A/D keys rotation speed for shuv
export const ALIGNMENT_TORQUE = 0.175
export const ALIGNMENT_DAMPING = 0.85  // Stronger damping when aligning on floor
export const ALIGNMENT_SNAP_THRESHOLD = 0.065  // Snap directly when close enough
export const FLOOR_Y = 0.5
export const BOARD_HALF_HEIGHT = 0.07
export const BOARD_HALF_LENGTH = 0.3  // Approximate half-length of board (for rotation clipping prevention)
export const FLOOR_COLOR = 0x202020  // Darker grey

// Movement constants
export const FORWARD_SPEED = 0.06  // Halved for 60 FPS
export const FRICTION = 0.92  // Higher friction for quick deceleration
export const MIN_VELOCITY = 0.0001

// Camera follow constants
export const CAMERA_FOLLOW_DISTANCE = 3
export const CAMERA_FOLLOW_HEIGHT = 2

// Mouse steering constants
export const MOUSE_STEERING_SENSITIVITY = 0.0010  // Halved for 60 FPS
export const KICKFLIP_RIGHT_CLICK_SENSITIVITY = 0.0025  // Right-click sensitivity for kickflip (barrel roll)
export const SHUV_RIGHT_CLICK_SENSITIVITY = 0.0025  // Right-click sensitivity for shuv
export const MOUSE_SMOOTHING = 0.3  // Smoothing factor for mouse movements (lower = smoother)
export const AIR_TURNING_RESISTANCE = 0.97  // Air resistance damping for turning in air (higher = less resistance)

// Snap constants
export const SNAP_SPEED = 0.35  // Speed of smooth snapping rotation

// Graphics constants
export const PIXELATION_LEVEL = 2  // Higher value = more pixelated (lower resolution)
export const BOARD_REFRESH_RATE = 20  // Visual update rate for board rotation (FPS, does not affect physics)

// Audio constants
export const SFX_VOLUME = 0.1  // Volume for all sound effects (0.0 to 1.0)

// Network constants
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
export const NETWORK_UPDATE_RATE = 25  // Send updates per second
export const NETWORK_LERP_FACTOR = 10  // Interpolation speed multiplier
export const NETWORK_SNAP_THRESHOLD = Math.PI / 20  // 9 degrees - rotation snap threshold
export const NETWORK_MAX_RECONNECT_ATTEMPTS = 10
export const NETWORK_RECONNECT_BASE_DELAY = 1000  // Base delay in ms
export const NETWORK_RECONNECT_MAX_DELAY = 30000  // Max delay in ms

// Rail constants
export const RAIL_ANGLE = Math.PI / 4  // 45 degrees
export const RAIL_GRIND_DISTANCE_THRESHOLD = 0.6  // Distance to start/stop grinding
export const RAIL_GLOW_DISTANCE = 0.5  // Distance for rail glow effect
export const RAIL_GLOW_MAX_INTENSITY = 2
export const RAIL_GRIND_SPEED_MULTIPLIER = 1.5  // Speed multiplier when grinding

// Angle normalization constants
export const ANGLE_NORMALIZATION_MAX_ATTEMPTS = 10  // Safety limit for normalization loops
export const TWO_PI = 2 * Math.PI
export const PI = Math.PI
export const HALF_PI = Math.PI / 2
export const QUARTER_PI = Math.PI / 4

// Rotation detection constants
export const UPSIDE_DOWN_THRESHOLD = 0.5  // Radians tolerance for upside down detection
export const NINETY_DEGREES = Math.PI / 2
export const ONE_EIGHTY_DEGREES = Math.PI
export const THREE_SIXTY_DEGREES = 2 * Math.PI
export const CLOSE_TO_COMPLETE_THRESHOLD = (270 * Math.PI) / 180  // 270 degrees
export const CLOSE_THRESHOLD = (300 * Math.PI) / 180  // 300 degrees
export const BODY_180_THRESHOLD = (140 * Math.PI) / 180  // 140 degrees with lenience

// Physics thresholds
export const MIN_ROTATION_DELTA = 0.001  // Minimum rotation change to track
export const MIN_MOMENTUM_DOT_RAIL = 0.001  // Minimum momentum dot product for rail direction
export const MIN_MOUSE_DELTA = 0.001  // Minimum mouse movement to process
export const MIN_ANGULAR_VELOCITY = 0.01  // Minimum angular velocity for alignment snap
export const MAX_ANGULAR_VELOCITY = 0.5  // Maximum angular velocity clamp
export const SNAP_COMPLETION_THRESHOLD = 0.01  // Threshold for snap completion

// Trick detection thresholds
export const MIN_ROTATION_FOR_COUNT = 0.05  // Minimum rotation (radians) to count as intentional rotation
export const MIN_CUMULATIVE_ROTATION = 0.1  // Minimum cumulative rotation before counting tricks
export const ROTATION_VELOCITY_THRESHOLD = 0.01  // Minimum rotation velocity to consider rotation intentional
export const CAMERA_ANGLE_SMOOTHING = 0.3  // Smoothing factor for camera angle (0-1, lower = smoother)

// Performance constants
export const FRUSTUM_CULLING_ENABLED = true
export const LOD_NEAR_DISTANCE = 10
export const LOD_MID_DISTANCE = 30
export const LOD_FAR_DISTANCE = 100
export const DISTANT_PLAYER_UPDATE_RATE = 10  // Updates per second for distant players

// Object pooling constants
export const AUDIO_POOL_SIZE = 5
export const PARTICLE_POOL_SIZE = 50
export const THREE_OBJECT_POOL_SIZE = 10

// Combo system constants
export const COMBO_DISPLAY_DURATION = 3000  // How long to show combo before reset (ms)
export const COMBO_ANIMATION_DURATION = 200  // Animation duration for combo updates (ms)

// UI feedback constants
export const SHOW_TRICK_NAME_FEEDBACK = false  // Toggle trick name display on landing

// Manual system constants
export const MANUAL_DIP_SPEED = 0.0005  // Speed of board dipping when scrolling (radians per scroll unit)
export const MANUAL_DIP_SMOOTHING = 0.15  // Smoothing factor for dip interpolation (0-1, lower = smoother)
export const MANUAL_MIN_DIP = -0.4  // Minimum board dip angle (nose manual)
export const MANUAL_MAX_DIP = 0.4  // Maximum board dip angle (tail manual)
export const MANUAL_DIP_THRESHOLD = 0.1  // Minimum dip angle to enter manual on landing
export const MANUAL_BALANCE_BAR_WIDTH = 15  // Width of balance bar in pixels
export const MANUAL_BALANCE_BAR_HEIGHT = 150  // Height of balance bar in pixels
export const MANUAL_BALANCE_LINE_WIDTH = 10  // Width of balance line in pixels
export const MANUAL_BALANCE_LINEAR_SPEED = 0.01  // Constant linear speed of balance movement
export const MANUAL_BALANCE_SCROLL_SPEED = 0.0003  // Speed of balance adjustment via scrollwheel
export const MANUAL_BALANCE_FAILURE_THRESHOLD = 0.05  // Distance from edge to trigger failure (0.0 or 1.0)
export const MANUAL_RETURN_SPEED = 0.15  // Speed of board returning to normal when manual fails

