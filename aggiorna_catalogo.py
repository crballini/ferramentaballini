import pandas as pd
import json
import os
import re
import argparse
import copy
import openpyxl
import urllib.request
import urllib.parse
import mimetypes
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation

# Mappatura dei Reparti del sito ai file JSON corrispondenti in assets/data/
REPARTO_MAP = {
    'Edilizia e ferramenta': 'prodotti-edilizia-ferramenta.json',
    'Elettricità': 'prodotti-elettricita.json',
    'Elettrodomestici': 'prodotti-elettrodomestici.json',
    'Elettroutensili': 'prodotti-elettroutensili.json',
    'Idraulica': 'prodotti-idraulica.json',
    'Utensili manuali': 'prodotti-utensili-manuali.json',
    'Vernici e colori': 'prodotti-vernici-colori.json',
    'Vario': 'prodotti-vario.json'
}

# Prefissi dei Reparti per i Codici Prodotto (2 lettere)
REPARTO_PREFIX = {
    'Edilizia e ferramenta': 'EF',
    'Elettricità': 'EL',
    'Elettrodomestici': 'ED',
    'Elettroutensili': 'EU',
    'Idraulica': 'ID',
    'Utensili manuali': 'UM',
    'Vernici e colori': 'VC',
    'Vario': 'VA'
}

# Mappatura Sottocategorie note per mantenere la coerenza dei codici (3 lettere)
SUBCAT_PREFIX_MAP = {
    'press control': 'PRC',
    'chiavi': 'CHI',
    'frigoriferi e congelatori': 'FRI',
    'prese e interruttori': 'PRE',
    'trapani e avvitatori': 'TRA',
    'pennelli e rulli': 'PEN',
    'articoli per la casa': 'CAS',
    'ferramenta varia': 'FER',
    'smerigliatrici': 'SME',
    'tubi e raccordi': 'TUB'
}

# Sottocategorie predefinite per i menù a tendine guidati
SOTTOCATEGORIE_REPARTI = {
    'Edilizia e ferramenta': [
        'Materiale edile',
        'Ferramenta varia',
        'Viteria e bulloneria',
        'Tasselli e ancoraggi',
        'Sicurezza e serrature',
        'Categoria Esempio'
    ],
    'Elettricità': [
        'Prese e interruttori',
        'Cavi e prolunghe',
        'Illuminazione',
        'Quadri elettrici e fusibili',
        'Categoria Esempio'
    ],
    'Elettrodomestici': [
        'Frigoriferi e congelatori',
        'Cottura e forni',
        'Lavaggio',
        'Piccoli elettrodomestici',
        'Climatizzazione',
        'Categoria Esempio'
    ],
    'Elettroutensili': [
        'Trapani e avvitatori',
        'Smerigliatrici',
        'Seghe e seghetti',
        'Levigatrici',
        'Categoria Esempio'
    ],
    'Idraulica': [
        'Press control',
        'Tubi e raccordi',
        'Rubinetteria',
        'Riscaldamento',
        'Categoria Esempio'
    ],
    'Utensili manuali': [
        'Chiavi e serraggio',
        'Giraviti',
        'Pinze e cesoie',
        'Martelli e scalpelli',
        'Strumenti di misura',
        'Categoria Esempio'
    ],
    'Vernici e colori': [
        'Vernici e smalti',
        'Pennelli e rulli',
        'Stucchi e siliconi',
        'Diluenti e solventi',
        'Categoria Esempio'
    ],
    'Vario': [
        'Articoli per la casa',
        'Giardinaggio',
        'Bombole GPL gas',
        'Raccorderia',
        'Categoria Esempio'
    ]
}

def get_subcategory_code(subcat_name):
    if pd.isna(subcat_name) or str(subcat_name).strip() == '':
        return 'GEN'
    
    clean_name = str(subcat_name).strip().lower()
    
    # Cerca nella mappatura predefinita
    if clean_name in SUBCAT_PREFIX_MAP:
        return SUBCAT_PREFIX_MAP[clean_name]
    
    # Altrimenti, prendi le prime 3 lettere escludendo spazi e speciali
    sub_clean = re.sub(r'[^a-zA-Z]+', '', clean_name).upper()
    sub_code = sub_clean[:3] if len(sub_clean) >= 3 else (sub_clean + "XXX")[:3]
    return sub_code

