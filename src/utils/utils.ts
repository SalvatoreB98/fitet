export function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

export function cleanItaDate(isoString?: string | number | null): string {
  if (!isoString) return '';
  const data = new Date(isoString);
  if (isNaN(data.getTime())) return '';

  // Formattazione con fuso orario italiano (Europe/Rome)
  const formatter = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  // Sostituisce la virgola predefinita con il trattino
  const risultato = formatter.format(data).replace(",", " -");
  return risultato;
}