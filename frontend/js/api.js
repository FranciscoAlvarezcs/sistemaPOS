// api.js - Servicio centralizado para comunicarse con el backend

const API_URL = 'http://localhost:5000/api';

// Función auxiliar para obtener el token
function getToken() {
    return localStorage.getItem('token');
}

// Función auxiliar para manejar respuestas
function handleResponse(response) {
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

// ============= AUTENTICACIÓN =============

export async function login(nombreUsuario, contrasena) {
    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nombreUsuario, contrasena })
    });
    return handleResponse(response);
}

export async function logout() {
    const token = getToken();
    if (token) {
        await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    }
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
}

export function isAuthenticated() {
    return !!getToken();
}

export function getUsuario() {
    const usuario = localStorage.getItem('usuario');
    return usuario ? JSON.parse(usuario) : null;
}

export function isAdmin() {
    const usuario = getUsuario();
    return usuario && usuario.rol === 'Administrador';
}

// ============= PRODUCTOS =============

export async function buscarProductoPorBarras(codigo) {
    const token = getToken();
    const response = await fetch(`${API_URL}/productos/buscar/barras/${codigo}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerProductos(params = {}) {
    const token = getToken();
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_URL}/productos${queryString ? '?' + queryString : ''}`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function crearProducto(producto) {
    const token = getToken();
    const response = await fetch(`${API_URL}/productos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(producto)
    });
    return handleResponse(response);
}

export async function actualizarProducto(id, producto) {
    const token = getToken();
    const response = await fetch(`${API_URL}/productos/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(producto)
    });
    return handleResponse(response);
}

export async function actualizarStock(productoID, cantidad, tipoMovimiento, motivo) {
    const token = getToken();
    const response = await fetch(`${API_URL}/productos/stock`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ productoID, cantidad, tipoMovimiento, motivo })
    });
    return handleResponse(response);
}

export async function obtenerProductosStockBajo() {
    const token = getToken();
    const response = await fetch(`${API_URL}/productos/alertas/stock-bajo`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

// ============= VENTAS =============

export async function registrarVenta(venta) {
    const token = getToken();
    const response = await fetch(`${API_URL}/ventas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(venta)
    });
    return handleResponse(response);
}

export async function obtenerVentasHoy() {
    const token = getToken();
    const response = await fetch(`${API_URL}/ventas/hoy`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

// ============= CAJA =============

export async function obtenerMiCaja() {
    const token = getToken();
    const response = await fetch(`${API_URL}/caja/mi-caja`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function listarCajas() {
    const token = getToken();
    const response = await fetch(`${API_URL}/caja/listar`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function abrirCaja(cajaID, montoInicial) {
    const token = getToken();
    const response = await fetch(`${API_URL}/caja/abrir`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cajaID, montoInicial })
    });
    return handleResponse(response);
}

export async function cerrarCaja(aperturaCierreID, montoFinal, observaciones) {
    const token = getToken();
    const response = await fetch(`${API_URL}/caja/cerrar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ aperturaCierreID, montoFinal, observaciones })
    });
    return handleResponse(response);
}

// ============= REPORTES (Solo Admin) =============

export async function obtenerDashboard() {
    const token = getToken();
    const response = await fetch(`${API_URL}/reportes/estado`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerCalendarioVentas(mes, anio) {
    const token = getToken();
    const response = await fetch(`${API_URL}/reportes/calendario-ventas?mes=${mes}&anio=${anio}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerProductosMasVendidos(limite = 10, fechaInicio = null, fechaFin = null) {
    const token = getToken();
    let url = `${API_URL}/reportes/productos-vendidos?limite=${limite}`;
    if (fechaInicio && fechaFin) {
        url += `&fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`;
    }
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerVentasPeriodo(fechaInicio, fechaFin) {
    const token = getToken();
    const response = await fetch(`${API_URL}/reportes/ventas-periodo?fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerCierresCaja(limite = 20) {
    const token = getToken();
    const response = await fetch(`${API_URL}/reportes/cierres-caja?limite=${limite}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

// ============= USUARIOS (Solo Admin) =============

export async function obtenerUsuarios() {
    const token = getToken();
    const response = await fetch(`${API_URL}/usuarios`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function obtenerRoles() {
    const token = getToken();
    const response = await fetch(`${API_URL}/usuarios/roles`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    return handleResponse(response);
}

export async function crearUsuario(usuario) {
    const token = getToken();
    const response = await fetch(`${API_URL}/usuarios`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(usuario)
    });
    return handleResponse(response);
}