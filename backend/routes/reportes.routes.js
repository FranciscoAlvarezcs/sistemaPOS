const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// 🔒 SOLO ADMIN - Productos más vendidos
router.get('/productos-vendidos', verifyToken, isAdmin, async (req, res) => {
  try {
    const { limite = 10, fechaInicio, fechaFin } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT TOP ${limite}
        p.ProductoID,
        p.NombreProducto,
        p.CodigoBarras,
        c.NombreCategoria,
        SUM(dv.Cantidad) AS CantidadVendida,
        SUM(dv.Subtotal) AS TotalVendido,
        AVG(dv.PrecioUnitario) AS PrecioPromedio
      FROM DetalleVentas dv
      INNER JOIN Productos p ON dv.ProductoID = p.ProductoID
      LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
      INNER JOIN Ventas v ON dv.VentaID = v.VentaID
      WHERE v.Estado = 'COMPLETADA'
    `;

    if (fechaInicio && fechaFin) {
      query += ` AND CAST(v.FechaHora AS DATE) BETWEEN '${fechaInicio}' AND '${fechaFin}'`;
    }

    query += `
      GROUP BY p.ProductoID, p.NombreProducto, p.CodigoBarras, c.NombreCategoria
      ORDER BY CantidadVendida DESC
    `;

    const result = await pool.request().query(query);

    res.json({ success: true, productos: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
});

// 🔒 SOLO ADMIN - Ventas por método de pago
router.get('/metodos-pago', verifyToken, isAdmin, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT 
        MetodoPago,
        COUNT(*) AS CantidadVentas,
        SUM(Total) AS TotalVentas
      FROM Ventas
      WHERE Estado = 'COMPLETADA'
    `;

    if (fechaInicio && fechaFin) {
      query += ` AND CAST(FechaHora AS DATE) BETWEEN '${fechaInicio}' AND '${fechaFin}'`;
    }

    query += ` GROUP BY MetodoPago ORDER BY TotalVentas DESC`;

    const result = await pool.request().query(query);

    res.json({ success: true, metodos: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
});

// 🔒 SOLO ADMIN - Ventas por usuario/cajero
router.get('/ventas-usuario', verifyToken, isAdmin, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT 
        u.UsuarioID,
        u.NombreUsuario,
        u.NombreCompleto,
        COUNT(v.VentaID) AS CantidadVentas,
        SUM(v.Total) AS TotalVendido,
        AVG(v.Total) AS PromedioVenta
      FROM Usuarios u
      LEFT JOIN Ventas v ON u.UsuarioID = v.UsuarioID AND v.Estado = 'COMPLETADA'
    `;

    if (fechaInicio && fechaFin) {
      query += ` WHERE CAST(v.FechaHora AS DATE) BETWEEN '${fechaInicio}' AND '${fechaFin}'`;
    }

    query += `
      GROUP BY u.UsuarioID, u.NombreUsuario, u.NombreCompleto
      ORDER BY TotalVendido DESC
    `;

    const result = await pool.request().query(query);

    res.json({ success: true, usuarios: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
});

// 🔒 SOLO ADMIN - Dashboard
router.get('/estado', verifyToken, isAdmin, async (req, res) => {
  try {
    const pool = await getConnection();

    const ventasHoy = await pool.request().query(`
      SELECT 
        COUNT(*) AS CantidadVentas,
        ISNULL(SUM(Total), 0) AS TotalVentas
      FROM Ventas
      WHERE CAST(FechaHora AS DATE) = CAST(GETDATE() AS DATE) AND Estado = 'COMPLETADA'
    `);

    const ventasMes = await pool.request().query(`
      SELECT 
        COUNT(*) AS CantidadVentas,
        ISNULL(SUM(Total), 0) AS TotalVentas
      FROM Ventas
      WHERE MONTH(FechaHora) = MONTH(GETDATE()) 
        AND YEAR(FechaHora) = YEAR(GETDATE())
        AND Estado = 'COMPLETADA'
    `);

    const stockBajo = await pool.request().query(`
      SELECT COUNT(*) AS CantidadProductos
      FROM vw_ProductosStockBajo
    `);

    const totalProductos = await pool.request().query(`
      SELECT COUNT(*) AS Total FROM Productos WHERE Activo = 1
    `);

    const valorInventario = await pool.request().query(`
      SELECT ISNULL(SUM(Stock * PrecioVenta), 0) AS ValorTotal
      FROM Productos WHERE Activo = 1
    `);

    const cajasAbiertas = await pool.request().query(`
      SELECT COUNT(*) AS CantidadCajas
      FROM AperturaCierreCaja WHERE Estado = 'ABIERTA'
    `);

    res.json({
      success: true,
      dashboard: {
        ventasHoy: {
          cantidad: ventasHoy.recordset[0].CantidadVentas,
          total: ventasHoy.recordset[0].TotalVentas
        },
        ventasMes: {
          cantidad: ventasMes.recordset[0].CantidadVentas,
          total: ventasMes.recordset[0].TotalVentas
        },
        inventario: {
          totalProductos: totalProductos.recordset[0].Total,
          productosStockBajo: stockBajo.recordset[0].CantidadProductos,
          valorTotal: valorInventario.recordset[0].ValorTotal
        },
        cajas: {
          cajasAbiertas: cajasAbiertas.recordset[0].CantidadCajas
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener dashboard', error: error.message });
  }
});

// 🔒 SOLO ADMIN - Reporte de ventas por período
router.get('/ventas-periodo', verifyToken, isAdmin, async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Fecha inicio y fecha fin son requeridas' 
      });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('fechaInicio', sql.Date, fechaInicio)
      .input('fechaFin', sql.Date, fechaFin)
      .query(`
        SELECT 
          CAST(FechaHora AS DATE) AS Fecha,
          COUNT(*) AS CantidadVentas,
          SUM(Subtotal) AS Subtotal,
          SUM(IVA) AS IVA,
          SUM(Total) AS Total
        FROM Ventas
        WHERE CAST(FechaHora AS DATE) BETWEEN @fechaInicio AND @fechaFin
          AND Estado = 'COMPLETADA'
        GROUP BY CAST(FechaHora AS DATE)
        ORDER BY Fecha DESC
      `);

    const totales = result.recordset.reduce((acc, dia) => {
      acc.cantidadVentas += dia.CantidadVentas;
      acc.subtotal += dia.Subtotal;
      acc.iva += dia.IVA;
      acc.total += dia.Total;
      return acc;
    }, { cantidadVentas: 0, subtotal: 0, iva: 0, total: 0 });

    res.json({ 
      success: true, 
      ventas: result.recordset,
      totales: totales
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
});

// 🔒 SOLO ADMIN - Historial de cierres de caja
router.get('/cierres-caja', verifyToken, isAdmin, async (req, res) => {
  try {
    const { limite = 20, usuarioID } = req.query;
    const pool = await getConnection();

    let query = `
      SELECT TOP ${limite}
        ac.AperturaCierreID,
        c.NombreCaja,
        u.NombreCompleto AS Usuario,
        ac.FechaHoraApertura,
        ac.FechaHoraCierre,
        ac.MontoInicial,
        ac.MontoEsperado,
        ac.MontoFinal,
        ac.Diferencia,
        CASE 
          WHEN ac.Diferencia = 0 THEN 'EXACTO'
          WHEN ac.Diferencia > 0 THEN 'SOBRANTE'
          ELSE 'FALTANTE'
        END AS TipoDiferencia,
        ac.Estado
      FROM AperturaCierreCaja ac
      INNER JOIN Cajas c ON ac.CajaID = c.CajaID
      INNER JOIN Usuarios u ON ac.UsuarioID = u.UsuarioID
      WHERE 1=1
    `;

    if (usuarioID) {
      query += ` AND ac.UsuarioID = ${usuarioID}`;
    }

    query += ` ORDER BY ac.FechaHoraApertura DESC`;

    const result = await pool.request().query(query);

    res.json({ success: true, cierres: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener cierres', error: error.message });
  }
});

// 🆕 NUEVO - Calendario de ventas (resumen por día del mes)
router.get('/calendario-ventas', verifyToken, isAdmin, async (req, res) => {
  try {
    const { mes, anio } = req.query;
    
    const mesActual = mes || new Date().getMonth() + 1;
    const anioActual = anio || new Date().getFullYear();

    const pool = await getConnection();
    const result = await pool.request()
      .input('mes', sql.Int, mesActual)
      .input('anio', sql.Int, anioActual)
      .query(`
        SELECT 
          DAY(FechaHora) AS Dia,
          CAST(FechaHora AS DATE) AS Fecha,
          COUNT(*) AS CantidadVentas,
          SUM(Total) AS TotalVentas
        FROM Ventas
        WHERE MONTH(FechaHora) = @mes 
          AND YEAR(FechaHora) = @anio
          AND Estado = 'COMPLETADA'
        GROUP BY CAST(FechaHora AS DATE), DAY(FechaHora)
        ORDER BY Dia
      `);

    res.json({ 
      success: true, 
      mes: mesActual,
      anio: anioActual,
      ventas: result.recordset 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener calendario', error: error.message });
  }
});

module.exports = router;