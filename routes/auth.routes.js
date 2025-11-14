const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../config/database');

// Login
router.post('/login', async (req, res) => {
  try {
    const { nombreUsuario, contrasena } = req.body;

    if (!nombreUsuario || !contrasena) {
      return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos' });
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('nombreUsuario', sql.NVarChar, nombreUsuario)
      .query(`
        SELECT u.UsuarioID, u.NombreUsuario, u.NombreCompleto, u.Contrasena, 
               u.Email, u.Activo, r.NombreRol
        FROM Usuarios u
        INNER JOIN Roles r ON u.RolID = r.RolID
        WHERE u.NombreUsuario = @nombreUsuario
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const usuario = result.recordset[0];

    if (!usuario.Activo) {
      return res.status(403).json({ success: false, message: 'Usuario inactivo. Contacte al administrador' });
    }
    
    if (contrasena !== usuario.Contrasena) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }
    await pool.request()
      .input('usuarioID', sql.Int, usuario.UsuarioID)
      .query('UPDATE Usuarios SET UltimoAcceso = GETDATE() WHERE UsuarioID = @usuarioID');

    await pool.request()
      .input('usuarioID', sql.Int, usuario.UsuarioID)
      .query('INSERT INTO SesionesUsuario (UsuarioID) VALUES (@usuarioID)');

const token = jwt.sign(
      { 
        id: usuario.UsuarioID, 
        username: usuario.NombreUsuario,
        role: usuario.NombreRol 
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario.UsuarioID,
        nombreUsuario: usuario.NombreUsuario,
        nombreCompleto: usuario.NombreCompleto,
        email: usuario.Email,
        rol: usuario.NombreRol
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ success: false, message: 'Error en el servidor', error: error.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const pool = await getConnection();
      
      await pool.request()
        .input('usuarioID', sql.Int, decoded.id)
        .query(`
          UPDATE SesionesUsuario 
          SET FechaHoraFin = GETDATE() 
          WHERE UsuarioID = @usuarioID AND FechaHoraFin IS NULL
        `);
    }

    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al cerrar sesión' });
  }
});

router.get('/verify', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
      return res.status(403).json({ success: false, message: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ success: true, valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ success: false, valid: false, message: 'Token inválido' });
  }
});

module.exports = router;