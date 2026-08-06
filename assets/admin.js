/* ============================================================
   FERRAMENTA BALLINI — Logica area di gestione
   Attenzione: la password qui sotto è un semplice filtro lato client,
   utile solo per scoraggiare visitatori occasionali. Non è una vera
   misura di sicurezza: chiunque legga il codice sorgente la trova.
   Per un controllo accessi reale serve un backend con autenticazione.
   ============================================================ */
(function(){
  const ADMIN_PASSWORD = '$$'; // <-- cambia questa password

  const gate        = document.getElementById('gate');
  const gateForm     = document.getElementById('gateForm');
  const gateInput    = document.getElementById('gatePassword');
  const gateError    = document.getElementById('gateError');
  const adminShell   = document.getElementById('adminShell');

  gateForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (gateInput.value === ADMIN_PASSWORD){
      gate.classList.add('admin-hidden');
      adminShell.classList.remove('admin-hidden');
      initAdmin();
    } else {
      gateError.classList.add('show');
    }
  });

  function initAdmin(){
    const STORAGE_KEY = 'fb_admin_departments_v1';

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

    function loadDepartments(){
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved){
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch (err) {
        console.warn('Impossibile leggere i dati salvati, uso i valori di default.', err);
      }
      return JSON.parse(JSON.stringify(window.ADMIN_DEPARTMENTS || []));
    }

    let departments = loadDepartments().map(d => ({
      ...d,
      products: sortBySubcategory(d.products.map((p, i) => Object.assign({ id: 'p' + i }, p)), d.subcategories)
    }));
    let nextIdByDept = {};
    departments.forEach(d => { nextIdByDept[d.slug] = d.products.length; });

    function persist(){
      try {
        const clean = departments.map(d => ({
          ...d,
          products: d.products.map(({ id, ...rest }) => rest)
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      } catch (err) {
        console.warn('Impossibile salvare le modifiche nel browser.', err);
        showToast('Attenzione: le modifiche non sono state salvate (spazio di archiviazione pieno o non disponibile).');
      }
    }

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
    const resetDataBtn = document.getElementById('resetDataBtn');

    const AVAILABILITY_LABELS = { 'disponibile':'Disponibile', 'in-arrivo':'In arrivo', 'esaurito':'Esaurito', 'contattare-negozio':'Contattare negozio' };

    deptSelect.innerHTML = departments.map(d => `<option value="${d.slug}">${d.title}</option>`).join('');
    let currentSlug = departments[0].slug;
    let pendingImage = null;
    let editingId = null;

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
            <div class="product-cat">${escapeHtml(p.category)}</div>
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
      countEl.innerHTML = `<strong>${dept.products.length}</strong> prodotti in "${dept.title}"`;
      if (!dept.products.length){
        grid.innerHTML = `<div class="catalog-empty">Nessun prodotto in questo reparto. Aggiungine uno con il pulsante qui sopra.</div>`;
        return;
      }
      grid.innerHTML = dept.products.map(p => renderCard(p, dept)).join('');

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

    function switchDepartment(slug){
      currentSlug = slug;
      refreshCategoryOptions();
      renderGrid();
      exportTextarea.value = '';
    }

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
      editingId = null;
      refreshCategoryOptions();
      previewBox.innerHTML = iconSvg(currentDept());
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
      persist();
      renderGrid();
      showToast('Prodotto eliminato.');
    }

    function showToast(msg){
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2600);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dept = currentDept();
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
        Object.assign(p, { name, category, price, availability, image: pendingImage, variants });
        showToast('Prodotto aggiornato.');
      } else {
        dept.products.unshift({
          id: 'p' + (nextIdByDept[dept.slug]++),
          name, category, price, availability, image: pendingImage, variants
        });
        showToast('Prodotto aggiunto.');
      }
      dept.products = sortBySubcategory(dept.products, dept.subcategories);
      persist();
      closeModal();
      renderGrid();
    });

    exportBtn.addEventListener('click', () => {
      const dept = currentDept();
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
    });

    resetDataBtn.addEventListener('click', () => {
      if (!confirm('Ripristinare tutti i reparti ai prodotti di esempio? Le modifiche salvate andranno perse.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      departments = JSON.parse(JSON.stringify(window.ADMIN_DEPARTMENTS || [])).map(d => ({
        ...d,
        products: sortBySubcategory(d.products.map((p, i) => Object.assign({ id: 'p' + i }, p)), d.subcategories)
      }));
      nextIdByDept = {};
      departments.forEach(d => { nextIdByDept[d.slug] = d.products.length; });
      deptSelect.innerHTML = departments.map(d => `<option value="${d.slug}">${d.title}</option>`).join('');
      switchDepartment(departments[0].slug);
      showToast('Dati ripristinati ai valori di default.');
    });

    switchDepartment(currentSlug);
  }
})();