def clean_price(price_val):
    if pd.isna(price_val) or str(price_val).strip() == '':
        return 0.0
    p_str = str(price_val).replace('€', '').replace('$', '').strip()
    p_str = p_str.replace(',', '.')
    match = re.search(r'\d+(?:\.\d+)?', p_str)
    if match:
        return float(match.group(0))
    return 0.0

def clean_availability(avail_val):
    if pd.isna(avail_val) or str(avail_val).strip() == '':
        return 'contattare-negozio'
    
    val = str(avail_val).lower().strip()
    if val in ['disponibile', 'si', 'sì', 'dispo', 'y', 'yes', 'disponibili', 'active']:
        return 'disponibile'
    elif val in ['in arrivo', 'in-arrivo', 'arrivo', 'in_arrivo']:
        return 'in-arrivo'
    elif val in ['esaurito', 'no', 'n', 'esauriti', 'out of stock']:
        return 'esaurito'
    else:
        return 'contattare-negozio'

def parse_variants(variants_val):
    if pd.isna(variants_val) or str(variants_val).strip() == '':
        return None
    
    val_str = str(variants_val).strip()
    if ':' not in val_str:
        return None
    
    try:
        parts = val_str.split(':', 1)
        label = parts[0].strip()
        options_part = parts[1].strip()
        
        options_list = []
        raw_options = options_part.split('|')
        for raw_opt in raw_options:
            if '=' in raw_opt:
                opt_parts = raw_opt.split('=', 1)
                opt_val = opt_parts[0].strip()
                opt_price = clean_price(opt_parts[1])
                options_list.append({
                    "value": opt_val,
                    "price": opt_price
                })
        
        if options_list:
            return {
                "label": label,
                "options": options_list
            }
    except Exception as e:
        print(f"Errore nel parsing della variante '{val_str}': {e}")
        
    return None

def format_variants_for_excel(variants_obj):
    if not variants_obj or not isinstance(variants_obj, dict):
        return ''
    
    label = variants_obj.get('label', '')
    options = variants_obj.get('options', [])
    if not label or not options:
        return ''
    
    opt_strings = []
    for opt in options:
        val = opt.get('value', '')
        price = opt.get('price', 0.0)
        try:
            price_float = float(price)
        except:
            price_float = clean_price(price)
        opt_strings.append(f"{val} = {price_float:.2f}")
        
    return f"{label}: " + " | ".join(opt_strings)

def get_simplified_image_value(image_path, code, reparto_name):
    if not image_path:
        return ""
    if image_path.startswith('data:'):
        return '[Immagine in Base64]'
    if image_path.startswith('http://') or image_path.startswith('https://'):
        return image_path
    
    # Sostituiamo backslash con forward slash per coerenza
    normalized_path = image_path.replace('\\\\', '/')
    standard_prefix = f"assets/img/{reparto_name}/"
    
    if normalized_path.startswith(standard_prefix):
        filename = os.path.basename(normalized_path)
        base, ext = os.path.splitext(filename)
        if base == code:
            return code # Scrive solo il codice prodotto! (es. 'ED-FRI-001')
        else:
            return filename # Scrive solo il nome file! (es. 'trapano.jpg')
    else:
        return image_path # Mantiene il percorso originale se è esterno

