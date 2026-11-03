import path from 'path';

/**
 * Cartella per le cache su disco. Su Vercel/Lambda il filesystem del progetto
 * (/var/task) è in sola lettura: l'unica cartella scrivibile è /tmp.
 */
export function getRuntimeCacheDir(): string {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    return isServerless
        ? path.join('/tmp', 'fitet_cache')
        : path.resolve(process.cwd(), 'node_modules', '.cache', 'fitet_cache');
}
