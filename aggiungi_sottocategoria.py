"""
Aggiunge una nuova sottocategoria OVUNQUE sia referenziata nel progetto:
  1. aggiorna_catalogo.py   -> dizionario SOTTOCATEGORIE_REPARTI (tendina Excel)
  2. assets/admin-data.js   -> subcategories del reparto (area di gestione)
  3. reparti/reparto-<slug>.html -> CATALOG_CONFIG.subcategories (filtro sito pubblico)

Uso:
    python3 aggiungi_sottocategoria.py "Idraulica" "Valvole di scarico"

Il nome del reparto deve essere scritto esattamente come compare nei fogli
Excel / in SOTTOCATEGORIE_REPARTI (es. "Edilizia e ferramenta", "Idraulica"...).
Se il nome non è valido, lo script mostra l'elenco di quelli disponibili.

La nuova voce viene inserita subito prima di "Altro" (se presente), altrimenti
in fondo alla lista. Lo script è idempotente: se la sottocategoria esiste già
in un file, quel file viene lasciato invariato.

Prima di ogni modifica viene creato un backup ".bak" del file originale.
"""
import argparse
import json
import re
import shutil
import sys

# Deve restare allineata a REPARTO_DIR_NAME in aggiorna_catalogo.py
REPARTO_SLUG = {
    'Edilizia e ferramenta': 'edilizia-ferramenta',
    'Elettricità': 'elettricita',
    'Elettrodomestici': 'elettrodomestici',
    'Elettroutensili': 'elettroutensili',
    'Idraulica': 'idraulica',
    'Utensili manuali': 'utensili-manuali',
    'Vernici e colori': 'vernici-colori',
    'Vario': 'vario',
}


def backup(path):
    shutil.copy2(path, str(path) + '.bak')


def insert_before_altro(items, new_subcat):
    """Ritorna una nuova lista con new_subcat inserita prima di 'Altro' (se c'è)."""
    if new_subcat in items:
        return None  # già presente, nessuna modifica
    items = list(items)
    if items and items[-1] == 'Altro':
        items.insert(len(items) - 1, new_subcat)
    else:
        items.append(new_subcat)
    return items


def update_aggiorna_catalogo(path, reparto, new_subcat):
    text = open(path, encoding='utf-8').read()
    pattern = re.compile(
        r"(    '" + re.escape(reparto) + r"': \[\n)(.*?)(\n    \],?)",
        re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        print(f"  [SALTATO] '{path.name}': blocco per '{reparto}' non trovato.")
        return False

    current_items = re.findall(r"'([^']*)'", m.group(2))
    new_items = insert_before_altro(current_items, new_subcat)
    if new_items is None:
        print(f"  [OK] '{path.name}': '{new_subcat}' era già presente.")
        return False

    formatted = ',\n'.join(f"        '{it}'" for it in new_items)
    new_text = text[:m.start()] + m.group(1) + formatted + m.group(3) + text[m.end():]

    backup(path)
    path.write_text(new_text, encoding='utf-8')
    print(f"  [FATTO] '{path.name}' aggiornato.")
    return True


def update_admin_data(path, reparto, new_subcat):
    text = open(path, encoding='utf-8').read()
    m = re.match(r'^(\s*window\.ADMIN_DEPARTMENTS\s*=\s*)(.*?)(\s*)$', text, re.DOTALL)
    if not m:
        print(f"  [SALTATO] '{path.name}': formato inatteso, nessuna modifica.")
        return False

    prefix, json_part, trailing = m.groups()
    data = json.loads(json_part)

    slug = REPARTO_SLUG.get(reparto)
    dept = next((d for d in data if d.get('slug') == slug or d.get('title') == reparto), None)
    if dept is None:
        print(f"  [SALTATO] '{path.name}': reparto '{reparto}' non trovato.")
        return False

    new_items = insert_before_altro(dept.get('subcategories', []), new_subcat)
    if new_items is None:
        print(f"  [OK] '{path.name}': '{new_subcat}' era già presente.")
        return False

    dept['subcategories'] = new_items
    new_json_part = json.dumps(data, indent=2, ensure_ascii=False)

    backup(path)
    path.write_text(prefix + new_json_part + trailing, encoding='utf-8')
    print(f"  [FATTO] '{path.name}' aggiornato.")
    return True


def update_reparto_html(path, new_subcat):
    text = open(path, encoding='utf-8').read()
    pattern = re.compile(r'(subcategories:\s*)(\[[^\]]*\])')
    m = pattern.search(text)
    if not m:
        print(f"  [SALTATO] '{path.name}': riga 'subcategories' non trovata.")
        return False

    current_items = json.loads(m.group(2))
    new_items = insert_before_altro(current_items, new_subcat)
    if new_items is None:
        print(f"  [OK] '{path.name}': '{new_subcat}' era già presente.")
        return False

    new_array = '[' + ', '.join(json.dumps(it, ensure_ascii=False) for it in new_items) + ']'
    new_text = text[:m.start()] + m.group(1) + new_array + text[m.end():]

    backup(path)
    path.write_text(new_text, encoding='utf-8')
    print(f"  [FATTO] '{path.name}' aggiornato.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Aggiunge una sottocategoria in tutti i file del sito.")
    parser.add_argument('reparto', help="Nome esatto del reparto (es. 'Idraulica')")
    parser.add_argument('sottocategoria', help="Nome della nuova sottocategoria")
    args = parser.parse_args()

    if args.reparto not in REPARTO_SLUG:
        print(f"Reparto '{args.reparto}' non riconosciuto. Reparti disponibili:")
        for r in REPARTO_SLUG:
            print(f"  - {r}")
        sys.exit(1)

    from pathlib import Path
    base = Path('.')
    slug = REPARTO_SLUG[args.reparto]

    print(f"Aggiunta sottocategoria '{args.sottocategoria}' al reparto '{args.reparto}'...\n")

    update_aggiorna_catalogo(base / 'aggiorna_catalogo.py', args.reparto, args.sottocategoria)
    update_admin_data(base / 'assets' / 'admin-data.js', args.reparto, args.sottocategoria)
    update_reparto_html(base / 'reparti' / f'reparto-{slug}.html', args.sottocategoria)

    print("\nCompletato. Ricontrolla i file con 'git diff' prima di committare.")
    print("Nota: il file Excel (catalogo_template.xlsx) NON viene toccato da questo script:")
    print("verrà aggiornato automaticamente al prossimo 'python3 aggiorna_catalogo.py --export'.")


if __name__ == '__main__':
    main()
