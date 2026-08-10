# La Pastella PWA

PWA React/Vite generata a partire da `la-pastella-1.jsx`.

## Funzioni presenti
- catalogo prodotti e prezzi
- carrello con quantità in kg
- ordine con data e fascia oraria
- un ordine per fascia (configurabile)
- chiusura date dal gestore
- gestione prodotti e disponibilità
- storico e "Ordina di nuovo"
- pannello gestore
- indicazioni stradali e telefono
- manifest PWA + service worker
- dati persistenti sul dispositivo tramite localStorage

## Avvio
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

La cartella `dist/` è il risultato da pubblicare su un hosting HTTPS.

## Nota importante
Questa versione è una PWA completa lato client, ma il salvataggio ordini usa `localStorage`: quindi gli ordini sono condivisi solo all'interno dello stesso browser/dispositivo. Per ricevere ordini reali da più clienti e vederli nel pannello del gestore da un altro dispositivo serve collegare un database/server (es. Supabase/Firebase) e, per i pagamenti online, un provider come Stripe.
