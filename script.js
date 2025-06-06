// === CONFIGURACIÓN ===
const CONFIG = {
    FIREBASE_URL: 'https://semaforo-a10b9-default-rtdb.firebaseio.com',
    RUTA_DATOS: '/semaforo/estado.json',
    RUTA_COMANDOS: '/semaforo/comandos.json',
    INTERVALO_ACTUALIZACION: 1000, // ms
    COLORES: {
        rojo: '🔴',
        amarillo: '🟡', 
        verde: '🟢'
    }
};

// === GESTOR DE LOGS ===
class LogManager {
    static log(mensaje, tipo = 'info') {
        const container = document.getElementById('logContainer');
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${tipo}`;
        entry.textContent = `[${timestamp}] ${mensaje}`;
        
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        
        // Mantener solo últimas 50 entradas
        if (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }
    }

    static limpiar() {
        document.getElementById('logContainer').innerHTML = 
            '<div class="log-entry">Log limpiado...</div>';
    }

    static error(mensaje) {
        this.log(`❌ ${mensaje}`, 'error');
    }

    static success(mensaje) {
        this.log(`✅ ${mensaje}`, 'success');
    }

    static warning(mensaje) {
        this.log(`⚠️ ${mensaje}`, 'warning');
    }
}

// === CONTROLADOR DEL SEMÁFORO ===
class SemaforoController {
    constructor() {
        this.conectado = false;
        this.intervalo = null;
        this.ultimoEstado = null;
        this.contadorCiclos = 0;
        this.tiempoInicio = null;
        
        this.elementos = {
            luzRoja: document.getElementById('luzRoja'),
            luzAmarilla: document.getElementById('luzAmarilla'),
            luzVerde: document.getElementById('luzVerde'),
            estadoActual: document.getElementById('estadoActual'),
            connectionStatus: document.getElementById('connectionStatus'),
            lastUpdate: document.getElementById('lastUpdate'),
            estadoInfo: document.getElementById('estadoInfo'),
            duracionInfo: document.getElementById('duracionInfo'),
            ciclosInfo: document.getElementById('ciclosInfo'),
            dispositivoInfo: document.getElementById('dispositivoInfo')
        };
    }

    async conectar() {
        try {
            LogManager.log('Intentando conectar a Firebase...');
            
            // Test de conexión
            const response = await fetch(`${CONFIG.FIREBASE_URL}${CONFIG.RUTA_DATOS}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.conectado = true;
            this.tiempoInicio = Date.now();
            
            // Actualizar UI
            this.elementos.connectionStatus.textContent = '🟢 Conectado';
            this.elementos.connectionStatus.className = 'connection-status conexion-activa';
            
            // Iniciar monitoreo
            this.iniciarMonitoreo();
            
            LogManager.success('Conectado a Firebase exitosamente');
            
        } catch (error) {
            LogManager.error(`Error de conexión: ${error.message}`);
            this.elementos.connectionStatus.textContent = '🔴 Error de conexión';
        }
    }

    desconectar() {
        this.conectado = false;
        
        if (this.intervalo) {
            clearInterval(this.intervalo);
            this.intervalo = null;
        }
        
        // Resetear UI
        this.apagarTodasLasLuces();
        this.elementos.connectionStatus.textContent = '🔴 Desconectado';
        this.elementos.connectionStatus.className = 'connection-status conexion-inactiva';
        this.elementos.estadoActual.innerHTML = '<span class="estado-text">Desconectado</span>';
        
        LogManager.warning('Desconectado de Firebase');
    }

    iniciarMonitoreo() {
        if (this.intervalo) {
            clearInterval(this.intervalo);
        }
        
        this.intervalo = setInterval(async () => {
            await this.actualizarDatos();
        }, CONFIG.INTERVALO_ACTUALIZACION);
        
        // Primera actualización inmediata
        this.actualizarDatos();
    }

    async actualizarDatos() {
        if (!this.conectado) return;
        
        try {
            const response = await fetch(`${CONFIG.FIREBASE_URL}${CONFIG.RUTA_DATOS}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data && data.color) {
                this.procesarNuevoEstado(data);
                this.actualizarUI(data);
                this.elementos.lastUpdate.textContent = 
                    `Última actualización: ${new Date().toLocaleTimeString()}`;
            }
            
        } catch (error) {
            LogManager.error(`Error al obtener datos: ${error.message}`);
            
            if (error.message.includes('Failed to fetch')) {
                this.desconectar();
            }
        }
    }

    procesarNuevoEstado(data) {
        const nuevoColor = data.color;
        
        // Detectar cambio de estado
        if (this.ultimoEstado && this.ultimoEstado !== nuevoColor) {
            LogManager.log(`Cambio de estado: ${this.ultimoEstado} → ${nuevoColor}`);
            
            // Contar ciclos (cuando vuelve a verde desde amarillo)
            if (this.ultimoEstado === 'amarillo' && nuevoColor === 'verde') {
                this.contadorCiclos++;
                LogManager.success(`Ciclo #${this.contadorCiclos} completado`);
            }
        }
        
        this.ultimoEstado = nuevoColor;
    }

    actualizarUI(data) {
        // Actualizar luces del semáforo
        this.cambiarLuz(data.color);
        
        // Actualizar información
        const emoji = CONFIG.COLORES[data.color] || '⚪';
        const modo = data.modo || 'automatico';
        const activo = data.activo !== false;
        const pausado = data.pausado || false;
        
        let estadoTexto = `${emoji} ${data.color.toUpperCase()}`;
        if (pausado) estadoTexto += ' (PAUSADO)';
        if (!activo) estadoTexto += ' (DETENIDO)';
        if (modo === 'manual') estadoTexto += ' (MANUAL)';
        
        this.elementos.estadoActual.innerHTML = 
            `<span class="estado-text">${estadoTexto}</span>`;
        
        this.elementos.estadoInfo.textContent = estadoTexto;
        this.elementos.ciclosInfo.textContent = this.contadorCiclos;
        this.elementos.dispositivoInfo.textContent = data.dispositivo || 'Raspberry Pico W';
        
        // Calcular duración
        if (data.timestamp) {
            const ahora = Date.now() / 1000;
            const duracion = Math.floor(ahora - data.timestamp);
            this.elementos.duracionInfo.textContent = `${duracion}s`;
        }
    }

    cambiarLuz(color) {
        // Apagar todas las luces
        this.apagarTodasLasLuces();
        
        // Encender la luz correspondiente
        switch(color) {
            case 'rojo':
                this.elementos.luzRoja.classList.add('activa');
                break;
            case 'amarillo':
                this.elementos.luzAmarilla.classList.add('activa');
                break;
            case 'verde':
                this.elementos.luzVerde.classList.add('activa');
                break;
            default:
                LogManager.warning(`Color desconocido: ${color}`);
        }
    }

    apagarTodasLasLuces() {
        this.elementos.luzRoja.classList.remove('activa', 'parpadeando');
        this.elementos.luzAmarilla.classList.remove('activa', 'parpadeando');
        this.elementos.luzVerde.classList.remove('activa', 'parpadeando');
    }

    async testLuces() {
        LogManager.log('Iniciando test de luces...');
        
        const colores = ['rojo', 'amarillo', 'verde'];
        
        for (let i = 0; i < colores.length; i++) {
            const color = colores[i];
            this.cambiarLuz(color);
            LogManager.log(`Probando luz ${color}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        this.apagarTodasLasLuces();
        LogManager.success('Test de luces completado');
    }

    // === NUEVOS MÉTODOS PARA CONTROL REMOTO ===
    async enviarComando(accion) {
        try {
            const url = `${CONFIG.FIREBASE_URL}${CONFIG.RUTA_COMANDOS}`;
            
            const comando = {
                accion: accion,
                timestamp: Date.now() / 1000,
                origen: 'dashboard_web'
            };
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(comando)
            });
            
            if (response.ok) {
                LogManager.success(`Comando enviado: ${accion}`);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            LogManager.error(`Error al enviar comando: ${error.message}`);
        }
    }

    async detenerSemaforo() {
        LogManager.log('Enviando comando: DETENER');
        await this.enviarComando('detener');
    }

    async restablecerSemaforo() {
        LogManager.log('Enviando comando: RESTABLECER');
        await this.enviarComando('restablecer');
    }

    async cambiarColorManual(color) {
        LogManager.log(`Enviando comando: Cambio manual a ${color.toUpperCase()}`);
        await this.enviarComando(`${color}_manual`);
    }

    // Métodos estáticos para uso global
    static instance = null;
    
    static init() {
        if (!this.instance) {
            this.instance = new SemaforoController();
        }
        return this.instance;
    }
    
    static conectar() {
        this.init().conectar();
    }
    
    static desconectar() {
        this.init().desconectar();
    }
    
    static testLuces() {
        this.init().testLuces();
    }

    static detenerSemaforo() {
        this.init().detenerSemaforo();
    }

    static restablecerSemaforo() {
        this.init().restablecerSemaforo();
    }

    static cambiarColorManual(color) {
        this.init().cambiarColorManual(color);
    }
}

// === INICIALIZACIÓN ===
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar controlador
    const semaforo = SemaforoController.init();
    
    // Auto-conectar al cargar
    setTimeout(() => {
        LogManager.log('Iniciando sistema...');
        semaforo.conectar();
    }, 1000);
    
    LogManager.log('Dashboard cargado correctamente');
});

// === MANEJO DE ERRORES GLOBALES ===
window.addEventListener('error', (event) => {
    LogManager.error(`Error JS: ${event.message}`);
});

window.addEventListener('unhandledrejection', (event) => {
    LogManager.error(`Promise rechazada: ${event.reason}`);
});