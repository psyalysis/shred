// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

import * as THREE from 'three'

/**
 * Frustum culling utility for checking if objects are in camera view
 */
export class FrustumCuller {
    /**
     * Creates a new frustum culler
     * @param {THREE.Camera} camera - Camera to use for culling
     */
    constructor(camera) {
        this.camera = camera
        this.frustum = new THREE.Frustum()
        this.matrix = new THREE.Matrix4()
    }
    
    /**
     * Updates the frustum based on current camera state
     */
    update() {
        this.matrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        )
        this.frustum.setFromProjectionMatrix(this.matrix)
    }
    
    /**
     * Checks if a bounding box is in the frustum
     * @param {THREE.Box3} box - Bounding box to check
     * @returns {boolean} True if box intersects frustum
     */
    intersectsBox(box) {
        return this.frustum.intersectsBox(box)
    }
    
    /**
     * Checks if a sphere is in the frustum
     * @param {THREE.Sphere} sphere - Sphere to check
     * @returns {boolean} True if sphere intersects frustum
     */
    intersectsSphere(sphere) {
        return this.frustum.intersectsSphere(sphere)
    }
    
    /**
     * Checks if a point is in the frustum
     * @param {THREE.Vector3} point - Point to check
     * @returns {boolean} True if point is in frustum
     */
    containsPoint(point) {
        return this.frustum.containsPoint(point)
    }
}

/**
 * Level of Detail (LOD) manager
 */
export class LODManager {
    /**
     * Creates a new LOD manager
     * @param {Object} config - LOD configuration
     * @param {number} config.nearDistance - Distance for high detail
     * @param {number} config.midDistance - Distance for medium detail
     * @param {number} config.farDistance - Distance for low detail
     */
    constructor(config = {}) {
        this.nearDistance = config.nearDistance || 10
        this.midDistance = config.midDistance || 30
        this.farDistance = config.farDistance || 100
    }
    
    /**
     * Gets the LOD level for a distance
     * @param {number} distance - Distance from camera
     * @returns {number} LOD level (0 = high, 1 = medium, 2 = low, 3 = culled)
     */
    getLODLevel(distance) {
        if (distance < this.nearDistance) return 0
        if (distance < this.midDistance) return 1
        if (distance < this.farDistance) return 2
        return 3 // Culled
    }
    
    /**
     * Calculates distance from camera to object
     * @param {THREE.Camera} camera - Camera
     * @param {THREE.Object3D} object - Object
     * @returns {number} Distance
     */
    getDistance(camera, object) {
        return camera.position.distanceTo(object.position)
    }
}

/**
 * Performance monitor for tracking FPS and frame times
 */
export class PerformanceMonitor {
    constructor() {
        this.frameCount = 0
        this.lastTime = performance.now()
        this.fps = 60
        this.frameTime = 16.67
        this.samples = []
        this.maxSamples = 60
    }
    
    /**
     * Updates the performance monitor (call each frame)
     */
    update() {
        const now = performance.now()
        const deltaTime = now - this.lastTime
        this.lastTime = now
        
        this.frameTime = deltaTime
        this.fps = 1000 / deltaTime
        
        // Store sample
        this.samples.push({
            fps: this.fps,
            frameTime: deltaTime,
            timestamp: now
        })
        
        // Keep only recent samples
        if (this.samples.length > this.maxSamples) {
            this.samples.shift()
        }
    }
    
    /**
     * Gets average FPS over recent frames
     * @returns {number} Average FPS
     */
    getAverageFPS() {
        if (this.samples.length === 0) return 60
        const sum = this.samples.reduce((acc, sample) => acc + sample.fps, 0)
        return sum / this.samples.length
    }
    
    /**
     * Gets average frame time over recent frames
     * @returns {number} Average frame time in ms
     */
    getAverageFrameTime() {
        if (this.samples.length === 0) return 16.67
        const sum = this.samples.reduce((acc, sample) => acc + sample.frameTime, 0)
        return sum / this.samples.length
    }
    
    /**
     * Gets current FPS
     * @returns {number} Current FPS
     */
    getFPS() {
        return this.fps
    }
    
    /**
     * Gets current frame time
     * @returns {number} Current frame time in ms
     */
    getFrameTime() {
        return this.frameTime
    }
}

/**
 * Throttles function calls to limit execution frequency
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, delay) {
    let lastCall = 0
    return function(...args) {
        const now = performance.now()
        if (now - lastCall >= delay) {
            lastCall = now
            return fn.apply(this, args)
        }
    }
}

/**
 * Debounces function calls to delay execution until after calls have stopped
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
    let timeoutId = null
    return function(...args) {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
            fn.apply(this, args)
        }, delay)
    }
}