def download_image_from_url(url, output_dir, code):
    # Crea la directory se non esiste
    os.makedirs(output_dir, exist_ok=True)
    
    # Determina l'estensione ipotetica dall'URL
    parsed_path = urllib.parse.urlparse(url).path
    _, url_ext = os.path.splitext(parsed_path)
    ext = url_ext.lstrip('.').lower()
    if ext not in ['jpg', 'jpeg', 'png', 'webp', 'gif']:
        ext = 'jpg' # Default
    if ext == 'jpeg':
        ext = 'jpg'
        
    filename = f"{code}.{ext}"
    file_path = os.path.join(output_dir, filename)
    reparto_dir = os.path.basename(output_dir)
    rel_path = f"assets/img/{reparto_dir}/{filename}"
    
    try:
        print(f"  -> Tentativo di download da: {url} ...")
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            content_type = response.headers.get('content-type')
            if content_type:
                guessed_ext = mimetypes.guess_extension(content_type)
                if guessed_ext:
                    new_ext = guessed_ext.lstrip('.').lower()
                    if new_ext == 'jpeg':
                        new_ext = 'jpg'
                    if new_ext in ['jpg', 'png', 'webp', 'gif'] and new_ext != ext:
                        ext = new_ext
                        filename = f"{code}.{ext}"
                        file_path = os.path.join(output_dir, filename)
                        rel_path = f"assets/img/{reparto_dir}/{filename}"
            
            with open(file_path, 'wb') as out_file:
                out_file.write(response.read())
            
            print(f"     [OK] Immagine scaricata e salvata in '{rel_path}'")
            return rel_path
    except Exception as e:
        print(f"     [ERRORE] Impossibile scaricare l'immagine da Internet: {e}")
        if "Name or service not known" in str(e) or "Temporary failure in name resolution" in str(e) or "timed out" in str(e).lower() or "connection refused" in str(e).lower():
            print("     (Nota: Se ti trovi in un ambiente offline come il sandbox di test, questo errore è normale. Sul tuo PC Windows funzionerà correttamente!)")
        # In caso di errore di rete, ritorniamo comunque il percorso relativo ipotizzato
        # in modo che il JSON rimanga coerente con la futura presenza del file.
        print(f"     [FALLBACK] Verrà comunque associato il percorso locale: '{rel_path}'")
        return rel_path

