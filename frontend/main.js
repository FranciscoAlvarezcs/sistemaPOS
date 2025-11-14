// =============================================
// MAIN.JS - Sistema POS conectado al backend
// Sin Firebase - Conectado a SQL Server
// =============================================

import * as API from './js/api.js';

// --- VARIABLES GLOBALES ---
let currentStock = [];
let currentSaleItems = [];
let usuarioActual = null;
let cajaActual = null;
let rolesDisponibles = [];

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticación
    if (!API.isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    // Obtener usuario actual
    usuarioActual = API.getUsuario();
    
    // Mostrar nombre de usuario
    const userNameDisplay = document.getElementById('user-name-display');
    if (userNameDisplay) {
        userNameDisplay.textContent = `¡Hola, ${usuarioActual.nombreCompleto || usuarioActual.nombreUsuario}!`;
    }

    // Ocultar secciones de admin si no es admin
    if (!API.isAdmin()) {
        ocultarSeccionesAdmin();
    }

    // Cargar datos iniciales
    await cargarDatosIniciales();

    // Inicializar navegación
    navigate('principal');
});

// --- OCULTAR SECCIONES ADMIN ---
function ocultarSeccionesAdmin() {
    const seccionesAdmin = document.querySelectorAll('.admin-only');
    seccionesAdmin.forEach(seccion => {
        seccion.style.display = 'none';
    });
}

// --- CARGAR DATOS INICIALES ---
async function cargarDatosIniciales() {
    try {
        // Cargar stock de productos
        const dataProductos = await API.obtenerProductos();
        if (dataProductos.success) {
            currentStock = dataProductos.productos;
            renderStockTable(currentStock);
        }

        // Cargar estado de caja
        await cargarEstadoCaja();

        // Si es admin, cargar dashboard y roles
        if (API.isAdmin()) {
            await cargarDashboard();
            await cargarRoles();
        }

    } catch (error) {
        console.error('Error al cargar datos:', error);
        showMessage('Error al cargar datos iniciales', 'error');
    }
}

// --- CARGAR DASHBOARD (Solo Admin) ---
async function cargarDashboard() {
    try {
        const data = await API.obtenerDashboard();
        if (data.success) {
            const ventasHoyCantidad = document.getElementById('ventas-hoy-cantidad');
            const ventasHoyTotal = document.getElementById('ventas-hoy-total');
            const ventasMesTotal = document.getElementById('ventas-mes-total');
            const productosStockBajo = document.getElementById('productos-stock-bajo');

            if (ventasHoyCantidad) ventasHoyCantidad.textContent = data.dashboard.ventasHoy.cantidad;
            if (ventasHoyTotal) ventasHoyTotal.textContent = `$${data.dashboard.ventasHoy.total.toFixed(2)}`;
            if (ventasMesTotal) ventasMesTotal.textContent = `$${data.dashboard.ventasMes.total.toFixed(2)}`;
            if (productosStockBajo) productosStockBajo.textContent = data.dashboard.inventario.productosStockBajo;
        }
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
    }
}

