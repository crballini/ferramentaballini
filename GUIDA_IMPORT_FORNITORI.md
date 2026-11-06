# Guida: Importazione automatica prodotti da fornitori → Excel

> **Come usare questa guida:** dai questo file intero a Copilot/agente AI in VS Code come
> primo messaggio, poi procedi **una sezione alla volta** (non tutte insieme). Ogni sezione
> è un blocco di lavoro autosufficiente e verificabile. Non far leggere all'agente l'intero
> `aggiorna_catalogo.py` se non serve: nella Sezione 4 gli servono solo i nomi delle funzioni
> da riusare, non l'implementazione — questo risparmia contesto/token.

## 0. Obiettivo (non negoziabile)

Un sistema che:
1. Accede al sito di un fornitore (login incluso) ed apre la pagina **ordini effettuati**.
2. Per ogni prodotto trovato negli ordini, estrae: **nome, URL immagine (una o più),
   varianti (se presenti), categoria grezza del fornitore**.
3. Fa riconoscere a un modello AI la **sottocategoria Ballini** corretta (le tue, non quelle
   del fornitore — non coincidono quasi mai).
4. Scrive una **riga bozza senza prezzo** nel foglio del reparto giusto di
   `catalogo_template.xlsx`, evitando duplicati.
5. Il prezzo lo aggiungi tu a mano in Excel; l'`import_excel_to_json.py` esistente fa il resto
   (già gestisce righe senza prezzo come bozze — vedi `load_existing_draft_rows`).
6. È **estendibile**: aggiungere un nuovo fornitore = un solo file nuovo, zero modifiche al
   resto del sistema.

Non è "solo uno script Python": è due parti che collaborano — **scraper deterministico** (login,
navigazione, estrazione HTML) + **classificatore AI** (mappatura categoria libera → tua tassonomia
fissa). Vanno tenuti separati: lo scraper non deve mai "indovinare", il classificatore non deve
mai fare scraping.

---

## 1. Struttura cartelle (crea questa, non improvvisare varianti)

```
import_fornitori/
├── config/
│   ├── fornitori.json          # registro fornitori attivi (vedi §2)
│   └── credenziali.env.example # template, MAI committare .env reale
├── adapters/
│   ├── __init__.py
│   ├── base.py                 # classe astratta SupplierAdapter (vedi §3)
│   ├── dfl.py                  # implementazione DFL
│   └── globale_trade.py        # implementazione Globale Trade
├── core/
│   ├── __init__.py
│   ├── categorizer.py          # classificazione AI → sottocategoria Ballini (§5)
│   ├── excel_writer.py         # scrittura righe bozza in catalogo_template.xlsx (§6)
│   └── dedup.py                # evita di reimportare lo stesso prodotto (§6)
├── cache/                      # JSON grezzi scaricati, per non ri-scrapare (gitignored)
├── importa.py                  # entrypoint CLI (§7)
└── requirements.txt
```

Aggiungi a `.gitignore` (accanto a quelle già presenti):
```
import_fornitori/config/credenziali.env
import_fornitori/cache/
```

**Perché questa struttura:** un fornitore nuovo = un file in `adapters/`. Il resto (Excel,
categorizzazione, dedup) è condiviso e non si tocca mai. Questo è il punto che rende il
sistema "estendibile in caso ci deve essere la possibilità di aggiungere altri siti".

---

## 2. Registro fornitori — `config/fornitori.json`

```json
{
  "dfl": {
    "adapter": "dfl",
    "login_url": "https://.../login",
    "orders_url": "https://.../ordini",
    "auth_method": "form_login",
    "requires_js": true
  },
  "globale_trade": {
    "adapter": "globale_trade",
    "login_url": "https://.../login",
    "orders_url": "https://.../storico-ordini",
    "auth_method": "form_login",
    "requires_js": true
  }
}
```

Ogni nuovo fornitore aggiunge una voce qui + un file adapter. **Nessun'altra modifica.**

---

## 3. Contratto adapter — `adapters/base.py`

Ogni fornitore deve rispettare esattamente questa interfaccia. Definiscila **prima** di scrivere
qualsiasi adapter concreto, così l'agente non re-inventa la forma dei dati ad ogni fornitore.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

@dataclass
class RawProduct:
    supplier_id: str          # es. "dfl"
    supplier_sku: str         # codice/riferimento del fornitore (per dedup)
    name: str
    supplier_category: str    # categoria COSÌ COM'È sul sito fornitore, non tradotta
    image_urls: list[str] = field(default_factory=list)
    variants_raw: str = ""    # testo libero, es. "Colore: Rosso, Blu | Taglia: M, L"
    order_date: str = ""      # utile per capire cosa è nuovo

