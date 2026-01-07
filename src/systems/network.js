import { io } from 'socket.io-client'
import * as state from '../core/state.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { shortestAngleDiff } from '../utils/math.js'
import { error, info, warn } from '../utils/logger.js'
import { emitSparksForOtherPlayer } from './particles.js'
import {
    SERVER_URL,
    NETWORK_UPDATE_RATE,
    NETWORK_LERP_FACTOR,
    NETWORK_SNAP_THRESHOLD,
    NETWORK_MAX_RECONNECT_ATTEMPTS,
    NETWORK_RECONNECT_BASE_DELAY,
    NETWORK_RECONNECT_MAX_DELAY,
    BOARD_REFRESH_RATE
} from '../config/constants.js'

// ============================================================================
// NETWORKING
// ============================================================================

let socket = null
let isConnected = false
const otherPlayers = new Map() // id -> { mesh, position, rotation, velocity, lastUpdateTime }
let lastUpdateTime = 0
let reconnectAttempts = 0
let reconnectTimeout = null
const otherPlayerSparkTimes = new Map() // Track last spark emission time per player
const OTHER_PLAYER_SPARK_RATE = 10  // Sparks per second for other players
const BOARD_REFRESH_DELTA = 1 / BOARD_REFRESH_RATE

// Room callbacks (set by UI)
let onRoomCreated = null
let onRoomJoined = null
let onGameStarted = null
let onRoomDisbanded = null
let onRoomError = null
let onRoomStateUpdate = null

function attemptReconnect() {
    if (reconnectAttempts >= NETWORK_MAX_RECONNECT_ATTEMPTS) {
        warn('Max reconnection attempts reached. Please refresh the page.')
        return
    }
    
    const delay = Math.min(
        NETWORK_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
        NETWORK_RECONNECT_MAX_DELAY
    )
    
    reconnectAttempts++
    info(`Attempting to reconnect (${reconnectAttempts}/${NETWORK_MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`)
    
    reconnectTimeout = setTimeout(() => {
        connect()
    }, delay)
}

export function connect() {
    // If already connected, don't create a new connection
    if (socket && socket.connected) {
        info('Already connected to server')
        return
    }
    
    // Disconnect existing socket if any
    if (socket) {
        socket.removeAllListeners()
        socket.disconnect()
        socket = null
    }
    
    // Clear any existing reconnection timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
    }
    
    try {
        socket = io(SERVER_URL)
        
        socket.on('connect', () => {
            info('Connected to multiplayer server')
            isConnected = true
            reconnectAttempts = 0 // Reset on successful connection
        })
        
        socket.on('disconnect', (reason) => {
            warn(`Disconnected from multiplayer server: ${reason}`)
            isConnected = false
            
            // Reset room state
            state.room.code = null
            state.room.isHost = false
            state.room.gameStarted = false
            state.room.players = []
            
            // Attempt to reconnect if it wasn't a manual disconnect
            if (reason !== 'io client disconnect') {
                attemptReconnect()
            }
        })
        
        socket.on('connect_error', (err) => {
            error('Connection error:', err)
            attemptReconnect()
        })
        
        // Room events
        socket.on('roomCreated', (data) => {
            info(`Room created: ${data.code}`)
            state.room.code = data.code
            state.room.isHost = true
            if (onRoomCreated) onRoomCreated(data.code)
        })
        
        socket.on('roomJoined', (data) => {
            info(`Joined room: ${data.code}`)
            state.room.code = data.code
            state.room.isHost = false
            if (onRoomJoined) onRoomJoined(data.code)
        })
        
        socket.on('roomState', (data) => {
            state.room.code = data.code
            state.room.isHost = data.isHost
            state.room.gameStarted = data.gameStarted
            state.room.players = data.players || []
            if (onRoomStateUpdate) onRoomStateUpdate(data)
        })
        
        socket.on('gameStarted', () => {
            info('Game started')
            state.room.gameStarted = true
            if (onGameStarted) onGameStarted()
        })
        
        socket.on('roomDisbanded', (data) => {
            warn(`Room disbanded: ${data.reason || 'Host left'}`)
            state.room.code = null
            state.room.isHost = false
            state.room.gameStarted = false
            state.room.players = []
            
            // Remove all other players
            otherPlayers.forEach((player, id) => {
                removeOtherPlayer(id)
            })
            
            if (onRoomDisbanded) onRoomDisbanded(data.reason || 'Host left')
        })
        
        socket.on('roomError', (data) => {
            error(`Room error: ${data.message}`)
            if (onRoomError) onRoomError(data.message)
        })
        
        socket.on('playerJoinedRoom', (data) => {
            info(`Player joined room: ${data.id}`)
        })
        
        socket.on('playerLeftRoom', (data) => {
            info(`Player left room: ${data.id}`)
        })
        
        // Game events (only when game is started)
        socket.on('currentPlayers', (players) => {
            info(`Received ${players.length} current players`)
            players.forEach(player => {
                if (player.id !== socket.id) {
                    createOtherPlayer(player.id, player.position, player.rotation)
                }
            })
        })
        
        socket.on('playerJoined', (player) => {
            info(`Player joined: ${player.id}`)
            createOtherPlayer(player.id, player.position, player.rotation)
        })
        
        socket.on('playerUpdate', (data) => {
            updateOtherPlayer(
                data.id, 
                data.position, 
                data.rotation, 
                data.velocity,
                data.isGrinding,
                data.railGrindDirection
            )
        })
        
        socket.on('playerLeft', (playerId) => {
            info(`Player left: ${playerId}`)
            removeOtherPlayer(playerId)
        })
    } catch (err) {
        error('Failed to connect to server:', err)
        attemptReconnect()
    }
}

