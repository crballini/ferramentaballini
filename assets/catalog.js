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

  // I percorsi "image" dentro i file JSON sono scritti relativi alla radice
  // del sito (es. "assets/img/elettrodomestici/xxx.jpg"). Se questa pagina
  // vive in una sottocartella (es. reparti/reparto-xxx.html), il browser
  // risolverebbe quel percorso in modo sbagliato. Calcoliamo il prefisso
  // corretto a partire da productsUrl, che è già configurato correttamente
  // per ogni pagina.
  const basePrefix = (cfg.productsUrl || '').replace(/assets\/data\/.*$/, '');

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
  const availList = document.getElementById('availabilityFilters');
  const priceList = document.getElementById('priceFilters');
  const resetBtn = document.getElementById('resetFilters');

  const AVAILABILITY_LABELS = {
    'disponibile': 'Disponibile',
    'in-arrivo': 'In arrivo',
    'esaurito': 'Esaurito',
    'contattare-negozio': 'Contattare negozio'
  };

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
  if (availList) buildCheckboxList(availList, Object.entries(AVAILABILITY_LABELS).map(([value, label]) => ({ value, label })), 'avail');
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
    const availLabel = AVAILABILITY_LABELS[p.availability] || p.availability;
    const imageHtml = p.image ? `<img src="${basePrefix}${p.image}" alt="${escapeHtml(p.name)}">` : iconSvg();
    const variantHtml = (p.variants && p.variants.options && p.variants.options.length) ? `<div class="product-variant"><label>${escapeHtml(p.variants.label)}</label><select class="variant-select">${p.variants.options.map(o => `<option value="${escapeHtml(o.price)}">${escapeHtml(o.value)}</option>`).join('')}</select></div>` : '';
    const initialPrice = (p.variants && p.variants.options && p.variants.options.length) ? p.variants.options[0].price : p.price;
    
    return `
      <div class="product-card" data-id="${p.id}" style="cursor: pointer;">
        <div class="product-image">
          <span class="availability" data-status="${p.availability}"><span class="dot"></span>${availLabel}</span>
          ${imageHtml}
        </div>
        <div class="product-body">
          <div class="product-cat">${escapeHtml(p.category)}</div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          ${variantHtml}
          <div class="product-price">${formatPrice(initialPrice)}</div>
        </div>
      </div>
    `;
  }

  function applyFilters(){
    const q = (searchInput.value || '').trim().toLowerCase();
    const cats = getChecked('cat');
    const avails = getChecked('avail');
    const priceIds = getChecked('price');

    const filtered = products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (cats.length && !cats.includes(p.category)) return false;
      if (avails.length && !avails.includes(p.availability)) return false;
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
      if (select){
        select.addEventListener('change', (e) => {
          e.stopPropagation(); // Evita di aprire la modale quando si cambia variante sulla scheda
          card.querySelector('.product-price').textContent = formatPrice(select.value);
        });
      }
      
      // Apertura modale dettagli al click sulla card
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('.variant-select')) return;
        
        const pId = card.getAttribute('data-id');
        const product = list.find(prod => prod.id === pId);
        if (product) {
          openProductDetailModal(product);
        }
      });
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  [catList, availList, priceList].forEach(el => {
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
                <span class="availability" id="modalDetailAvail" data-status=""></span>
              </div>
              <div class="modal-detail-desc" id="modalDetailDesc"></div>
              <div class="modal-detail-variants" id="modalDetailVariants"></div>
              <a class="btn modal-detail-btn" id="modalDetailContactBtn" href="#">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                Chiedi informazioni
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
    const modal = document.getElementById('productDetailModal');
    
    // Informazioni base
    document.getElementById('modalDetailCat').textContent = p.category;
    document.getElementById('modalDetailTitle').textContent = p.name;
    
    // Disponibilità
    const availEl = document.getElementById('modalDetailAvail');
    availEl.textContent = AVAILABILITY_LABELS[p.availability] || p.availability;
    availEl.setAttribute('data-status', p.availability);
    
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
          <img src="${basePrefix}${img}" alt="Miniatura">
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
    const src = basePrefix + modalImages[currentImgIndex];
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
      })
      .catch(err => {
        console.error('Impossibile caricare i prodotti:', err);
        grid.innerHTML = `<div class="catalog-empty">Impossibile caricare i prodotti in questo momento. Riprova più tardi.</div>`;
        if (countEl) countEl.innerHTML = '';
      });
  }
})();