class SupplierAdapter(ABC):
    def __init__(self, config: dict, credentials: dict): ...

    @abstractmethod
    def login(self) -> None:
        """Autentica la sessione. Deve sollevare AuthError se fallisce."""

    @abstractmethod
    def fetch_order_products(self) -> list[RawProduct]:
        """Ritorna i prodotti trovati nella sezione ordini effettuati."""
```

Questa interfaccia **non cambia mai**. Ogni adapter concreto implementa solo `login()` e
`fetch_order_products()`.

---

## 4. Scelta strumento di scraping (decidilo subito, non durante lo sviluppo)

- Se il sito fornitore carica i dati via JavaScript (probabile per portali B2B moderni) →
  **Playwright** (`pip install playwright`, poi `playwright install chromium`).
- Se è HTML statico semplice → `requests` + `BeautifulSoup` (più leggero, preferibile se basta).

**Regola pratica:** prova prima `requests`. Se il contenuto ordini non è nell'HTML grezzo
(verificabile con `curl` o "visualizza sorgente"), passa a Playwright.

**Login:** usa Playwright con **storage state persistente** (salva i cookie di sessione dopo il
primo login manuale/automatico in `cache/{fornitore}_session.json`), così non rifai login ad
ogni run:
```python
context = browser.new_context(storage_state="cache/dfl_session.json")
```

**Credenziali:** mai hardcoded. Leggi da `.env` (python-dotenv) — vedi `config/credenziali.env.example`:
```
DFL_USERNAME=...
DFL_PASSWORD=...
GLOBALE_TRADE_USERNAME=...
GLOBALE_TRADE_PASSWORD=...
```

**Prima di scrivere `adapters/dfl.py`**: apri manualmente la pagina ordini di DFL, ispeziona
l'HTML (DevTools → seleziona un prodotto → copia selettore), e dai all'agente **solo quello
snippet HTML**, non l'intero sito. Questo è il modo più efficiente per farglielo scrivere bene
senza sprecare token su esplorazione a tentativi.

**Nota legale:** controlla i Termini di Servizio di DFL/Globale Trade prima di automatizzare
l'accesso — molti portali B2B lo vietano esplicitamente. Se vietato, valuta se c'è un'API
ordini ufficiale o un export CSV/PDF degli ordini da leggere invece (più sicuro e spesso già
strutturato meglio dello scraping HTML).

---

## 5. Classificatore AI — `core/categorizer.py`

Questo è il pezzo che risolve il problema che hai correttamente individuato: le categorie del
fornitore non coincidono con le tue 8 famiglie × sottocategorie.

**Principio guida: euristica prima, AI solo se serve.** Non chiamare un LLM per ogni prodotto:
costa token e tempo inutilmente quando basta un dizionario di parole chiave.

```python
# Passo 1 — euristica locale (gratis, istantanea)
KEYWORD_MAP = {
    "trapano": ("Elettroutensili", "Trapani e avvitatori"),
    "avvitatore": ("Elettroutensili", "Trapani e avvitatori"),
    "guarnizione": ("Idraulica", "Guarnizioni"),
    # ... popolare leggendo le sottocategorie REALI da SOTTOCATEGORIE_REPARTI
    # in aggiorna_catalogo.py (non riscriverle a mano, importarle da lì)
}

def categorize_heuristic(name: str, supplier_category: str) -> tuple[str, str] | None:
    text = f"{name} {supplier_category}".lower()
    for keyword, (dept, subcat) in KEYWORD_MAP.items():
        if keyword in text:
            return dept, subcat
    return None
```

```python
# Passo 2 — fallback AI, SOLO per i prodotti che l'euristica non risolve
# Chiamata in BATCH (es. 20 prodotti per chiamata), mai uno alla volta:
# risparmia ~90% delle chiamate rispetto a una per prodotto.