// Room management functions
export function createRoom() {
    if (!socket || !isConnected) {
        error('Not connected to server')
        return
    }
    socket.emit('createRoom')
}

export function joinRoom(code) {
    if (!socket || !isConnected) {
        error('Not connected to server')
        return
    }
    socket.emit('joinRoom', { code })
}

export function startGame() {
    if (!socket || !isConnected) {
        error('Not connected to server')
        return
    }
    if (!state.room.isHost) {
        error('Only host can start the game')
        return
    }
    socket.emit('startGame')
}

export function leaveRoom() {
    if (!socket || !isConnected) {
        return
    }
    socket.emit('leaveRoom')
    
    // Reset room state
    state.room.code = null
    state.room.isHost = false
    state.room.gameStarted = false
    state.room.players = []
    
    // Remove all other players
    otherPlayers.forEach((player, id) => {
        removeOtherPlayer(id)
    })
}

// Set room event callbacks
export function setRoomCallbacks(callbacks) {
    onRoomCreated = callbacks.onRoomCreated
    onRoomJoined = callbacks.onRoomJoined
    onGameStarted = callbacks.onGameStarted
    onRoomDisbanded = callbacks.onRoomDisbanded
    onRoomError = callbacks.onRoomError
    onRoomStateUpdate = callbacks.onRoomStateUpdate
}

function createOtherPlayer(id, position, rotation) {
    if (otherPlayers.has(id)) return
    
    const loader = new GLTFLoader()
    loader.load(
        '/assets/skateboard.glb',
        (gltf) => {
            const mesh = gltf.scene.clone()
            
            // Scale to match player's board
            const box = new THREE.Box3().setFromObject(mesh)
            const size = box.getSize(new THREE.Vector3())
            const targetHeight = 0.1
            const scale = (targetHeight / size.y) * 1.5
            mesh.scale.set(scale, scale, scale)
            
            // Set rotation order to 'YXZ' to match local player (ensures rotation.x is relative to board)
            mesh.rotation.order = 'YXZ'
            mesh.rotation.x = Math.PI / 2
            
            // Set initial position and rotation
            mesh.position.set(position.x, position.y, position.z)
            mesh.rotation.set(rotation.x, rotation.y, rotation.z)
            
            // Make it slightly transparent to distinguish from local player
            mesh.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone()
                    child.material.transparent = true
                    child.material.opacity = 0.7
                }
            })
            
            mesh.castShadow = true
            mesh.receiveShadow = true
            
            state.sceneObjects.scene.add(mesh)
            
            otherPlayers.set(id, {
                mesh,
                position: { ...position },
                rotation: { ...rotation },
                velocity: { x: 0, y: 0, z: 0 },
                targetPosition: { ...position },
                targetRotation: { ...rotation },
                lastUpdateTime: performance.now(),
                isGrinding: false,
                railGrindDirection: 0,
                previousIsGrinding: false,
                visualTiming: {
                    accumulatedTime: 0
                }
            })
        },
        undefined,
        (err) => {
            error(`Error loading other player model for ${id}:`, err)
        }
    )
}

