const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

// Aquí guardamos dónde están los jugadores
let players = {};

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);
    
    // Al conectarse, lo añadimos vacío
    players[socket.id] = {};

    // Cuando un jugador se mueve, actualizamos su posición aquí
    socket.on('playerState', (data) => {
        players[socket.id] = data;
    });

    // Cuando se desconecta, lo borramos
    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
    });
});

// Enviar las posiciones a todos 30 veces por segundo
setInterval(() => {
    io.emit('updateState', players);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de espejos corriendo en puerto ${PORT}`);
});
