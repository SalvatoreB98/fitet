// server/app.ts
import express from "express";
import cors from "cors";
import path3 from "path";

// server/services/fitetClient.ts
var BASE_URL = "https://portale.fitet.org";
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
};
var FitetClient = class {
  /**
   * Fetches raw ISO-8859-1 HTML content from a FITeT endpoint and decodes it safely
   */
  static async fetchHtml(url, isAjax = false, customReferer) {
    const headers = {
      ...DEFAULT_HEADERS
    };
    if (isAjax) {
      headers["X-Requested-With"] = "XMLHttpRequest";
      headers["Referer"] = customReferer || "https://portale.fitet.org/risultati/new_rank/testaclassifica_auto.php?ID_CLASS=247&ID=1&PASS=20";
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12e3);
    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`FITeT HTTP error: ${response.status} ${response.statusText} on ${url}`);
      }
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder("iso-8859-1");
      return decoder.decode(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }
  /**
   * Endpoint 1: Classifica Squadre
   */
  static async fetchClassifica(cam = 1902) {
    const url = `${BASE_URL}/risultati/campionati/classifica_squadre.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 2: Calendario & Incontri
   */
  static async fetchCalendario(cam = 1902, anno = 41) {
    const url = `${BASE_URL}/risultati/campionati/Calendario.asp?CAM=${cam}&ANNO=${anno}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 3: Statistiche Atleti Girone
   */
  static async fetchStatisticheAtleti(cam = 1902) {
    const url = `${BASE_URL}/risultati/campionati/statistiche_atleti.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 4: Scheda Singolo Atleta (Ranking & Storico Punti)
   */
  static async fetchSchedaAtleta(atletaId, idClass = 247) {
    const url = `${BASE_URL}/risultati/new_rank/dettaglioatleta_unica.php?ATLETA=${atletaId}&ID_CLASS=${idClass}&ZU=1&AVVERSARIO=0`;
    return this.fetchHtml(url, true);
  }
  /**
   * Autocomplete search for athletes
   */
  static async searchAtleta(query) {
    const url = `${BASE_URL}/risultati/new_rank/ajax.php?term=${encodeURIComponent(query)}`;
    const text = await this.fetchHtml(url, true);
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }
  /**
   * Endpoint 5: Referto Incontro Gara
   */
  static async fetchRefertoIncontro(incontroId, cam = 1902, formula = 19) {
    const url = `${BASE_URL}/risultati/campionati/giornata.php?INCONTRO=${incontroId}&CAM=${cam}&FORMULA=${formula}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 6: Dettaglio Singola Partita Individuale
   */
  static async fetchDettaglioPartita(partitaId) {
    const url = `${BASE_URL}/risultati/campionati/dettaglio_partita.php?ID=${partitaId}`;
    return this.fetchHtml(url);
  }
};

// server/services/cacheService.ts
import fs from "fs";
import path from "path";
var CacheService = class {
  cacheDir;
  memoryCache = /* @__PURE__ */ new Map();
  constructor() {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    this.cacheDir = isServerless ? path.join("/tmp", "fitet_cache") : path.resolve(process.cwd(), "server", "cache");
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    } catch (err) {
      console.warn("Cache directory initialization fallback to memory-only:", err);
    }
  }
  /**
   * Retrieves an item from memory or disk if not expired.
   */
  get(key) {
    const now = Date.now();
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now - memEntry.timestamp < memEntry.ttlMs) {
        return memEntry.data;
      }
      this.memoryCache.delete(key);
    }
    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const fileEntry = JSON.parse(fileContent);
        if (now - fileEntry.timestamp < fileEntry.ttlMs) {
          this.memoryCache.set(key, fileEntry);
          return fileEntry.data;
        }
      } catch (err) {
        console.warn(`Error reading disk cache for key ${key}:`, err);
      }
    }
    return null;
  }
  /**
   * Stores an item with a given TTL in milliseconds in both memory and disk.
   */
  set(key, data, ttlMs) {
    const entry = {
      data,
      timestamp: Date.now(),
      ttlMs
    };
    this.memoryCache.set(key, entry);
    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf8");
    } catch (err) {
      console.warn(`Error saving disk cache for key ${key}:`, err);
    }
  }
  /**
   * Deletes a cache key or clears all cache
   */
  delete(key) {
    this.memoryCache.delete(key);
    const filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
      }
    }
  }
  clear() {
    this.memoryCache.clear();
    if (fs.existsSync(this.cacheDir)) {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            fs.unlinkSync(path.join(this.cacheDir, file));
          } catch {
          }
        }
      }
    }
  }
};
var cacheService = new CacheService();

// server/services/athleteResolver.ts
import fs2 from "fs";
import path2 from "path";

