import { createServer } from 'http'
import { Server } from 'socket.io'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// MIME types for static files
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
}

// Serve static files
function serveStaticFile(req, res) {
    // Parse URL to get pathname (remove query string and hash)
    let urlPath = req.url.split('?')[0] // Remove query string
    urlPath = urlPath.split('#')[0] // Remove hash
    
    // Normalize path
    if (urlPath === '/') {
        urlPath = '/index.html'
    }
    
    let filePath = join(__dirname, 'dist', urlPath)
    
    // Security: prevent directory traversal
    const distPath = join(__dirname, 'dist')
    if (!filePath.startsWith(distPath)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
    }
    
    // Check if file exists
    if (!existsSync(filePath)) {
        // Check if it's a directory
        try {
            const stats = statSync(filePath)
            if (stats.isDirectory()) {
                filePath = join(filePath, 'index.html')
                if (!existsSync(filePath)) {
                    res.writeHead(404)
                    res.end('File not found')
                    return
                }
            }
        } catch (err) {
            // File doesn't exist - check if it's an asset request
            const ext = extname(urlPath).toLowerCase()
            const isAssetRequest = ext && (ext !== '.html' || urlPath.startsWith('/assets/') || urlPath.endsWith('.json'))
            
            if (isAssetRequest) {
                // Asset file not found - return 404
                console.error(`Asset not found: ${urlPath}`)
                res.writeHead(404, { 'Content-Type': 'text/plain' })
                res.end('Asset not found')
                return
            }
            
            // SPA fallback: serve index.html for routes (not assets)
            filePath = join(__dirname, 'dist', 'index.html')
            if (!existsSync(filePath)) {
                res.writeHead(404)
                res.end('File not found')
                return
            }
        }
    }
    
    // Get file stats
    let stats
    try {
        stats = statSync(filePath)
    } catch (err) {
        res.writeHead(404)
        res.end('File not found')
        return
    }
    
    if (stats.isDirectory()) {
        filePath = join(filePath, 'index.html')
        if (!existsSync(filePath)) {
            res.writeHead(404)
            res.end('File not found')
            return
        }
        stats = statSync(filePath)
    }
    
    // Get file extension and set MIME type
    const ext = extname(filePath).toLowerCase()
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    
    // Read and serve file
    try {
        const content = readFileSync(filePath)
        
        // Set cache headers for static assets (not HTML)
        if (ext !== '.html') {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else {
            res.setHeader('Cache-Control', 'no-cache')
        }
        
        res.writeHead(200, { 'Content-Type': contentType })
        res.end(content)
    } catch (err) {
        console.error('Error serving file:', err)
        res.writeHead(500)
        res.end('Internal server error')
    }
}

const httpServer = createServer((req, res) => {
    // Handle Socket.IO upgrade requests
    if (req.url.startsWith('/socket.io/')) {
        // Let Socket.IO handle it
        return
    }
    
    // Serve static files
    serveStaticFile(req, res)
})

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

// Room management
const rooms = new Map() // code -> { hostId, players: Map<socketId, playerData>, gameStarted, createdAt }
const roomCleanupTimeouts = new Map() // code -> timeout

// Generate unique 6-character game code
function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    // Check for collision (unlikely but handle)
    if (rooms.has(code)) {
        return generateGameCode() // Recursively generate until unique
    }
    return code
}

// Cleanup empty rooms after timeout
function scheduleRoomCleanup(code) {
    // Clear existing timeout if any
    if (roomCleanupTimeouts.has(code)) {
        clearTimeout(roomCleanupTimeouts.get(code))
    }
    
    const timeout = setTimeout(() => {
        const room = rooms.get(code)
        if (room && room.players.size === 0) {
            rooms.delete(code)
            roomCleanupTimeouts.delete(code)
            console.log(`Room ${code} cleaned up`)
        }
    }, 5 * 60 * 1000) // 5 minutes
    
    roomCleanupTimeouts.set(code, timeout)
}

