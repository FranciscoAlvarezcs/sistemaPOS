const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken, isCajero } = require('../middleware/auth.middleware');

// Abrir caja
router.post('/abrir', verifyToken, isCajero, async (req, res) => {
  try {
    const { cajaID, montoInicial } = req.body;

    if (!cajaID || montoInicial === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Caja ID y monto inicial son requeridos' 
      });
    }

    const pool = await getConnection();

    // Verificar si el usuario ya tiene una caja abierta
    const cajaActiva = await pool.request()
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT AperturaCierreID FROM AperturaCierreCaja 
        WHERE UsuarioID = @usuarioID AND Estado = 'ABIERTA'
      `);

    if (cajaActiva.recordset.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ya tiene una caja abierta. Debe cerrarla primero' 
      });
    }

    const result = await pool.request()
      .input('cajaID', sql.Int, cajaID)
      .input('usuarioID', sql.Int, req.userId)
      .input('montoInicial', sql.Decimal(10, 2), montoInicial)
      .execute('sp_AbrirCaja');

    res.json({ 
      success: true, 
      message: 'Caja abierta exitosamente',
      aperturaCierreID: result.recordset[0].AperturaCierreID,
      cajaID,
      montoInicial
    });
  } catch (error) {
    console.error('Error al abrir caja:', error);
    res.status(500).json({ success: false, message: error.message || 'Error al abrir caja' });
  }
});

// Cerrar caja
router.post('/cerrar', verifyToken, isCajero, async (req, res) => {
  try {
    const { aperturaCierreID, montoFinal, observaciones } = req.body;

    if (!aperturaCierreID || montoFinal === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de apertura y monto final son requeridos' 
      });
    }

    const pool = await getConnection();

    // Verificar que la caja pertenece al usuario
    const cajaVerif = await pool.request()
      .input('aperturaCierreID', sql.Int, aperturaCierreID)
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT * FROM AperturaCierreCaja 
        WHERE AperturaCierreID = @aperturaCierreID AND UsuarioID = @usuarioID AND Estado = 'ABIERTA'
      `);

    if (cajaVerif.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Caja no encontrada o ya está cerrada' 
      });
    }

    await pool.request()
      .input('aperturaCierreID', sql.Int, aperturaCierreID)
      .input('montoFinal', sql.Decimal(10, 2), montoFinal)
      .input('observaciones', sql.NVarChar, observaciones || null)
      .execute('sp_CerrarCaja');

    // Obtener detalles del cierre
    const cierreResult = await pool.request()
      .input('aperturaCierreID', sql.Int, aperturaCierreID)
      .query(`
        SELECT 
          ac.*,
          c.NombreCaja,
          CASE 
            WHEN ac.Diferencia = 0 THEN 'EXACTO'
            WHEN ac.Diferencia > 0 THEN 'SOBRANTE'
            ELSE 'FALTANTE'
          END AS TipoDiferencia
        FROM AperturaCierreCaja ac
        INNER JOIN Cajas c ON ac.CajaID = c.CajaID
        WHERE ac.AperturaCierreID = @aperturaCierreID
      `);

    res.json({ 
      success: true, 
      message: 'Caja cerrada exitosamente',
      cierre: cierreResult.recordset[0]
    });
  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({ success: false, message: 'Error al cerrar caja', error: error.message });
  }
});

// Estado de cajas
router.get('/estado', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM vw_EstadoCajas');

    res.json({ success: true, cajas: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener estado', error: error.message });
  }
});

// Obtener caja actual del usuario
router.get('/mi-caja', verifyToken, isCajero, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT TOP 1
          ac.AperturaCierreID,
          ac.CajaID,
          c.NombreCaja,
          ac.MontoInicial,
          ac.FechaHoraApertura,
          ac.Estado,
          ISNULL((SELECT SUM(Total) FROM Ventas WHERE AperturaCierreID = ac.AperturaCierreID AND Estado = 'COMPLETADA'), 0) AS TotalVentas
        FROM AperturaCierreCaja ac
        INNER JOIN Cajas c ON ac.CajaID = c.CajaID
        WHERE ac.UsuarioID = @usuarioID AND ac.Estado = 'ABIERTA'
        ORDER BY ac.FechaHoraApertura DESC
      `);

    if (result.recordset.length === 0) {
      return res.json({ success: true, cajaAbierta: false, mensaje: 'No tiene caja abierta' });
    }

    res.json({ success: true, cajaAbierta: true, caja: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener caja', error: error.message });
  }
});

// Listar cajas disponibles
router.get('/listar', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT CajaID, NombreCaja, Ubicacion, Activo 
      FROM Cajas 
      WHERE Activo = 1
      ORDER BY NombreCaja
    `);

    res.json({ success: true, cajas: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al listar cajas', error: error.message });
  }
});

// Registrar movimiento de caja (ingreso/egreso)
router.post('/movimiento', verifyToken, isCajero, async (req, res) => {
  try {
    const { tipoMovimiento, monto, concepto } = req.body;

    if (!['INGRESO', 'EGRESO'].includes(tipoMovimiento)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo de movimiento debe ser INGRESO o EGRESO' 
      });
    }

    const pool = await getConnection();

    // Obtener caja actual del usuario
    const cajaResult = await pool.request()
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT TOP 1 AperturaCierreID 
        FROM AperturaCierreCaja 
        WHERE UsuarioID = @usuarioID AND Estado = 'ABIERTA'
      `);

    if (cajaResult.recordset.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No tiene caja abierta' 
      });
    }

    await pool.request()
      .input('aperturaCierreID', sql.Int, cajaResult.recordset[0].AperturaCierreID)
      .input('tipoMovimiento', sql.NVarChar, tipoMovimiento)
      .input('monto', sql.Decimal(10, 2), monto)
      .input('concepto', sql.NVarChar, concepto)
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        INSERT INTO MovimientosCaja (AperturaCierreID, TipoMovimiento, Monto, Concepto, UsuarioID)
        VALUES (@aperturaCierreID, @tipoMovimiento, @monto, @concepto, @usuarioID)
      `);

    res.json({ success: true, message: 'Movimiento registrado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al registrar movimiento', error: error.message });
  }
});

module.exports = router;