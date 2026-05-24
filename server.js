const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ==========================================
// CONSTANTES Y LÓGICA COMPARTIDA (MAPA)
// ==========================================
const TILE_SIZE = 200;
const TYPES = { GRASS: 0, ROAD: 1, BUILDING: 2, TREE: 3, SIDEWALK: 4, WATER: 5 };

function isTownArea(tx, ty) {
    let rx = Math.floor(tx / 64), ry = Math.floor(ty / 64);
    let hash = Math.abs(Math.sin(rx * 12.9898 + ry * 78.233) * 43758.5453);
    return (hash - Math.floor(hash)) > 0.65;
}
function getRoadType(tx, ty) { /* ... MISMO CÓDIGO DEL ORIGINAL ... */ 
    let isTown = isTownArea(tx, ty);
    let lx = ((tx % 28) + 28) % 28; let ly = ((ty % 28) + 28) % 28;
    let isMainV = (lx === 0); let isMainH = (ly === 0);
    let isV = isMainV || (isTown && (lx === 8 || lx === 18));
    let isH = isMainH || (isTown && (ly === 6 || ly === 14 || ly === 22));
    if (isV && isH) return 'INTERSECTION';
    if (isV) return 'VERTICAL';
    if (isH) return 'HORIZONTAL';
    return 'NONE';
}
function getTileType(tx, ty) {
    let road = getRoadType(tx, ty);
    if (road !== 'NONE') return TYPES.ROAD;
    let isTown = isTownArea(tx, ty);
    let hash = Math.abs(Math.sin(tx * 12.989 + ty * 78.233));
    if (isTown) {
        if (hash < 0.1) return TYPES.TREE;
        if (hash < 0.2) return TYPES.SIDEWALK;
        return TYPES.BUILDING;
    } else {
        return hash < 0.08 ? TYPES.TREE : TYPES.GRASS;
    }
}

// ==========================================
// ESTADO DEL JUEGO
// ==========================================
const gameState = {
    players: {}, // Jugadores conectados
    vehicles: [], // Vehículos en el mundo
    timeOfDay: 12.0
};

// Crear un par de vehículos de prueba en el servidor
gameState.vehicles.push({ id: 'v1', x: 2000, y: 2000, angle: 0, type: 'SEDAN', speed: 0, color: '#e74c3c', driverId: null });
gameState.vehicles.push({ id: 'v2', x: 2300, y: 2000, angle: 0, type: 'MOTO', speed: 0, color: '#2ecc71', driverId: null });

// ==========================================
// CONEXIONES DE CLIENTES
// ==========================================
io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Crear jugador
    gameState.players[socket.id] = {
        x: 2000 + Math.random() * 200, 
        y: 2000 + Math.random() * 200,
        angle: 0, speed: 100, hp: 100,
        keys: { up: false, down: false, left: false, right: false },
        inVehicle: null
    };

    // Recibir inputs del cliente
    socket.on('input', (data) => {
        if (gameState.players[socket.id]) {
            gameState.players[socket.id].keys = data;
        }
    });

    // Acción de entrar/salir de vehículo
    socket.on('action', () => {
        let p = gameState.players[socket.id];
        if (!p) return;

        if (p.inVehicle) {
            // Salir del vehículo
            let v = gameState.vehicles.find(v => v.id === p.inVehicle);
            if(v) v.driverId = null;
            p.inVehicle = null;
            p.x += 40; // Mover al lado para no atascarse
        } else {
            // Buscar vehículo cercano
            for (let v of gameState.vehicles) {
                if (Math.hypot(p.x - v.x, p.y - v.y) < 80 && !v.driverId) {
                    p.inVehicle = v.id;
                    v.driverId = socket.id;
                    break;
                }
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        let p = gameState.players[socket.id];
        if (p && p.inVehicle) {
            let v = gameState.vehicles.find(v => v.id === p.inVehicle);
            if (v) v.driverId = null;
        }
        delete gameState.players[socket.id];
    });
});

// ==========================================
// BUCLE DEL SERVIDOR (Tick Rate: 30 FPS)
// ==========================================
let lastTime = Date.now();

setInterval(() => {
    let now = Date.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // Actualizar físicas de jugadores a pie
    for (let id in gameState.players) {
        let p = gameState.players[id];
        if (p.inVehicle) continue; // Su posición es la del coche

        let moveX = 0, moveY = 0;
        if (p.keys.left) moveX -= 1;
        if (p.keys.right) moveX += 1;
        if (p.keys.up) moveY -= 1;
        if (p.keys.down) moveY += 1;

        let len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len; moveY /= len;
            p.x += moveX * p.speed * dt;
            p.y += moveY * p.speed * dt;
            p.angle = Math.atan2(moveY, moveX);
        }
    }

    // Actualizar físicas de vehículos
    for (let v of gameState.vehicles) {
        if (v.driverId) {
            let driver = gameState.players[v.driverId];
            if (driver) {
                // Lógica súper simplificada de coche para el ejemplo
                if (driver.keys.up) v.speed += 300 * dt;
                if (driver.keys.down) v.speed -= 300 * dt;
                
                v.speed *= 0.95; // Fricción

                if (Math.abs(v.speed) > 10) {
                    if (driver.keys.left) v.angle -= 2 * dt;
                    if (driver.keys.right) v.angle += 2 * dt;
                }

                v.x += Math.cos(v.angle) * v.speed * dt;
                v.y += Math.sin(v.angle) * v.speed * dt;
                
                // Actualizar la posición del jugador dentro
                driver.x = v.x;
                driver.y = v.y;
            }
        }
    }

    // Enviar el estado a todos los clientes (Snapshot)
    io.emit('stateUpdate', gameState);

}, 1000 / 30); // 30 veces por segundo

server.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});