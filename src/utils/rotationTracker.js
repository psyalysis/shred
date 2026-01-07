// ============================================================================
// ROTATION TRACKER
// ============================================================================

import { normalizeAngle, shortestAngleDiff } from './math.js'
import { PI, TWO_PI, MIN_ROTATION_FOR_COUNT, ROTATION_VELOCITY_THRESHOLD } from '../config/constants.js'

/**
 * Unified rotation tracker that accurately counts rotations by detecting boundary crossings
 * Works for any rotation type: flips (360°), shuvs/body180s (180°), etc.
 */
export class RotationTracker {
    /**
     * Creates a new rotation tracker
     * @param {string} axis - Axis identifier ('z', 'y', 'camera', etc.) for debugging
     * @param {number} threshold - Full rotation threshold (TWO_PI for flips, PI for shuvs/body180s)
     */
    constructor(axis = 'z', threshold = TWO_PI) {
        this.axis = axis
        this.threshold = threshold  // Full rotation threshold (2π for flips, π for shuvs/body180s)
        this.startRotation = null
        this.previousRotation = null
        this.cumulativeRotation = 0  // Signed cumulative rotation
        this.completedRotations = 0  // Integer count of completed rotations
        this.direction = 0  // 1 for positive, -1 for negative, 0 for none
        this.isActive = false
        
        // Velocity tracking for better wrap-around detection
        this.rotationVelocity = 0  // Current rotation velocity (radians per frame)
        this.previousDelta = 0  // Previous frame's delta for velocity calculation
        
        // History for debugging (optional)
        this.history = []
        this.maxHistorySize = 10
    }
    
    /**
     * Initialize tracking when entering air or starting rotation
     * @param {number} currentRotation - Current rotation value in radians
     */
    start(currentRotation) {
        if (!isFinite(currentRotation)) {
            console.warn(`[RotationTracker:${this.axis}] Invalid start rotation:`, currentRotation)
            return
        }
        
        this.startRotation = normalizeAngle(currentRotation)
        this.previousRotation = this.startRotation
        this.cumulativeRotation = 0
        this.completedRotations = 0
        this.direction = 0
        this.rotationVelocity = 0
        this.previousDelta = 0
        this.isActive = true
        this.history = []
    }
    
    /**
     * Update tracking with current rotation value
     * @param {number} currentRotation - Current rotation value in radians
     * @returns {boolean} True if a rotation was completed this frame
     */
    update(currentRotation) {
        if (!this.isActive) return false
        
        // Validate input
        if (!isFinite(currentRotation)) {
            console.warn(`[RotationTracker:${this.axis}] Invalid rotation value:`, currentRotation)
            return false
        }
        
        const normalizedCurrent = normalizeAngle(currentRotation)
        const TWO_PI = 2 * Math.PI
        const PI = Math.PI
        
        // Calculate delta using shortest angle difference
        let delta = shortestAngleDiff(this.previousRotation, normalizedCurrent)
        
        // Calculate rotation velocity for better wrap-around detection
        this.rotationVelocity = delta
        const avgVelocity = (delta + this.previousDelta) / 2
        
        // Detect wrap-around using improved logic
        // Check if we're rotating consistently and crossed the boundary
        const boundaryThreshold = PI * 0.7  // 126 degrees - tighter threshold for more accurate detection
        
        // Forward wrap-around: previous was near 2π (high), current is near 0 (low)
        // Only count if we were rotating forward (positive velocity)
        if (this.previousRotation > PI + boundaryThreshold && normalizedCurrent < PI - boundaryThreshold) {
            if (avgVelocity > 0 || this.direction > 0) {
                // We wrapped forward: delta should be (2π - previous) + current
                delta = TWO_PI - this.previousRotation + normalizedCurrent
            }
        }
        // Backward wrap-around: previous was near 0 (low), current is near 2π (high)
        // Only count if we were rotating backward (negative velocity)
        else if (this.previousRotation < PI - boundaryThreshold && normalizedCurrent > PI + boundaryThreshold) {
            if (avgVelocity < 0 || this.direction < 0) {
                // We wrapped backward: delta should be -(previous + (2π - current))
                delta = -(this.previousRotation + (TWO_PI - normalizedCurrent))
            }
        }
        
        // Filter out noise: ignore very small rotations unless we're already rotating
        const minDelta = MIN_ROTATION_FOR_COUNT
        if (Math.abs(delta) < minDelta && Math.abs(this.cumulativeRotation) < minDelta && this.direction === 0) {
            // Too small to count, likely noise
            this.previousDelta = delta
            return false
        }
        
        // Update previous delta for next frame
        this.previousDelta = delta
        
        // Update cumulative rotation
        const oldCumulative = this.cumulativeRotation
        this.cumulativeRotation += delta
        
        // Detect boundary crossings
        const oldCompleted = this._getCompletedCount(oldCumulative)
        const newCompleted = this._getCompletedCount(this.cumulativeRotation)
        
        if (newCompleted !== oldCompleted) {
            // A rotation was completed!
            // newCompleted is already signed correctly (positive for forward, negative for backward)
            this.completedRotations = newCompleted
            
            // Update direction
            if (Math.abs(delta) > 0.001) {
                this.direction = Math.sign(delta)
            }
            
            // Record in history
            const completed = newCompleted - oldCompleted
            this._addHistory('boundary_cross', completed)
            
            this.previousRotation = normalizedCurrent
            return true
        }
        
        // Update direction if rotating
        if (Math.abs(delta) > 0.001) {
            this.direction = Math.sign(delta)
        }
        
        this.previousRotation = normalizedCurrent
        return false
    }
    
