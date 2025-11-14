const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ success: false, message: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userName = decoded.username;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.userRole !== 'Administrador') {
    return res.status(403).json({ success: false, message: 'Acceso denegado. Se requiere rol de Administrador' });
  }
  next();
};

const isCajero = (req, res, next) => {
  const rolesPermitidos = ['Administrador', 'Cajero', 'Supervisor'];
  if (!rolesPermitidos.includes(req.userRole)) {
    return res.status(403).json({ success: false, message: 'Acceso denegado. Se requiere rol de Cajero o superior' });
  }
  next();
};

module.exports = { verifyToken, isAdmin, isCajero };