// --- RENDERIZAR TABLA DE STOCK ---
function renderStockTable(items) {
    const tableBody = document.getElementById('stock-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">No hay productos en el inventario.</td></tr>';
        return;
    }

    items.sort((a, b) => (a.NombreProducto || '').localeCompare(b.NombreProducto || ''));

    items.forEach(item => {
        const stock = parseInt(item.Stock) || 0;
        const isLowStock = stock <= item.StockMinimo;
        const lowStockClass = isLowStock ? 'bg-red-900/40 text-red-300' : '';
        
        const row = document.createElement('tr');
        row.className = `border-b border-gray-700 hover:bg-surface/70 transition ${lowStockClass}`;

        row.innerHTML = `
            <td class="px-6 py-4 font-medium text-white text-shadow">${item.NombreProducto || 'N/A'}</td>
            <td class="px-6 py-4 font-mono text-sm text-secondary">${item.CodigoBarras || 'Sin código'}</td>
            <td class="px-6 py-4">${item.NombreCategoria || 'General'}</td>
            <td class="px-6 py-4">$${parseFloat(item.PrecioVenta || 0).toFixed(2)}</td>
            <td class="px-6 py-4">
                <span class="inline-block px-3 py-1 text-xs rounded-full ${isLowStock ? 'bg-red-500 text-white' : 'bg-green-600/50 text-white'}">
                    ${stock} uds
                </span>
            </td>
            <td class="px-6 py-4">${item.NombreProveedor || 'N/A'}</td>
            <td class="px-6 py-4 flex space-x-2">
                <button onclick="editarProducto(${item.ProductoID})" class="text-secondary hover:text-white transition p-1">
                   <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                   </svg>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- SISTEMA DE VENTAS (POS) ---
const scannerForm = document.getElementById('scanner-form');
const cancelSaleBtn = document.getElementById('cancel-sale-btn');
const finalizeSaleBtn = document.getElementById('finalize-sale-btn');
const saleListContainer = document.getElementById('venta-lista-items');
const saleTotalDisplay = document.getElementById('venta-total-display');

if (scannerForm) {
    scannerForm.addEventListener('submit', handleAddItemToSale);
}

if (cancelSaleBtn) {
    cancelSaleBtn.addEventListener('click', () => clearSale(true));
}

if (finalizeSaleBtn) {
    finalizeSaleBtn.addEventListener('click', finalizeSale);
}

async function handleAddItemToSale(e) {
    e.preventDefault();
    
    const scannerInput = document.getElementById('scanner-input');
    const qtyInput = document.getElementById('scanner-qty');
    
    let codigoBarras = scannerInput.value.trim();
    let quantityToAdd = parseInt(qtyInput.value);

    if (!codigoBarras || isNaN(quantityToAdd) || quantityToAdd <= 0) {
        showMessage('Datos de entrada inválidos.', 'error');
        return;
    }

    try {
        const data = await API.buscarProductoPorBarras(codigoBarras);
        
        if (!data.success) {
            showMessage(`Producto no encontrado.`, 'error');
            scannerInput.value = '';
            scannerInput.focus();
            return;
        }

        const product = data.producto;

        let qtyInCart = 0;
        const existingItem = currentSaleItems.find(item => item.ProductoID === product.ProductoID);
        if (existingItem) {
            qtyInCart = existingItem.cantidad;
        }
        
        if ((qtyInCart + quantityToAdd) > product.Stock) {
            showMessage(`Stock insuficiente. Solo quedan ${product.Stock} unidades.`, 'error');
            return;
        }
        
        if (existingItem) {
            existingItem.cantidad += quantityToAdd;
        } else {
            currentSaleItems.push({
                ProductoID: product.ProductoID,
                NombreProducto: product.NombreProducto,
                PrecioVenta: parseFloat(product.PrecioVenta),
                cantidad: quantityToAdd,
                Stock: product.Stock
            });
        }

        scannerInput.value = '';
        qtyInput.value = 1;
        scannerInput.focus();

        renderSaleList();
        updateSaleTotal();
        showMessage(`${product.NombreProducto} agregado`, 'success');

    } catch (error) {
        console.error('Error al buscar producto:', error);
        showMessage('Error al buscar el producto.', 'error');
    }
}

function renderSaleList() {
    if (!saleListContainer) return;
    
    saleListContainer.innerHTML = '';

    if (currentSaleItems.length === 0) {
        saleListContainer.innerHTML = '<p class="text-center text-gray-500 pt-10">Escanee un producto para comenzar...</p>';
        return;
    }

    currentSaleItems.forEach((item, index) => {
        const subtotal = (item.PrecioVenta * item.cantidad).toFixed(2);
        const itemHtml = `
            <div class="flex items-center text-sm p-3 bg-bg-dark rounded-lg border border-gray-700 mb-2">
                <div class="flex-1">
                    <p class="font-medium text-white text-shadow">${item.NombreProducto}</p>
                    <p class="text-xs text-gray-400">${item.cantidad} x $${item.PrecioVenta.toFixed(2)}</p>
                </div>
                <div class="w-24 text-right font-medium text-secondary text-base">$${subtotal}</div>
                <div class="w-12 text-right">
                    <button onclick="removeItemFromSale(${index})" class="text-red-400 hover:text-red-200 p-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        saleListContainer.innerHTML += itemHtml;
    });
}

