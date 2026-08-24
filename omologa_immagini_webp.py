import os
import sys
import json
import shutil

# Definiamo i reparti e le mappature delle cartelle per sicurezza (sia vecchie che web-safe)
REPARTI_MAPPING = {
    'Edilizia e ferramenta': 'edilizia-ferramenta',
    'Elettricità': 'elettricita',
    'Elettrodomestici': 'elettrodomestici',
    'Elettroutensili': 'elettroutensili',
    'Idraulica': 'idraulica',
    'Utensili manuali': 'utensili-manuali',
    'Vernici e colori': 'vernici-colori',
    'Vario': 'vario'
}

# Elenco dei file JSON associati ai reparti
JSON_FILES = [
    'prodotti-edilizia-ferramenta.json',
    'prodotti-elettricita.json',
    'prodotti-elettrodomestici.json',
    'prodotti-elettroutensili.json',
    'prodotti-idraulica.json',
    'prodotti-utensili-manuali.json',
    'prodotti-vernici-colori.json',
    'prodotti-vario.json'
]

def main():
    print("==================================================")
    print("   OMOLOGAZIONE E CONVERSIONE IMMAGINI IN WEBP    ")
    print("==================================================")

    # 1. Verifica della libreria Pillow (PIL)
    try:
        from PIL import Image
        print("[OK] Libreria Pillow (PIL) rilevata correttamente.")
    except ImportError:
        print("[ERRORE] La libreria 'Pillow' non è installata su questo computer.")
        print("Per installarla, esegui questo comando in PowerShell prima di rilanciare lo script:")
        print("pip install Pillow")
        sys.exit(1)

    # Definiamo i percorsi di base
    base_img_dir = os.path.join('assets', 'img')
    base_data_dir = os.path.join('assets', 'data')

    # Se siamo all'interno del sandbox di test, usiamo i percorsi della scratch
    if not os.path.exists(base_img_dir) and os.path.exists('/workspace/scratch/manutenzione/assets/img'):
        base_img_dir = '/workspace/scratch/manutenzione/assets/img'
        base_data_dir = '/workspace/scratch/manutenzione/assets/data'
        print(f"[DEBUG] Modalità test sandbox rilevata. Uso directory di test.")

    if not os.path.exists(base_img_dir):
        print(f"[ERRORE] Impossibile trovare la cartella immagini '{base_img_dir}'.")
        print("Assicurati di lanciare lo script dalla cartella principale del tuo sito (ferramentaballini).")
        sys.exit(1)

    print(f"\n[Fase 1] Scansione delle cartelle in '{base_img_dir}'...")
    
    # Raccogliamo tutte le cartelle reali presenti per i reparti
    subdirs = [d for d in os.listdir(base_img_dir) if os.path.isdir(os.path.join(base_img_dir, d))]
    
    converted_count = 0
    removed_count = 0
    mapping_changes = {} # Mappa i vecchi file convertiti ai nuovi .webp

    # 2. Scansione e conversione delle immagini
    for subdir in subdirs:
        subdir_path = os.path.join(base_img_dir, subdir)
        print(f"\nAnalisi cartella reparto: '{subdir}'")
        
        for filename in os.listdir(subdir_path):
            file_path = os.path.join(subdir_path, filename)
            
            # Elaboriamo solo i file
            if os.path.isfile(file_path):
                base, ext = os.path.splitext(filename)
                ext_lower = ext.lower().lstrip('.')
                
                # Ignoriamo i file che sono già webp o non sono immagini
                if ext_lower in ['jpg', 'jpeg', 'png', 'png']:
                    print(f"  -> Trovata immagine non omologata: '{filename}'")
                    
                    try:
                        # Convertiamo e comprimiamo l'immagine
                        with Image.open(file_path) as img:
                            # Convertiamo in RGB se necessario (es. immagini PNG con trasparenza o CMYK)
                            if img.mode in ('RGBA', 'LA'):
                                # Manteniamo la trasparenza convertendola o lasciandola gestire a WebP
                                pass
                            elif img.mode != 'RGB':
                                img = img.convert('RGB')
                            
                            # Ridimensionamento proporzionale se supera la larghezza standard di 800px
                            width, height = img.size
                            if width > 800:
                                ratio = 800 / float(width)
                                new_height = int(height * ratio)
                                img = img.resize((800, new_height), Image.Resampling.LANCZOS)
                                print(f"     [INFO] Ridimensionata da {width}x{height}px a 800x{new_height}px")
                            
                            # Salviamo in WebP compresso
                            webp_filename = f"{base}.webp"
                            webp_path = os.path.join(subdir_path, webp_filename)
                            
                            img.save(webp_path, 'WEBP', quality=80)
                            print(f"     [OK] Convertita in WebP: '{webp_filename}'")
                            converted_count += 1
                            
                            # Registriamo la modifica per poter aggiornare i JSON
                            # Es. 'assets/img/Elettrodomestici/ED-FRI-001.jpg' -> 'assets/img/elettrodomestici/ED-FRI-001.webp'
                            # Gestiamo anche la normalizzazione del nome cartella web-safe
                            safe_subdir = subdir
                            for old_rep, clean_slug in REPARTI_MAPPING.items():
                                if subdir == old_rep or subdir == clean_slug:
                                    safe_subdir = clean_slug
                                    break
                                    
                            old_rel_path = f"assets/img/{subdir}/{filename}".replace('\\', '/')
                            new_rel_path = f"assets/img/{safe_subdir}/{webp_filename}".replace('\\', '/')
                            mapping_changes[old_rel_path] = new_rel_path
                            mapping_changes[old_rel_path.lower()] = new_rel_path
                        
                        # Rimuoviamo il file originale per evitare doppioni disordinati
                        os.remove(file_path)
                        print(f"     [INFO] Rimosso file originale non ottimizzato.")
                        removed_count += 1
                        
                    except Exception as e:
                        print(f"     [ERRORE] Impossibile convertire l'immagine '{filename}': {e}")

    # 3. Aggiornamento dei database JSON
    print(f"\n[Fase 2] Aggiornamento dei riferimenti nei file JSON in '{base_data_dir}'...")
    json_updated_count = 0
    
    if os.path.exists(base_data_dir):
        for json_filename in os.listdir(base_data_dir):
            if json_filename.endswith('.json') and not json_filename.endswith('.bak'):
                json_path = os.path.join(base_data_dir, json_filename)
                
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        products = json.load(f)
                    
                    updated = False
                    for prod in products:
                        img_path = prod.get('image', '')
                        if img_path:
                            # Normalizziamo gli slash
                            normalized_img = img_path.replace('\\', '/')
                            
                            # Controlliamo se questa immagine rientra tra quelle che abbiamo convertito
                            if normalized_img in mapping_changes:
                                prod['image'] = mapping_changes[normalized_img]
                                updated = True
                            elif normalized_img.lower() in mapping_changes:
                                prod['image'] = mapping_changes[normalized_img.lower()]
                                updated = True
                            else:
                                # Controllo generico: se finisce per .jpg/.png e punta alla cartella del reparto, 
                                # normalizziamolo comunque in .webp e con la cartella web-safe
                                base_path, ext = os.path.splitext(normalized_img)
                                if ext.lower() in ['.jpg', '.jpeg', '.png']:
                                    # Trova la cartella del reparto nel percorso
                                    parts = normalized_img.split('/')
                                    if len(parts) >= 4 and parts[0] == 'assets' and parts[1] == 'img':
                                        rep_dir = parts[2]
                                        img_file = parts[3]
                                        img_base, _ = os.path.splitext(img_file)
                                        
                                        # Trova il nome web-safe corrispondente
                                        safe_rep = rep_dir
                                        for old_rep, clean_slug in REPARTI_MAPPING.items():
                                            if rep_dir == old_rep or rep_dir == clean_slug:
                                                safe_rep = clean_slug
                                                break
                                                
                                        new_path = f"assets/img/{safe_rep}/{img_base}.webp"
                                        prod['image'] = new_path
                                        updated = True
                    
                    if updated:
                        # Salvataggio con backup di sicurezza
                        backup_path = json_path + ".bak"
                        shutil.copy2(json_path, backup_path)
                        
                        with open(json_path, 'w', encoding='utf-8') as f:
                            json.dump(products, f, indent=2, ensure_ascii=False)
                        print(f"  [OK] Riferimenti aggiornati e ottimizzati in: '{json_filename}' (Creato backup .bak)")
                        json_updated_count += 1
                        
                except Exception as e:
                    print(f"  [ERRORE] Impossibile aggiornare il file JSON '{json_filename}': {e}")
    else:
        print("  [AVVISO] Cartella dei dati JSON non trovata. Fase saltata.")

    print("\n==================================================")
    print("             RILASCIO OTTIMIZZAZIONE              ")
    print("==================================================")
    print(f"✔ Immagini convertite in WebP: {converted_count}")
    print(f"✔ File originali obsoleti eliminati: {removed_count}")
    print(f"✔ Database JSON aggiornati: {json_updated_count}")
    print("--------------------------------------------------")
    print("Fatto! Ora tutte le immagini esistenti sono allineate")
    print("al nuovo standard super-leggero del sito web. 🎉")
    print("==================================================")

if __name__ == '__main__':
    main()
