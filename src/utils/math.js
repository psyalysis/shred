// ============================================================================
// MATH UTILITIES
// ============================================================================

/**
 * Normalizes an angle to the range [0, 2π)
 * @param {number} angle - Angle in radians
 * @param {number} maxAttempts - Maximum normalization attempts (safety limit)
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle, maxAttempts = 10) {
    if (!isFinite(angle)) return 0
    
    let normalized = angle
    let attempts = 0
    
    while (normalized < 0 && attempts < maxAttempts) {
        normalized += 2 * Math.PI
        attempts++
    }
    
    attempts = 0
    while (normalized >= 2 * Math.PI && attempts < maxAttempts) {
        normalized -= 2 * Math.PI
        attempts++
    }
    
    return normalized
}

/**
 * Calculates the shortest angular difference between two angles
 * Handles wrap-around (e.g., difference between 350° and 10° is 20°, not 340°)
 * @param {number} current - Current angle in radians
 * @param {number} target - Target angle in radians
 * @returns {number} Shortest angular difference in radians (signed)
 */
export function shortestAngleDiff(current, target) {
    const normalizedCurrent = normalizeAngle(current)
    const normalizedTarget = normalizeAngle(target)
    
    let diff = normalizedTarget - normalizedCurrent
    
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    
    return diff
}

/**
 * Calculates the distance between two 3D points
 * @param {Object} p1 - First point {x, y, z}
 * @param {Object} p2 - Second point {x, y, z}
 * @returns {number} Distance
 */
export function distance3D(p1, p2) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dz = p2.z - p1.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Calculates the squared distance between two 3D points (faster, no sqrt)
 * @param {Object} p1 - First point {x, y, z}
 * @param {Object} p2 - Second point {x, y, z}
 * @returns {number} Squared distance
 */
export function distance3DSquared(p1, p2) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const dz = p2.z - p1.z
    return dx * dx + dy * dy + dz * dz
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t
}

/**
 * Clamps a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

/**
 * Calculates the magnitude of a 3D vector
 * @param {Object} vec - Vector {x, y, z}
 * @returns {number} Magnitude
 */
export function magnitude3D(vec) {
    return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z)
}

/**
 * Calculates the squared magnitude of a 3D vector (faster, no sqrt)
 * @param {Object} vec - Vector {x, y, z}
 * @returns {number} Squared magnitude
 */
export function magnitude3DSquared(vec) {
    return vec.x * vec.x + vec.y * vec.y + vec.z * vec.z
}

/**
 * Normalizes a 3D vector to unit length
 * @param {Object} vec - Vector {x, y, z} (modified in place)
 * @returns {Object} Normalized vector
 */
export function normalize3D(vec) {
    const mag = magnitude3D(vec)
    if (mag > 0.0001) {
        vec.x /= mag
        vec.y /= mag
        vec.z /= mag
    }
    return vec
}

/**
 * Calculates dot product of two 3D vectors
 * @param {Object} a - First vector {x, y, z}
 * @param {Object} b - Second vector {x, y, z}
 * @returns {number} Dot product
 */
export function dot3D(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z
}

/**
 * Checks if a value is approximately equal to another (within epsilon)
 * @param {number} a - First value
 * @param {number} b - Second value
 * @param {number} epsilon - Tolerance (default: 0.001)
 * @returns {boolean} True if approximately equal
 */
export function approximatelyEqual(a, b, epsilon = 0.001) {
    return Math.abs(a - b) < epsilon
}

/**
 * Maps a value from one range to another
 * @param {number} value - Value to map
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