function removeItemFromSale(index) {
    currentSaleItems.splice(index, 1);
    renderSaleList();
    updateSaleTotal();
}

function updateSaleTotal() {
    if (!saleTotalDisplay) return;
    
    const total = currentSaleItems.reduce((acc, item) => acc + (item.PrecioVenta * item.cantidad), 0);
    saleTotalDisplay.textContent = `$${total.toFixed(2)}`;
}

function clearSale(showCancelMessage = false) {
    currentSaleItems = [];
    renderSaleList();
    updateSaleTotal();
    if (showCancelMessage) {
        showMessage('Venta cancelada.', 'error');
    }
}

async function finalizeSale() {
    if (currentSaleItems.length === 0) {
        showMessage('No hay productos en la venta.', 'error');
        return;
    }

    const total = currentSaleItems.reduce((acc, item) => acc + (item.PrecioVenta * item.cantidad), 0);
    const subtotal = total / 1.21;
    const iva = total - subtotal;

    const venta = {
        clienteID: 1,
        productos: currentSaleItems.map(item => ({
            productoID: item.ProductoID,
            cantidad: item.cantidad,
            precioUnitario: item.PrecioVenta,
            descuento: 0,
            subtotal: item.PrecioVenta * item.cantidad
        })),
        subtotal: subtotal,
        descuento: 0,
        iva: iva,
        total: total,
        metodoPago: 'EFECTIVO'
    };

    try {
        const data = await API.registrarVenta(venta);
        
        if (data.success) {
            showMessage('¡Venta registrada con éxito!', 'success');
            clearSale(false);
            
            const dataProductos = await API.obtenerProductos();
            if (dataProductos.success) {
                currentStock = dataProductos.productos;
                renderStockTable(currentStock);
            }

            await cargarEstadoCaja();
        } else {
            showMessage(data.message || 'Error al registrar venta.', 'error');
        }

    } catch (error) {
        console.error('Error al finalizar venta:', error);
        showMessage('Error al procesar la venta.', 'error');
    }
}

// =============================================
// SISTEMA DE CAJA
// =============================================

