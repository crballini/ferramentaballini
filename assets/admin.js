/* ============================================================
   FERRAMENTA BALLINI — Logica area di gestione
   Questa pagina non è collegata dal menu del sito (meta robots noindex,
   nofollow) ma non richiede più una password per accedere: chi conosce
   l'URL può vedere e modificare l'inventario. Se in futuro serve un
   controllo accessi reale, va aggiunto un backend con autenticazione:
   una password lato client, come quella rimossa da qui, era comunque
   visibile a chiunque leggesse il codice sorgente e non proteggeva nulla.

   I prodotti NON sono più salvati nel browser (localStorage): questa
   pagina legge sempre i file assets/data/prodotti-<reparto>.json, cioè
   gli stessi file che alimentano il sito pubblico. Le modifiche fatte
   qui restano solo in memoria finché non usi "Esporta reparto" per
   scaricarle e caricarle su GitHub: se ricarichi la pagina o cambi
   reparto prima di esportare, quelle modifiche si perdono.
   ============================================================ */
(function(){

  function initAdmin(){

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

    // Solo configurazione (titolo, icona, sottocategorie, url del json):
    // i prodotti vengono caricati al volo, reparto per reparto, con fetch().
    const departments = (window.ADMIN_DEPARTMENTS || []).map(d => ({
      ...d,
      products: null,   // null = non ancora caricato da file
      loadError: null,
      dirty: false       // true = ci sono modifiche non esportate
    }));
    const nextIdByDept = {};

    const deptSelect   = document.getElementById('deptSelect');
    const grid         = document.getElementById('adminGrid');
    const countEl      = document.getElementById('adminCount');
    const categorySelect = document.getElementById('productCategorySelect');
    const modal        = document.getElementById('productModal');
    const modalTitle   = document.getElementById('modalTitle');
    const openAddBtn   = document.getElementById('openAddProduct');
    const closeModalBtn= document.getElementById('closeModal');
    const cancelBtn    = document.getElementById('cancelModal');
    const form         = document.getElementById('productForm');
    const fileInput    = document.getElementById('productImageInput');
    const previewBox   = document.getElementById('imagePreview');
    const hasVariantsCheckbox = document.getElementById('hasVariantsCheckbox');
    const variantFields = document.getElementById('variantFields');
    const variantLabelInput = document.getElementById('variantLabelInput');
    const variantOptionsInput = document.getElementById('variantOptionsInput');
    const priceField = document.getElementById('priceField');
    const priceInput = document.getElementById('productPriceInput');
    const toast        = document.getElementById('toast');
    const exportTextarea = document.getElementById('exportTextarea');
    const exportBtn    = document.getElementById('exportBtn');
    const copyBtn      = document.getElementById('copyExportBtn');
    const downloadBtn  = document.getElementById('downloadExportBtn');
    const reloadDeptBtn = document.getElementById('resetDataBtn');
    const searchInput  = document.getElementById('adminSearchInput');

    const AVAILABILITY_LABELS = { 'disponibile':'Disponibile', 'in-arrivo':'In arrivo', 'esaurito':'Esaurito', 'contattare-negozio':'Contattare negozio' };

    // Codice prodotto: <REPARTO>-<SOTTOCATEGORIA>-<progressivo>, es. ED-LAV-001.
    // Tenere sincronizzati con le mappe usate per generare i codici già presenti
    // nei file assets/data/prodotti-*.json.
    const DEPT_CODES = {
      'utensili-manuali': 'UM',
      'elettroutensili': 'EU',
      'elettricita': 'EL',
      'idraulica': 'ID',
      'edilizia-ferramenta': 'EF',
      'elettrodomestici': 'ED',
      'vernici-colori': 'VC',
      'vario': 'VA'
    };
    const SUBCAT_CODES = {
      'utensili-manuali': { 'Chiavi':'CHI', 'Cacciaviti e bit':'CAC', 'Pinze e tronchesi':'PIN', 'Martelli e mazze':'MAR', 'Metri e livelle':'MET', 'Taglio':'TAG', 'Set e valigette':'SET', 'Altro':'ALT' },
      'elettroutensili': { 'Trapani e avvitatori':'TRA', 'Seghe':'SEG', 'Levigatrici':'LEV', 'Smerigliatrici':'SME', 'Batterie e caricabatterie':'BAT', 'Accessori':'ACC', 'Altro':'ALT' },
      'elettricita': { 'Cavi e prolunghe':'CAV', 'Prese e interruttori':'PRE', 'Illuminazione':'ILL', 'Multiprese':'MUL', 'Fusibili e quadri':'FUS', 'Torce e pile':'TOR', 'Altro':'ALT' },
      'idraulica': { 'Tubi e raccordi':'TUB', 'Rubinetteria':'RUB', 'Sifoni e scarichi':'SIF', 'Guarnizioni':'GUA', 'Pompe':'POM', 'Teflon e sigillanti':'TEF', 'Press control':'PRC', 'Accessori doccia':'DOC', 'Altro':'ALT' },
      'edilizia-ferramenta': { 'Viti e bulloneria':'VIT', 'Tasselli e ancoraggi':'TAS', 'Cemento e malte':'CEM', 'Ferramenta varia':'FER', 'Catene e corde':'CAT', 'Lucchetti e serrature':'LUC', 'Scarpe':'SCA', 'Altro':'ALT' },
      'elettrodomestici': { 'Frigoriferi e congelatori':'FRI', 'Lavatrici e asciugatrici':'LAV', 'Lavastoviglie':'LVS', 'Cucine':'CUC', 'Televisori':'TEL', 'Piccoli elettrodomestici':'PIC', 'Elettrodomestici da incasso':'INC', 'Climatizzazione':'CLI', 'Riscaldamento':'RIS', 'Ricambi e accessori':'RIC', 'Cura della persona':'CUR', 'Altro':'ALT' },
      'vernici-colori': { 'Pitture murali':'PIT', 'Smalti e vernici legno':'SML', 'Pennelli e rulli':'PEN', 'Solventi e diluenti':'SOL', 'Nastri e teli protettivi':'NAS', 'Stucchi e decorazioni':'STU', 'Tinte decorative':'TIN', 'Vernici speciali':'VRS', 'Altro':'ALT' },
      'vario': { 'Articoli per la casa':'CAS', 'Contenitori e organizzazione':'CON', 'Cancelleria e ufficio':'CAN', 'Pulizia':'PUL', 'Articoli stagionali':'STA', 'Giardinaggio':'GIA', 'Altro':'ALT' }
    };

    function generateCode(dept, category){
      const deptCode = DEPT_CODES[dept.slug] || dept.slug.slice(0, 2).toUpperCase();
      const subCode = (SUBCAT_CODES[dept.slug] && SUBCAT_CODES[dept.slug][category]) || 'ALT';
      const prefix = `${deptCode}-${subCode}-`;
      let max = 0;
      dept.products.forEach(p => {
        if (p.code && p.code.startsWith(prefix)){
          const n = parseInt(p.code.slice(prefix.length), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      return prefix + String(max + 1).padStart(3, '0');
    }

    if (!departments.length){
      grid.innerHTML = `<div class="catalog-empty">Nessun reparto configurato in admin-data.js.</div>`;
      return;
    }

    deptSelect.innerHTML = departments.map(d => `<option value="${d.slug}">${d.title}</option>`).join('');
    let currentSlug = departments[0].slug;
    let pendingImage = null;
    let editingId = null;
    let loadToken = 0; // evita che una fetch lenta sovrascriva un reparto aperto dopo

    function currentDept(){ return departments.find(d => d.slug === currentSlug); }

    function escapeHtml(str){
      return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }

    function iconSvg(dept){
      return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${dept.icon}</svg>`;
    }

    function formatPrice(price){
      const raw = String(price).trim();
      if (/^\d+([.,]\d+)?$/.test(raw)){
        return `€ ${Number(raw.replace(',', '.')).toFixed(2).replace('.', ',')}`;
      }
      return raw;
    }

    // Carica (o ricarica) i prodotti di un reparto da assets/data/prodotti-<slug>.json.
    // force=true ignora la cache in memoria e rilegge sempre il file dal server.
    async function loadDeptProducts(dept, { force = false } = {}){
      if (dept.products !== null && !force) return;
      const myToken = ++loadToken;
      dept.loadError = null;
      if (dept.slug === currentSlug) renderGrid(); // mostra lo stato "caricamento..."
      try {
        const res = await fetch(dept.productsUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = await res.json();
        if (myToken !== loadToken) return; // nel frattempo è partita una richiesta più recente
        dept.products = sortBySubcategory(
          raw.map((p, i) => Object.assign({ id: 'p' + i }, p)),
          dept.subcategories
        );
        nextIdByDept[dept.slug] = dept.products.length;
        dept.dirty = false;
      } catch (err) {
        if (myToken !== loadToken) return;
        console.error('Impossibile caricare ' + dept.productsUrl, err);
        dept.products = [];
        dept.loadError = 'Impossibile caricare i prodotti di questo reparto da ' + dept.productsUrl + '. '
          + 'Verifica di aver avviato il sito con un server locale (es. "python3 -m http.server 8000" '
          + 'dalla cartella del sito, non aprendo il file direttamente) e che il file esista in assets/data/.';
      }
      if (dept.slug === currentSlug) renderGrid();
    }

    function renderCard(p, dept){
      const availLabel = AVAILABILITY_LABELS[p.availability] || p.availability;
      const imageHtml = p.image ? `<img src="${p.image}" alt="${escapeHtml(p.name)}">` : iconSvg(dept);
      const variantHtml = (p.variants && p.variants.options && p.variants.options.length)
        ? `<div class="product-variant"><label>${escapeHtml(p.variants.label)}</label><select class="variant-select">${p.variants.options.map(o => `<option value="${escapeHtml(o.price)}">${escapeHtml(o.value)}</option>`).join('')}</select></div>`
        : '';
      return `
        <div class="product-card is-admin" data-id="${p.id}">
          <div class="product-image">
            <span class="availability" data-status="${p.availability}"><span class="dot"></span>${availLabel}</span>
            ${imageHtml}
          </div>
          <div class="product-body">
            <div class="product-cat">${escapeHtml(p.category)}${p.code ? ' · ' + escapeHtml(p.code) : ''}</div>
            <div class="product-name">${escapeHtml(p.name)}</div>
            ${variantHtml}
            <div class="product-price">${formatPrice(p.price)}</div>
          </div>
          <div class="card-actions">
            <button type="button" class="edit-btn" data-id="${p.id}">Modifica</button>
            <button type="button" class="danger delete-btn" data-id="${p.id}">Elimina</button>
          </div>
        </div>
      `;
    }

    function renderGrid(){
      const dept = currentDept();

      if (dept.products === null){
        countEl.innerHTML = '';
        grid.innerHTML = `<div class="catalog-empty">Caricamento prodotti da ${escapeHtml(dept.productsUrl)}…</div>`;
        return;
      }
      if (dept.loadError){
        countEl.innerHTML = '';
        grid.innerHTML = `<div class="catalog-empty">${escapeHtml(dept.loadError)}</div>`;
        return;
      }

      const query = (searchInput.value || '').trim().toLowerCase();
      const list = query
        ? dept.products.filter(p => p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query)))
        : dept.products;

      countEl.innerHTML = (query
          ? `<strong>${list.length}</strong> risultati per "${escapeHtml(searchInput.value.trim())}" su ${dept.products.length} prodotti in "${dept.title}"`
          : `<strong>${dept.products.length}</strong> prodotti in "${dept.title}"`)
        + (dept.dirty ? ' — <strong>modifiche non esportate</strong>' : '');
      if (!list.length){
        grid.innerHTML = `<div class="catalog-empty">${query ? 'Nessun prodotto corrisponde alla ricerca.' : 'Nessun prodotto in questo reparto. Aggiungine uno con il pulsante qui sopra.'}</div>`;
        return;
      }
      grid.innerHTML = list.map(p => renderCard(p, dept)).join('');

      grid.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
      grid.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
      grid.querySelectorAll('.product-card').forEach(card => {
        const select = card.querySelector('.variant-select');
        if (select){
          select.addEventListener('change', () => {
            card.querySelector('.product-price').textContent = formatPrice(select.value);
          });
        }
      });
    }

    function refreshCategoryOptions(){
      const dept = currentDept();
      categorySelect.innerHTML = dept.subcategories.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    }

    async function switchDepartment(slug){
      currentSlug = slug;
      refreshCategoryOptions();
      exportTextarea.value = '';
      searchInput.value = '';
      const dept = currentDept();
      renderGrid();
      await loadDeptProducts(dept);
    }

    searchInput.addEventListener('input', renderGrid);

    deptSelect.addEventListener('change', () => switchDepartment(deptSelect.value));

    function openModal(title){
      modalTitle.textContent = title;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    function closeModal(){
      modal.classList.remove('open');
      document.body.style.overflow = '';
      form.reset();
      pendingImage = null;
      editingId = null;
      previewBox.innerHTML = iconSvg(currentDept());
      variantFields.classList.remove('open');
      priceField.classList.remove('admin-hidden');
      priceInput.required = true;
    }

    hasVariantsCheckbox.addEventListener('change', () => {
      variantFields.classList.toggle('open', hasVariantsCheckbox.checked);
      priceField.classList.toggle('admin-hidden', hasVariantsCheckbox.checked);
      priceInput.required = !hasVariantsCheckbox.checked;
    });

    openAddBtn.addEventListener('click', () => {
      const dept = currentDept();
      if (!dept.products){
        showToast('Attendi il caricamento dei prodotti del reparto prima di aggiungerne uno.');
        return;
      }
      editingId = null;
      refreshCategoryOptions();
      previewBox.innerHTML = iconSvg(dept);
      hasVariantsCheckbox.checked = false;
      variantFields.classList.remove('open');
      priceField.classList.remove('admin-hidden');
      priceInput.required = true;
      openModal('Aggiungi prodotto');
    });
    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        pendingImage = e.target.result;
        previewBox.innerHTML = `<img src="${pendingImage}" alt="Anteprima prodotto">`;
      };
      reader.readAsDataURL(file);
    });

    function openEdit(id){
      const dept = currentDept();
      const p = dept.products.find(x => x.id === id);
      if (!p) return;
      editingId = id;
      refreshCategoryOptions();
      document.getElementById('productNameInput').value = p.name;
      document.getElementById('productPriceInput').value = p.price;
      document.getElementById('productAvailabilitySelect').value = p.availability;
      categorySelect.value = p.category;
      pendingImage = p.image || null;
      previewBox.innerHTML = p.image ? `<img src="${p.image}" alt="Anteprima prodotto">` : iconSvg(dept);
      if (p.variants && p.variants.options && p.variants.options.length){
        hasVariantsCheckbox.checked = true;
        variantFields.classList.add('open');
        priceField.classList.add('admin-hidden');
        priceInput.required = false;
        variantLabelInput.value = p.variants.label || '';
        variantOptionsInput.value = p.variants.options.map(o => `${o.value} - ${o.price}`).join('\n');
      } else {
        hasVariantsCheckbox.checked = false;
        variantFields.classList.remove('open');
        priceField.classList.remove('admin-hidden');
        priceInput.required = true;
      }
      openModal('Modifica prodotto');
    }

    function deleteProduct(id){
      const dept = currentDept();
      if (!confirm('Eliminare questo prodotto dal reparto?')) return;
      dept.products = dept.products.filter(p => p.id !== id);
      dept.dirty = true;
      renderGrid();
      showToast('Prodotto eliminato. Ricorda di esportare il reparto per rendere permanente la modifica.');
    }

    function showToast(msg){
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2600);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dept = currentDept();
      if (!dept.products) return;
      const name = document.getElementById('productNameInput').value.trim();
      const category = categorySelect.value;
      const availability = document.getElementById('productAvailabilitySelect').value;
      if (!name) return;

      let variants = null;
      let price = document.getElementById('productPriceInput').value.trim();

      if (hasVariantsCheckbox.checked){
        const label = variantLabelInput.value.trim();
        const options = variantOptionsInput.value.split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .map(line => {
            const idx = line.lastIndexOf(' - ');
            if (idx === -1) return null;
            const value = line.slice(0, idx).trim();
            const optPrice = line.slice(idx + 3).trim();
            return (value && optPrice) ? { value, price: optPrice } : null;
          })
          .filter(Boolean);
        if (!label || !options.length){
          showToast('Inserisci il nome della variante e almeno un\'opzione nel formato "valore - prezzo".');
          return;
        }
        variants = { label, options };
        price = options[0].price;
      } else if (!price){
        return;
      }

      if (editingId){
        const p = dept.products.find(x => x.id === editingId);
        const categoryChanged = p.category !== category;
        Object.assign(p, { name, category, price, availability, image: pendingImage, variants });
        if (categoryChanged || !p.code) p.code = generateCode(dept, category);
        showToast('Prodotto aggiornato. Ricorda di esportare il reparto per rendere permanente la modifica.');
      } else {
        const newProduct = {
          id: 'p' + (nextIdByDept[dept.slug]++),
          name, category, price, availability, image: pendingImage, variants
        };
        newProduct.code = generateCode(dept, category);
        dept.products.unshift(newProduct);
        showToast('Prodotto aggiunto. Ricorda di esportare il reparto per rendere permanente la modifica.');
      }
      dept.products = sortBySubcategory(dept.products, dept.subcategories);
      dept.dirty = true;
      closeModal();
      renderGrid();
    });

    exportBtn.addEventListener('click', () => {
      const dept = currentDept();
      if (!dept.products) return;
      const clean = dept.products.map(({ id, ...rest }) => rest);
      exportTextarea.value = JSON.stringify(clean, null, 2);
    });

    copyBtn.addEventListener('click', async () => {
      if (!exportTextarea.value) return;
      try {
        await navigator.clipboard.writeText(exportTextarea.value);
        showToast('Codice copiato negli appunti.');
      } catch (err) {
        exportTextarea.select();
        document.execCommand('copy');
        showToast('Codice copiato negli appunti.');
      }
      currentDept().dirty = false;
      renderGrid();
    });

    downloadBtn.addEventListener('click', () => {
      const dept = currentDept();
      if (!exportTextarea.value) return;
      const blob = new Blob([exportTextarea.value], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prodotti-${dept.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
      dept.dirty = false;
      renderGrid();
    });

    reloadDeptBtn.addEventListener('click', () => {
      const dept = currentDept();
      if (dept.dirty && !confirm('Questo reparto ha modifiche non esportate: ricaricando il file .json le perderai. Continuare?')) return;
      loadDeptProducts(dept, { force: true });
      showToast('Ricarico i prodotti dal file aggiornato…');
    });

    switchDepartment(currentSlug);
  }

  initAdmin();
})();
