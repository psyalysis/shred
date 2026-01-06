import { io } from 'socket.io-client'
import * as state from './state.js'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ============================================================================
// NETWORKING
// ============================================================================

const SERVER_URL = 'http://localhost:3001' // Change this to your server URL if different

let socket = null
let isConnected = false
const otherPlayers = new Map() // id -> { mesh, position, rotation, velocity }
const UPDATE_RATE = 25 // Send updates 20 times per second
let lastUpdateTime = 0

export function connect() {
    socket = io(SERVER_URL)
    
    socket.on('connect', () => {
        console.log('Connected to multiplayer server')
        isConnected = true
    })
    
    socket.on('disconnect', () => {
        console.log('Disconnected from multiplayer server')
        isConnected = false
    })
    
    socket.on('currentPlayers', (players) => {
        console.log(`Received ${players.length} current players`)
        players.forEach(player => {
            if (player.id !== socket.id) {
                createOtherPlayer(player.id, player.position, player.rotation)
            }
        })
    })
    
    socket.on('playerJoined', (player) => {
        console.log(`Player joined: ${player.id}`)
        createOtherPlayer(player.id, player.position, player.rotation)
    })
    
    socket.on('playerUpdate', (data) => {
        updateOtherPlayer(data.id, data.position, data.rotation, data.velocity)
    })
    
    socket.on('playerLeft', (playerId) => {
        console.log(`Player left: ${playerId}`)
        removeOtherPlayer(playerId)
    })
}

function createOtherPlayer(id, position, rotation) {
    if (otherPlayers.has(id)) return
    
    const loader = new GLTFLoader()
    loader.load(
        './skateboard.glb',
        (gltf) => {
            const mesh = gltf.scene.clone()
            
            // Scale to match player's board
            const box = new THREE.Box3().setFromObject(mesh)
            const size = box.getSize(new THREE.Vector3())
            const targetHeight = 0.1
            const scale = (targetHeight / size.y) * 1.5
            mesh.scale.set(scale, scale, scale)
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
                targetRotation: { ...rotation }
            })
        },
        undefined,
        (error) => {
            console.error(`Error loading other player model for ${id}:`, error)
        }
    )
}

function updateOtherPlayer(id, position, rotation, velocity) {
    const player = otherPlayers.get(id)
    if (!player) return
    
    // Store target values for interpolation
    player.targetPosition = { ...position }
    player.targetRotation = { ...rotation }
    player.velocity = velocity || { x: 0, y: 0, z: 0 }
}

// Helper function to calculate shortest angular distance (handles wrap-around)
function shortestAngleDiff(current, target) {
    let diff = target - current
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI
    while (diff < -Math.PI) diff += 2 * Math.PI
    return diff
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
    
    // Interpolate other players' positions smoothly
    const lerpFactor = Math.min(1, deltaTime * 10) // Adjust speed as needed
    const SNAP_THRESHOLD = Math.PI / 20 // 9 degrees - if rotation changes more than this, it's a snap
    
    otherPlayers.forEach((player) => {
        if (!player.mesh) return
        
        // Interpolate position
        player.position.x += (player.targetPosition.x - player.position.x) * lerpFactor
        player.position.y += (player.targetPosition.y - player.position.y) * lerpFactor
        player.position.z += (player.targetPosition.z - player.position.z) * lerpFactor
        
        // Check for snap rotations (large sudden changes)
        const rotXDiff = Math.abs(shortestAngleDiff(player.rotation.x, player.targetRotation.x))
        const rotYDiff = Math.abs(shortestAngleDiff(player.rotation.y, player.targetRotation.y))
        const rotZDiff = Math.abs(shortestAngleDiff(player.rotation.z, player.targetRotation.z))
        
        // If any rotation change is large (snap), apply immediately
        if (rotXDiff > SNAP_THRESHOLD || rotYDiff > SNAP_THRESHOLD || rotZDiff > SNAP_THRESHOLD) {
            // Snap immediately - don't interpolate
            player.rotation.x = player.targetRotation.x
            player.rotation.y = player.targetRotation.y
            player.rotation.z = player.targetRotation.z
        } else {
            // Normal continuous rotation - interpolate smoothly
            player.rotation.x += shortestAngleDiff(player.rotation.x, player.targetRotation.x) * lerpFactor
            player.rotation.y += shortestAngleDiff(player.rotation.y, player.targetRotation.y) * lerpFactor
            player.rotation.z += shortestAngleDiff(player.rotation.z, player.targetRotation.z) * lerpFactor
        }
        
        // Update mesh
        player.mesh.position.set(player.position.x, player.position.y, player.position.z)
        player.mesh.rotation.set(player.rotation.x, player.rotation.y, player.rotation.z)
    })
    
    // Send player update
    const now = performance.now()
    if (now - lastUpdateTime >= 1000 / UPDATE_RATE) {
        if (state.sceneObjects.cubeMesh) {
            socket.emit('playerUpdate', {
                position: {
                    x: state.cubeTransform.position.x,
                    y: state.cubeTransform.position.y,
                    z: state.cubeTransform.position.z
                },
                rotation: {
                    x: state.cubeTransform.rotation.x,
                    y: state.cubeTransform.rotation.y,
                    z: state.cubeTransform.rotation.z
                },
                velocity: {
                    x: state.cubeVelocity.x,
                    y: state.cubeVelocity.y,
                    z: state.cubeVelocity.z
                }
            })
        }
        lastUpdateTime = now
    }
}

export function disconnect() {
    if (socket) {
        socket.disconnect()
        socket = null
    }
    isConnected = false
}