// server/data/athlete_mapping.json
var athlete_mapping_default = {
  "DURANTE SAMUELE": "777889",
  "BASILE DANILO": "775851",
  "FILOGRANA GIUSEPPE": "745378",
  "KAWA TOMASZ STANISLAN": "751159",
  "D'ACRI LORENZO PIO": "788809",
  "MANFREDI MASSIMO": "794230",
  "DE CARLO GIOVANNI": "824195",
  "RITACCO LUIGI": "764314",
  "BASILE GIORGIO": "778244",
  "BELMONTE ALDO": "724301",
  "DURANTE EMILIO": "781684",
  "SIRIMARCO GIOVANNI": "749394",
  "BRUSCO CESARE": "816917",
  "PIRAINO FRANCESCO MARIA": "611964",
  "BUTERA SALVATORE": "829250",
  "PALERMO DOMENICO": "751507",
  "BASILE SARA": "778245",
  "FEDERICO MARIO": "774477",
  "MONTESANTO MATTEO": "797039",
  "TARTARO RAFFAELE": "837324",
  "BELSITO DANIEL": "808429",
  "FORTE LUIGI": "818642",
  "FERRARO GIUSEPPE": "732567",
  "ORIGLIA PIERLUIGI": "745200",
  "TOMA FERDINANDO": "718926",
  "RITACCO SIMONE": "824725",
  "GRANATO BORIS": "835128",
  "BELSITO MASSIMO": "830623",
  "GACCIONE CLAUDIA MARIA": "800248",
  "MILICCHIO ENEA": "818653",
  "BRANCA FRANCESCO": "829065",
  "FERRARO LUIGI ANGELO": "824196",
  "MONTESANTO MARIO": "797038",
  "D'ANDREA MARCO": "817090",
  "RENDE FEDELE": "743857"
};

// server/services/athleteResolver.ts
var AthleteResolver = class {
  mappingFile;
  mapping;
  constructor() {
    this.mapping = { ...athlete_mapping_default };
    this.mappingFile = path2.resolve(process.cwd(), "server", "data", "athlete_mapping.json");
    this.loadMapping();
  }
  loadMapping() {
    try {
      if (fs2.existsSync(this.mappingFile)) {
        const content = fs2.readFileSync(this.mappingFile, "utf8");
        this.mapping = { ...athlete_mapping_default, ...JSON.parse(content) };
      }
    } catch {
      this.mapping = { ...athlete_mapping_default };
    }
  }
  saveMapping() {
    try {
      fs2.writeFileSync(this.mappingFile, JSON.stringify(this.mapping, null, 2), "utf8");
    } catch {
    }
  }
  reloadMapping() {
    this.loadMapping();
  }
  getMapping() {
    this.loadMapping();
    return { ...this.mapping };
  }
  /**
   * Resolves athlete name to ID, falling back to dynamic search on FITeT autocomplete
   */
  async resolveAthleteId(name) {
    const cleanName = name.trim().toUpperCase();
    if (this.mapping[cleanName]) {
      return this.mapping[cleanName];
    }
    try {
      const surname = cleanName.split(" ")[0];
      const results = await FitetClient.searchAtleta(surname);
      const norm = (s) => s.replace(/[^a-zA-Z]/g, "").toUpperCase();
      const target = norm(cleanName);
      const exact = results.find(
        (r) => norm(r.value) === target || norm(r.value).includes(target) || target.includes(norm(r.value))
      );
      if (exact) {
        this.mapping[cleanName] = exact.id;
        this.saveMapping();
        return exact.id;
      }
    } catch (err) {
      console.warn(`Dynamic athlete resolution failed for ${cleanName}:`, err);
    }
    return null;
  }
};
var athleteResolver = new AthleteResolver();

// server/parsers/classificaParser.ts
import * as cheerio from "cheerio";
function parseClassifica(html) {
  const $ = cheerio.load(html);
  const squadre = [];
  $("table tr").each((_, row) => {
    const $row = $(row);
    const teamLink = $row.find('a[href*="percentuali.php"]');
    if (teamLink.length === 0) return;
    const href = teamLink.attr("href") || "";
    const squadraIdMatch = href.match(/SQUADRA=(\d+)/i);
    const squadraId = squadraIdMatch ? squadraIdMatch[1] : "";
    const nome = teamLink.text().replace(/\s+/g, " ").trim();
    const cells = $row.find("td");
    if (cells.length < 14) return;
    const getCellInt = (idx) => {
      const text = $(cells[idx]).text().trim().replace(/\D+/g, "");
      return parseInt(text, 10) || 0;
    };
    const punti = getCellInt(2);
    const incontriDisputati = getCellInt(3);
    const incontriVinti = getCellInt(4);
    const incontriPareggiati = getCellInt(5);
    const incontriPersi = getCellInt(6);
    const partiteVinte = getCellInt(7);
    const partitePerse = getCellInt(8);
    const setVinti = getCellInt(9);
    const setPersi = getCellInt(10);
    const puntiVinti = getCellInt(11);
    const puntiPersi = getCellInt(12);
    const penalizzazioni = getCellInt(13);
    squadre.push({
      posizione: 0,
      // Calculated after sorting
      squadraId,
      nome,
      punti,
      incontriDisputati,
      incontriVinti,
      incontriPareggiati,
      incontriPersi,
      partiteVinte,
      partitePerse,
      diffPartite: partiteVinte - partitePerse,
      setVinti,
      setPersi,
      diffSet: setVinti - setPersi,
      puntiVinti,
      puntiPersi,
      diffPunti: puntiVinti - puntiPersi,
      penalizzazioni,
      isPromozione: false,
      isPlayoff: false,
      isRetrocessione: false,
      forma: []
    });
  });
  squadre.forEach((sq, idx) => {
    sq.posizione = idx + 1;
    if (idx === 0) {
      sq.isPromozione = true;
    } else if (idx === 1) {
      sq.isPlayoff = true;
    } else if (idx >= squadre.length - 2 && squadre.length > 4) {
      sq.isRetrocessione = true;
    }
  });
  return squadre;
}

