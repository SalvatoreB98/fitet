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
    punti = parseFloat(puntiMatch[1].replace(",", ".")) || 0;
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
          puntiIniziali = parseFloat(initMatch[1].replace(",", ".")) || 0;
          puntiInizialiData = initMatch[2] || "";
        }
        puntiTotali = parseFloat($(dataCells[1]).text().trim().replace(",", ".")) || 0;
        punteggioFinale = parseFloat($(dataCells[2]).text().trim().replace(",", ".")) || punti;
        partiteGiocate = parseInt($(dataCells[3]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[4]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[5]).text().trim(), 10) || 0;
        percentualePositiva = parseFloat($(dataCells[6]).text().trim().replace("%", "")) || 0;
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
    const ptText = $(cells[2]).text().trim().replace(",", ".");
    const pt = parseFloat(ptText) || 0;
    const cat = $(cells[3]).text().trim() || categoria;
    storicoClassifica.push({
      data,
      punti: pt,
      posizione,
      categoria: cat
    });
  });
  storicoClassifica.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
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
      punti: punteggioFinale || punti,
      stato,
      recordClassifica
    },
    riepilogo: {
      puntiIniziali,
      puntiInizialiData,
      puntiTotali,
      punteggioFinale: punteggioFinale || punti,
      partiteGiocate,
      partiteVinte,
      partitePerse,
      percentualePositiva
    },
    storicoClassifica
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
  const { id } = req.params;
  const forceRefresh = req.query.refresh === "true";
  const cacheKey = `atleta_${id}`;
  if (!id || id === "null" || id === "undefined") {
    return res.status(400).json({ error: "ID atleta non valido" });
  }
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
