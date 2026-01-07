// ============================================================================
// OBJECT POOL UTILITIES
// ============================================================================

/**
 * Generic object pool for reusing objects to reduce garbage collection
 * @template T
 */
export class ObjectPool {
    /**
     * Creates a new object pool
     * @param {Function} createFn - Function to create new objects
     * @param {Function} resetFn - Function to reset objects before reuse
     * @param {number} initialSize - Initial pool size
     * @param {number} maxSize - Maximum pool size (0 = unlimited)
     */
    constructor(createFn, resetFn = () => {}, initialSize = 10, maxSize = 0) {
        this.createFn = createFn
        this.resetFn = resetFn
        this.pool = []
        this.maxSize = maxSize
        this.activeCount = 0
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(createFn())
        }
    }
    
    /**
     * Acquires an object from the pool
     * @returns {T} Object from pool
     */
    acquire() {
        let obj
        if (this.pool.length > 0) {
            obj = this.pool.pop()
        } else {
            obj = this.createFn()
        }
        this.activeCount++
        return obj
    }
    
    /**
     * Releases an object back to the pool
     * @param {T} obj - Object to release
     */
    release(obj) {
        if (!obj) return
        
        this.resetFn(obj)
        
        // Only add back if under max size or max size is 0 (unlimited)
        if (this.maxSize === 0 || this.pool.length < this.maxSize) {
            this.pool.push(obj)
        }
        
        this.activeCount--
    }
    
    /**
     * Gets the number of available objects in the pool
     * @returns {number} Available count
     */
    getAvailableCount() {
        return this.pool.length
    }
    
    /**
     * Gets the number of active objects
     * @returns {number} Active count
     */
    getActiveCount() {
        return this.activeCount
    }
    
    /**
     * Clears the pool
     */
    clear() {
        this.pool = []
        this.activeCount = 0
    }
}

/**
 * Specialized pool for Audio objects
 */
export class AudioPool {
    /**
     * Creates a new audio pool
     * @param {string} src - Audio source path
     * @param {number} poolSize - Number of audio objects to pool
     * @param {number} volume - Volume level (0-1)
     */
    constructor(src, poolSize = 5, volume = 1.0) {
        this.src = src
        this.pool = []
        this.currentIndex = 0
        
        for (let i = 0; i < poolSize; i++) {
            const audio = new Audio(src)
            audio.preload = 'auto'
            audio.volume = volume
            this.pool.push(audio)
        }
    }
    
    /**
     * Plays a sound from the pool
     * @param {number} volume - Optional volume override
     * @returns {Promise} Promise that resolves when sound starts playing
     */
    async play(volume = null) {
        const audio = this.pool[this.currentIndex]
        this.currentIndex = (this.currentIndex + 1) % this.pool.length
        
        // Reset audio
        audio.currentTime = 0
        if (volume !== null) {
            audio.volume = volume
        }
        
        try {
            await audio.play()
            return audio
        } catch (err) {
            // Ignore AbortError and NotAllowedError (user interaction required)
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                console.error('Error playing audio:', err)
            }
            return null
        }
    }
    
    /**
     * Sets volume for all audio objects in pool
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        this.pool.forEach(audio => {
            audio.volume = volume
        })
    }
}

/**
 * Specialized pool for THREE.js objects
 */
export class ThreeObjectPool {
    /**
     * Creates a new THREE.js object pool
     * @param {Function} createFn - Function to create THREE.js objects
     * @param {Function} resetFn - Function to reset objects
     * @param {number} initialSize - Initial pool size
     */
    constructor(createFn, resetFn = () => {}, initialSize = 10) {
        this.createFn = createFn
        this.resetFn = resetFn
        this.pool = []
        this.activeObjects = new Set()
        
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(createFn())
        }
    }
    
    /**
     * Acquires a THREE.js object from the pool
     * @returns {THREE.Object3D} Object from pool
     */
    acquire() {
        let obj
        if (this.pool.length > 0) {
            obj = this.pool.pop()
        } else {
            obj = this.createFn()
        }
        this.activeObjects.add(obj)
        return obj
    }
    
    /**
     * Releases a THREE.js object back to the pool
     * @param {THREE.Object3D} obj - Object to release
     */
    release(obj) {
        if (!obj || !this.activeObjects.has(obj)) return
        
        this.resetFn(obj)
        this.activeObjects.delete(obj)
        this.pool.push(obj)
    }
    
    /**
     * Disposes all objects in the pool
     * @param {Function} disposeFn - Function to dispose objects
     */
    dispose(disposeFn = null) {
        const allObjects = [...this.pool, ...this.activeObjects]
        
        allObjects.forEach(obj => {
            if (disposeFn) {
                disposeFn(obj)
            } else {
                // Default disposal for THREE.js objects
                if (obj.geometry) obj.geometry.dispose()
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => mat.dispose())
                    } else {
                        obj.material.dispose()
                    }
                }
            }
        })
        
        this.pool = []
        this.activeObjects.clear()
    }
}

