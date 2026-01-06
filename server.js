import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = process.env.PORT || 3001

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

const players = new Map()

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`)
    
    // Send current players to new player
    const currentPlayers = Array.from(players.entries()).map(([id, data]) => ({
        id,
        ...data
    }))
    socket.emit('currentPlayers', currentPlayers)
    
    // Broadcast new player to others
    socket.broadcast.emit('playerJoined', {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 }
    })
    
    // Handle player updates
    socket.on('playerUpdate', (data) => {
        players.set(socket.id, {
            position: data.position,
            rotation: data.rotation,
            velocity: data.velocity || { x: 0, y: 0, z: 0 }
        })
        
        // Broadcast to all other players
        socket.broadcast.emit('playerUpdate', {
            id: socket.id,
            ...data
        })
    })
    
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`)
        players.delete(socket.id)
        socket.broadcast.emit('playerLeft', socket.id)
    })
})

httpServer.listen(PORT, () => {
    console.log(`Multiplayer server running on port ${PORT}`)
    console.log(`Connect clients to: ws://localhost:${PORT}`)
})

