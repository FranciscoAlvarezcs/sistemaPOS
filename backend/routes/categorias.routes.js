const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken } = require('../middleware/auth.middleware');

// Listar categorías
router.get('/', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT CategoriaID, NombreCategoria, Descripcion, Activo
      FROM Categorias
      WHERE Activo = 1
      ORDER BY NombreCategoria
    `);

    res.json({ success: true, categorias: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener categorías', error: error.message });
  }
});

// Crear categoría
router.post('/', verifyToken, async (req, res) => {
  try {
    const { nombreCategoria, descripcion } = req.body;

    if (!nombreCategoria) {
      return res.status(400).json({ success: false, message: 'Nombre de categoría es requerido' });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('nombreCategoria', sql.NVarChar, nombreCategoria)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .query(`
        INSERT INTO Categorias (NombreCategoria, Descripcion)
        VALUES (@nombreCategoria, @descripcion);
        SELECT SCOPE_IDENTITY() AS CategoriaID;
      `);

    res.status(201).json({ 
      success: true, 
      message: 'Categoría creada',
      categoriaID: result.recordset[0].CategoriaID 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear categoría', error: error.message });
  }
});

module.exports = router;