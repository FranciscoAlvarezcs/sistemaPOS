const express = require('express');
const router = express.Router();
const { getConnection, sql } = require('../config/database');
const { verifyToken } = require('../middleware/auth.middleware');

// BUSCAR PRODUCTO POR CÓDIGO DE BARRAS (OPTIMIZADO PARA LECTOR)
router.get('/buscar/barras/:codigo', verifyToken, async (req, res) => {
  try {
    const { codigo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('codigo', sql.NVarChar, codigo)
      .query(`
        SELECT 
          p.ProductoID,
          p.CodigoBarras,
          p.NombreProducto,
          p.Descripcion,
          p.PrecioVenta,
          p.Stock,
          p.StockMinimo,
          c.NombreCategoria,
          c.CategoriaID,
          CASE 
            WHEN p.Stock > 0 THEN 1
            ELSE 0
          END AS Disponible
        FROM Productos p
        LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
        WHERE p.CodigoBarras = @codigo AND p.Activo = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Producto no encontrado',
        codigo: codigo
      });
    }

    const producto = result.recordset[0];

    if (producto.Stock <= 0) {
      return res.status(200).json({ 
        success: true, 
        warning: 'Producto sin stock',
        producto: producto
      });
    }

    res.json({ success: true, producto: producto });
  } catch (error) {
    console.error('Error al buscar producto:', error);
    res.status(500).json({ success: false, message: 'Error al buscar producto', error: error.message });
  }
});

// BUSCAR PRODUCTOS POR NOMBRE
router.get('/buscar/nombre/:termino', verifyToken, async (req, res) => {
  try {
    const { termino } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('termino', sql.NVarChar, `%${termino}%`)
      .query(`
        SELECT TOP 20
          p.ProductoID,
          p.CodigoBarras,
          p.NombreProducto,
          p.Descripcion,
          p.PrecioVenta,
          p.Stock,
          c.NombreCategoria
        FROM Productos p
        LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
        WHERE p.NombreProducto LIKE @termino AND p.Activo = 1
        ORDER BY p.NombreProducto
      `);

    res.json({ success: true, productos: result.recordset, cantidad: result.recordset.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al buscar productos', error: error.message });
  }
});

// Obtener todos los productos con paginación
router.get('/', verifyToken, async (req, res) => {
  try {
    const { pagina = 1, limite = 50, categoria, buscar } = req.query;
    const offset = (pagina - 1) * limite;

    const pool = await getConnection();
    
    let query = `
      SELECT 
        p.ProductoID,
        p.CodigoBarras,
        p.NombreProducto,
        p.Descripcion,
        p.PrecioCompra,
        p.PrecioVenta,
        p.Stock,
        p.StockMinimo,
        c.NombreCategoria,
        c.CategoriaID,
        pr.NombreProveedor,
        CASE WHEN p.Stock <= p.StockMinimo THEN 1 ELSE 0 END AS StockBajo
      FROM Productos p
      LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
      LEFT JOIN Proveedores pr ON p.ProveedorID = pr.ProveedorID
      WHERE p.Activo = 1
    `;

    if (categoria) {
      query += ` AND p.CategoriaID = ${categoria}`;
    }

    if (buscar) {
      query += ` AND (p.NombreProducto LIKE '%${buscar}%' OR p.CodigoBarras LIKE '%${buscar}%')`;
    }

    query += ` ORDER BY p.NombreProducto OFFSET ${offset} ROWS FETCH NEXT ${limite} ROWS ONLY`;

    const result = await pool.request().query(query);

    const countResult = await pool.request().query(`
      SELECT COUNT(*) as Total FROM Productos WHERE Activo = 1
    `);

    res.json({ 
      success: true, 
      productos: result.recordset,
      paginacion: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        total: countResult.recordset[0].Total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener productos', error: error.message });
  }
});

// Obtener un producto específico
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT p.*, c.NombreCategoria, pr.NombreProveedor
        FROM Productos p
        LEFT JOIN Categorias c ON p.CategoriaID = c.CategoriaID
        LEFT JOIN Proveedores pr ON p.ProveedorID = pr.ProveedorID
        WHERE p.ProductoID = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    res.json({ success: true, producto: result.recordset[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener producto', error: error.message });
  }
});

// Crear producto
router.post('/', verifyToken, async (req, res) => {
  try {
    const { codigoBarras, nombreProducto, descripcion, categoriaID, proveedorID, 
            precioCompra, precioVenta, stock, stockMinimo } = req.body;

    if (!codigoBarras || !nombreProducto || !precioVenta) {
      return res.status(400).json({ 
        success: false, 
        message: 'Código de barras, nombre y precio de venta son requeridos' 
      });
    }

    const pool = await getConnection();
    
    const existeResult = await pool.request()
      .input('codigoBarras', sql.NVarChar, codigoBarras)
      .query('SELECT ProductoID FROM Productos WHERE CodigoBarras = @codigoBarras');

    if (existeResult.recordset.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El código de barras ya existe' 
      });
    }

    const result = await pool.request()
      .input('codigoBarras', sql.NVarChar, codigoBarras)
      .input('nombreProducto', sql.NVarChar, nombreProducto)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('categoriaID', sql.Int, categoriaID || null)
      .input('proveedorID', sql.Int, proveedorID || null)
      .input('precioCompra', sql.Decimal(10, 2), precioCompra || 0)
      .input('precioVenta', sql.Decimal(10, 2), precioVenta)
      .input('stock', sql.Int, stock || 0)
      .input('stockMinimo', sql.Int, stockMinimo || 5)
      .query(`
        INSERT INTO Productos (CodigoBarras, NombreProducto, Descripcion, CategoriaID, 
                               ProveedorID, PrecioCompra, PrecioVenta, Stock, StockMinimo)
        VALUES (@codigoBarras, @nombreProducto, @descripcion, @categoriaID, 
                @proveedorID, @precioCompra, @precioVenta, @stock, @stockMinimo);
        SELECT SCOPE_IDENTITY() AS ProductoID;
      `);

    if (stock > 0) {
      await pool.request()
        .input('productoID', sql.Int, result.recordset[0].ProductoID)
        .input('cantidad', sql.Int, stock)
        .input('tipoMovimiento', sql.NVarChar, 'ENTRADA')
        .input('usuarioID', sql.Int, req.userId)
        .input('motivo', sql.NVarChar, 'Stock inicial')
        .execute('sp_ActualizarStock');
    }

    res.status(201).json({ 
      success: true, 
      message: 'Producto creado exitosamente',
      productoID: result.recordset[0].ProductoID 
    });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ success: false, message: 'Error al crear producto', error: error.message });
  }
});

// Actualizar producto
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { codigoBarras, nombreProducto, descripcion, categoriaID, proveedorID, 
            precioCompra, precioVenta, stockMinimo } = req.body;

    const pool = await getConnection();
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('codigoBarras', sql.NVarChar, codigoBarras)
      .input('nombreProducto', sql.NVarChar, nombreProducto)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('categoriaID', sql.Int, categoriaID)
      .input('proveedorID', sql.Int, proveedorID)
      .input('precioCompra', sql.Decimal(10, 2), precioCompra)
      .input('precioVenta', sql.Decimal(10, 2), precioVenta)
      .input('stockMinimo', sql.Int, stockMinimo)
      .query(`
        UPDATE Productos 
        SET CodigoBarras = @codigoBarras,
            NombreProducto = @nombreProducto,
            Descripcion = @descripcion,
            CategoriaID = @categoriaID,
            ProveedorID = @proveedorID,
            PrecioCompra = @precioCompra,
            PrecioVenta = @precioVenta,
            StockMinimo = @stockMinimo
        WHERE ProductoID = @id
      `);

    res.json({ success: true, message: 'Producto actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar producto', error: error.message });
  }
});

// Actualizar stock
router.post('/stock', verifyToken, async (req, res) => {
  try {
    const { productoID, cantidad, tipoMovimiento, motivo } = req.body;

    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipoMovimiento)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo de movimiento inválido. Use: ENTRADA, SALIDA o AJUSTE' 
      });
    }

    const pool = await getConnection();
    await pool.request()
      .input('productoID', sql.Int, productoID)
      .input('cantidad', sql.Int, cantidad)
      .input('tipoMovimiento', sql.NVarChar, tipoMovimiento)
      .input('usuarioID', sql.Int, req.userId)
      .input('motivo', sql.NVarChar, motivo || 'Ajuste manual')
      .execute('sp_ActualizarStock');

    res.json({ success: true, message: 'Stock actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al actualizar stock', error: error.message });
  }
});

// Productos con stock bajo
router.get('/alertas/stock-bajo', verifyToken, async (req, res) => {
  try {
    const pool = await getConnection();
    const result = await pool.request().query('SELECT * FROM vw_ProductosStockBajo ORDER BY Stock ASC');

    res.json({ success: true, productos: result.recordset, cantidad: result.recordset.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al obtener productos', error: error.message });
  }
});

// Desactivar producto
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();
    
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Productos SET Activo = 0 WHERE ProductoID = @id');

    res.json({ success: true, message: 'Producto desactivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al desactivar producto', error: error.message });
  }
});

module.exports = router;