// server/parsers/calendarioParser.ts
import * as cheerio2 from "cheerio";
function parseCalendario(html) {
  const $ = cheerio2.load(html);
  const giornate = [];
  $("table").each((_, table) => {
    const $table = $(table);
    const tableText = $table.text();
    const giornataMatch = tableText.match(/(\d+)\^\s*Giornata/i);
    if (!giornataMatch) return;
    const numGiornata = parseInt(giornataMatch[1], 10);
    const titolo = `${numGiornata}^ Giornata`;
    const partiteAndata = [];
    const partiteRitorno = [];
    $table.find("tr").each((rowIdx, row) => {
      const $row = $(row);
      const cells = $row.find("td");
      if (cells.length !== 8) return;
      const dataAndata = $(cells[0]).text().trim();
      if (!dataAndata.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) return;
      const oraAndata = $(cells[1]).text().trim();
      const $risAndataCell = $(cells[2]);
      const risAndataText = $risAndataCell.text().trim();
      const casaAndata = $(cells[3]).text().trim().replace(/\s+/g, " ");
      const ospiteAndata = $(cells[4]).text().trim().replace(/\s+/g, " ");
      const $risRitornoCell = $(cells[5]);
      const risRitornoText = $risRitornoCell.text().trim();
      const oraRitorno = $(cells[6]).text().trim();
      const dataRitorno = $(cells[7]).text().trim();
      const parseMatch = (tipo, data, ora, casa, ospite, $cell, rawRis, matchIdx) => {
        const link = $cell.find("a[href]").attr("href") || null;
        let incontroId = null;
        if (link) {
          const m = link.match(/INCONTRO=(\d+)/i);
          if (m) incontroId = m[1];
        }
        const scoreMatch = rawRis.match(/(\d+)\s*[-:]\s*(\d+)/);
        const disputato = Boolean(scoreMatch);
        const puntiCasa = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
        const puntiOspite = scoreMatch ? parseInt(scoreMatch[2], 10) : null;
        let vincitore = null;
        if (disputato && puntiCasa !== null && puntiOspite !== null) {
          if (puntiCasa > puntiOspite) vincitore = "casa";
          else if (puntiOspite > puntiCasa) vincitore = "ospite";
          else vincitore = "pareggio";
        }
        const fullRefertoUrl = link ? link.startsWith("http") ? link : `https://portale.fitet.org/risultati/campionati/${link}` : null;
        return {
          id: `g${numGiornata}_${tipo}_${matchIdx}_${incontroId || "nomatch"}`,
          giornata: numGiornata,
          tipo,
          data,
          ora,
          squadraCasa: casa,
          squadraOspite: ospite,
          risultato: disputato ? `${puntiCasa} - ${puntiOspite}` : "-",
          puntiCasa,
          puntiOspite,
          disputato,
          refertoUrl: fullRefertoUrl,
          incontroId,
          vincitore
        };
      };
      partiteAndata.push(
        parseMatch("andata", dataAndata, oraAndata, casaAndata, ospiteAndata, $risAndataCell, risAndataText, rowIdx)
      );
      partiteRitorno.push(
        parseMatch("ritorno", dataRitorno, oraRitorno, ospiteAndata, casaAndata, $risRitornoCell, risRitornoText, rowIdx)
      );
    });
    if (partiteAndata.length > 0 || partiteRitorno.length > 0) {
      giornate.push({
        numero: numGiornata,
        titolo,
        partiteAndata,
        partiteRitorno
      });
    }
  });
  return giornate.sort((a, b) => a.numero - b.numero);
}

// server/parsers/statisticheParser.ts
import * as cheerio3 from "cheerio";
function parseStatisticheAtleti(html, athleteMapping = {}) {
  const $ = cheerio3.load(html);
  const atleti = [];
  $("table tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    if (cells.length < 12) return;
    const nomeText = $(cells[1]).text().trim().replace(/\s+/g, " ");
    if (!nomeText || nomeText === "Atleta" || nomeText.includes("S t a t i s t i c h e")) return;
    const flagImg = $(cells[0]).find("img").attr("src") || "";
    const flagMatch = flagImg.match(/bandiere\/([A-Za-z0-9_]+)\.png/i);
    const nazionalita = flagMatch ? flagMatch[1].toUpperCase() : "IT";
    const bandieraUrl = flagImg.startsWith("http") ? flagImg : `https://portale.fitet.org/images/bandiere/${nazionalita}.png`;
    const squadra = $(cells[2]).text().trim().replace(/\s+/g, " ");
    const getCellInt = (idx) => {
      const text = $(cells[idx]).text().trim().replace(/\D+/g, "");
      return parseInt(text, 10) || 0;
    };
    const incontriDisputati = getCellInt(3);
    const partiteDisputate = getCellInt(4);
    const partiteVinte = getCellInt(5);
    const partitePerse = getCellInt(6);
    const setVinti = getCellInt(7);
    const setPersi = getCellInt(8);
    const puntiVinti = getCellInt(9);
    const puntiPersi = getCellInt(10);
    const percText = $(cells[11]).text().trim().replace("%", "");
    const percentualeVittorie = parseFloat(percText) || 0;
    const athleteId = athleteMapping[nomeText] || athleteMapping[nomeText.toUpperCase()] || null;
    atleti.push({
      nazionalita,
      bandieraUrl,
      atleta: nomeText,
      atletaId: athleteId,
      squadra,
      incontriDisputati,
      partiteDisputate,
      partiteVinte,
      partitePerse,
      setVinti,
      setPersi,
      puntiVinti,
      puntiPersi,
      percentualeVittorie
    });
  });
  return atleti;
}