async function cargarEstadoCaja() {
    try {
        const data = await API.obtenerMiCaja();
        
        const cajaCerrada = document.getElementById('caja-cerrada');
        const cajaAbierta = document.getElementById('caja-abierta');

        if (data.success && data.cajaAbierta) {
            cajaActual = data.caja;
            if (cajaCerrada) cajaCerrada.classList.add('hidden');
            if (cajaAbierta) cajaAbierta.classList.remove('hidden');

            const nombreCaja = document.getElementById('nombre-caja');
            const montoInicial = document.getElementById('monto-inicial');
            const totalVentas = document.getElementById('total-ventas-caja');

            if (nombreCaja) nombreCaja.textContent = data.caja.NombreCaja;
            if (montoInicial) montoInicial.textContent = `$${parseFloat(data.caja.MontoInicial).toFixed(2)}`;
            if (totalVentas) totalVentas.textContent = `$${parseFloat(data.caja.TotalVentas).toFixed(2)}`;
        } else {
            cajaActual = null;
            if (cajaAbierta) cajaAbierta.classList.add('hidden');
            if (cajaCerrada) cajaCerrada.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error al cargar estado de caja:', error);
        const cajaCerrada = document.getElementById('caja-cerrada');
        const cajaAbierta = document.getElementById('caja-abierta');
        if (cajaAbierta) cajaAbierta.classList.add('hidden');
        if (cajaCerrada) cajaCerrada.classList.remove('hidden');
    }
}

async function mostrarModalAbrirCaja() {
    try {
        const data = await API.listarCajas();
        const selectCaja = document.getElementById('select-caja');
        
        if (data.success && data.cajas.length > 0) {
            selectCaja.innerHTML = data.cajas.map(caja => 
                `<option value="${caja.CajaID}">${caja.NombreCaja} - ${caja.Ubicacion}</option>`
            ).join('');
        } else {
            selectCaja.innerHTML = '<option value="">No hay cajas disponibles</option>';
        }

        document.getElementById('modal-abrir-caja').classList.remove('hidden');
    } catch (error) {
        console.error('Error al cargar cajas:', error);
        showMessage('Error al cargar cajas disponibles', 'error');
    }
}

async function abrirCaja(event) {
    event.preventDefault();
    
    const cajaID = parseInt(document.getElementById('select-caja').value);
    const montoInicial = parseFloat(document.getElementById('monto-inicial-input').value);

    if (!cajaID || isNaN(montoInicial) || montoInicial < 0) {
        showMessage('Datos inválidos', 'error');
        return;
    }

    try {
        const data = await API.abrirCaja(cajaID, montoInicial);
        
        if (data.success) {
            showMessage('¡Caja abierta exitosamente!', 'success');
            closeModal('modal-abrir-caja');
            await cargarEstadoCaja();
        } else {
            showMessage(data.message || 'Error al abrir caja', 'error');
        }
    } catch (error) {
        console.error('Error al abrir caja:', error);
        showMessage('Error al abrir caja', 'error');
    }
}

async function mostrarModalCerrarCaja() {
    if (!cajaActual) {
        showMessage('No hay caja abierta', 'error');
        return;
    }

    const montoEsperado = parseFloat(cajaActual.MontoInicial) + parseFloat(cajaActual.TotalVentas);
    document.getElementById('monto-esperado-cierre').textContent = `$${montoEsperado.toFixed(2)}`;
    
    document.getElementById('modal-cerrar-caja').classList.remove('hidden');
}

async function cerrarCaja(event) {
    event.preventDefault();
    
    if (!cajaActual) {
        showMessage('No hay caja abierta', 'error');
        return;
    }

    const montoFinal = parseFloat(document.getElementById('monto-final-input').value);
    const observaciones = document.getElementById('observaciones-cierre').value;

    if (isNaN(montoFinal) || montoFinal < 0) {
        showMessage('Monto final inválido', 'error');
        return;
    }

    try {
        const data = await API.cerrarCaja(cajaActual.AperturaCierreID, montoFinal, observaciones);
        
        if (data.success) {
            const diferencia = data.cierre.Diferencia;
            let mensaje = '¡Caja cerrada exitosamente!';
            
            if (diferencia > 0) {
                mensaje += ` Sobrante: $${diferencia.toFixed(2)}`;
            } else if (diferencia < 0) {
                mensaje += ` Faltante: $${Math.abs(diferencia).toFixed(2)}`;
            } else {
                mensaje += ' Cuadre exacto.';
            }

            showMessage(mensaje, 'success');
            closeModal('modal-cerrar-caja');
            await cargarEstadoCaja();
        } else {
            showMessage(data.message || 'Error al cerrar caja', 'error');
        }
    } catch (error) {
        console.error('Error al cerrar caja:', error);
        showMessage('Error al cerrar caja', 'error');
    }
}

// =============================================
// REPORTES (SOLO ADMIN)
// =============================================

async function cargarReportes(periodo) {
    const hoy = new Date();
    let fechaInicio, fechaFin;

    if (periodo === 'hoy') {
        fechaInicio = fechaFin = hoy.toISOString().split('T')[0];
    } else if (periodo === 'semana') {
        const primerDia = new Date(hoy.setDate(hoy.getDate() - hoy.getDay()));
        fechaInicio = primerDia.toISOString().split('T')[0];
        fechaFin = new Date().toISOString().split('T')[0];
    } else if (periodo === 'mes') {
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        fechaFin = new Date().toISOString().split('T')[0];
    }

    try {
        const data = await API.obtenerVentasPeriodo(fechaInicio, fechaFin);
        
        if (data.success) {
            document.getElementById('total-recaudado').textContent = `$${data.totales.total.toFixed(2)}`;
            document.getElementById('cantidad-ventas-periodo').textContent = `${data.totales.cantidadVentas} ventas`;
        }

        await cargarProductosMasVendidos(fechaInicio, fechaFin);
    } catch (error) {
        console.error('Error al cargar reportes:', error);
        showMessage('Error al cargar reportes', 'error');
    }
}

async function cargarProductosMasVendidos(fechaInicio = null, fechaFin = null) {
    try {
        const data = await API.obtenerProductosMasVendidos(10, fechaInicio, fechaFin);
        const container = document.getElementById('productos-vendidos-lista');
        
        if (data.success && data.productos.length > 0) {
            container.innerHTML = data.productos.map((producto, index) => `
                <div class="bg-bg-dark p-4 rounded-lg flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <span class="text-2xl font-bold text-secondary">#${index + 1}</span>
                        <div>
                            <p class="font-medium text-white">${producto.NombreProducto}</p>
                            <p class="text-sm text-gray-400">${producto.NombreCategoria || 'Sin categoría'}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-secondary">${producto.CantidadVendida} uds</p>
                        <p class="text-sm text-gray-400">$${parseFloat(producto.TotalVendido).toFixed(2)}</p>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p class="text-center text-gray-400">No hay datos disponibles</p>';
        }
    } catch (error) {
        console.error('Error al cargar productos más vendidos:', error);
    }
}

async function cargarCalendario() {
    const mes = parseInt(document.getElementById('mes-select').value);
    const anio = parseInt(document.getElementById('anio-select').value);

    try {
        const data = await API.obtenerCalendarioVentas(mes, anio);
        const container = document.getElementById('calendario-ventas');
        
        if (data.success) {
            const diasConVentas = {};
            data.ventas.forEach(venta => {
                diasConVentas[venta.Dia] = {
                    cantidad: venta.CantidadVentas,
                    total: venta.TotalVentas
                };
            });

            const diasEnMes = new Date(anio, mes, 0).getDate();
            let html = '';

            for (let dia = 1; dia <= diasEnMes; dia++) {
                const ventas = diasConVentas[dia];
                const bgColor = ventas ? 'bg-green-600/50 hover:bg-green-600' : 'bg-surface';
                
                html += `
                    <div class="${bgColor} p-3 rounded-lg text-center cursor-pointer transition" title="${ventas ? `${ventas.cantidad} ventas - $${ventas.total.toFixed(2)}` : 'Sin ventas'}">
                        <p class="text-lg font-bold text-white">${dia}</p>
                        ${ventas ? `<p class="text-xs text-gray-300">$${ventas.total.toFixed(0)}</p>` : ''}
                    </div>
                `;
            }

            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error al cargar calendario:', error);
    }
}

window.addEventListener('load', () => {
    const hoy = new Date();
    const mesSelect = document.getElementById('mes-select');
    const anioSelect = document.getElementById('anio-select');
    
    if (mesSelect) mesSelect.value = hoy.getMonth() + 1;
    if (anioSelect) anioSelect.value = hoy.getFullYear();
});

// =============================================
// GESTIÓN DE PRODUCTOS
// =============================================

const productForm = document.getElementById('product-form');
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nombre = document.getElementById('product-name').value.trim();
        const codigoBarras = document.getElementById('product-barcode').value.trim();
        const precio = parseFloat(document.getElementById('product-price').value);
        const stock = parseInt(document.getElementById('product-stock').value);
        const categoria = document.getElementById('product-category').value.trim();
        const proveedor = document.getElementById('product-supplier').value.trim();

        if (!nombre || !codigoBarras || isNaN(precio) || isNaN(stock)) {
            showMessage('Por favor complete todos los campos requeridos', 'error');
            return;
        }

        const producto = {
            codigoBarras: codigoBarras,
            nombreProducto: nombre,
            descripcion: categoria || '',
            categoriaID: null,
            proveedorID: null,
            precioCompra: 0,
            precioVenta: precio,
            stock: stock,
            stockMinimo: 5
        };

        try {
            const data = await API.crearProducto(producto);
            
            if (data.success) {
                showMessage('¡Producto creado exitosamente!', 'success');
                closeModal('product-modal');
                
                const dataProductos = await API.obtenerProductos();
                if (dataProductos.success) {
                    currentStock = dataProductos.productos;
                    renderStockTable(currentStock);
                }
            } else {
                showMessage(data.message || 'Error al crear producto', 'error');
            }
        } catch (error) {
            console.error('Error al crear producto:', error);
            showMessage('Error al crear producto', 'error');
        }
    });
}

// =============================================
// GESTIÓN DE USUARIOS (SOLO ADMIN)
// =============================================

async function cargarRoles() {
    try {
        const data = await API.obtenerRoles();
        if (data.success) {
            rolesDisponibles = data.roles;
        }
    } catch (error) {
        console.error('Error al cargar roles:', error);
    }
}

async function cargarUsuarios() {
    try {
        const data = await API.obtenerUsuarios();
        const tableBody = document.getElementById('usuarios-table-body');
        
        if (!tableBody) return;

        if (data.success && data.usuarios.length > 0) {
            tableBody.innerHTML = data.usuarios.map(usuario => {
                const estadoBadge = usuario.Activo 
                    ? '<span class="px-2 py-1 text-xs rounded-full bg-green-600/50 text-white">Activo</span>'
                    : '<span class="px-2 py-1 text-xs rounded-full bg-red-600/50 text-white">Inactivo</span>';
                
                const ultimoAcceso = usuario.UltimoAcceso 
                    ? new Date(usuario.UltimoAcceso).toLocaleDateString()
                    : 'Nunca';

                return `
                    <tr class="border-b border-gray-700 hover:bg-surface/70 transition">
                        <td class="px-6 py-4 font-medium text-white">${usuario.NombreUsuario}</td>
                        <td class="px-6 py-4">${usuario.NombreCompleto}</td>
                        <td class="px-6 py-4 text-gray-300">${usuario.Email || '-'}</td>
                        <td class="px-6 py-4">
                            <span class="px-2 py-1 text-xs rounded-full bg-primary/50 text-white">
                                ${usuario.NombreRol}
                            </span>
                        </td>
                        <td class="px-6 py-4">${estadoBadge}</td>
                        <td class="px-6 py-4 text-gray-400 text-sm">${ultimoAcceso}</td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">No hay usuarios registrados</td></tr>';
        }
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        showMessage('Error al cargar usuarios', 'error');
    }
}

async function mostrarModalCrearUsuario() {
    const selectRol = document.getElementById('usuario-rol');
    
    if (rolesDisponibles.length > 0) {
        selectRol.innerHTML = '<option value="">Seleccione un rol...</option>' + 
            rolesDisponibles.map(rol => 
                `<option value="${rol.RolID}">${rol.NombreRol}</option>`
            ).join('');
    } else {
        await cargarRoles();
        selectRol.innerHTML = '<option value="">Seleccione un rol...</option>' + 
            rolesDisponibles.map(rol => 
                `<option value="${rol.RolID}">${rol.NombreRol}</option>`
            ).join('');
    }

    document.getElementById('modal-crear-usuario').classList.remove('hidden');
}

async function crearUsuario(event) {
    event.preventDefault();
    
    const nombreUsuario = document.getElementById('usuario-username').value.trim();
    const nombreCompleto = document.getElementById('usuario-nombre-completo').value.trim();
    const email = document.getElementById('usuario-email').value.trim();
    const contrasena = document.getElementById('usuario-password').value;
    const rolID = parseInt(document.getElementById('usuario-rol').value);

    if (!nombreUsuario || !nombreCompleto || !contrasena || !rolID) {
        showMessage('Por favor complete todos los campos requeridos', 'error');
        return;
    }

    const usuario = {
        nombreUsuario,
        nombreCompleto,
        email: email || null,
        contrasena,
        rolID
    };

    try {
        const data = await API.crearUsuario(usuario);
        
        if (data.success) {
            showMessage('¡Usuario creado exitosamente!', 'success');
            closeModal('modal-crear-usuario');
            document.getElementById('form-crear-usuario').reset();
            await cargarUsuarios();
        } else {
            showMessage(data.message || 'Error al crear usuario', 'error');
        }
    } catch (error) {
        console.error('Error al crear usuario:', error);
        showMessage('Error al crear usuario', 'error');
    }
}

// --- NAVEGACIÓN ---
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const mainTitle = document.getElementById('main-title');
const navLinks = document.querySelectorAll('.nav-link');
const contentViews = document.querySelectorAll('.content-view');

function navigate(viewId) {
    const currentLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
    if (currentLink) {
        const titleText = currentLink.textContent.trim();
        if (mainTitle) mainTitle.textContent = titleText;
    }

    contentViews.forEach(view => view.classList.add('hidden'));
    
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.classList.remove('hidden');
    } else {
        document.getElementById('view-principal').classList.remove('hidden');
    }

    navLinks.forEach(link => link.classList.remove('active'));
    if (currentLink) currentLink.classList.add('active');
    
    if (sidebar && window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }

    if (viewId === 'ventas') {
        const scannerInput = document.getElementById('scanner-input');
        if (scannerInput) scannerInput.focus();
    }

    if (viewId === 'caja' && API.isAdmin()) {
        cargarReportes('hoy');
        cargarCalendario();
    }

    if (viewId === 'usuarios' && API.isAdmin()) {
        cargarUsuarios();
    }
}

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = e.currentTarget.getAttribute('data-view');
        navigate(viewId);
    });
});

