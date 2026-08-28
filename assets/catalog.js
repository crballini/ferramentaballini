/* ============================================================
FERRAMENTA BALLINI — Catalogo di reparto (versione pubblica, sola lettura)
Richiede che la pagina definisca window.CATALOG_CONFIG prima di includere questo file:
{
  categoryIcon: '<svg ...>...</svg>', // placeholder immagine
  subcategories: ['Nome A', 'Nome B', ...],
  productsUrl: 'assets/data/prodotti-<reparto>.json' // array di prodotti caricato via fetch
}
I prodotti vivono in un file .json separato (vedi productsUrl) invece che inline nella pagina:
aggiornare l'inventario significa sovrascrivere quel file, esportato dall'area di gestione, senza toccare questo HTML.
============================================================ */

(function(){
  const cfg = window.CATALOG_CONFIG || { subcategories:[], productsUrl:'', categoryIcon:'' };

  // Variabili globali per la gestione del carrello (Aggiunte per Carrello v3.0)
  let cart = [];
  let currentActiveProduct = null;


  // I percorsi "image" dentro i file JSON sono scritti relativi alla radice
  // del sito (es. "assets/img/elettrodomestici/xxx.jpg"). Se questa pagina
  // vive in una sottocartella (es. reparti/reparto-xxx.html), il browser
  // risolverebbe quel percorso in modo sbagliato. Calcoliamo il prefisso
  // corretto a partire da productsUrl, che è già configurato correttamente
  // per ogni pagina.
  const basePrefix = (cfg.productsUrl || '').replace(/assets\/data\/.*$/, '');

  // Funzione di risoluzione robusta dei percorsi delle immagini (Risolve problema anteprima)
  function resolveImagePath(imagePath) {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
      return imagePath;
    }
    // Rimuove eventuali "../" iniziali ripetuti o barre per ripulire il percorso memorizzato o caricato
    let cleanPath = imagePath.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
    return basePrefix + cleanPath;
  }


  function sortBySubcategory(list, subcategories){
    return list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        let oa = subcategories.indexOf(a.p.category);
        if (oa === -1) oa = subcategories.length;
        let ob = subcategories.indexOf(b.p.category);
        if (ob === -1) ob = subcategories.length;
        return oa !== ob ? oa - ob : a.i - b.i;
      })
      .map(x => x.p);
  }

  let products = [];
  const grid = document.getElementById('catalogGrid');
  const countEl = document.getElementById('catalogCount');
  const searchInput = document.getElementById('searchInput');
  const catList = document.getElementById('categoryFilters');
  const priceList = document.getElementById('priceFilters');
  const resetBtn = document.getElementById('resetFilters');

  const DEFAULT_PRICE_BANDS = [
    { id:'p1', label:'Fino a € 10', test:(v)=> v <= 10 },
    { id:'p2', label:'€ 10 – € 30', test:(v)=> v > 10 && v <= 30 },
    { id:'p3', label:'€ 30 – € 60', test:(v)=> v > 30 && v <= 60 },
    { id:'p4', label:'Oltre € 60', test:(v)=> v > 60 }
  ];

  // Ogni reparto può definire fasce di prezzo personalizzate tramite
  // CATALOG_CONFIG.priceBands; se non specificate, si usano quelle di default.
  const PRICE_BANDS = cfg.priceBands || DEFAULT_PRICE_BANDS;

  function buildCheckboxList(container, items, name){
    container.innerHTML = items.map(item => `
      <label class="filter-option">
        <input type="checkbox" name="${name}" value="${item.value}">
        ${item.label}
      </label>
    `).join('');
  }

  if (catList) buildCheckboxList(catList, cfg.subcategories.map(s => ({ value: s, label: s })), 'cat');
  if (priceList) buildCheckboxList(priceList, PRICE_BANDS.map(b => ({ value: b.id, label: b.label })), 'price');

  function getChecked(name){
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
  }

  function iconSvg(){
    return cfg.categoryIcon || '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>';
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function formatPrice(price){
    const raw = String(price).trim();
    if (/^\d+([.,]\d+)?$/.test(raw)){
      return `€ ${Number(raw.replace(',', '.')).toFixed(2).replace('.', ',')}`;
    }
    return raw;
  }

  function parsePrice(price){
    const match = String(price).match(/\d+(?:[.,]\d+)?/);
    return match ? parseFloat(match[0].replace(',', '.')) : NaN;
  }

  function renderCard(p){
    const imageHtml = p.image ? `<img src="${resolveImagePath(p.image)}" alt="${escapeHtml(p.name)}">` : iconSvg();
    const variantHtml = (p.variants && p.variants.options && p.variants.options.length) ? `<div class="product-variant"><label>${escapeHtml(p.variants.label)}</label><select class="variant-select">${p.variants.options.map(o => `<option value="${escapeHtml(o.price)}">${escapeHtml(o.value)}</option>`).join('')}</select></div>` : '';
    const initialPrice = (p.variants && p.variants.options && p.variants.options.length) ? p.variants.options[0].price : p.price;
    
    return `
      <div class="product-card" data-id="${p.id}" style="cursor: pointer;">
        <div class="product-image">
          ${imageHtml}
        </div>
        <div class="product-body">
          <div class="product-cat">${escapeHtml(p.category)}</div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          ${variantHtml}
          <div class="product-price-row">
            <div class="product-price-val">${formatPrice(initialPrice)}</div>
            <button class="card-add-to-cart-btn" aria-label="Aggiungi al carrello" title="Aggiungi direttamente al carrello">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function applyFilters(){
    const q = (searchInput.value || '').trim().toLowerCase();
    const cats = getChecked('cat');
    const priceIds = getChecked('price');

    const filtered = products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (cats.length && !cats.includes(p.category)) return false;
      if (priceIds.length){
        const bands = PRICE_BANDS.filter(b => priceIds.includes(b.id));
        // Se ha varianti, verifichiamo il prezzo della prima variante, altrimenti il prezzo base
        const currentPriceVal = (p.variants && p.variants.options && p.variants.options.length) ? p.variants.options[0].price : p.price;
        if (!bands.some(b => b.test(parsePrice(currentPriceVal)))) return false;
      }
      return true;
    });
    renderGrid(filtered);
  }

  function renderGrid(list){
    countEl.innerHTML = `<strong>${list.length}</strong> prodott${list.length === 1 ? 'o' : 'i'} trovat${list.length === 1 ? 'o' : 'i'}`;
    if (!list.length){
      grid.innerHTML = `
        <div class="catalog-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div>Nessun prodotto corrisponde ai filtri selezionati.</div>
        </div>`;
      return;
    }
    grid.innerHTML = list.map(renderCard).join('');
    
    // Aggancia gestori di eventi per varianti e per la modale di dettaglio
    grid.querySelectorAll('.product-card').forEach(card => {
      const select = card.querySelector('.variant-select');
      
      // Gestore per il pulsante carrello rapido sulla scheda
      const cardAddToCartBtn = card.querySelector('.card-add-to-cart-btn');
      if (cardAddToCartBtn) {
        cardAddToCartBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Evita l'apertura della modale di dettaglio
          e.preventDefault();
          
          const pId = card.getAttribute('data-id');
          const product = list.find(prod => prod.id === pId);
          if (product) {
            let variantValue = null;
            let price = product.price;
            const select = card.querySelector('.variant-select');
            if (select) {
              variantValue = select.options[select.selectedIndex].text;
              price = select.value;
            }
            addToCart(product, variantValue, price, 1);
          }
        });
      }

      // Sincronizzazione del prezzo mostrato sulla scheda al cambio variante
      if (select){
        select.addEventListener('change', (e) => {
          e.stopPropagation();
          card.querySelector('.product-price-val').textContent = formatPrice(select.value);
        });
      }

      // Apertura modale dettagli al click sulla card (escludendo select e pulsante carrello)
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('.variant-select')) return;
        if (e.target.closest('.card-add-to-cart-btn')) return; // Previene apertura modale
        
        const pId = card.getAttribute('data-id');
        const product = list.find(prod => prod.id === pId);
        if (product) {
          openProductDetailModal(product);
        }
      });
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  [catList, priceList].forEach(el => {
    if (el) el.addEventListener('change', applyFilters);
  });
  
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      searchInput.value = '';
      document.querySelectorAll('.catalog-sidebar input[type="checkbox"]').forEach(i => i.checked = false);
      applyFilters();
    });
  }

  /* ---------- DETTAGLIO PRODOTTO (MODALE INTEGRATA) ---------- */
  let currentImgIndex = 0;
  let modalImages = [];

  // Iniezione automatica della struttura HTML della modale se non presente
  function ensureModalMarkup(){
    if (document.getElementById('productDetailModal')) return;
    
    const modalHtml = `
      <div id="productDetailModal" class="modal-overlay-detail" style="display:none;">
        <div class="modal-box-detail">
          <button class="modal-close-detail" id="modalCloseDetail" aria-label="Chiudi finestra">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div class="modal-detail-content">
            <div class="modal-detail-gallery">
              <div class="modal-detail-main-img-wrapper">
                <button class="gallery-arrow prev" id="detailGalleryPrev">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div id="modalDetailMainImgContainer"></div>
                <button class="gallery-arrow next" id="detailGalleryNext">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
              <div class="modal-detail-thumbnails" id="modalDetailThumbnails"></div>
            </div>
            <div class="modal-detail-info">
              <span class="modal-detail-cat" id="modalDetailCat"></span>
              <h2 class="modal-detail-title" id="modalDetailTitle"></h2>
              <div class="modal-detail-price-avail">
                <span class="modal-detail-price" id="modalDetailPrice"></span>
              </div>
              <div class="modal-detail-desc" id="modalDetailDesc"></div>
              <div class="modal-detail-variants" id="modalDetailVariants"></div>
              
              <!-- Selettore Quantità (Aggiunto per Carrello v3.0) -->
              <div class="product-quantity-selector" style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                <span class="label-font" style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-faint); font-weight: 500;">Quantità:</span>
                <div class="cart-qty-ctrl" style="border: 1px solid var(--line); display: inline-flex; align-items: center; background: var(--paper);">
                  <button id="modalQtyDecBtn" type="button" style="width: 32px; height: 32px; border: none; background: transparent; cursor: pointer; font-size: 1.1rem; color: var(--ink); font-weight: bold;">-</button>
                  <input id="modalQtyInput" type="number" value="1" min="1" max="99" style="width: 36px; text-align: center; border: none; background: transparent; font-family: 'Work Sans', sans-serif; font-size: 0.95rem; font-weight: 500; color: var(--ink); -moz-appearance: textfield;" readonly>
                  <button id="modalQtyIncBtn" type="button" style="width: 32px; height: 32px; border: none; background: transparent; cursor: pointer; font-size: 1.1rem; color: var(--ink); font-weight: bold;">+</button>
                </div>
              </div>

              <!-- Pulsante Aggiungi al Carrello (Aggiunto per Carrello v3.0) -->
              <button class="btn modal-detail-btn-cart" id="modalAddToCartBtn" style="margin-bottom: 12px; width: 100%; justify-content: center; gap: 8px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Aggiungi al Carrello
              </button>

              <a class="btn modal-detail-btn" id="modalDetailContactBtn" href="#" style="background:transparent; color:var(--ink); border:1px solid var(--line); font-size:0.8rem; padding:10px 20px; width: 100%; justify-content: center; margin-top: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Chiedi informazioni via email
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = modalHtml;
    document.body.appendChild(container.firstElementChild);
    
    // Aggancia i listener di chiusura e navigazione della galleria una sola volta
    const modal = document.getElementById('productDetailModal');
    const closeBtn = document.getElementById('modalCloseDetail');
    const prevBtn = document.getElementById('detailGalleryPrev');
    const nextBtn = document.getElementById('detailGalleryNext');
    
    closeBtn.addEventListener('click', closeProductDetailModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeProductDetailModal();
    });
    
    prevBtn.addEventListener('click', () => navigateGallery(-1));
    nextBtn.addEventListener('click', () => navigateGallery(1));
    
    // Registra listener per quantità e aggiunta al carrello (Aggiunti per Carrello v3.0)
    const qtyInput = document.getElementById('modalQtyInput');
    const qtyDecBtn = document.getElementById('modalQtyDecBtn');
    const qtyIncBtn = document.getElementById('modalQtyIncBtn');
    const addToCartBtn = document.getElementById('modalAddToCartBtn');
    
    qtyDecBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val > 1) qtyInput.value = val - 1;
    });
    qtyIncBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val < 99) qtyInput.value = val + 1;
    });
    addToCartBtn.addEventListener('click', () => {
      if (!currentActiveProduct) return;
      
      let variantValue = null;
      let price = currentActiveProduct.price;
      const variantSelect = document.getElementById('modalVariantSelect');
      if (variantSelect) {
        variantValue = variantSelect.options[variantSelect.selectedIndex].text;
        price = variantSelect.value;
      }
      
      const qty = parseInt(qtyInput.value) || 1;
      addToCart(currentActiveProduct, variantValue, price, qty);
      closeProductDetailModal();
    });
    
    // Supporto tasti freccia e ESC
    document.addEventListener('keydown', (e) => {
      if (modal.style.display === 'flex') {
        if (e.key === 'Escape') closeProductDetailModal();
        if (e.key === 'ArrowLeft') navigateGallery(-1);
        if (e.key === 'ArrowRight') navigateGallery(1);
      }
    });
  }

  function openProductDetailModal(p){
    ensureModalMarkup();
    currentActiveProduct = p; // Memorizza il prodotto attivo per il carrello
    const qtyInput = document.getElementById('modalQtyInput');
    if (qtyInput) qtyInput.value = 1; // Resetta la quantità ad ogni apertura
    const modal = document.getElementById('productDetailModal');
    
    // Informazioni base
    document.getElementById('modalDetailCat').textContent = p.category;
    document.getElementById('modalDetailTitle').textContent = p.name;
    
    // Descrizione prodotto
    const descEl = document.getElementById('modalDetailDesc');
    if (p.description && p.description.trim() !== '') {
      descEl.innerHTML = `<p>${escapeHtml(p.description)}</p>`;
      descEl.style.display = 'block';
    } else {
      descEl.innerHTML = `<p style="font-style:italic; color:var(--ink-faint);">Dettagli aggiuntivi per questo prodotto non ancora inseriti. Contattaci per qualsiasi chiarimento!</p>`;
      descEl.style.display = 'block';
    }
    
    // Configura immagini della galleria
    modalImages = [];
    if (p.images && Array.isArray(p.images) && p.images.length > 0) {
      modalImages = p.images.filter(img => img && img.trim() !== '');
    } else if (p.image) {
      modalImages = [p.image];
    }
    
    currentImgIndex = 0;
    renderGallery();

    // Sezione varianti nella modale
    const varContainer = document.getElementById('modalDetailVariants');
    const priceEl = document.getElementById('modalDetailPrice');
    
    if (p.variants && p.variants.options && p.variants.options.length) {
      const initialPrice = p.variants.options[0].price;
      priceEl.textContent = formatPrice(initialPrice);
      
      varContainer.innerHTML = `
        <div class="product-variant">
          <label>${escapeHtml(p.variants.label)}</label>
          <select id="modalVariantSelect" class="variant-select">
            ${p.variants.options.map(o => `<option value="${escapeHtml(o.price)}">${escapeHtml(o.value)}</option>`).join('')}
          </select>
        </div>
      `;
      varContainer.style.display = 'block';
      
      const modalSelect = document.getElementById('modalVariantSelect');
      modalSelect.addEventListener('change', () => {
        priceEl.textContent = formatPrice(modalSelect.value);
        updateContactLink(p, modalSelect.options[modalSelect.selectedIndex].text, modalSelect.value);
      });
      
      updateContactLink(p, p.variants.options[0].value, initialPrice);
    } else {
      priceEl.textContent = formatPrice(p.price);
      varContainer.style.display = 'none';
      updateContactLink(p, null, p.price);
    }

    // Mostra modale con stile flex
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeProductDetailModal(){
    const modal = document.getElementById('productDetailModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  function renderGallery(){
    const container = document.getElementById('modalDetailMainImgContainer');
    const thumbContainer = document.getElementById('modalDetailThumbnails');
    const prevBtn = document.getElementById('detailGalleryPrev');
    const nextBtn = document.getElementById('detailGalleryNext');
    
    if (modalImages.length === 0) {
      container.innerHTML = iconSvg();
      thumbContainer.innerHTML = '';
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      return;
    }
    
    // Mostra frecce navigazione solo se ci sono più immagini
    const hasMultiple = modalImages.length > 1;
    prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    nextBtn.style.display = hasMultiple ? 'flex' : 'none';
    
    updateGalleryImg();
    
    // Genera miniature
    if (hasMultiple) {
      thumbContainer.innerHTML = modalImages.map((img, idx) => `
        <div class="modal-detail-thumb ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
          <img src="${resolveImagePath(img)}" alt="Miniatura">
        </div>
      `).join('');
      
      thumbContainer.querySelectorAll('.modal-detail-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
          currentImgIndex = parseInt(thumb.getAttribute('data-idx'));
          updateGalleryImg();
        });
      });
      thumbContainer.style.display = 'flex';
    } else {
      thumbContainer.innerHTML = '';
      thumbContainer.style.display = 'none';
    }
  }

  function updateGalleryImg(){
    const container = document.getElementById('modalDetailMainImgContainer');
    const src = resolveImagePath(modalImages[currentImgIndex]);
    container.innerHTML = `<img id="modalDetailMainImg" src="${src}" alt="Immagine prodotto grande">`;
    
    // Sincronizza lo stato attivo della miniatura
    const thumbs = document.querySelectorAll('.modal-detail-thumb');
    thumbs.forEach((thumb, idx) => {
      if (idx === currentImgIndex) {
        thumb.classList.add('active');
      } else {
        thumb.classList.remove('active');
      }
    });
  }

  function navigateGallery(direction){
    if (modalImages.length <= 1) return;
    currentImgIndex += direction;
    if (currentImgIndex < 0) currentImgIndex = modalImages.length - 1;
    if (currentImgIndex >= modalImages.length) currentImgIndex = 0;
    updateGalleryImg();
  }

  function updateContactLink(product, selectedVariantLabel, currentPrice){
    const contactBtn = document.getElementById('modalDetailContactBtn');
    
    const formattedPrice = formatPrice(currentPrice);
    let detailsText = `- Prodotto: ${product.name}\n- Codice: ${product.code}\n- Reparto: ${product.category}\n- Prezzo: ${formattedPrice}`;
    if (selectedVariantLabel) {
      detailsText += `\n- Opzione Selezionata: ${selectedVariantLabel}`;
    }
    
    const subject = encodeURIComponent(`Richiesta Informazioni Catalogo - ${product.name}`);
    const body = encodeURIComponent(
      `Salve Ferramenta Ballini,\n\nVorrei ricevere maggiori informazioni o verificare la disponibilità del seguente prodotto visto sul vostro catalogo online:\n\n${detailsText}\n\nGrazie, vi lascio i miei contatti.`
    );
    
    contactBtn.href = `mailto:balliniluiginofiuggi@libero.it?subject=${subject}&body=${body}`;
  }

  /* ---------- Header mobile menu (coerenza con la home) ---------- */
  const menuToggle = document.getElementById('menuToggle');
  const header = document.getElementById('siteHeader');
  if (menuToggle && header){
    menuToggle.addEventListener('click', () => header.classList.toggle('open'));
  }

  /* ---------- FUNZIONI DI GESTIONE DEL CARRELLO (Aggiunte per Carrello v3.0) ---------- */
  function loadCart() {
    try {
      cart = JSON.parse(localStorage.getItem('ferramenta_ballini_cart')) || [];
    } catch(e) {
      cart = [];
    }
    updateCartHeaderBtn();
  }

  function saveCart() {
    localStorage.setItem('ferramenta_ballini_cart', JSON.stringify(cart));
    updateCartHeaderBtn();
  }

  function addToCart(product, variantValue, price, quantity) {
    const cartItemId = product.code + '_' + (variantValue || 'base');
    const existingIndex = cart.findIndex(item => item.cartItemId === cartItemId);
    
    if (existingIndex > -1) {
      cart[existingIndex].quantity += quantity;
    } else {
      cart.push({
        cartItemId: cartItemId,
        code: product.code,
        name: product.name,
        category: product.category,
        price: price,
        variant: variantValue,
        quantity: quantity,
        image: product.image
      });
    }
    
    saveCart();
    showCartToast(product.name, quantity);
  }

  function ensureToastMarkup() {
    if (document.getElementById('cartToast')) return;
    const toast = document.createElement('div');
    toast.id = 'cartToast';
    toast.className = 'toast-cart';
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--yellow-dark);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
      <span id="cartToastMsg"></span>
    `;
    document.body.appendChild(toast);
  }

  function showCartToast(productName, quantity) {
    ensureToastMarkup();
    const toast = document.getElementById('cartToast');
    const msg = document.getElementById('cartToastMsg');
    msg.textContent = `${quantity}x "${productName}" aggiunto al carrello!`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function ensureCartHeaderBtn() {
    if (document.getElementById('headerCartBtn')) return;
    
    const container = document.querySelector('.site-header .container');
    if (!container) return;
    
    const callBtn = container.querySelector('.call-btn');
    if (callBtn) {
      callBtn.style.display = 'none';
    }
    
    const cartBtn = document.createElement('a');
    cartBtn.id = 'headerCartBtn';
    cartBtn.className = 'cart-btn';
    cartBtn.href = '#';
    cartBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <span class="cart-btn-text">Carrello</span>
      <span class="cart-count" id="headerCartCount">0</span>
    `;
    
    const menuToggle = container.querySelector('.menu-toggle');
    if (menuToggle) {
      container.insertBefore(cartBtn, menuToggle);
    } else {
      container.appendChild(cartBtn);
    }
    
    cartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openCartModal();
    });
  }

  function updateCartHeaderBtn() {
    ensureCartHeaderBtn();
    const countEl = document.getElementById('headerCartCount');
    if (!countEl) return;
    
    let totalItems = 0;
    cart.forEach(item => {
      totalItems += item.quantity;
    });
    
    countEl.textContent = totalItems;
  }

  function ensureCartModalMarkup() {
    if (document.getElementById('cartModal')) return;
    
    const cartModalHtml = `
      <div id="cartModal" class="modal-overlay-cart" style="display:none;">
        <div class="modal-box-cart">
          <button class="modal-close-detail" id="cartModalClose" aria-label="Chiudi carrello" style="position: absolute; top: 15px; right: 15px; background: none; border: none; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--ink);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 22px; height: 22px;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          
          <h2 class="modal-title-cart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            Carrello Prenotazioni
          </h2>
          
          <div id="cartItemsContainer" class="cart-items-list"></div>
          
          <div class="cart-total-box">
            <span class="cart-total-label">Totale Stimato</span>
            <span class="cart-total-val" id="cartTotalVal">€ 0,00</span>
          </div>
          
          <div class="cart-booking-form" id="cartBookingFormSection">
            <h4>Riepilogo e Contatti per il Ritiro</h4>
            <form id="cartSubmitForm">
              <div class="form-row-2">
                <div class="field">
                  <label for="cartClientName">Nome</label>
                  <input type="text" id="cartClientName" placeholder="" required>
                </div>
                <div class="field">
                  <label for="cartClientSurname">Cognome</label>
                  <input type="text" id="cartClientSurname" placeholder="" required>
                </div>
              </div>
              
              <div class="field">
                <label for="cartClientPhone">Numero di Telefono o Email</label>
                <input type="text" id="cartClientPhone" placeholder="Esempio: +39 333 1234567 o mail@esempio.com" required>
              </div>
              
              <div class="field">
                <label style="margin-bottom: 7px; display: block; font-family: 'Oswald', sans-serif; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em;">Metodo di Invio Richiesta</label>
                <div class="contact-method-select">
                  <div class="contact-method-card active" id="methodWhatsAppCard">
                    <input type="radio" id="methodWhatsApp" name="contact_method" value="whatsapp" checked style="display:none;">
                    <label for="methodWhatsApp" style="cursor: pointer; width: 100%; display: flex; align-items: center; gap: 8px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke: #25D366; width: 16px; height: 16px;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                      WhatsApp
                    </label>
                  </div>
                  <div class="contact-method-card" id="methodEmailCard">
                    <input type="radio" id="methodEmail" name="contact_method" value="email" style="display:none;">
                    <label for="methodEmail" style="cursor: pointer; width: 100%; display: flex; align-items: center; gap: 8px;">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke: #0070BA; width: 16px; height: 16px;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      Invia via Email
                    </label>
                  </div>
                </div>
              </div>
              
              <button type="submit" id="cartSubmitBtn" class="cart-submit-btn">
                Invia Richiesta di Prenotazione
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = cartModalHtml;
    document.body.appendChild(container.firstElementChild);
    
    const modal = document.getElementById('cartModal');
    const closeBtn = document.getElementById('cartModalClose');
    const form = document.getElementById('cartSubmitForm');
    const waCard = document.getElementById('methodWhatsAppCard');
    const mailCard = document.getElementById('methodEmailCard');
    const waRadio = document.getElementById('methodWhatsApp');
    const mailRadio = document.getElementById('methodEmail');
    
    closeBtn.addEventListener('click', closeCartModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCartModal();
    });
    
    waCard.addEventListener('click', () => {
      waRadio.checked = true;
      waCard.classList.add('active');
      mailCard.classList.remove('active');
    });
    
    mailCard.addEventListener('click', () => {
      mailRadio.checked = true;
      mailCard.classList.add('active');
      waCard.classList.remove('active');
    });
    
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitBookingRequest();
    });
  }

  function openCartModal() {
    ensureCartModalMarkup();
    renderCartItems();
    
    const modal = document.getElementById('cartModal');
    modal.style.display = 'flex';
    // Forza il reflow affinché il browser registri il display: flex prima di applicare l'animazione di scivolamento
    modal.offsetHeight; 
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCartModal() {
    const modal = document.getElementById('cartModal');
    if (modal) {
      modal.classList.remove('open');
      // Attende il completamento della transizione CSS laterale prima di nascondere l'elemento
      setTimeout(() => {
        if (!modal.classList.contains('open')) {
          modal.style.display = 'none';
        }
      }, 350);
      document.body.style.overflow = '';
    }
  }

  function renderCartItems() {
    const itemsContainer = document.getElementById('cartItemsContainer');
    const totalValEl = document.getElementById('cartTotalVal');
    const formSection = document.getElementById('cartBookingFormSection');
    
    if (cart.length === 0) {
      itemsContainer.innerHTML = `
        <div class="empty-cart-message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <p>Il tuo carrello prenota-e-ritira è vuoto.<br>Aggiungi articoli dal catalogo per iniziare!</p>
        </div>
      `;
      totalValEl.textContent = formatPrice(0);
      formSection.style.display = 'none';
      return;
    }
    
    formSection.style.display = 'block';
    
    let totalSum = 0;
    
    itemsContainer.innerHTML = cart.map((item, idx) => {
      const priceVal = parsePrice(item.price) || 0;
      const subtotal = priceVal * item.quantity;
      totalSum += subtotal;
      
      const imgHtml = item.image ? `<img src="${resolveImagePath(item.image)}" alt="${escapeHtml(item.name)}">` : iconSvg();
      const variantText = item.variant ? `<div class="cart-item-variant">Opzione: ${escapeHtml(item.variant)}</div>` : '';
      
      return `
        <div class="cart-item-row" data-id="${item.cartItemId}">
          <div class="cart-item-img">
            ${imgHtml}
          </div>
          <div class="cart-item-info">
            <div class="cart-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
            ${variantText}
            <div class="cart-item-price">${formatPrice(item.price)} cad.</div>
          </div>
          <div class="cart-item-actions">
            <div class="cart-qty-ctrl">
              <button class="cart-qty-dec" type="button">-</button>
              <input type="text" class="cart-qty-val" value="${item.quantity}" readonly>
              <button class="cart-qty-inc" type="button">+</button>
            </div>
            <button class="cart-remove-btn" type="button" aria-label="Rimuovi articolo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    totalValEl.textContent = formatPrice(totalSum);
    
    itemsContainer.querySelectorAll('.cart-item-row').forEach(row => {
      const cartItemId = row.getAttribute('data-id');
      const decBtn = row.querySelector('.cart-qty-dec');
      const incBtn = row.querySelector('.cart-qty-inc');
      const removeBtn = row.querySelector('.cart-remove-btn');
      
      decBtn.addEventListener('click', () => {
        updateItemQty(cartItemId, -1);
      });
      incBtn.addEventListener('click', () => {
        updateItemQty(cartItemId, 1);
      });
      removeBtn.addEventListener('click', () => {
        removeCartItem(cartItemId);
      });
    });
  }

  function updateItemQty(cartItemId, diff) {
    const itemIndex = cart.findIndex(item => item.cartItemId === cartItemId);
    if (itemIndex > -1) {
      cart[itemIndex].quantity += diff;
      if (cart[itemIndex].quantity <= 0) {
        cart.splice(itemIndex, 1);
      }
      saveCart();
      renderCartItems();
    }
  }

  function removeCartItem(cartItemId) {
    cart = cart.filter(item => item.cartItemId !== cartItemId);
    saveCart();
    renderCartItems();
  }

  function submitBookingRequest() {
    const name = document.getElementById('cartClientName').value.trim();
    const surname = document.getElementById('cartClientSurname').value.trim();
    const phoneOrEmail = document.getElementById('cartClientPhone').value.trim();
    const method = document.querySelector('input[name="contact_method"]:checked').value;
    
    if (!name || !surname || !phoneOrEmail) {
      alert("Per favore, compila tutti i campi richiesti.");
      return;
    }
    
    let itemsText = "";
    let totalSum = 0;
    
    cart.forEach(item => {
      const priceVal = parsePrice(item.price) || 0;
      const subtotal = priceVal * item.quantity;
      totalSum += subtotal;
      
      const variantText = item.variant ? ` (Opzione: ${item.variant})` : '';
      itemsText += `- ${item.quantity}x ${item.name}${variantText} [Codice: ${item.code}] - ${formatPrice(item.price)} cad.\n`;
    });
    
    const formattedTotal = formatPrice(totalSum);
    const clientNameFull = name + " " + surname;
    
    let emailSubject = `Richiesta Ordinazione con Ritiro - ${clientNameFull}`;
    let messageBody = `Salve Ferramenta Ballini,\n\nVorrei effettuare un'ordinazione con ritiro in negozio per i seguenti prodotti:\n\nDATI CLIENTE:\n- Nome e Cognome: ${clientNameFull}\n- Recapito: ${phoneOrEmail}\n\nELENCO PRODOTTI PRENOTATI:\n${itemsText}\nTOTALE PRENOTAZIONE: ${formattedTotal} (da saldare al ritiro)\n\nVi chiedo gentilmente di verificare la disponibilità dei prodotti in negozio (Via Armando Diaz, 301 - Fiuggi) e metterli da parte a mio nome. Attendo vostra gentile conferma via WhatsApp o e-mail.\n\nGrazie, cordiali saluti.`;

    if (method === 'whatsapp') {
      const encodedMsg = encodeURIComponent(messageBody);
      window.open(`https://wa.me/393388994200?text=${encodedMsg}`, '_blank');
    } else {
      const encodedSubject = encodeURIComponent(emailSubject);
      const encodedBody = encodeURIComponent(messageBody);
      window.open(`mailto:balliniluiginofiuggi@libero.it?subject=${encodedSubject}&body=${encodedBody}`, '_blank');
    }
    
    cart = [];
    saveCart();
    closeCartModal();
    
    alert(`Grazie ${clientNameFull}! La tua richiesta è stata preparata ed è pronta per l'invio. Verifica che l'applicazione si sia aperta ed invia il messaggio per completare la procedura.`);
  }

  /* ---------- Caricamento prodotti da file .json esterno ---------- */
  if (grid) {
    grid.innerHTML = `<div class="catalog-empty">Caricamento prodotti...</div>`;
    
    // Modifica qui: aggiungiamo ?v=timestamp per eludere la cache
    fetch(cfg.productsUrl + '?v=' + new Date().getTime())
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        products = sortBySubcategory(data.map((p, i) => Object.assign({ id: 'p' + i }, p)), cfg.subcategories);
        applyFilters();
        loadCart(); // Carica lo stato iniziale del carrello
      })
      .catch(err => {
        console.error('Impossibile caricare i prodotti:', err);
        grid.innerHTML = `<div class="catalog-empty">Impossibile caricare i prodotti in questo momento. Riprova più tardi.</div>`;
        if (countEl) countEl.innerHTML = '';
      });
  }
})();