    /**
     * Apply a snap rotation explicitly
     * @param {number} snapRotation - The rotation amount from the snap
     * @returns {boolean} True if a rotation was completed by the snap
     */
    applySnap(snapRotation) {
        if (!this.isActive) return false
        
        if (!isFinite(snapRotation)) {
            console.warn(`[RotationTracker:${this.axis}] Invalid snap rotation:`, snapRotation)
            return false
        }
        
        const oldCumulative = this.cumulativeRotation
        this.cumulativeRotation += snapRotation
        
        // Detect boundary crossings from snap
        const oldCompleted = this._getCompletedCount(oldCumulative)
        const newCompleted = this._getCompletedCount(this.cumulativeRotation)
        
        // Update previousRotation to reflect the snap (normalized)
        // This prevents double-counting if update() is called after applySnap()
        this.previousRotation = normalizeAngle(this.previousRotation + snapRotation)
        
        if (newCompleted !== oldCompleted) {
            // A rotation was completed by the snap!
            // newCompleted is already signed correctly
            this.completedRotations = newCompleted
            
            if (Math.abs(snapRotation) > 0.001) {
                this.direction = Math.sign(snapRotation)
            }
            
            // Record in history
            const completed = newCompleted - oldCompleted
            this._addHistory('snap_complete', completed)
            
            return true
        }
        
        // Even if no boundary crossed, update cumulative rotation and direction
        if (Math.abs(snapRotation) > 0.001) {
            this.direction = Math.sign(snapRotation)
        }
        
        return false
    }
    
    /**
     * Get current count of completed rotations (signed)
     * @returns {number} Number of completed rotations (positive or negative)
     */
    getCount() {
        return this.completedRotations
    }
    
    /**
     * Get direction of rotation
     * @returns {number} 1 for positive, -1 for negative, 0 for none
     */
    getDirection() {
        return this.direction
    }
    
    /**
     * Get cumulative rotation amount (for debugging)
     * @returns {number} Total rotation in radians
     */
    getCumulativeRotation() {
        return this.cumulativeRotation
    }
    
    /**
     * Reset tracking
     */
    reset() {
        this.startRotation = null
        this.previousRotation = null
        this.cumulativeRotation = 0
        this.completedRotations = 0
        this.direction = 0
        this.rotationVelocity = 0
        this.previousDelta = 0
        this.isActive = false
        this.history = []
    }
    
    /**
     * Get rotation history (for debugging)
     * @returns {Array} Array of rotation events
     */
    getHistory() {
        return [...this.history]
    }
    
    /**
     * Calculate completed rotation count from cumulative rotation
     * Uses a small epsilon to detect rotations at the exact threshold
     * @private
     */
    _getCompletedCount(cumulative) {
        const epsilon = 0.01  // Small threshold to detect rotations at exact threshold
        
        if (Math.abs(cumulative) < epsilon) return 0
        
        if (cumulative > 0) {
            // For positive rotations, count when we reach or exceed the threshold
            // Add epsilon to ensure we count at exactly the threshold
            return Math.floor((cumulative + epsilon) / this.threshold)
        } else {
            // For negative rotations, count when we reach or exceed the threshold
            // Subtract epsilon to ensure we count at exactly the threshold
            return Math.ceil((cumulative - epsilon) / this.threshold)
        }
    }
    
    /**
     * Add event to history
     * @private
     */
    _addHistory(eventType, completed) {
        this.history.push({
            timestamp: performance.now(),
            type: eventType,
            rotation: this.completedRotations,
            cumulative: this.cumulativeRotation,
            direction: this.direction,
            completed: completed
        })
        
        // Keep only recent history
        if (this.history.length > this.maxHistorySize) {
            this.history.shift()
        }
    }
}

