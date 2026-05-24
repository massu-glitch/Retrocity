const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let trafficData = { vehicles: [], npcs: [] };
let hostId = null;

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);
    players[socket.id] = {};
    
    // Si no hay nadie más, este jugador es el Host que controla el tráfico
    if (!hostId) hostId = socket.id;
    socket.emit('hostStatus', socket.id === hostId);

    // Posición del jugador
    socket.on('playerState', (data) => {
        players[socket.id] = data;
    });

    // Posición del tráfico (Solo la envía el Host)
    socket.on('trafficState', (data) => {
        if (socket.id === hostId) {
            trafficData = data;
        }
    });

    // Si alguien roba un coche de la calle, avisar a todos
    socket.on('claimVehicle', (vid) => {
        io.emit('vehicleClaimed', vid);
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
        
        // Si el Host se va, le pasamos el control del tráfico al siguiente
        if (socket.id === hostId) {
            let remaining = Object.keys(players);
            if (remaining.length > 0) {
                hostId = remaining[0];
                io.to(hostId).emit('hostStatus', true);
            } else {
                hostId = null;
                trafficData = { vehicles: [], npcs: [] };
            }
        }
    });
});

// Enviar estado a todos 30 veces por segundo
setInterval(() => {
    io.emit('updateState', { players, traffic: trafficData });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor MMO corriendo en puerto ${PORT}`);
});
