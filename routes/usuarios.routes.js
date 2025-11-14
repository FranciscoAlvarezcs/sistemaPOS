const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

// Obtener todos los usuarios (solo admin)
router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT 
        u.UsuarioID, 
        u.NombreUsuario, 
        u.NombreCompleto, 
        u.Email, 
        u.Activo, 
        r.NombreRol,
        r.RolID,
        u.FechaCreacion,
        u.UltimoAcceso
      FROM Usuarios u
      INNER JOIN Roles r ON u.RolID = r.RolID
      ORDER BY u.NombreCompleto
    `);

    res.json({ success: true, usuarios: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener usuarios', error: error.message });
  }
});

// Obtener perfil del usuario actual
router.get('/perfil', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request()
      .input('usuarioID', sql.Int, req.userId)
      .query(`
        SELECT 
          u.UsuarioID,
          u.NombreUsuario,
          u.NombreCompleto,
          u.Email,
          r.NombreRol,
          u.FechaCreacion,
          u.UltimoAcceso
        FROM Usuarios u
        INNER JOIN Roles r ON u.RolID = r.RolID
        WHERE u.UsuarioID = @usuarioID
      `);

    res.json({ success: true, usuario: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener perfil', error: error.message });
  }
});

// Listar roles
router.get('/roles', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM Roles ORDER BY NombreRol');

    res.json({ success: true, roles: result.recordset });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener roles', error: error.message });
  }
});

// Crear usuario (solo admin)
router.post('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { nombreUsuario, contrasena, nombreCompleto, email, rolID } = req.body;

    if (!nombreUsuario || !contrasena || !nombreCompleto || !rolID) {
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son requeridos' 
      });
    }

    const pool = await getConnection();

    // Verificar si el usuario ya existe
    const existe = await pool.request()
      .input('nombreUsuario', sql.NVarChar, nombreUsuario)
      .query('SELECT UsuarioID FROM Usuarios WHERE NombreUsuario = @nombreUsuario');

    if (existe.recordset.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El nombre de usuario ya existe' 
      });
    }

    const result = await pool.request()
      .input('nombreUsuario', sql.NVarChar, nombreUsuario)
      .input('contrasena', sql.NVarChar, contrasena) // En producción usar bcrypt
      .input('nombreCompleto', sql.NVarChar, nombreCompleto)
      .input('email', sql.NVarChar, email || null)
      .input('rolID', sql.Int, rolID)
      .query(`
        INSERT INTO Usuarios (NombreUsuario, Contrasena, NombreCompleto, Email, RolID)
        VALUES (@nombreUsuario, @contrasena, @nombreCompleto, @email, @rolID);
        SELECT SCOPE_IDENTITY() AS UsuarioID;
      `);

    res.status(201).json({ 
      success: true, 
      message: 'Usuario creado exitosamente',
      usuarioID: result.recordset[0].UsuarioID 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al crear usuario', error: error.message });
  }
});

module.exports = router;