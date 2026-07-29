/* ============================================================
   FERRAMENTA BALLINI — Catalogo di reparto (versione pubblica, sola lettura)
   Richiede che la pagina definisca window.CATALOG_CONFIG prima
   di includere questo file:
   {
     categoryIcon: '<svg ...>...</svg>',   // placeholder immagine
     subcategories: ['Nome A', 'Nome B', ...],
     products: [
       { name, category, price, availability, image: null }
     ]
   }
   La gestione dell'inventario (aggiunta/modifica/eliminazione prodotti)
   avviene esclusivamente da area-gestione.html, non da questa pagina.
   ============================================================ */
(function(){
  const cfg = window.CATALOG_CONFIG || { subcategories:[], products:[], categoryIcon:'' };

  function sortBySubcategory(list, subcategories){
    return list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        let oa = subcategories.indexOf(a.p.category); if (oa === -1) oa = subcategories.length;
        let ob = subcategories.indexOf(b.p.category); if (ob === -1) ob = subcategories.length;
        return oa !== ob ? oa - ob : a.i - b.i;
      })
      .map(x => x.p);
  }

  const products = sortBySubcategory(cfg.products.map((p, i) => Object.assign({ id: 'p' + i }, p)), cfg.subcategories);

  const grid        = document.getElementById('catalogGrid');
  const countEl      = document.getElementById('catalogCount');
  const searchInput  = document.getElementById('searchInput');
  const catList      = document.getElementById('categoryFilters');
  const availList    = document.getElementById('availabilityFilters');
  const priceList    = document.getElementById('priceFilters');
  const resetBtn     = document.getElementById('resetFilters');

  const AVAILABILITY_LABELS = {
    'disponibile': 'Disponibile',
    'in-arrivo':   'In arrivo',
    'esaurito':    'Esaurito',
    'da-ordinare': 'Da ordinare'
  };
  const PRICE_BANDS = [
    { id:'p1', label:'Fino a € 10',   test:(v)=> v <= 10 },
    { id:'p2', label:'€ 10 – € 30',   test:(v)=> v > 10 && v <= 30 },
    { id:'p3', label:'€ 30 – € 60',   test:(v)=> v > 30 && v <= 60 },
    { id:'p4', label:'Oltre € 60',    test:(v)=> v > 60 }
  ];

  function buildCheckboxList(container, items, name){
    container.innerHTML = items.map(item => `
      <label class="filter-option">
        <input type="checkbox" name="${name}" value="${item.value}">
        ${item.label}
      </label>
    `).join('');
  }

  buildCheckboxList(catList, cfg.subcategories.map(s => ({ value: s, label: s })), 'cat');
  buildCheckboxList(availList, Object.entries(AVAILABILITY_LABELS).map(([value, label]) => ({ value, label })), 'avail');
  buildCheckboxList(priceList, PRICE_BANDS.map(b => ({ value: b.id, label: b.label })), 'price');

  function getChecked(name){
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
  }

  function iconSvg(){
    return cfg.categoryIcon || '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="9"/></svg>';
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function renderCard(p){
    const availLabel = AVAILABILITY_LABELS[p.availability] || p.availability;
    const imageHtml = p.image
      ? `<img src="${p.image}" alt="${escapeHtml(p.name)}">`
      : iconSvg();
    return `
      <div class="product-card">
        <div class="product-image">
          <span class="availability" data-status="${p.availability}"><span class="dot"></span>${availLabel}</span>
          ${imageHtml}
        </div>
        <div class="product-body">
          <div class="product-cat">${escapeHtml(p.category)}</div>
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-price">€ ${Number(p.price).toFixed(2).replace('.', ',')}</div>
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
        if (!bands.some(b => b.test(Number(p.price)))) return false;
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
  }

  searchInput.addEventListener('input', applyFilters);
  [catList, availList, priceList].forEach(el => el.addEventListener('change', applyFilters));

  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    document.querySelectorAll('.catalog-sidebar input[type="checkbox"]').forEach(i => i.checked = false);
    applyFilters();
  });

  /* ---------- Header mobile menu (coerenza con la home) ---------- */
  const menuToggle = document.getElementById('menuToggle');
  const header = document.getElementById('siteHeader');
  if (menuToggle && header){
    menuToggle.addEventListener('click', () => header.classList.toggle('open'));
  }

  applyFilters();
})();
