const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken, isCajero } = require('../middleware/auth.middleware');

// CREAR VENTA (OPTIMIZADO PARA MINIMARKET)
router.post('/', verifyToken, isCajero, async (req, res) => {
  const { clienteID, productos, subtotal, descuento, iva, total, metodoPago, montoRecibido, cambio } = req.body;

  // Validaciones
  if (!productos || productos.length === 0) {
    return res.status(400).json({ success: false, message: 'Debe incluir al menos un producto' });
  }

  if (!metodoPago) {
    return res.status(400).json({ success: false, message: 'Método de pago es requerido' });
  }

  const pool = await getConnection();
  const transaction = pool.transaction();

  try {
    await transaction.begin();

    // Obtener apertura de caja actual del usuario
    const cajaResult = await transaction.request()
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT TOP 1 AperturaCierreID, CajaID
        FROM AperturaCierreCaja 
        WHERE UsuarioID = @usuarioID AND Estado = 'ABIERTA' 
        ORDER BY FechaHoraApertura DESC
      `);

    if (cajaResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'No tiene una caja abierta. Debe abrir caja primero' 
      });
    }

    const aperturaCierreID = cajaResult.recordset[0].AperturaCierreID;

    // Verificar stock de todos los productos antes de proceder
    for (const item of productos) {
      const stockResult = await transaction.request()
        .input('productoID', sql.Int, item.productoID)
        .query('SELECT Stock, NombreProducto FROM Productos WHERE ProductoID = @productoID');

      if (stockResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ 
          success: false, 
          message: `Producto con ID ${item.productoID} no encontrado` 
        });
      }

      const producto = stockResult.recordset[0];
      if (producto.Stock < item.cantidad) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          message: `Stock insuficiente para ${producto.NombreProducto}. Disponible: ${producto.Stock}` 
        });
      }
    }

    // Generar número de venta
    const ventaNumResult = await transaction.request().query(`
      SELECT 'V-' + FORMAT(GETDATE(), 'yyyyMMdd') + '-' + 
             RIGHT('0000' + CAST(ISNULL(MAX(VentaID), 0) + 1 AS NVARCHAR), 4) AS NumeroVenta
      FROM Ventas
    `);

    const numeroVenta = ventaNumResult.recordset[0].NumeroVenta;

    // Insertar venta
    const ventaResult = await transaction.request()
      .input('numeroVenta', sql.NVarChar, numeroVenta)
      .input('clienteID', sql.Int, clienteID || 1) // Cliente general por defecto
      .input('usuarioID', sql.Int, req.userId)
      .input('aperturaCierreID', sql.Int, aperturaCierreID)
      .input('subtotal', sql.Decimal(10, 2), subtotal)
      .input('descuento', sql.Decimal(10, 2), descuento || 0)
      .input('iva', sql.Decimal(10, 2), iva || 0)
      .input('total', sql.Decimal(10, 2), total)
      .input('metodoPago', sql.NVarChar, metodoPago)
      .query(`
        INSERT INTO Ventas (NumeroVenta, ClienteID, UsuarioID, AperturaCierreID, 
                           Subtotal, Descuento, IVA, Total, MetodoPago)
        VALUES (@numeroVenta, @clienteID, @usuarioID, @aperturaCierreID, 
                @subtotal, @descuento, @iva, @total, @metodoPago);
        SELECT SCOPE_IDENTITY() AS VentaID;
      `);

    const ventaID = ventaResult.recordset[0].VentaID;

    // Insertar detalles y actualizar stock
    for (const item of productos) {
      // Insertar detalle
      await transaction.request()
        .input('ventaID', sql.Int, ventaID)
        .input('productoID', sql.Int, item.productoID)
        .input('cantidad', sql.Int, item.cantidad)
        .input('precioUnitario', sql.Decimal(10, 2), item.precioUnitario)
        .input('descuento', sql.Decimal(10, 2), item.descuento || 0)
        .input('subtotal', sql.Decimal(10, 2), item.subtotal)
        .query(`
          INSERT INTO DetalleVentas (VentaID, ProductoID, Cantidad, PrecioUnitario, Descuento, Subtotal)
          VALUES (@ventaID, @productoID, @cantidad, @precioUnitario, @descuento, @subtotal)
        `);

      // Actualizar stock
      await transaction.request()
        .input('productoID', sql.Int, item.productoID)
        .input('cantidad', sql.Int, item.cantidad)
        .input('tipoMovimiento', sql.NVarChar, 'SALIDA')
        .input('usuarioID', sql.Int, req.userId)
        .input('motivo', sql.NVarChar, `Venta ${numeroVenta}`)
        .execute('sp_ActualizarStock');
    }

    // Registrar pago
    await transaction.request()
      .input('ventaID', sql.Int, ventaID)
      .input('metodoPago', sql.NVarChar, metodoPago)
      .input('monto', sql.Decimal(10, 2), total)
      .input('referencia', sql.NVarChar, montoRecibido ? `Recibido: ${montoRecibido}, Cambio: ${cambio}` : null)
      .query(`
        INSERT INTO Pagos (VentaID, MetodoPago, Monto, Referencia)
        VALUES (@ventaID, @metodoPago, @monto, @referencia)
      `);

    await transaction.commit();

    res.status(201).json({ 
      success: true, 
      message: 'Venta registrada exitosamente',
      venta: {
        ventaID,
        numeroVenta,
        total,
        metodoPago,
        cambio: cambio || 0
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error en venta:', error);
    res.status(500).json({ success: false, message: 'Error al registrar venta', error: error.message });
  }
});

// Obtener ventas con filtros
router.get('/', verifyToken, async (req, res) => {
  try {
    const { fecha, usuarioID, metodoPago, limite = 50 } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT TOP ${limite}
        v.VentaID,
        v.NumeroVenta,
        v.FechaHora,
        c.NombreCliente,
        u.NombreUsuario AS Cajero,
        v.Subtotal,
        v.Descuento,
        v.IVA,
        v.Total,
        v.MetodoPago,
        v.Estado
      FROM Ventas v
      LEFT JOIN Clientes c ON v.ClienteID = c.ClienteID
      INNER JOIN Usuarios u ON v.UsuarioID = u.UsuarioID
      WHERE 1=1
    `;

    if (fecha) {
      query += ` AND CAST(v.FechaHora AS DATE) = '${fecha}'`;
    }
    if (usuarioID) {
      query += ` AND v.UsuarioID = ${usuarioID}`;
    }
    if (metodoPago) {
      query += ` AND v.MetodoPago = '${metodoPago}'`;
    }

    query += ` ORDER BY v.FechaHora DESC`;

    const result = await pool.request().query(query);

    res.json({ success: true, ventas: result.recordset, cantidad: result.recordset.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener ventas', error: error.message });
  }
});

// Obtener ventas del día actual
router.get('/hoy', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM vw_VentasDelDia ORDER BY FechaHora DESC');

    // Calcular totales
    const totales = result.recordset.reduce((acc, venta) => {
      acc.total += venta.Total || 0;
      acc.cantidad += 1;
      return acc;
    }, { total: 0, cantidad: 0 });

    res.json({ 
      success: true, 
      ventas: result.recordset,
      totales: {
        cantidadVentas: totales.cantidad,
        totalVendido: totales.total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener ventas', error: error.message });
  }
});

// Obtener detalle completo de una venta
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    const venta = await pool.request()
      .input('ventaID', sql.Int, id)
      .query(`
        SELECT 
          v.*,
          c.NombreCliente,
          c.Documento,
          u.NombreCompleto AS Cajero,
          u.NombreUsuario,
          ca.NombreCaja
        FROM Ventas v
        LEFT JOIN Clientes c ON v.ClienteID = c.ClienteID
        INNER JOIN Usuarios u ON v.UsuarioID = u.UsuarioID
        INNER JOIN AperturaCierreCaja ac ON v.AperturaCierreID = ac.AperturaCierreID
        INNER JOIN Cajas ca ON ac.CajaID = ca.CajaID
        WHERE v.VentaID = @ventaID
      `);

    if (venta.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }

    const detalles = await pool.request()
      .input('ventaID', sql.Int, id)
      .query(`
        SELECT 
          dv.*,
          p.NombreProducto,
          p.CodigoBarras,
          p.Descripcion
        FROM DetalleVentas dv
        INNER JOIN Productos p ON dv.ProductoID = p.ProductoID
        WHERE dv.VentaID = @ventaID
      `);

    const pagos = await pool.request()
      .input('ventaID', sql.Int, id)
      .query(`
        SELECT * FROM Pagos WHERE VentaID = @ventaID
      `);

    res.json({ 
      success: true, 
      venta: venta.recordset[0],
      detalles: detalles.recordset,
      pagos: pagos.recordset
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener venta', error: error.message });
  }
});

// Cancelar venta
router.put('/:id/cancelar', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;

  const pool = await getConnection();
  const transaction = pool.transaction();

  try {
    await transaction.begin();

    // Obtener detalles de la venta
    const detalles = await transaction.request()
      .input('ventaID', sql.Int, id)
      .query('SELECT * FROM DetalleVentas WHERE VentaID = @ventaID');

    // Devolver stock de cada producto
    for (const detalle of detalles.recordset) {
      await transaction.request()
        .input('productoID', sql.Int, detalle.ProductoID)
        .input('cantidad', sql.Int, detalle.Cantidad)
        .input('tipoMovimiento', sql.NVarChar, 'ENTRADA')
        .input('usuarioID', sql.Int, req.userId)
        .input('motivo', sql.NVarChar, `Cancelación de venta - ${motivo || 'Sin motivo'}`)
        .execute('sp_ActualizarStock');
    }

    // Marcar venta como cancelada
    await transaction.request()
      .input('ventaID', sql.Int, id)
      .query('UPDATE Ventas SET Estado = \'CANCELADA\' WHERE VentaID = @ventaID');

    await transaction.commit();

    res.json({ success: true, message: 'Venta cancelada y stock devuelto' });
  } catch (error) {
    await transaction.rollback();
    console.error('Error al cancelar venta:', error);
    res.status(500).json({ success: false, message: 'Error al cancelar venta', error: error.message });
  }
});

module.exports = router;