def import_excel_to_json(excel_file, data_dir):
    print(f"Lettura file Excel: {excel_file}...")
    try:
        xls = pd.ExcelFile(excel_file)
    except Exception as e:
        print(f"Errore nel caricamento del file Excel: {e}")
        return

    # Per ogni foglio (che rappresenta un reparto)
    for sheet_name in xls.sheet_names:
        if sheet_name not in REPARTO_MAP:
            if sheet_name != 'Sottocategorie':
                print(f"Ignorato foglio non standard: '{sheet_name}'")
            continue
            
        print(f"\nElaborazione reparto '{sheet_name}'...")
        df = pd.read_excel(xls, sheet_name=sheet_name)
        
        # Carichiamo il JSON esistente per preservare i Base64 originari
        filename = REPARTO_MAP[sheet_name]
        json_path = os.path.join(data_dir, filename)
        existing_images = {}
        
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    old_data = json.load(f)
                    for p in old_data:
                        if p.get('name') and p.get('image'):
                            existing_images[p['name'].strip().lower()] = p['image']
            except Exception as e:
                print(f"Nota: Impossibile caricare il JSON esistente per mappare le immagini: {e}")
        
        # Rileviamo tutti i codici già definiti in questo Excel per evitare di duplicarli
        # e per determinare il contatore iniziale corretto per ogni sottocategoria
        assigned_codes = {}
        
        # Prima passata: leggiamo i codici esistenti
        for idx, row in df.iterrows():
            code_val = row.get('Codice Prodotto')
            if not pd.isna(code_val) and str(code_val).strip() != '':
                code_str = str(code_val).strip()
                match = re.match(r'^([A-Z]{2}-[A-Z]{3})-(\d{3})$', code_str)
                if match:
                    prefix = match.group(1)
                    num = int(match.group(2))
                    if prefix not in assigned_codes:
                        assigned_codes[prefix] = []
                    assigned_codes[prefix].append(num)
        
        products_list = []
        for idx, row in df.iterrows():
            name = str(row.get('Nome Prodotto', '')).strip()
            if not name or pd.isna(row.get('Nome Prodotto')):
                continue # Salta righe vuote
                
            subcategory = str(row.get('Sottocategoria', '')).strip()
            price_base = clean_price(row.get('Prezzo Base'))
            availability = clean_availability(row.get('Disponibilità'))
            
            # Determinazione del Codice Prodotto intelligente
            code_val = row.get('Codice Prodotto')
            rep_prefix = REPARTO_PREFIX.get(sheet_name, 'XX')
            sub_prefix = get_subcategory_code(subcategory)
            counter_key = f"{rep_prefix}-{sub_prefix}"
            
            if not pd.isna(code_val) and str(code_val).strip() != '':
                code = str(code_val).strip()
            else:
                # Generiamo automaticamente il codice progressivo libero!
                if counter_key not in assigned_codes:
                    assigned_codes[counter_key] = []
                
                next_num = 1
                if assigned_codes[counter_key]:
                    next_num = max(assigned_codes[counter_key]) + 1
                
                assigned_codes[counter_key].append(next_num)
                code = f"{counter_key}-{next_num:03d}"
                print(f"  -> Generato codice automatico per '{name}': {code}")
            
            # Gestione intelligente delle immagini
            image_val = row.get('Immagine')
            image_path = ""
            
            if not pd.isna(image_val):
                image_val_str = str(image_val).strip()
                if image_val_str == '[Immagine in Base64]':
                    # Recupera il Base64 originario dal file JSON esistente
                    lookup_key = name.lower()
                    if lookup_key in existing_images:
                        image_path = existing_images[lookup_key]
                elif image_val_str and image_val_str != 'nan' and image_val_str != '':
                    # SE E' UN URL WEB! (http:// o https://)
                    if image_val_str.startswith('http://') or image_val_str.startswith('https://'):
                        reparto_dir = sheet_name
                        output_dir = os.path.join('assets', 'img', reparto_dir)
                        # Se siamo nel sandbox, modifichiamo il percorso di destinazione per farlo finire in /workspace/scratch/manutenzione/assets/img/
                        if not os.path.exists('assets') and os.path.exists('/workspace/scratch/manutenzione/assets'):
                            output_dir = os.path.join('/workspace/scratch/manutenzione', 'assets', 'img', reparto_dir)
                        
                        downloaded_path = download_image_from_url(image_val_str, output_dir, code)
                        if downloaded_path:
                            image_path = downloaded_path
                    # Se non contiene slash/backslash, è un nome file o codice semplificato!
                    elif '/' not in image_val_str and '\\\\' not in image_val_str:
                        reparto_dir = sheet_name
                        if '.' in image_val_str:
                            # Ha già l'estensione (es. 'ED-FRI-001.jpg')
                            image_path = f"assets/img/{reparto_dir}/{image_val_str}"
                        else:
                            # È solo il codice (es. 'ED-FRI-001')
                            found_path = None
                            local_reparto_dir = os.path.join('assets', 'img', reparto_dir)
                            if not os.path.exists('assets') and os.path.exists('/workspace/scratch/manutenzione/assets'):
                                local_reparto_dir = os.path.join('/workspace/scratch/manutenzione', 'assets', 'img', reparto_dir)
                            if os.path.exists(local_reparto_dir):
                                for ext in ['.jpg', '.png', '.webp', '.jpeg', '.JPG', '.PNG', '.WEBP']:
                                    test_file = f"{image_val_str}{ext}"
                                    if os.path.exists(os.path.join(local_reparto_dir, test_file)):
                                        found_path = f"assets/img/{reparto_dir}/{test_file}"
                                        break
                            if found_path:
                                image_path = found_path
                            else:
                                # Default a .jpg se non trovato
                                image_path = f"assets/img/{reparto_dir}/{image_val_str}.jpg"
                    else:
                        # È un percorso intero, lo usiamo direttamente
                        image_path = image_val_str
            
            # Se la cella dell'immagine era vuota, proviamo ad auto-associarla
            # se esiste un file con il codice prodotto nella cartella corretta!
            if not image_path:
                reparto_dir = sheet_name
                local_reparto_dir = os.path.join('assets', 'img', reparto_dir)
                found_path = None
                if not os.path.exists('assets') and os.path.exists('/workspace/scratch/manutenzione/assets'):
                    local_reparto_dir = os.path.join('/workspace/scratch/manutenzione', 'assets', 'img', reparto_dir)
                if os.path.exists(local_reparto_dir):
                    for ext in ['.jpg', '.png', '.webp', '.jpeg', '.JPG', '.PNG', '.WEBP']:
                        test_file = f"{code}{ext}"
                        if os.path.exists(os.path.join(local_reparto_dir, test_file)):
                            found_path = f"assets/img/{reparto_dir}/{test_file}"
                            break
                if found_path:
                    image_path = found_path
                    print(f"  -> Auto-associata immagine esistente per '{name}': {image_path}")

            variants = parse_variants(row.get('Varianti'))
            
            product_obj = {
                "code": code,
                "name": name,
                "category": subcategory,
                "price": price_base,
                "availability": availability,
                "image": image_path
            }
            
            if variants:
                product_obj["variants"] = variants
                
            products_list.append(product_obj)
            
        # Salva in formato JSON
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(products_list, f, indent=2, ensure_ascii=False)
            print(f"File JSON aggiornato con successo: '{json_path}' ({len(products_list)} prodotti)")
        except Exception as e:
            print(f"Errore nel salvataggio del file {json_path}: {e}")

