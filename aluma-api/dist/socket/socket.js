import { Server } from "socket.io";
let io;
export function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: "http://localhost:5173",
        },
    });
    io.on("connection", (socket) => {
        console.log("Cliente conectado:", socket.id);
        socket.on("disconnect", () => {
            console.log("Cliente desconectado:", socket.id);
        });
    });
    return io;
}
export function getIO() {
    if (!io) {
        throw new Error("Socket.IO no ha sido inicializado");
    }
    return io;
}
//# sourceMappingURL=socket.js.map