// server/parsers/atletaParser.ts
import * as cheerio4 from "cheerio";
function parseItalianNumber(val) {
  if (!val) return 0;
  const clean = val.trim();
  if (!clean) return 0;
  if (clean.includes(".") && clean.includes(",")) {
    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (clean.includes(",")) {
    return parseFloat(clean.replace(",", ".")) || 0;
  }
  if (/^\s*[+-]?\d{1,3}(?:\.\d{3})+\s*$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, "")) || 0;
  }
  return parseFloat(clean) || 0;
}
function parseDettaglioAtleta(html, atletaId) {
  const $ = cheerio4.load(html);
  const $titolo = $("p.titolo").first();
  const nomeRaw = $titolo.text().replace(/\s+/g, " ").trim();
  const flagImg = $titolo.find("img.immagine").first();
  const flagSrc = flagImg.attr("src") || "";
  const flagMatch = flagSrc.match(/bandiere\/([A-Za-z0-9_]+)\.png/i);
  const nazionalita = flagImg.attr("title") || (flagMatch ? flagMatch[1] : "IT");
  const bandieraUrl = flagSrc.startsWith("http") ? flagSrc : `https://portale.fitet.org/images/bandiere/${flagMatch ? flagMatch[1] : "IT"}.png`;
  const photoImg = $('img[src*="/atleti/"]').first();
  const photoSrc = photoImg.attr("src") || "";
  const photoMatch = photoSrc.match(/atleti\/(\d+)\.jpg/i);
  const fotoId = photoMatch ? photoMatch[1] : atletaId;
  const fotoUrl = `https://portale.fitet.org/images/atleti/${fotoId}.jpg`;
  const getFieldValue = (label) => {
    let result = "";
    $("td").each((_, td) => {
      const $td = $(td);
      const text = $td.text().trim();
      if (text.toLowerCase().includes(label.toLowerCase())) {
        const nextTd = $td.next("td");
        if (nextTd.length > 0) {
          result = nextTd.text().replace(/\s+/g, " ").trim();
          return false;
        }
      }
    });
    return result;
  };
  const dataNascitaRaw = getFieldValue("Dati di Nascita");
  const dataNascitaMatch = dataNascitaRaw.match(/(\d{2}\/\d{2}\/\d{4})/);
  const dataNascita = dataNascitaMatch ? dataNascitaMatch[1] : dataNascitaRaw;
  const luogoNascita = dataNascitaRaw.replace(/.*?a\s*/i, "").trim();
  const settore = getFieldValue("Settore Agonistico") || "Seniores";
  const societa = getFieldValue("Societa' appartenenza") || getFieldValue("Societa") || "";
  const regione = getFieldValue("Regione") || "Calabria";
  const catRaw = getFieldValue("Categoria");
  let categoria = catRaw;
  let punti = 0;
  const puntiMatch = catRaw.match(/punti\s*([\d\.,]+)/i);
  if (puntiMatch) {
    punti = parseItalianNumber(puntiMatch[1]);
    categoria = catRaw.replace(/punti\s*[\d\.,]+/i, "").trim();
  }
  let stato = $(".style5").text().trim();
  if (!stato) {
    const classNum = $("p.classifica").text().trim();
    stato = classNum ? `N. ${classNum}` : "Attivo";
  }
  const recordClassifica = getFieldValue("Record classifica");
  const $riepilogoTable = $("#fragment-1 table").first();
  let puntiIniziali = 0;
  let puntiInizialiData = "";
  let puntiTotali = 0;
  let punteggioFinale = punti;
  let partiteGiocate = 0;
  let partiteVinte = 0;
  let partitePerse = 0;
  let percentualePositiva = 0;
  if ($riepilogoTable.length > 0) {
    const rows = $riepilogoTable.find("tr");
    if (rows.length >= 2) {
      const dataRow = $(rows[1]);
      const dataCells = dataRow.find("td");
      if (dataCells.length >= 7) {
        const initText = $(dataCells[0]).text().trim();
        const initMatch = initText.match(/([\d\.,]+)\s*\[?\s*(\d{2}\/\d{2}\/\d{4})?/);
        if (initMatch) {
          puntiIniziali = parseItalianNumber(initMatch[1]);
          puntiInizialiData = initMatch[2] || "";
        }
        puntiTotali = parseItalianNumber($(dataCells[1]).text().trim());
        punteggioFinale = parseItalianNumber($(dataCells[2]).text().trim()) || punti;
        partiteGiocate = parseInt($(dataCells[3]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[4]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[5]).text().trim(), 10) || 0;
        percentualePositiva = parseItalianNumber($(dataCells[6]).text().trim().replace("%", ""));
      }
    }
  }
  const storicoClassifica = [];
  $("#fragment-4 table tr").each((idx, tr) => {
    if (idx === 0) return;
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const data = $(cells[0]).text().trim();
    if (!data.match(/\d{4}-\d{2}-\d{2}/) && !data.match(/\d{2}\/\d{2}\/\d{4}/)) return;
    const posText = $(cells[1]).text().trim();
    const posizione = posText ? parseInt(posText, 10) || null : null;
    const pt = parseItalianNumber($(cells[2]).text().trim());
    const cat = $(cells[3]).text().trim() || categoria;
    storicoClassifica.push({
      data,
      punti: pt,
      posizione,
      categoria: cat
    });
  });
  storicoClassifica.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const ultimoSnapshot = storicoClassifica.length > 0 ? storicoClassifica[storicoClassifica.length - 1] : null;
  const puntiEffettivi = punteggioFinale || punti || (ultimoSnapshot ? ultimoSnapshot.punti : 0);
  return {
    id: atletaId,
    anagrafica: {
      nome: nomeRaw || `Atleta ${atletaId}`,
      nazionalita,
      bandieraUrl,
      fotoId,
      fotoUrl,
      dataNascita,
      luogoNascita,
      settore,
      societa,
      regione,
      categoria,
      punti: puntiEffettivi,
      stato,
      recordClassifica
    },
    riepilogo: {
      puntiIniziali,
      puntiInizialiData,
      puntiTotali,
      punteggioFinale: puntiEffettivi,
      partiteGiocate,
      partiteVinte,
      partitePerse,
      percentualePositiva
    },
    storicoClassifica
  };
}

// server/parsers/refertoParser.ts
import * as cheerio5 from "cheerio";
function resolveFitetUrl(src) {
  if (!src) return void 0;
  if (src.startsWith("http")) return src;
  const clean = src.replace(/^(\.\.\/)+/, "");
  return `https://portale.fitet.org/${clean}`;
}
function parseRefertoIncontro(html, incontroId, camId, formulaId) {
  const $ = cheerio5.load(html);
  const $incontri = $("p.incontro");
  let casaNome = "";
  let ospiteNome = "";
  if ($incontri.length >= 2) {
    casaNome = $($incontri[0]).text().replace(/\s+/g, " ").trim();
    ospiteNome = $($incontri[1]).text().replace(/\s+/g, " ").trim();
  }
  if (!casaNome || !ospiteNome) {
    const $schede = $("p.titolo_scheda");
    if ($schede.length >= 2) {
      if (!casaNome) casaNome = $($schede[0]).text().replace(/\s+/g, " ").trim();
      if (!ospiteNome) ospiteNome = $($schede[1]).text().replace(/\s+/g, " ").trim();
    }
  }
  const $immagini = $('img[src*="/societa/"], img.immagine');
  const logoCasa = resolveFitetUrl($($immagini[0]).attr("src"));
  const logoOspite = resolveFitetUrl($($immagini[1]).attr("src"));
  let puntiCasa = 0;
  let puntiOspite = 0;
  let setTotaliCasa = 0;
  let setTotaliOspite = 0;
  let puntiTotaliCasa = 0;
  let puntiTotaliOspite = 0;
  const $scoreTable = $('table[bgcolor="#DCDCDC"], table[bgcolor="#dcdcdc"]').first();
  if ($scoreTable.length > 0) {
    $scoreTable.find("tr").each((_, tr) => {
      const $tr = $(tr);
      const text = $tr.text().toUpperCase();
      const cells = $tr.find("td");
      if (cells.length >= 3) {
        if (text.includes(":") && (text.includes("0") || text.includes("1") || text.includes("2") || text.includes("3") || text.includes("4") || text.includes("5") || text.includes("6") || text.includes("7"))) {
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) puntiCasa = c;
          if (!isNaN(o)) puntiOspite = o;
        } else if (text.includes("SET")) {
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) setTotaliCasa = c;
          if (!isNaN(o)) setTotaliOspite = o;
        } else if (text.includes("PUNTI")) {
          const c = parseInt($(cells[0]).text().trim(), 10);
          const o = parseInt($(cells[2]).text().trim(), 10);
          if (!isNaN(c)) puntiTotaliCasa = c;
          if (!isNaN(o)) puntiTotaliOspite = o;
        }
      }
    });
  }
  let giornata = "";
  let arbitro;
  let campoGara;
  const bodyText = $("body").text().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const gMatch = bodyText.match(/(\d+\^\s*Giornata(?:\s*del\s*[\d\/]+)?)/i);
  if (gMatch) giornata = gMatch[1].trim();
  const arbMatch = bodyText.match(/Arbitro:\s*([A-Za-z\s'\.]+?)(?=\s*(?:Campo|Palestra|Societ|Contrada|$))/i);
  if (arbMatch) {
    arbitro = arbMatch[1].trim();
  } else {
    const fallbackArb = bodyText.match(/Arbitro:\s*([^\s]+(?:\s+[^\s]+){1,3})/i);
    if (fallbackArb) arbitro = fallbackArb[1].trim();
  }
  const $campoGara = $("p.campo_gara");
  if ($campoGara.length > 0) {
    campoGara = $campoGara.html()?.replace(/<br\s*[\/]?>/gi, " - ")?.replace(/<[^>]+>/g, "")?.replace(/Campo gara principale:\s*/i, "")?.replace(/\u00a0/g, " ")?.replace(/\s+/g, " ")?.trim()?.replace(/^[\s\-]+/, "");
  }
  const partite = [];
  $("tr").each((rowIdx, tr) => {
    const $tr = $(tr);
    const link = $tr.find('a[href*="dettaglio_partita.php"]');
    if (link.length === 0) return;
    const cells = $tr.find("td");
    if (cells.length < 14) return;
    const href = link.attr("href") || "";
    const idMatch = href.match(/ID=(\d+)/i);
    const partitaId = idMatch ? idMatch[1] : `match_${rowIdx}`;
    const num = parseInt(link.text().trim(), 10) || partite.length + 1;
    const $cellCasa = $(cells[1]);
    const atletaCasa = $cellCasa.text().replace(/\s+/g, " ").trim();
    const isCasaWinner = $cellCasa.find("b").length > 0;
    const $cellOspite = $(cells[2]);
    const atletaOspite = $cellOspite.text().replace(/\s+/g, " ").trim();
    const isOspiteWinner = $cellOspite.find("b").length > 0;
    const sets = [];
    for (let s = 0; s < 5; s++) {
      const idxCasa = 3 + s * 2;
      const idxOspite = 4 + s * 2;
      if (idxOspite < cells.length) {
        const pCasa = parseInt($(cells[idxCasa]).text().trim(), 10);
        const pOspite = parseInt($(cells[idxOspite]).text().trim(), 10);
        if (!isNaN(pCasa) && !isNaN(pOspite) && (pCasa > 0 || pOspite > 0)) {
          sets.push({
            setNumero: s + 1,
            puntiCasa: pCasa,
            puntiOspite: pOspite
          });
        }
      }
    }
    const sv = parseInt($(cells[13]).text().trim(), 10) || 0;
    const sp = parseInt($(cells[14]).text().trim(), 10) || 0;
    partite.push({
      id: partitaId,
      numero: num,
      atletaCasa,
      atletaOspite,
      isCasaWinner,
      isOspiteWinner,
      sets,
      setVintiCasa: sv,
      setVintiOspite: sp
    });
  });
  return {
    incontroId,
    camId,
    formulaId,
    giornata: giornata || "Referto di Gara",
    arbitro,
    campoGara,
    squadraCasa: {
      nome: casaNome || "Squadra Casa",
      logoUrl: logoCasa,
      punti: puntiCasa,
      setTotali: setTotaliCasa,
      puntiTotali: puntiTotaliCasa
    },
    squadraOspite: {
      nome: ospiteNome || "Squadra Ospite",
      logoUrl: logoOspite,
      punti: puntiOspite,
      setTotali: setTotaliOspite,
      puntiTotali: puntiTotaliOspite
    },
    partite
  };
}
function parseDettaglioPartita(html, partitaId) {
  const $ = cheerio5.load(html);
  const rows = $('table[width="716"] > tr, table[width="716"] > tbody > tr');
  let headerRow = rows.eq(0);
  let detailRow = rows.eq(1);
  if (rows.length === 0) {
    headerRow = $("tr").filter((_, tr) => $(tr).find("> td").length === 3 && $(tr).find("p.titolo").length > 0).first();
    detailRow = headerRow.next("tr");
  }
  const headerTds = headerRow.find("> td");
  let atletaCasaNome = "";
  let atletaOspiteNome = "";
  let risultatoSet = "";
  if (headerTds.length >= 3) {
    const casaTitoli = [];
    headerTds.eq(0).find("p.titolo").each((_, p) => {
      const t = $(p).text().replace(/\s+/g, " ").trim();
      if (t) casaTitoli.push(t);
    });
    atletaCasaNome = casaTitoli.join(" - ");
    risultatoSet = headerTds.eq(1).find("p.titolo").first().text().replace(/\s+/g, " ").trim();
    const ospiteTitoli = [];
    headerTds.eq(2).find("p.titolo").each((_, p) => {
      const t = $(p).text().replace(/\s+/g, " ").trim();
      if (t) ospiteTitoli.push(t);
    });
    atletaOspiteNome = ospiteTitoli.join(" - ");
  } else {
    const $titoli = $("p.titolo");
    if ($titoli.length >= 3) {
      atletaCasaNome = $($titoli[0]).text().replace(/\s+/g, " ").trim();
      risultatoSet = $($titoli[1]).text().replace(/\s+/g, " ").trim();
      atletaOspiteNome = $($titoli[2]).text().replace(/\s+/g, " ").trim();
    }
  }
  const flagCasa = resolveFitetUrl(headerTds.eq(0).find('img[src*="/bandiere/"]').attr("src"));
  const flagOspite = resolveFitetUrl(headerTds.eq(2).find('img[src*="/bandiere/"]').attr("src"));
  const detailTds = detailRow.find("> td");
  let fotoCasa;
  let fotoOspite;
  let atletaCasaId;
  let atletaOspiteId;
  if (detailTds.length >= 3) {
    detailTds.eq(0).find("img").each((_, img) => {
      const src = $(img).attr("src") || "";
      const m = src.match(/atleti\/(\d+)\.jpg/i);
      if (m && !atletaCasaId) {
        atletaCasaId = m[1];
        fotoCasa = resolveFitetUrl(src);
      } else if (src.includes("atleti/") && !src.includes("-vuoto") && !fotoCasa) {
        fotoCasa = resolveFitetUrl(src);
      }
    });
    detailTds.eq(2).find("img").each((_, img) => {
      const src = $(img).attr("src") || "";
      const m = src.match(/atleti\/(\d+)\.jpg/i);
      if (m && !atletaOspiteId) {
        atletaOspiteId = m[1];
        fotoOspite = resolveFitetUrl(src);
      } else if (src.includes("atleti/") && !src.includes("-vuoto") && !fotoOspite) {
        fotoOspite = resolveFitetUrl(src);
      }
    });
  }
  const sets = [];
  let puntiTotali = "";
  $("table table tr").each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.find("td");
    if (tds.length === 3) {
      const label = $(tds[1]).text().trim();
      const pCasa = parseInt($(tds[0]).text().trim(), 10);
      const pOspite = parseInt($(tds[2]).text().trim(), 10);
      if (label.includes("set")) {
        const setNum = parseInt(label.replace(/\D/g, ""), 10) || sets.length + 1;
        if (!isNaN(pCasa) && !isNaN(pOspite) && (pCasa > 0 || pOspite > 0)) {
          sets.push({
            setNumero: setNum,
            puntiCasa: pCasa,
            puntiOspite: pOspite
          });
        }
      }
    } else if (tds.length === 1) {
      const totText = $(tds[0]).text().replace(/\s+/g, " ").trim();
      if (totText.includes(":")) {
        puntiTotali = totText;
      }
    }
  });
  return {
    id: partitaId,
    atletaCasa: {
      nome: atletaCasaNome,
      bandieraUrl: flagCasa,
      fotoUrl: fotoCasa,
      atletaId: atletaCasaId
    },
    atletaOspite: {
      nome: atletaOspiteNome,
      bandieraUrl: flagOspite,
      fotoUrl: fotoOspite,
      atletaId: atletaOspiteId
    },
    risultatoSet,
    puntiTotali,
    sets
  };
}

