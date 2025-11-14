const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken } = require('../middleware/auth.middleware');

// Listar clientes
router.get('/', verifyToken, async (req, res) => {
  try {
    const { buscar } = req.query;
    const pool = await getConnection();
    
    let query = 'SELECT * FROM Clientes WHERE Activo = 1';
    
    if (buscar) {
      query += ` AND (NombreCliente LIKE '%${buscar}%' OR Documento LIKE '%${buscar}%')`;
    }
    
    query += ' ORDER BY NombreCliente';

    const result = await pool.request().query(query);

    res.json({ success: true, clientes: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener clientes', error: error.message });
  }
});

// Crear cliente
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nombreCliente, documento, telefono, email, direccion } = req.body;

    if (!nombreCliente) {
      return res.status(400).json({ success: false, message: 'Nombre de cliente es requerido' });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('nombreCliente', sql.NVarChar, nombreCliente)
      .input('documento', sql.NVarChar, documento || null)
      .input('telefono', sql.NVarChar, telefono || null)
      .input('email', sql.NVarChar, email || null)
      .input('direccion', sql.NVarChar, direccion || null)
      .query(`
        INSERT INTO Clientes (NombreCliente, Documento, Telefono, Email, Direccion)
        VALUES (@nombreCliente, @documento, @telefono, @email, @direccion);
        SELECT SCOPE_IDENTITY() AS ClienteID;
      `);

    res.status(201).json({ 
      success: true, 
      message: 'Cliente creado',
      clienteID: result.recordset[0].ClienteID 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear cliente', error: error.message });
  }
});

module.exports = router;