// Disband room (host left)
function disbandRoom(code) {
    const room = rooms.get(code)
    if (!room) return
    
    // Notify all players
    io.to(code).emit('roomDisbanded', { reason: 'Host left the game' })
    
    // Disconnect all players from room
    room.players.forEach((playerData, socketId) => {
        const socket = io.sockets.sockets.get(socketId)
        if (socket) {
            socket.leave(code)
        }
    })
    
    // Clean up
    rooms.delete(code)
    if (roomCleanupTimeouts.has(code)) {
        clearTimeout(roomCleanupTimeouts.get(code))
        roomCleanupTimeouts.delete(code)
    }
    
    console.log(`Room ${code} disbanded`)
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`)
    
    // Create room
    socket.on('createRoom', () => {
        const code = generateGameCode()
        const room = {
            hostId: socket.id,
            players: new Map(),
            gameStarted: false,
            createdAt: Date.now()
        }
        
        room.players.set(socket.id, {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 }
        })
        
        rooms.set(code, room)
        socket.join(code)
        
        socket.emit('roomCreated', { code })
        socket.emit('roomState', {
            code,
            isHost: true,
            gameStarted: false,
            players: [{ id: socket.id }]
        })
        
        console.log(`Room ${code} created by ${socket.id}`)
    })
    
    // Join room
    socket.on('joinRoom', ({ code }) => {
        const room = rooms.get(code)
        
        if (!room) {
            socket.emit('roomError', { message: 'Invalid game code' })
            return
        }
        
        if (room.players.size >= 4) {
            socket.emit('roomError', { message: 'Room is full' })
            return
        }
        
        // Cancel cleanup timeout
        if (roomCleanupTimeouts.has(code)) {
            clearTimeout(roomCleanupTimeouts.get(code))
            roomCleanupTimeouts.delete(code)
        }
        
        room.players.set(socket.id, {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            displayName: ''
        })
        socket.join(code)
        
        const playersList = Array.from(room.players.keys()).map(id => ({ id }))
        
        socket.emit('roomJoined', { code })
        socket.emit('roomState', {
            code,
            isHost: false,
            gameStarted: room.gameStarted,
            players: playersList
        })
        
        // If game has already started, send current players to the new joiner
        if (room.gameStarted) {
            const currentPlayers = Array.from(room.players.entries())
                .filter(([id]) => id !== socket.id) // Exclude self
                .map(([id, data]) => ({
                    id,
                    position: data.position,
                    rotation: data.rotation,
                    displayName: data.displayName || ''
                }))
            
            socket.emit('currentPlayers', currentPlayers)
            
            // Notify existing players about the new player joining (so they can see them)
            const newPlayerData = room.players.get(socket.id)
            socket.to(code).emit('playerJoined', {
                id: socket.id,
                position: newPlayerData.position,
                rotation: newPlayerData.rotation,
                displayName: newPlayerData.displayName || ''
            })
        }
        
        // Notify other players (for room state updates)
        socket.to(code).emit('playerJoinedRoom', { id: socket.id })
        
        // Send roomState to each player individually with correct isHost value
        room.players.forEach((playerData, playerId) => {
            const playerSocket = io.sockets.sockets.get(playerId)
            if (playerSocket) {
                playerSocket.emit('roomState', {
                    code,
                    isHost: room.hostId === playerId,
                    gameStarted: room.gameStarted,
                    players: playersList
                })
            }
        })
        
        console.log(`Player ${socket.id} joined room ${code}${room.gameStarted ? ' (game in progress)' : ''}`)
    })
    
    // Start game (host only)
    socket.on('startGame', () => {
        // Find room where this socket is host
        for (const [code, room] of rooms.entries()) {
            if (room.hostId === socket.id && !room.gameStarted) {
                if (room.players.size < 1) {
                    socket.emit('roomError', { message: 'Need at least 1 player to start' })
                    return
                }
                
                room.gameStarted = true
                
                // Send current players to all players in room
                const currentPlayers = Array.from(room.players.entries()).map(([id, data]) => ({
                    id,
                    position: data.position,
                    rotation: data.rotation,
                    displayName: data.displayName || ''
                }))
                
                io.to(code).emit('gameStarted')
                io.to(code).emit('currentPlayers', currentPlayers)
                
                // Broadcast initial player join to others
                currentPlayers.forEach(player => {
                    if (player.id !== socket.id) {
                        socket.to(code).emit('playerJoined', {
                            id: player.id,
                            position: player.position,
                            rotation: player.rotation,
                            displayName: player.displayName || ''
                        })
                    }
                })
                
                console.log(`Game started in room ${code}`)
                return
            }
        }
        
        socket.emit('roomError', { message: 'Not authorized to start game' })
    })
    
    // Leave room
    socket.on('leaveRoom', () => {
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                socket.leave(code)
                room.players.delete(socket.id)
                
                const playersList = Array.from(room.players.keys()).map(id => ({ id }))
                
                // If host left, disband room
                if (room.hostId === socket.id) {
                    disbandRoom(code)
                } else {
                    // Notify other players
                    socket.to(code).emit('playerLeftRoom', { id: socket.id })
                    
                    // Send roomState to each remaining player individually with correct isHost value
                    room.players.forEach((playerData, playerId) => {
                        const playerSocket = io.sockets.sockets.get(playerId)
                        if (playerSocket) {
                            playerSocket.emit('roomState', {
                                code,
                                isHost: room.hostId === playerId,
                                gameStarted: room.gameStarted,
                                players: playersList
                            })
                        }
                    })
                    
                    // Schedule cleanup if room is empty
                    if (room.players.size === 0) {
                        scheduleRoomCleanup(code)
                    }
                }
                
                console.log(`Player ${socket.id} left room ${code}`)
                return
            }
        }
    })
    
    // Handle player name updates (can happen anytime, even before game starts)
    socket.on('playerNameUpdate', (data) => {
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                const playerData = room.players.get(socket.id)
                playerData.displayName = data.displayName || ''
                
                // Broadcast name update to all other players in room immediately
                socket.to(code).emit('playerNameUpdate', {
                    id: socket.id,
                    displayName: data.displayName || ''
                })
                return
            }
        }
    })
    
    // Handle player updates (only when game is started)
    socket.on('playerUpdate', (data) => {
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id) && room.gameStarted) {
                const playerData = room.players.get(socket.id)
                playerData.position = data.position
                playerData.rotation = data.rotation
                playerData.velocity = data.velocity || { x: 0, y: 0, z: 0 }
                if (data.displayName !== undefined) {
                    playerData.displayName = data.displayName || 'Guest'
                }
                
                // Broadcast to all other players in room
                socket.to(code).emit('playerUpdate', {
                    id: socket.id,
                    ...data
                })
                return
            }
        }
    })
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`)
        
        for (const [code, room] of rooms.entries()) {
            if (room.players.has(socket.id)) {
                socket.leave(code)
                room.players.delete(socket.id)
                
                // If host disconnected, disband room
                if (room.hostId === socket.id) {
                    disbandRoom(code)
                } else {
                    // Notify other players
                    socket.to(code).emit('playerLeft', socket.id)
                    
                    // Schedule cleanup if room is empty
                    if (room.players.size === 0) {
                        scheduleRoomCleanup(code)
                    }
                }
                return
            }
        }
    })
})

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Multiplayer server running on port ${PORT}`)
    console.log(`Environment: ${NODE_ENV}`)
    if (NODE_ENV === 'production') {
        console.log(`Server accessible at: http://0.0.0.0:${PORT}`)
    } else {
        console.log(`Connect clients to: http://localhost:${PORT}`)
    }
})

