        // --- FIREBASE IMPORTS ---
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, query, onSnapshot, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        
        // --- GLOBAL VARIABLES ---
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        let app, db, auth, userId = null;
        let stockSnapshotUnsubscribe = null;
        
        let currentStock = []; // Almacena el stock actual para búsquedas
        let currentSaleItems = []; // Almacena los productos de la venta actual

        // --- FIREBASE INITIALIZATION & AUTHENTICATION ---

        async function initializeFirebase() {
            if (!Object.keys(firebaseConfig).length) {
                console.error("Firebase configuration is missing or empty.");
                return;
            }

            try {
                app = initializeApp(firebaseConfig);
                auth = getAuth(app);
                db = getFirestore(app);
                
                if (typeof __initial_auth_token !== 'undefined') {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }

                onAuthStateChanged(auth, (user) => {
                    if (user) {
                        userId = user.uid;
                        console.log("Authenticated successfully. User ID:", userId);
                        
                        const userIdDisplay = document.querySelector('#user-id-display');
                        if (userIdDisplay) {
                            userIdDisplay.textContent = userId;
                        }
                        
                        loadStockData(); 
                    } else {
                        console.log("No user is signed in. Using anonymous fallback.");
                    }
                });

            } catch (error) {
                console.error("Error initializing or authenticating Firebase:", error);
            }
        }
        
        // --- FIRESTORE DATA FUNCTIONS ---

        function getStockCollectionRef(uid) {
            // Path: /artifacts/{appId}/users/{userId}/stock_products
            return collection(db, `artifacts/${appId}/users/${uid}/stock_products`);
        }
        
        // Nueva función para la colección de ventas
        function getSalesCollectionRef(uid) {
            // Path: /artifacts/{appId}/users/{userId}/sales
            return collection(db, `artifacts/${appId}/users/${uid}/sales`);
        }

        function loadStockData() {
            if (!db || !userId) return;

            if (stockSnapshotUnsubscribe) {
                stockSnapshotUnsubscribe();
            }
            
            const stockRef = getStockCollectionRef(userId);
            const q = query(stockRef);

            // Use onSnapshot for real-time updates
            stockSnapshotUnsubscribe = onSnapshot(q, (snapshot) => {
                const stockItems = [];
                snapshot.forEach((d) => {
                    stockItems.push({ id: d.id, ...d.data() });
                });
                
                // **NUEVO**: Guardar el stock en la variable global para el POS
                currentStock = stockItems; 
                
                renderStockTable(stockItems);
            }, (error) => {
                console.error("Error fetching stock data:", error);
            });
        }
        
        async function saveProduct(id, productData) {
            if (!db || !userId) {
                showMessage('Error: Sistema de datos no disponible.', 'error');
                return;
            }
            try {
                const colRef = getStockCollectionRef(userId);
                
                // Convert numeric fields to actual numbers
                productData.unitPrice = parseFloat(productData.unitPrice);
                productData.stock = parseInt(productData.stock);
                
                if (id) {
                    await updateDoc(doc(colRef, id), productData);
                    showMessage('Producto actualizado con éxito.', 'success');
                } else {
                    await addDoc(colRef, productData);
                    showMessage('Nuevo producto agregado con éxito.', 'success');
                }
                closeModal('product-modal');
            } catch (error) {
                console.error("Error al guardar el producto:", error);
                showMessage('Error al guardar el producto. Ver consola para más detalles.', 'error');
            }
        }

        async function deleteProduct(id) {
            if (!db || !userId) {
                showMessage('Error: Sistema no listo.', 'error');
                return;
            }
            try {
                const colRef = getStockCollectionRef(userId);
                await deleteDoc(doc(colRef, id));
                showMessage('Producto eliminado con éxito.', 'success');
                closeModal('delete-confirm-modal');
            } catch (error) {
                console.error("Error al eliminar el producto:", error);
                showMessage('Error al eliminar el producto. Ver consola para más detalles.', 'error');
            }
        }

        // --- UI RENDERING & LOGIC (STOCK) ---

        function renderStockTable(items) {
            const tableBody = document.getElementById('stock-table-body');
            if (!tableBody) return;

            tableBody.innerHTML = ''; 

            if (items.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-400">No hay productos en el inventario. Use el botón "Agregar Producto" para empezar.</td></tr>';
                return;
            }

            items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            items.forEach(item => {
                const stock = parseInt(item.stock) || 0;
                const isLowStock = stock <= 5;
                const lowStockClass = isLowStock ? 'bg-red-900/40 text-red-300' : '';
                
                const row = document.createElement('tr');
                row.className = `border-b border-gray-700 hover:bg-surface/70 transition ${lowStockClass}`;
                
                const itemData = JSON.stringify(item).replace(/"/g, '&quot;'); 

                row.innerHTML = `
                    <td class="px-6 py-4 font-medium text-white text-shadow">${item.name || 'N/A'}</td>
                    <td class="px-6 py-4">${item.category || 'General'}</td>
                    <td class="px-6 py-4">${item.unitPrice ? '$' + parseFloat(item.unitPrice).toFixed(2) : 'N/A'}</td>
                    <td class="px-6 py-4">
                        <span class="inline-block px-3 py-1 text-xs rounded-full ${isLowStock ? 'bg-red-500 text-white' : 'bg-green-600/50 text-white'}">
                            ${stock} uds
                        </span>
                    </td>
                    <td class="px-6 py-4">${item.supplier || 'N/A'}</td>
                    <td class="px-6 py-4 flex space-x-2">
                        <button title="Editar" onclick='openEditModal(${itemData})' class="text-secondary hover:text-white transition p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button title="Eliminar" onclick="showDeleteConfirm('${item.id}', '${item.name}')" class="text-red-400 hover:text-red-200 transition p-1">
                           <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }

        // --- MODAL AND FORM LOGIC ---
        const productForm = document.getElementById('product-form');
        const modalTitle = document.getElementById('modal-title');
        
        function openModal(modalId) {
            document.getElementById(modalId).classList.remove('hidden');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.add('hidden');
        }

        function openAddModal() {
            modalTitle.textContent = 'Agregar Nuevo Producto';
            productForm.reset();
            productForm.dataset.id = '';
            openModal('product-modal');
        }

        function openEditModal(item) {
            modalTitle.textContent = `Editar Producto: ${item.name}`;
            productForm.dataset.id = item.id;
            
            document.getElementById('product-name').value = item.name || '';
            document.getElementById('product-category').value = item.category || '';
            document.getElementById('product-price').value = item.unitPrice !== undefined ? parseFloat(item.unitPrice).toFixed(2) : '';
            document.getElementById('product-stock').value = item.stock !== undefined ? item.stock : '';
            document.getElementById('product-supplier').value = item.supplier || '';
            
            openModal('product-modal');
        }

        function showDeleteConfirm(id, name) {
            document.getElementById('delete-product-name').textContent = name;
            document.getElementById('confirm-delete-button').onclick = () => deleteProduct(id);
            openModal('delete-confirm-modal');
        }
        
        // Handle form submission
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = e.target.dataset.id || null;
            
            const productData = {
                name: document.getElementById('product-name').value.trim(),
                category: document.getElementById('product-category').value.trim() || 'General',
                unitPrice: document.getElementById('product-price').value,
                stock: document.getElementById('product-stock').value, 
                supplier: document.getElementById('product-supplier').value.trim() || 'Desconocido',
            };

            // Basic validation
            if (!productData.name || isNaN(productData.unitPrice) || isNaN(productData.stock)) {
                showMessage('Por favor, complete todos los campos requeridos con valores válidos.', 'error');
                return;
            }

            await saveProduct(id, productData);
        });

        // ======================================================
        // =           NUEVA LÓGICA DE VENTAS (POS)             =
        // ======================================================

        const scannerForm = document.getElementById('scanner-form');
        const cancelSaleBtn = document.getElementById('cancel-sale-btn');
        const finalizeSaleBtn = document.getElementById('finalize-sale-btn');
        const saleListContainer = document.getElementById('venta-lista-items');
        const saleTotalDisplay = document.getElementById('venta-total-display');

        function handleAddItemToSale(e) {
            e.preventDefault();
            
            const scannerInput = document.getElementById('scanner-input');
            const qtyInput = document.getElementById('scanner-qty');
            
            let searchTerm = scannerInput.value.trim();
            let quantityToAdd = parseInt(qtyInput.value);

            if (!searchTerm || isNaN(quantityToAdd) || quantityToAdd <= 0) {
                showMessage('Datos de entrada inválidos.', 'error');
                return;
            }

            // Buscar producto en el stock cargado (por ID o nombre exacto, insensible a mayúsculas)
            let product = currentStock.find(p => p.id === searchTerm || p.name.toLowerCase() === searchTerm.toLowerCase());

            if (!product) {
                showMessage(`Producto "${searchTerm}" no encontrado.`, 'error');
                return;
            }

            // Verificar stock
            let qtyInCart = 0;
            const existingItem = currentSaleItems.find(item => item.id === product.id);
            if (existingItem) {
                qtyInCart = existingItem.quantity;
            }
            
            if ((qtyInCart + quantityToAdd) > product.stock) {
                showMessage(`Stock insuficiente para ${product.name}. Solo quedan ${product.stock} unidades.`, 'error');
                return;
            }
            
            // Agregar o actualizar item en el carrito
            if (existingItem) {
                existingItem.quantity += quantityToAdd;
            } else {
                currentSaleItems.push({
                    id: product.id,
                    name: product.name,
                    unitPrice: parseFloat(product.unitPrice),
                    quantity: quantityToAdd,
                    stock: product.stock // Guardamos el stock original para referencia
                });
            }

            // Limpiar inputs
            scannerInput.value = '';
            qtyInput.value = 1;
            scannerInput.focus();

            renderSaleList();
            updateSaleTotal();
        }

        function renderSaleList() {
            saleListContainer.innerHTML = ''; // Limpiar lista

            if (currentSaleItems.length === 0) {
                saleListContainer.innerHTML = '<p class="text-center text-gray-500 pt-10">Escanee un producto para comenzar...</p>';
                return;
            }

            currentSaleItems.forEach((item, index) => {
                const subtotal = (item.unitPrice * item.quantity).toFixed(2);
                const itemHtml = `
                    <div class="flex items-center text-sm p-3 bg-bg-dark rounded-lg border border-gray-700">
                        <div class="flex-1">
                            <p class="font-medium text-white text-shadow">${item.name}</p>
                            <p class="text-xs text-gray-400">${item.quantity} x $${item.unitPrice.toFixed(2)}</p>
                        </div>
                        <div class="w-24 text-right font-medium text-secondary text-base">$${subtotal}</div>
                        <div class="w-12 text-right">
                            <button onclick="removeItemFromSale(${index})" title="Quitar" class="text-red-400 hover:text-red-200 p-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                    </div>
                `;
                saleListContainer.innerHTML += itemHtml;
            });
        }

        function removeItemFromSale(index) {
            currentSaleItems.splice(index, 1); // Eliminar el item del array por su índice
            renderSaleList();
            updateSaleTotal();
        }

        function updateSaleTotal() {
            const total = currentSaleItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
            saleTotalDisplay.textContent = `$${total.toFixed(2)}`;
        }

        function clearSale() {
            currentSaleItems = [];
            renderSaleList();
            updateSaleTotal();
            showMessage('Venta cancelada.', 'success');
        }

        async function finalizeSale() {
            if (currentSaleItems.length === 0) {
                showMessage('No hay productos en la venta.', 'error');
                return;
            }

            if (!db || !userId) {
                showMessage('Error: No se puede conectar con la base de datos.', 'error');
                return;
            }

            const batch = writeBatch(db);

            // 1. Crear el registro de la venta
            const totalAmount = currentSaleItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
            const saleRecord = {
                items: currentSaleItems.map(item => ({ // Guardar solo la info necesaria
                    id: item.id,
                    name: item.name,
                    unitPrice: item.unitPrice,
                    quantity: item.quantity
                })),
                totalAmount: totalAmount,
                createdAt: serverTimestamp(),
                createdBy: userId // O el ID del empleado
            };
            
            const newSaleRef = doc(getSalesCollectionRef(userId)); // Crea una referencia con ID automático
            batch.set(newSaleRef, saleRecord);

            // 2. Actualizar el stock de cada producto
            for (const item of currentSaleItems) {
                const stockDocRef = doc(getStockCollectionRef(userId), item.id);
                const newStockLevel = item.stock - item.quantity; // Usamos el stock guardado
                batch.update(stockDocRef, { stock: newStockLevel });
            }

            // 3. Ejecutar el batch
            try {
                await batch.commit();
                showMessage('¡Venta registrada con éxito!', 'success');
                clearSale();
            } catch (error) {
                console.error("Error al finalizar la venta:", error);
                showMessage('Error al procesar la venta. El stock no ha sido modificado.', 'error');
            }
        }

        // Adjuntar listeners del POS
        scannerForm.addEventListener('submit', handleAddItemToSale);
        cancelSaleBtn.addEventListener('click', clearSale);
        finalizeSaleBtn.addEventListener('click', finalizeSale);


        // --- MESSAGE/TOAST UTILITY ---
        function showMessage(message, type) {
            const messageBox = document.getElementById('message-box');
            messageBox.textContent = message;
            
            messageBox.className = 'fixed bottom-4 right-4 p-4 rounded-lg shadow-xl z-50 transition-transform transform duration-500 text-shadow';
            
            if (type === 'success') {
                messageBox.classList.add('bg-green-600', 'text-white', 'translate-x-0');
            } else if (type === 'error') {
                messageBox.classList.add('bg-red-600', 'text-white', 'translate-x-0');
            }

            setTimeout(() => {
                messageBox.classList.add('translate-x-full');
            }, 4000);
        }

        // --- LÓGICA DE NAVEGACIÓN SIMULADA (SPA) ---
        
        const sidebar = document.getElementById('sidebar');
        const menuToggle = document.getElementById('menu-toggle');
        const mainTitle = document.getElementById('main-title');
        const navLinks = document.querySelectorAll('.nav-link');
        const contentViews = document.querySelectorAll('.content-view');
        
        function navigate(viewId) {
            const currentLink = document.querySelector(`.nav-link[data-view="${viewId}"]`);
            if (currentLink) {
                const titleText = currentLink.textContent.trim().replace('Admin', '').trim() || 'Principal';
                mainTitle.textContent = titleText;
            }

            contentViews.forEach(view => {
                view.classList.add('hidden');
            });
            
            const targetView = document.getElementById(`view-${viewId}`);
            if (targetView) {
                targetView.classList.remove('hidden');
            } else {
                document.getElementById('view-principal').classList.remove('hidden');
                mainTitle.textContent = 'Principal';
            }

            navLinks.forEach(link => {
                link.classList.remove('active');
            });
            if (currentLink) {
                currentLink.classList.add('active');
            }
            
            if (window.innerWidth < 768) {
                sidebar.classList.add('hidden');
            }

            // Enfocar el scanner al ir a la vista de ventas
            if (viewId === 'ventas') {
                document.getElementById('scanner-input').focus();
            }
        }
        
        // Listener para los enlaces de navegación
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const viewId = e.currentTarget.getAttribute('data-view');
                navigate(viewId);
            });
        });

        // Toggle del menú para dispositivos móviles
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('hidden');
            document.getElementById('app').classList.toggle('overflow-hidden', !sidebar.classList.contains('hidden'));
        });

        // Inicializar la vista en Principal y Firebase al cargar
        document.addEventListener('DOMContentLoaded', () => {
            navigate('principal');
            initializeFirebase();
        });
        
        // Expose functions globally for HTML buttons
        window.navigate = navigate;
        window.openAddModal = openAddModal;
        window.openEditModal = openEditModal;
        window.showDeleteConfirm = showDeleteConfirm;
        window.closeModal = closeModal;
        window.removeItemFromSale = removeItemFromSale; // NUEVO
        window.clearSale = clearSale; // NUEV