// server/app.ts
var app = express();
app.use(cors());
app.use(express.json());
var CAM_ID = 1902;
var ANNO_ID = 41;
var TTL_CLASSIFICA = 30 * 60 * 1e3;
var TTL_CALENDARIO = 30 * 60 * 1e3;
var TTL_STATISTICHE = 60 * 60 * 1e3;
var TTL_ATLETA = 24 * 60 * 60 * 1e3;
var TTL_REFERTO = 12 * 60 * 60 * 1e3;
function computeTeamForm(classifica, calendario) {
  const playedMatches = [];
  for (const g of calendario) {
    for (const m of [...g.partiteAndata, ...g.partiteRitorno]) {
      if (m.disputato && m.puntiCasa !== null && m.puntiOspite !== null) {
        playedMatches.push({
          casa: m.squadraCasa,
          ospite: m.squadraOspite,
          puntiCasa: m.puntiCasa,
          puntiOspite: m.puntiOspite,
          giornata: m.giornata
        });
      }
    }
  }
  playedMatches.sort((a, b) => a.giornata - b.giornata);
  return classifica.map((team) => {
    const teamNorm = team.nome.toUpperCase().replace(/\s+/g, " ");
    const teamForm = [];
    for (const m of playedMatches) {
      const casaNorm = m.casa.toUpperCase().replace(/\s+/g, " ");
      const ospiteNorm = m.ospite.toUpperCase().replace(/\s+/g, " ");
      if (casaNorm === teamNorm || teamNorm.includes(casaNorm) || casaNorm.includes(teamNorm)) {
        if (m.puntiCasa > m.puntiOspite) teamForm.push("V");
        else if (m.puntiCasa < m.puntiOspite) teamForm.push("P");
        else teamForm.push("N");
      } else if (ospiteNorm === teamNorm || teamNorm.includes(ospiteNorm) || ospiteNorm.includes(teamNorm)) {
        if (m.puntiOspite > m.puntiCasa) teamForm.push("V");
        else if (m.puntiOspite < m.puntiCasa) teamForm.push("P");
        else teamForm.push("N");
      }
    }
    return {
      ...team,
      forma: teamForm.slice(-5)
      // Last 5 matches
    };
  });
}
async function getClassifica(forceRefresh = false) {
  const cacheKey = `classifica_${CAM_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  const html = await FitetClient.fetchClassifica(CAM_ID);
  const data = parseClassifica(html);
  cacheService.set(cacheKey, data, TTL_CLASSIFICA);
  return data;
}
async function getCalendario(forceRefresh = false) {
  const cacheKey = `calendario_${CAM_ID}_${ANNO_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  const html = await FitetClient.fetchCalendario(CAM_ID, ANNO_ID);
  const data = parseCalendario(html);
  cacheService.set(cacheKey, data, TTL_CALENDARIO);
  return data;
}
async function getStatistiche(forceRefresh = false) {
  const cacheKey = `statistiche_${CAM_ID}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  const html = await FitetClient.fetchStatisticheAtleti(CAM_ID);
  const mapping = athleteResolver.getMapping();
  const data = parseStatisticheAtleti(html, mapping);
  cacheService.set(cacheKey, data, TTL_STATISTICHE);
  return data;
}
app.get("/api/dashboard", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(forceRefresh),
      getCalendario(forceRefresh),
      getStatistiche(forceRefresh)
    ]);
    const classifica = computeTeamForm(rawClassifica, calendario);
    const payload = {
      classifica,
      calendario,
      statisticheAtleti,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      championship: {
        id: CAM_ID,
        anno: ANNO_ID,
        nome: "Serie D/1",
        girone: "Girone Nord",
        regione: "Calabria"
      }
    };
    res.json(payload);
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Errore durante il recupero dei dati FITeT", details: error.message });
  }
});
app.get("/api/classifica", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const data = await getClassifica(forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/calendario", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const data = await getCalendario(forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/statistiche", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const data = await getStatistiche(forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/atleta/:id", async (req, res) => {
  let { id } = req.params;
  const forceRefresh = req.query.refresh === "true";
  if (!id || id === "null" || id === "undefined") {
    return res.status(400).json({ error: "ID atleta non valido" });
  }
  if (!/^\d+$/.test(id)) {
    const cleanName = decodeURIComponent(id).trim();
    const resolvedId = await athleteResolver.resolveAthleteId(cleanName);
    if (resolvedId) {
      id = resolvedId;
    } else {
      return res.status(404).json({ error: `Impossibile risolvere ID federale per "${cleanName}"` });
    }
  }
  const cacheKey = `atleta_${id}`;
  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const html = await FitetClient.fetchSchedaAtleta(id);
    const atleta = parseDettaglioAtleta(html, id);
    cacheService.set(cacheKey, atleta, TTL_ATLETA);
    res.json(atleta);
  } catch (error) {
    console.error(`Error fetching athlete ${id}:`, error);
    res.status(500).json({ error: "Errore nel recupero della scheda atleta", details: error.message });
  }
});
app.get("/api/search-atleta", async (req, res) => {
  const query = req.query.q || "";
  if (!query || query.length < 2) {
    return res.json([]);
  }
  try {
    const results = await FitetClient.searchAtleta(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/referto/:incontroId", async (req, res) => {
  const { incontroId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : CAM_ID;
  const formula = req.query.formula ? parseInt(req.query.formula, 10) : 19;
  const forceRefresh = req.query.refresh === "true";
  const cacheKey = `referto_${incontroId}_${cam}_${formula}`;
  if (!incontroId || incontroId === "null" || incontroId === "undefined") {
    return res.status(400).json({ error: "ID incontro non valido" });
  }
  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const html = await FitetClient.fetchRefertoIncontro(incontroId, cam, formula);
    const referto = parseRefertoIncontro(html, incontroId, String(cam), String(formula));
    cacheService.set(cacheKey, referto, TTL_REFERTO);
    res.json(referto);
  } catch (error) {
    console.error(`Error fetching referto ${incontroId}:`, error);
    res.status(500).json({ error: "Errore nel recupero del referto di gara", details: error.message });
  }
});
app.get("/api/partita/:partitaId", async (req, res) => {
  const { partitaId } = req.params;
  const forceRefresh = req.query.refresh === "true";
  const cacheKey = `partita_${partitaId}`;
  if (!partitaId || partitaId === "null" || partitaId === "undefined") {
    return res.status(400).json({ error: "ID partita non valido" });
  }
  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const html = await FitetClient.fetchDettaglioPartita(partitaId);
    const dettaglio = parseDettaglioPartita(html, partitaId);
    if (!dettaglio.atletaCasa.atletaId && dettaglio.atletaCasa.nome) {
      const primaryName = dettaglio.atletaCasa.nome.split("-")[0].trim();
      const resolved = await athleteResolver.resolveAthleteId(primaryName);
      if (resolved) dettaglio.atletaCasa.atletaId = resolved;
    }
    if (!dettaglio.atletaOspite.atletaId && dettaglio.atletaOspite.nome) {
      const primaryName = dettaglio.atletaOspite.nome.split("-")[0].trim();
      const resolved = await athleteResolver.resolveAthleteId(primaryName);
      if (resolved) dettaglio.atletaOspite.atletaId = resolved;
    }
    cacheService.set(cacheKey, dettaglio, TTL_ATLETA);
    res.json(dettaglio);
  } catch (error) {
    console.error(`Error fetching dettaglio partita ${partitaId}:`, error);
    res.status(500).json({ error: "Errore nel recupero del dettaglio partita", details: error.message });
  }
});
app.post("/api/refresh", async (req, res) => {
  try {
    cacheService.clear();
    athleteResolver.reloadMapping();
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(true),
      getCalendario(true),
      getStatistiche(true)
    ]);
    const classifica = computeTeamForm(rawClassifica, calendario);
    res.json({ success: true, timestamp: (/* @__PURE__ */ new Date()).toISOString(), classifica, calendario, statisticheAtleti });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
if (!process.env.VERCEL) {
  const distPath = path3.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const indexFile = path3.join(distPath, "index.html");
    res.sendFile(indexFile, (err) => {
      if (err) res.status(404).send("Not Found");
    });
  });
}
var app_default = app;
export {
  app,
  app_default as default
};