if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
    });
}

// --- CERRAR SESIÓN ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await API.logout();
    });
}

// --- MENSAJES/TOAST ---
function showMessage(message, type) {
    const messageBox = document.getElementById('message-box');
    if (!messageBox) return;
    
    messageBox.textContent = message;
    messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-50 transition-transform transform duration-500';
    
    if (type === 'success') {
        messageBox.classList.add('bg-green-600', 'text-white');
    } else {
        messageBox.classList.add('bg-red-600', 'text-white');
    }

    messageBox.style.transform = 'translateX(0)';
    
    setTimeout(() => {
        messageBox.style.transform = 'translateX(500px)';
    }, 4000);
}

// --- EXPONER FUNCIONES GLOBALES ---
window.navigate = navigate;
window.removeItemFromSale = removeItemFromSale;
window.clearSale = clearSale;
window.editarProducto = editarProducto;
window.openAddModal = openAddModal;
window.closeModal = closeModal;
window.mostrarModalAbrirCaja = mostrarModalAbrirCaja;
window.abrirCaja = abrirCaja;
window.mostrarModalCerrarCaja = mostrarModalCerrarCaja;
window.cerrarCaja = cerrarCaja;
window.cargarReportes = cargarReportes;
window.cargarCalendario = cargarCalendario;
window.mostrarModalCrearUsuario = mostrarModalCrearUsuario;
window.crearUsuario = crearUsuario;

// --- FUNCIONES DE MODAL DE PRODUCTOS ---
function openAddModal() {
    const modal = document.getElementById('product-modal');
    const modalTitle = document.getElementById('modal-title');
    const form = document.getElementById('product-form');
    
    if (modal && modalTitle && form) {
        modalTitle.textContent = 'Agregar Nuevo Producto';
        form.reset();
        form.setAttribute('data-id', '');
        modal.classList.remove('hidden');
        
        setTimeout(() => {
            document.getElementById('product-name')?.focus();
        }, 100);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

function editarProducto(productoID) {
    showMessage('Función de edición en desarrollo', 'error');
}