function updateOtherPlayer(id, position, rotation, velocity, isGrinding, railGrindDirection) {
    const player = otherPlayers.get(id)
    if (!player) return
    
    // Use velocity for better prediction
    const timeSinceUpdate = (performance.now() - (player.lastUpdateTime || performance.now())) / 1000
    const predictedPosition = {
        x: position.x + ((velocity?.x || 0) * timeSinceUpdate),
        y: position.y + ((velocity?.y || 0) * timeSinceUpdate),
        z: position.z + ((velocity?.z || 0) * timeSinceUpdate)
    }
    
    // Store target values for interpolation
    player.targetPosition = predictedPosition
    player.targetRotation = { ...rotation }
    player.velocity = velocity || { x: 0, y: 0, z: 0 }
    player.previousIsGrinding = player.isGrinding
    player.isGrinding = isGrinding || false
    player.railGrindDirection = railGrindDirection || 0
    player.lastUpdateTime = performance.now()
}

function removeOtherPlayer(id) {
    const player = otherPlayers.get(id)
    if (!player) return
    
    state.sceneObjects.scene.remove(player.mesh)
    
    // Dispose of geometry and materials
    player.mesh.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                } else {
                    child.material.dispose()
                }
            }
        }
    })
    
    otherPlayers.delete(id)
}

export function updateNetwork(deltaTime) {
    if (!isConnected || !socket) return
    if (!state.room.gameStarted) return // Only send updates when game is started
    
    // Interpolate other players' positions smoothly
    const lerpFactor = Math.min(1, deltaTime * NETWORK_LERP_FACTOR)
    
    otherPlayers.forEach((player) => {
        if (!player.mesh) return
        
        // Initialize visual timing if not present
        if (!player.visualTiming) {
            player.visualTiming = { accumulatedTime: 0 }
        }
        
        // Interpolate position smoothly
        player.position.x += (player.targetPosition.x - player.position.x) * lerpFactor
        player.position.y += (player.targetPosition.y - player.position.y) * lerpFactor
        player.position.z += (player.targetPosition.z - player.position.z) * lerpFactor
        
        // Emit sparks for other players while they're grinding (throttled)
        if (player.isGrinding && typeof emitSparksForOtherPlayer === 'function') {
            const playerId = player.mesh.id || 'unknown'
            const now = performance.now()
            const lastSparkTime = otherPlayerSparkTimes.get(playerId) || 0
            const sparkInterval = 1000 / OTHER_PLAYER_SPARK_RATE
            
            if (now - lastSparkTime >= sparkInterval) {
                emitSparksForOtherPlayer(playerId, {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z
                }, player.railGrindDirection)
                otherPlayerSparkTimes.set(playerId, now)
            }
        }
        
        // Update rotation at board refresh rate without smoothing
        player.visualTiming.accumulatedTime += deltaTime
        
        while (player.visualTiming.accumulatedTime >= BOARD_REFRESH_DELTA) {
            // Update rotation directly without interpolation (choppy like board)
            player.rotation.x = player.targetRotation.x
            player.rotation.y = player.targetRotation.y
            player.rotation.z = player.targetRotation.z
            
            player.visualTiming.accumulatedTime -= BOARD_REFRESH_DELTA
        }
        
        // Update mesh
        player.mesh.position.set(player.position.x, player.position.y, player.position.z)
        player.mesh.rotation.set(player.rotation.x, player.rotation.y, player.rotation.z)
    })
    
    // Send player update
    const now = performance.now()
    if (now - lastUpdateTime >= 1000 / NETWORK_UPDATE_RATE) {
        if (state.sceneObjects.boardMesh) {
            socket.emit('playerUpdate', {
                position: {
                    x: state.boardTransform.position.x,
                    y: state.boardTransform.position.y,
                    z: state.boardTransform.position.z
                },
                rotation: {
                    x: state.boardTransform.rotation.x,
                    y: state.boardTransform.rotation.y,
                    z: state.boardTransform.rotation.z
                },
                velocity: {
                    x: state.boardVelocity.x,
                    y: state.boardVelocity.y,
                    z: state.boardVelocity.z
                },
                isGrinding: state.physics.isGrinding,
                railGrindDirection: state.physics.railGrindDirection
            })
        }
        lastUpdateTime = now
    }
}

export function disconnect() {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
    }
    
    if (socket) {
        socket.disconnect()
        socket = null
    }
    isConnected = false
    reconnectAttempts = 0
    info('Disconnected from multiplayer server')
}

