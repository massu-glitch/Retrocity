const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuramos CORS para permitir que Netlify se conecte aquí
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let players = {}; 

io.on('connection', (socket) => {
    console.log('Un jugador se ha conectado:', socket.id);

    // Posición inicial de los jugadores
    players[socket.id] = { x: 2000, y: 2000, angle: 0 };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMovement', (movementData) => {
        players[socket.id].x = movementData.x;
        players[socket.id].y = movementData.y;
        players[socket.id].angle = movementData.angle;
        socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// En Render es OBLIGATORIO usar process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto ' + PORT);
});