def export_json_to_excel(excel_file, data_dir):
    print(f"Inizio esportazione dei file JSON da '{data_dir}' verso l'Excel '{excel_file}'...")
    wb = openpyxl.Workbook()
    default_sheet = wb.active
    wb.remove(default_sheet)
    
    columns = [
        'Codice Prodotto',
        'Nome Prodotto',
        'Sottocategoria',
        'Prezzo Base',
        'Disponibilità',
        'Immagine',
        'Varianti'
    ]
    
    # Stili
    header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
    header_fill = PatternFill(start_color='1F4E78', end_color='1F4E78', fill_type='solid')
    align_center = Alignment(horizontal='center', vertical='center')
    align_left = Alignment(horizontal='left', vertical='center')
    border_thin = Side(border_style='thin', color='D9D9D9')
    cell_border = Border(left=border_thin, right=border_thin, top=border_thin, bottom=border_thin)
    
    # Copia delle sottocategorie predefinite per arricchirle dinamicamente
    sottocategorie_reali = copy.deepcopy(SOTTOCATEGORIE_REPARTI)
    
    # Per ogni reparto mappato, leggiamo i dati per raccogliere eventuali sottocategorie custom
    for reparto_name, json_filename in REPARTO_MAP.items():
        json_path = os.path.join(data_dir, json_filename)
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    products = json.load(f)
                    for prod in products:
                        subcat = prod.get('category', '').strip()
                        if subcat and subcat not in sottocategorie_reali[reparto_name]:
                            sottocategorie_reali[reparto_name].append(subcat)
            except Exception as e:
                print(f"Nota: Impossibile leggere {json_filename} per mappare le sottocategorie: {e}")
                
    # Ora generiamo i singoli fogli dei Reparti
    for reparto_name, json_filename in REPARTO_MAP.items():
        json_path = os.path.join(data_dir, json_filename)
        ws = wb.create_sheet(title=reparto_name)
        
        # Scrivi intestazione
        ws.append(columns)
        ws.row_dimensions[1].height = 25
        for col_num in range(1, len(columns) + 1):
            cell = ws.cell(row=1, column=col_num)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = align_center
            cell.border = cell_border
            
        if os.path.exists(json_path):
            print(f"Caricamento prodotti per il reparto '{reparto_name}' dal file '{json_filename}'...")
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    products = json.load(f)
            except Exception as e:
                print(f"Errore nel parsing del file {json_path}: {e}")
                products = []
                
            for prod in products:
                code = prod.get('code', '')
                name = prod.get('name', '')
                subcategory = prod.get('category', '')
                price = prod.get('price', 0.0)
                
                try:
                    price = float(price)
                except:
                    price = clean_price(price)
                    
                avail = prod.get('availability', 'disponibile')
                avail = avail.replace('-', ' ').title()
                
                # Semplificazione intelligente del percorso dell'immagine
                img_raw = prod.get('image', '')
                img = get_simplified_image_value(img_raw, code, reparto_name)
                    
                var_str = format_variants_for_excel(prod.get('variants'))
                
                row_data = [code, name, subcategory, price, avail, img, var_str]
                ws.append(row_data)
        else:
            print(f"Nessun file JSON trovato per il reparto '{reparto_name}' ({json_filename}). Creato foglio vuoto.")
            ws.append(['', 'Esempio Prodotto', 'Categoria Esempio', 10.00, 'Disponibile', '', ''])
            
        # Formatta celle dati
        for r_num in range(2, ws.max_row + 1):
            ws.row_dimensions[r_num].height = 20
            for col_num in range(1, len(columns) + 1):
                cell = ws.cell(row=r_num, column=col_num)
                cell.font = Font(name='Segoe UI', size=10)
                cell.border = cell_border
                
                if col_num in [1, 4, 5]: # Codice, Prezzo, Disponibilità
                    cell.alignment = align_center
                else:
                    cell.alignment = align_left
                
                if col_num == 4:
                    cell.number_format = '[$€-2] #,##0.00'
                    
        # Ridimensiona colonne
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 15)
            
        # Applica il menù a tendine per la Sottocategoria (Colonna C)
        headers_sub = list(sottocategorie_reali.keys())
        col_idx_sub = headers_sub.index(reparto_name) + 1
        col_letter_sub = openpyxl.utils.get_column_letter(col_idx_sub)
        num_items = len(sottocategorie_reali[reparto_name])
        formula_val = f"Sottocategorie!${col_letter_sub}$2:${col_letter_sub}${num_items + 1}"
        
        dv_sub = DataValidation(type='list', formula1=formula_val, allow_blank=True)
        dv_sub.error = "Seleziona una sottocategoria valida dalla lista"
        dv_sub.errorTitle = "Sottocategoria non valida"
        dv_sub.prompt = "Scegli una sottocategoria dalla lista"
        dv_sub.promptTitle = "Sottocategoria"
        
        ws.add_data_validation(dv_sub)
        dv_sub.add("C2:C200") # Valido fino a riga 200 per foglio
        
        # Applica il menù a tendine per la Disponibilità (Colonna E)
        dv_avail = DataValidation(type='list', formula1='"Disponibile,In Arrivo,Esaurito,Contattare Negozio"', allow_blank=True)
        dv_avail.error = "Seleziona uno stato di disponibilità valido"
        dv_avail.errorTitle = "Disponibilità non valida"
        dv_avail.prompt = "Scegli lo stato di disponibilità"
        dv_avail.promptTitle = "Disponibilità"
        
        ws.add_data_validation(dv_avail)
        dv_avail.add("E2:E200")
        
    # Scrittura del foglio Sottocategorie (Impostazioni per i menù a tendine)
    ws_sub = wb.create_sheet(title='Sottocategorie')
    headers_sub = list(sottocategorie_reali.keys())
    ws_sub.append(headers_sub)
    
    max_len = max(len(lst) for lst in sottocategorie_reali.values())
    for r in range(max_len):
        row_data = []
        for rep in headers_sub:
            lst = sottocategorie_reali[rep]
            if r < len(lst):
                row_data.append(lst[r])
            else:
                row_data.append(None)
        ws_sub.append(row_data)
        
    # Nascondiamo il foglio per non disturbare la visualizzazione dell'utente
    ws_sub.sheet_state = 'hidden'
            
    # Salva il file Excel
    try:
        wb.save(excel_file)
        print(f"\nSincronizzazione completata! Excel generato con successo: {excel_file}")
    except Exception as e:
        print(f"Errore nel salvataggio dell'Excel: {e}")

def main():
    parser = argparse.ArgumentParser(description="Script di Sincronizzazione Catalogo Excel <-> JSON v10")
    parser.add_argument('--export', action='store_true', help="Esporta i file JSON correnti per popolare l'Excel")
    args = parser.parse_args()
    
    excel_file = 'catalogo_template.xlsx'
    
    # Se siamo nel sandbox, usiamo i percorsi corretti
    if not os.path.exists(excel_file) and os.path.exists('/workspace/scratch/catalogo_template-v10.xlsx'):
        excel_file = '/workspace/scratch/catalogo_template-v10.xlsx'
    elif not os.path.exists(excel_file):
        excel_file = '/workspace/scratch/catalogo_template-v10.xlsx'
        
    data_dir = 'assets/data'
    if not os.path.exists(data_dir):
        data_dir = '/workspace/scratch/manutenzione/assets/data'
        os.makedirs(data_dir, exist_ok=True)
        
    if args.export:
        export_json_to_excel(excel_file, data_dir)
    else:
        import_excel_to_json(excel_file, data_dir)

if __name__ == '__main__':
    main()
