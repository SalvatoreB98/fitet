#!/usr/bin/env tsx
/**
 * Invio manuale di una notifica push a tutti i dispositivi iscritti.
 *
 * Uso:
 *   npm run notify -- --title "Nuova classifica" --body "È uscita la classifica di novembre" --url "/?view=classifiche"
 *
 * Opzioni:
 *   --title, -t   Titolo della notifica (default: "Portale Risultati TT")
 *   --body, -b    Testo della notifica (obbligatorio)
 *   --url, -u     URL aperto al click (default: "/")
 *   --help, -h    Mostra questo aiuto
 *
 * Legge le subscription attive da Supabase (push_subscriptions) e rimuove
 * automaticamente quelle scadute/non più valide (HTTP 404/410).
 */

import { pushService } from '../server/services/pushService';

const DEFAULT_TITLE = 'Portale Risultati TT';
const DEFAULT_URL = '/';

interface CliOptions {
    title: string;
    body: string;
    url: string;
    help: boolean;
}

function usage(): string {
    return [
        'Invio manuale di una notifica push a tutti gli iscritti.',
        '',
        'Uso:',
        '  npm run notify -- --title "Titolo" --body "Messaggio" [--url "/?view=tornei"]',
        '',
        'Opzioni:',
        '  --title, -t   Titolo della notifica (default: "' + DEFAULT_TITLE + '")',
        '  --body, -b    Testo della notifica (obbligatorio)',
        '  --url, -u     URL aperto al click (default: "' + DEFAULT_URL + '")',
        '  --help, -h    Mostra questo aiuto',
        '',
        'Esempio:',
        '  npm run notify -- --title "Nuova classifica" --body "È uscita la classifica di novembre" --url "/?view=classifiche"',
        '',
        'Nota (PowerShell): se npm non inoltra i parametri, usa direttamente:',
        '  npx tsx scripts/send-push.ts --title "Titolo" --body "Messaggio"',
    ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        title: DEFAULT_TITLE,
        body: '',
        url: DEFAULT_URL,
        help: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const raw = argv[i];
        const separatorIndex = raw.indexOf('=');
        const flag = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
        const inlineValue = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : undefined;
        const nextValue = (): string => {
            const value = inlineValue ?? argv[(i += 1)];
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`Valore mancante per ${flag}.`);
            }
            return value;
        };

        switch (flag) {
            case '--title':
            case '-t':
                options.title = nextValue();
                break;
            case '--body':
            case '-b':
                options.body = nextValue();
                break;
            case '--url':
            case '-u':
                options.url = nextValue();
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                throw new Error(`Opzione non riconosciuta: ${raw}`);
        }
    }

    return options;
}

function normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return DEFAULT_URL;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

async function main(): Promise<number> {
    let options: CliOptions;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
        console.error(usage());
        return 1;
    }

    if (options.help) {
        console.log(usage());
        return 0;
    }

    const title = options.title.trim() || DEFAULT_TITLE;
    const body = options.body.trim();

    if (!body) {
        console.error('❌ Il parametro --body è obbligatorio.');
        console.error(usage());
        return 1;
    }

    if (!pushService.isReady()) {
        const missing: string[] = [];
        if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
        if (!process.env.VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
        if (!process.env.VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');

        console.error('❌ Push non configurate: variabili d\'ambiente mancanti o non valide.');
        if (missing.length > 0) {
            console.error(`   Mancanti: ${missing.join(', ')}`);
        }
        return 1;
    }

    const url = normalizeUrl(options.url);

    console.log('📨 Invio notifica push...');
    console.log(`   Titolo: ${title}`);
    console.log(`   Testo:  ${body}`);
    console.log(`   URL:    ${url}`);

    const startedAt = Date.now();
    const result = await pushService.sendToAll({
        title,
        body,
        url,
        icon: '/icon.png',
        badge: '/icon.png',
        tag: `manual-${Date.now()}`,
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('');
    console.log(`✅ Invio completato in ${elapsed}s`);
    console.log(`   Subscription totali: ${result.total}`);
    console.log(`   Inviate:             ${result.sent}`);
    console.log(`   Fallite:             ${result.failed}`);
    console.log(`   Rimosse (404/410):   ${result.removed}`);

    if (result.total === 0) {
        console.warn('⚠️ Nessuna subscription attiva trovata nel database.');
    }

    if (result.sent === 0 && result.failed > 0) {
        console.error('❌ Nessuna notifica inviata: controlla le chiavi VAPID e lo stato delle subscription.');
        return 1;
    }

    return 0;
}

main()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((err) => {
        console.error('❌ Errore durante l\'invio della notifica:', err);
        process.exitCode = 1;
    });