PROMPT_TEMPLATE = """Assegna ogni prodotto a UN reparto e UNA sottocategoria dalla lista.
Rispondi SOLO con JSON valido, un oggetto per prodotto, niente testo extra.

REPARTI E SOTTOCATEGORIE DISPONIBILI:
{tassonomia}

PRODOTTI DA CLASSIFICARE:
{prodotti}

Formato risposta: [{{"nome": "...", "reparto": "...", "sottocategoria": "...", "confidenza": "alta|bassa"}}]
Se nessuna sottocategoria è adatta, usa "Altro" del reparto più plausibile.
"""
```

- `{tassonomia}` va generata leggendo `SOTTOCATEGORIE_REPARTI` da `aggiorna_catalogo.py`
  (import diretto, non copiarla a mano — se cambia lì, cambia automaticamente qui).
- Usa un modello economico per questo task (classificazione, non ragionamento complesso).
- I prodotti con `"confidenza": "bassa"` vanno scritti comunque in Excel ma **con un flag
  visibile** (es. prefisso `[DA VERIFICARE] ` nella colonna Sottocategoria, o una nota nella
  colonna Descrizione) così li correggi tu al volo invece di doverli ricercare tra centinaia
  di righe.

---

## 6. Scrittura Excel e deduplicazione

Riusa quanto già esiste, non reinventarlo:

- **Formato riga**: stesse colonne di `export_json_to_excel` in `aggiorna_catalogo.py`
  (`Codice Prodotto` vuoto — lo genera l'import esistente —, `Nome Prodotto`, `Sottocategoria`,
  `Prezzo Base` **vuoto**, `Immagine` con l'URL diretto del fornitore (verrà scaricata e
  convertita in WebP automaticamente al prossimo `import_excel_to_json`), `Descrizione`,
  `Varianti` nel formato `label: valore1 = 0.00 | valore2 = 0.00` — se non hai ancora i prezzi
  delle varianti, scrivi comunque i nomi e lascia `0.00`, la riga resta bozza per il prezzo
  base comunque).
- **Apri il file con `openpyxl` in modalità append** sul foglio del reparto corretto — non
  rigenerare l'intero workbook, altrimenti perdi formattazione/validazioni esistenti.
- **Dedup** (`core/dedup.py`): prima di scrivere una riga, controlla se esiste già un prodotto
  con lo stesso `supplier_sku` (tienine traccia in un piccolo indice JSON in `cache/`, es.
  `cache/importati.json` → `{"dfl:ABC123": "riga scritta il 2026-09-03"}`) oppure nome quasi
  identico (case-insensitive, spazi normalizzati). Se già presente, salta silenziosamente e
  logga solo un conteggio finale ("12 prodotti già presenti, saltati").

---

## 7. Entrypoint — `importa.py`

```
python importa.py --fornitore dfl
python importa.py --fornitore globale_trade
python importa.py --tutti
```

Flusso per ogni fornitore:
1. Carica config da `fornitori.json` + credenziali da `.env`.
2. Istanzia l'adapter giusto (dizionario `{"dfl": DflAdapter, "globale_trade": GlobaleTradeAdapter}`).
3. `login()` → `fetch_order_products()`.
4. Per ogni `RawProduct`: dedup check → categorizza (euristica, poi AI in batch per i rimanenti)
   → scrivi riga in Excel.
5. Stampa riepilogo finale: quanti nuovi, quanti saltati (duplicati), quanti a bassa confidenza
   da rivedere.

**Nessuna scrittura silenziosa senza riepilogo finale**: è ciò che ti permette di fidarti dello
script senza dover riaprire l'Excel riga per riga ogni volta.

---

## 8. Checklist "aggiungere un nuovo fornitore" (per il futuro, senza riaprire questa guida)

1. Aggiungi voce in `config/fornitori.json`.
2. Crea `adapters/<nome>.py` che implementa `SupplierAdapter` (login + fetch_order_products).
3. Aggiungi credenziali in `.env`.
4. Registra la classe nel dizionario adapter di `importa.py`.
5. Test: `python importa.py --fornitore <nome>` su un ordine piccolo prima di usarlo su uno grande.

Nessun altro file va toccato — è il senso di tutta l'architettura sopra.

---

## 9. Ordine di sviluppo consigliato (per non sprecare token con l'agente)

Fai costruire il sistema in questo ordine, verificando ogni passo prima del successivo:

1. `adapters/base.py` (contratto) — nessuna logica, solo la forma dei dati.
2. Un **adapter finto** (`adapters/fake.py`) che ritorna 3 `RawProduct` hardcoded — serve per
   testare Excel writer e categorizer senza dipendere dal sito vero.
3. `core/categorizer.py` (solo euristica, no AI ancora) — testalo con il fake adapter.
4. `core/excel_writer.py` + `core/dedup.py` — testali con l'output del fake adapter.
5. `importa.py` funzionante end-to-end con il fake adapter.
6. **Solo ora** `adapters/dfl.py` vero (login + scraping reale) — il resto della pipeline è già
   collaudato, quindi se qualcosa si rompe sai che è lì.
7. Aggiungi il fallback AI nel categorizer.
8. Ripeti il passo 6 per Globale Trade.

Questo ordine isola i problemi: se lo scraping DFL fallisce, non stai anche debuggando Excel o
AI nello stesso momento.

---

## 10. Cosa NON fare

- Non chiamare l'AI per la scrittura vera e propria dei dati (nome prodotto, URL immagine): quei
  campi vengono dallo scraping deterministico, sempre. L'AI serve **solo** per la
  categorizzazione, dove serve giudizio.
- Non riscrivere `aggiorna_catalogo.py`: importa da lì (`SOTTOCATEGORIE_REPARTI`,
  `save_json_with_backup` se utile) invece di duplicare logica.
- Non salvare le credenziali nel repository, nemmeno in un branch privato.
- Non scaricare/convertire immagini in questo modulo: lasciale come URL grezzo in Excel — la
  conversione WebP è già gestita da `aggiorna_catalogo.py` al momento dell'import.
