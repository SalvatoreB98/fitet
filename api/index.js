// server/app.ts
import express from "express";
import cors from "cors";
import path5 from "path";
import fs5 from "fs";

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
      headers["Referer"] = customReferer || "https://portale.fitet.org/risultati/new_rank/testaclassifica_auto.php?ID_CLASS=248&ID=1&PASS=20";
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
   * Fetches a FITeT page through a POST form and decodes the ISO-8859-1 response.
   */
  static async postForm(url, formData, customReferer) {
    const headers = {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": customReferer || `${BASE_URL}/risultati/new_rank/scelta_atleta.php`
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12e3);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: new URLSearchParams(formData).toString(),
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
  static async fetchClassifica(cam) {
    const url = `${BASE_URL}/risultati/campionati/classifica_squadre.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 2: Calendario & Incontri
   */
  static async fetchCalendario(cam, anno = 41) {
    const url = `${BASE_URL}/risultati/campionati/Calendario.asp?CAM=${cam}&ANNO=${anno}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 3: Statistiche Atleti Girone
   */
  static async fetchStatisticheAtleti(cam) {
    const url = `${BASE_URL}/risultati/campionati/statistiche_atleti.php?CAM=${cam}`;
    return this.fetchHtml(url);
  }
  /**
   * Endpoint 4: Scheda Singolo Atleta (Ranking & Storico Punti)
   */
  static async fetchSchedaAtleta(atletaId, idClass = 248) {
    const url = `${BASE_URL}/risultati/new_rank/dettaglioatleta_unica.php?ATLETA=${atletaId}&ID_CLASS=${idClass}&ZU=1&AVVERSARIO=0`;
    return this.fetchHtml(url, true);
  }
  /**
   * Autocomplete search for athletes
   */
  static async searchAtleta(query) {
    const rawClean = query.trim();
    if (!rawClean || rawClean.length < 2) return [];
    const hasApostrophe = /['\u2018\u2019\u02BC`\u00B4]/.test(rawClean);
    const variants = /* @__PURE__ */ new Set();
    if (hasApostrophe) {
      const spaced = rawClean.replace(/['\u2018\u2019\u02BC`\u00B4]/g, " ").replace(/\s+/g, " ").trim();
      if (spaced.length >= 2) variants.add(spaced);
      const attached = rawClean.replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, "").trim();
      if (attached.length >= 2) variants.add(attached);
    } else {
      variants.add(rawClean);
      if (/^d[aeiou]/i.test(rawClean) && rawClean.length >= 4) {
        variants.add(rawClean.replace(/^d([aeiou])/i, "d $1"));
      } else if (/^dell[aeiou]/i.test(rawClean) && rawClean.length >= 6) {
        variants.add(rawClean.replace(/^dell([aeiou])/i, "dell $1"));
      }
    }
    const fetchVariant = async (term) => {
      const url = `${BASE_URL}/risultati/new_rank/ajax.php?term=${encodeURIComponent(term)}`;
      try {
        const text = await this.fetchHtml(url, true);
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const resultsLists = await Promise.all(Array.from(variants).map((v) => fetchVariant(v)));
    const map = /* @__PURE__ */ new Map();
    for (const list of resultsLists) {
      for (const item of list) {
        if (item && item.id && item.id !== "#" && !map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }
    const allResults = Array.from(map.values());
    if (allResults.length === 0) return [];
    const normalizedUser = rawClean.toUpperCase().replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, "");
    const userWords = rawClean.toUpperCase().replace(/['\u2018\u2019\u02BC`\u00B4]/g, " ").split(/\s+/).filter(Boolean);
    const scored = allResults.map((item) => {
      const valUpper = (item.value || "").toUpperCase();
      const valClean = valUpper.replace(/['\u2018\u2019\u02BC`\u00B4\s]/g, "");
      let score = 0;
      if (valClean.startsWith(normalizedUser)) {
        score += 1e3;
      } else if (valUpper.startsWith(rawClean.toUpperCase())) {
        score += 800;
      } else if (valClean.includes(normalizedUser)) {
        score += 500;
      }
      const allWordsPresent = userWords.every((w) => valUpper.includes(w) || valClean.includes(w));
      if (allWordsPresent) {
        score += 200;
      }
      if (hasApostrophe && !valClean.includes(normalizedUser)) {
        score -= 300;
      }
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    if (hasApostrophe) {
      const positive = scored.filter((s) => s.score > 0);
      return positive.length > 0 ? positive.map((s) => s.item) : scored.map((s) => s.item);
    }
    return scored.map((s) => s.item);
  }
  /**
   * Ricerca atleti tramite il form ufficiale "scelta_atleta.php".
   * ATLETA viene usato da FITeT per escludere l'atleta già selezionato.
   */
  static async fetchSceltaAtleta(query, excludeId = "0", idClass = 248) {
    const url = `${BASE_URL}/risultati/new_rank/scelta_atleta.php`;
    return this.postForm(
      url,
      {
        CERCA: query.trim(),
        ATLETA: excludeId || "0",
        ZU: "1",
        ID_CLASS: String(idClass)
      },
      `${BASE_URL}/risultati/new_rank/scelta_atleta.php`
    );
  }
  /**
   * Endpoint 5: Referto Incontro Gara
   */
  static async fetchRefertoIncontro(incontroId, cam, formula = 19) {
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
  legacyCacheDir;
  memoryCache = /* @__PURE__ */ new Map();
  constructor() {
    const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    this.cacheDir = isServerless ? path.join("/tmp", "fitet_cache") : path.resolve(process.cwd(), "node_modules", ".cache", "fitet_cache");
    this.legacyCacheDir = path.resolve(process.cwd(), "server", "cache");
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
    let filePath = path.join(this.cacheDir, `${encodeURIComponent(key)}.json`);
    if (!fs.existsSync(filePath)) {
      const legacyPath = path.join(this.legacyCacheDir, `${encodeURIComponent(key)}.json`);
      if (fs.existsSync(legacyPath)) {
        filePath = legacyPath;
      }
    }
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
    const legacyPath = path.join(this.legacyCacheDir, `${encodeURIComponent(key)}.json`);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.unlinkSync(legacyPath);
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

// server/services/viewsService.ts
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();
var ViewsService = class {
  supabase = null;
  memoryCache = /* @__PURE__ */ new Map();
  constructor() {
    this.initClient();
  }
  initClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      try {
        this.supabase = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        });
        console.log("\u2705 [ViewsService] Supabase connesso con successo.");
      } catch (err) {
        console.error("\u274C [ViewsService] Errore inizializzazione client Supabase:", err);
        this.supabase = null;
      }
    } else {
      console.warn("\u26A0\uFE0F [ViewsService] Credenziali SUPABASE_URL / KEY non trovate: fallback in memoria locale.");
    }
  }
  /**
   * Converte l'id atleta in numero valido (es. "593082" -> 593082)
   */
  parsePlayerId(id) {
    if (!id) return null;
    const clean = id.replace(/\D/g, "");
    if (!clean) return null;
    const parsed = parseInt(clean, 10);
    return isNaN(parsed) ? null : parsed;
  }
  /**
   * Incrementa atomicamente il contatore delle visualizzazioni per un determinato atleta.
   */
  async incrementViews(id, ip = null) {
    if (!id) return 0;
    const playerId = this.parsePlayerId(String(id));
    const cacheKey = String(playerId ?? id);
    if (this.supabase && playerId !== null) {
      try {
        const { data: rpcCount, error: rpcError } = await this.supabase.rpc("increment_athlete_views", {
          p_player_id: Number(playerId),
          p_client_ip: ip,
          p_cooldown_minutes: 60
        });
        console.log(`[ViewsService] RPC result:`, { rpcCount, rpcError });
        if (!rpcError && rpcCount !== null && rpcCount !== void 0) {
          const count = Number(rpcCount);
          this.memoryCache.set(cacheKey, count);
          return count;
        }
        if (rpcError) {
          console.error(`[ViewsService] Errore RPC increment_athlete_views:`, rpcError);
        }
        const { data: existing } = await this.supabase.from("views").select("count").eq("playerId", playerId).maybeSingle();
        const currentFromDb = Number(existing?.count || 0);
        this.memoryCache.set(cacheKey, currentFromDb);
        return currentFromDb;
      } catch (err) {
        console.error(`[ViewsService] Eccezione Supabase:`, err);
      }
    }
    return this.memoryCache.get(cacheKey) || 0;
  }
  /**
   * Recupera il contatore delle visualizzazioni per un determinato atleta.
   */
  async getViews(id) {
    if (!id) return 0;
    const playerId = this.parsePlayerId(id);
    const cacheKey = String(playerId ?? id);
    if (this.supabase && playerId !== null) {
      try {
        const { data, error } = await this.supabase.from("views").select("count").eq("playerId", playerId).maybeSingle();
        if (!error && data && typeof data.count === "number") {
          this.memoryCache.set(cacheKey, data.count);
          return data.count;
        }
      } catch (err) {
        console.error(`[ViewsService] Errore lettura Supabase getViews per ${playerId}:`, err);
      }
    }
    return this.memoryCache.get(cacheKey) || 0;
  }
};
var viewsService = new ViewsService();

// server/services/athleteResolver.ts
import fs2 from "fs";
import path2 from "path";
import * as cheerio from "cheerio";

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
  "RITACCO SIMONE": "824825",
  "GRANATO BORIS": "835128",
  "BELSITO MASSIMO": "830623",
  "GACCIONE CLAUDIA MARIA": "800248",
  "MILICCHIO ENEA": "818653",
  "BRANCA FRANCESCO": "829065",
  "FERRARO LUIGI ANGELO": "824196",
  "MONTESANTO MARIO": "797038",
  "D'ANDREA MARCO": "817090",
  "RENDE FEDELE": "743857",
  "FILOGRANA G": "745378",
  "CARRO SANDRO": "799213",
  "RUBINO CLAUDIO": "600410",
  "PEPINO GIANCARLO": "766358",
  "DE SIMONE DARIO": "613242",
  "PAPACCIO LUIGI": "766660",
  "RUBINO C - PAPACCIO L": "803850",
  "CARBONE PASQUALE": "767384",
  "SERRAPICA IMMACOLATA AURORA": "742040",
  "NUNZIATA ROCCO": "767650",
  "SERRAPICA IMMACOLATA A - NUNZIATA R": "848382",
  "MARZUILLO GIUSEPPE": "698681",
  "AVERSA ANTONINO": "591957",
  "MARESCA ALBERTO": "764636",
  "CAFIERO GIUSEPPE": "591950",
  "CAFIERO G - AVERSA A": "848781",
  "MARZUILLO G - AVERSA A": "849788",
  "CANDELMO MAURIZIO": "714427",
  "TROPEANO PAOLO": "709842",
  "TROPEANO FLAVIO": "816181",
  "TROPEANO F - TROPEANO P": "849496",
  "DI MARZO ROSARIO": "772773",
  "BRUNASSO GIOVANNI BATTISTA": "789732",
  "MASSA LUIGI": "731346",
  "SCOGNAMIGLIO PAOLO": "834763",
  "BORRIELLO FRANCESCO": "731672",
  "DI MARZO R - SCOGNAMIGLIO P": "848780",
  "MASSA L - DI MARZO R": "849452",
  "MARTONE GIOVANNI": "732904",
  "SAGLIOCCO RICCARDO": "772261",
  "CRISPINO ANGELO": "592291",
  "MERCIAI DARIO": "747111",
  "MARTONE G - CRISPINO A": "848133",
  "SAGLIOCCO R - MARTONE G": "849787",
  "D'ANIELLO GABRIELE": "723906",
  "ESPOSITO MAURIZIO": "738529",
  "VERNILLO NICOLA": "613244",
  "GALIERO GIOVANNI": "723475",
  "VITTORIOSO ANTONIO": "758502",
  "D'ANIELLO G - VERNILLO N": "848380",
  "FAMA' DANIELE AGAZIO": "766354",
  "FERRARO NICOLA": "735053",
  "CUCCI PAOLO": "705292",
  "CUCCI P - FERRARO N": "819144",
  "SILVESTRO SALVATORE": "591644",
  "CAVALLARI ADOLFO": "610207",
  "FERRARO FRANCESCO": "612185",
  "CAVALLARI A - SILVESTRO S": "832289",
  "CUSATO ANTONIO FRANCO": "594596",
  "LACAVA FABIO": "721818",
  "SORGIOVANNI ILARIO": "722762",
  "CUSATO ANTONIO F - LACAVA F": "849833",
  "CUSATO ANTONIO F - SORGIOVANNI I": "847985",
  "MESSINA FELICE": "767966",
  "CATANIA PAOLO": "789842",
  "SCUTICCHIO NICOLA": "762505",
  "CATANIA P - MESSINA F": "847969",
  "D'ACRI GIOVANNI PAOLO": "789834",
  "FIORE STEVEN": "670392",
  "MARCHESE CESARE": "788878",
  "MALIZIA ELIO": "788877",
  "MARCHESE C - D'ACRI G": "837482",
  "RUFFA FRANCESCO": "713362",
  "CAERO IVAN MARCO": "716345",
  "PIETROPAOLO CHIARA": "800472",
  "RUFFA F - CAERO IVAN M": "848392",
  "AMATO SALVATORE": "613410",
  "FALSONE FRANCESCO": "587496",
  "MAIO MAURIZIO": "587461",
  "MITTIGA MASSIMO": "594601",
  "FALSONE F - AMATO S": "776087",
  "MASTROIANNI ANTONIO GIOVANNI": "591896",
  "LONGO ANDREA": "596592",
  "MASTROIANNI ANDREA": "720577",
  "SCRIVANO ROBERTO": "599045",
  "MASTROIANNI A - MASTROIANNI A": "837472",
  "KULCZYCKI SAMUEL SZYMON": "846245",
  "MUTTI MATTEO": "696674",
  "PERSSON JON SEBASTIAN": "824481",
  "TREVISAN FRANCESCO": "734684",
  "ABUSEV ARTUR": "758735",
  "KOZUL DENI": "737436",
  "GKIONIS PANAGIOTIS": "811390",
  "TURRINI RAFAEL VINICIUS": "825439",
  "BOULOUSSA MEHDI": "830399",
  "GIOVANNETTI TOMMASO MARIA": "712557",
  "OUAICHE STEPHANE LAURENT JOHANN": "846717",
  "SODERLUND HAMPUS AKE HANNES": "775313",
  "GACINA ANDREJ": "767245",
  "CAPPUCCIO MARCO ANTONIO": "718997",
  "PUPPO ANDREA": "706240",
  "ROSSI CARLO": "706227",
  "BERGLUND SIMON ALEXANDER": "846601",
  "CHANDRA JEET": "810802",
  "MANHANI JUNIOR HUMBERTO": "793667",
  "SPELBUS ALIN-MARIAN": "772219",
  "BOBOCICA MIHAI RAZVAN": "594848",
  "DE LAS HERAS PLAZA RAFAEL": "796478",
  "ANDRADE SELGAS MONTEIRO JOAO PEDRO": "758319",
  "DYJAS JAKUB WIKTOR": "774939",
  "PUCAR TOMISLAV": "774979",
  "URSU VLADISLAV": "810352",
  "PISTEJ LUBOMIR": "767279",
  "PINTO DANIELE": "703038",
  "STOYANOV NIAGOL IVANOV": "598079",
  "KAWA TOMASZ S - FILOGRANA G": "849723",
  "BELMONTE A - RITACCO L": "849777",
  "DURANTE S - RITACCO L": "804976",
  "D'ACRI LORENZO P - DURANTE E": "849637",
  "BRUSCO C - CRISPO M": "849663",
  "BASILE D - BASILE S": "837476",
  "BASILE G - BASILE D": "837478",
  "D'ANDREA M - FEDERICO M": "849725",
  "BRANCA F - FERRARO LUIGI A": "849773",
  "RITACCO S - GACCIONE CLAUDIA M": "849776",
  "FORTE L - BELSITO D": "849636",
  "MILICCHIO E - BELSITO M": "849610",
  "PIRAINO FRANCESCO M - FERRARO G": "849719",
  "PALERMO D - TOMA F": "849664",
  "PRADOS I LOPEZ ANTONI": "825100",
  "CALARCO EZIO": "599504",
  "PALUMMO MARCO": "608519",
  "SCERMINO UMBERTO": "604602",
  "PALUMMO M - CALARCO E": "847655",
  "COLELLA GIAMPIERO": "714424",
  "NAPOLITANO FRANCESCO": "709401",
  "D'AGOSTINO GAETANO": "598216",
  "DI PALMA GIUSEPPE": "764385",
  "NAPOLITANO F - COLELLA G": "790045",
  "DI VIZIO ALFREDO": "708427",
  "GIORGIONE GIOVANNI": "696065",
  "DE LUCA DOMENICO": "775280",
  "DE LUCA D - GIORGIONE G": "847594",
  "MASSINELLI ANDREA": "591205",
  "MINUCCI FABIO": "702436",
  "FERRARA FABIO": "762723",
  "FERRARA F - IAQUINANDI G": "847798",
  "FERRAIOLI FRANCESCO": "732094",
  "RUSSO CARMINE": "717746",
  "GAMBARDELLA FRANCESCO": "742546",
  "FERRAIOLI F - RUSSO C": "805336",
  "D'ORSO BENEDETTO": "813846",
  "SAVINO ANTONINO": "727274",
  "SOLARO GIUSEPPE": "774976",
  "DI DONNA RAFFAELE": "600951",
  "D'ORSO B - DI DONNA R": "849467",
  "DI DONNA R - SAVINO A": "848764",
  "IOVINE LORENZO": "771477",
  "CASO GIUSEPPE": "771479",
  "D'AVINO RAFFAELE": "710707",
  "IOVINE L - CASO G": "847653",
  "DE SIMONE MARCO": "705523",
  "POLLIO EMMANUEL": "721348",
  "ACANFORA ERMANNO": "758503",
  "PANE GIOVANBATTISTA": "591964",
  "DE SIMONE M - PANE G": "848765",
  "PANE G - POLLIO E": "849793",
  "TRIPPINI ENRICO": "752031",
  "LI HAOYAN": "730199",
  "MATTIOLI CRISPINO": "598032",
  "MATTIOLI C - TRIPPINI E": "847927",
  "PROIETTI CRISTIANO": "758476",
  "ROSINI ALEXHS": "766207",
  "ROSINI PARIS": "766208",
  "ROSINI MASSIMO": "601750",
  "ROSINI P - ROSINI A": "782970",
  "CERQUIGLINI MATTIA": "670651",
  "GIGLIONI ELIA": "728747",
  "QUAGLIARINI ANDREA": "633790",
  "BASTIANELLI VALTER": "717983",
  "CERQUIGLINI M - GIGLIONI E": "847497",
  "BASTIANELLI V - GIGLIONI E": "762313",
  "FLAYEH NISARE": "733252",
  "YAQOUB PETER BASEM ANWER": "811652",
  "RICCA CARMINE": "606048",
  "RICCA C - YAQOUB PETER B": "847823",
  "FLAYEH N - YAQOUB P": "838640",
  "PROIETTI MICHELE": "737772",
  "COSTANTINI GIACOMO": "758341",
  "MARIOTTI JULIEN": "750653",
  "SIMONE NICOLA": "789911",
  "MARIOTTI J - PROIETTI M": "847926",
  "CORSINI DANIELE": "733643",
  "CORSINI CHRISTIAN": "732894",
  "PALONI PIETRO": "770007",
  "TETTI CHRISTIAN": "774118",
  "TETTI C - PALONI P": "847534",
  "BRACCIONI LORENZO": "710333",
  "SCOTTONI STEFANO": "595421",
  "TOSI COSIMO": "732930",
  "BRACCIONI L - TOSI C": "847535",
  "MONOTTI FEDERICO": "727386",
  "PATTOIA ERICA": "767821",
  "PIRAINO MIRIAM": "724201",
  "MONOTTI F - PIRAINO M": "849754",
  "PIRAINO M - PATTOIA E": "778694",
  "MOSCONI VERONICA": "696325",
  "MAGNAGHI ARIANNA": "697909",
  "BUZZONI MATILDE": "758459",
  "CICUTTINI CECILIA": "735118",
  "CICUTTINI AURORA": "715627",
  "MARINELLI AZZURRA": "734973",
  "MESCIERI SOFIA": "700933",
  "COLANTONI CHIARA": "609947",
  "PINNA LAURA ALBA": "738009",
  "CARAGEA CLAUDIA STEFANIA": "774690",
  "PETKOVA ANITA": "811270",
  "WANG XUELAN": "595290",
  "MOR SONIA": "610704",
  "IVANOVA SOFIA": "764824",
  "MORETTI IRENE": "737770",
  "FILIPPI GIORGIA": "736310",
  "ATOYAN GOHAR": "588887",
  "LIBRETTI AMELIA": "740075",
  "PROKOP ANNA BOZENA": "701960",
  "MERENDA MICHELA": "595284",
  "GUILLOT RUIZ JOSE CARLOS": "832034",
  "PALMIERI FRANCESCO": "713761",
  "DI MARINO ALESSANDRO": "588926",
  "DI MARINO A - GUILLOT RUIZ J": "847770",
  "CAPPUCCIO COSTANTINO": "719546",
  "VALLINO COSTASSA FEDERICO": "718434",
  "URSUT HORIA STEFAN": "831088",
  "URSUT HORIA S - CAPPUCCIO C": "847790",
  "SANCHI FRANCISCO": "772233",
  "BASSI ANDREA": "749360",
  "GUALDI MATTEO": "712400",
  "INCARDONA PAOLO": "712112",
  "NINIOLA ADESHINA ISIAKA": "745080",
  "GUALDI M - SANCHI F": "847691",
  "BASSI A - NINIOLA ADESHINA I": "849829",
  "BHANJA RONIT": "827162",
  "MARTINALLI LORENZO": "710248",
  "AL-NUAIMI AMEER THAMER MOHAMMED": "816099",
  "POMA MARCO": "709934",
  "POMA M - BHANJA R": "849812",
  "MARTINALLI L - POMA M": "847693",
  "MARTIN SANCHO IVAN": "815169",
  "SIMON DAVIDE LORENZO": "738068",
  "CALARCO GIUSEPPE": "728478",
  "PROVOST DAMIEN ROLAND GREGORY": "810542",
  "CALARCO G - SIMON DAVIDE L": "849830",
  "PROVOST DAMIEN R - SIMON DAVIDE L": "848512",
  "LILLO BORDAJANDI ALBERTO": "776874",
  "GIORDANO ANTONIO": "726934",
  "CIPRIANO JACOPO": "729983",
  "LILLO BORDAJANDI A - GIORDANO A": "848511",
  "JOSIP HUZJAK": "846778",
  "CAPRI' GIOVANNI": "592064",
  "MARAGIOGLIO FRANCESCO": "810237",
  "JOSIP H - MARAGIOGLIO F": "847771",
  "RUIZ RODRIGUEZ FRANCISCO MIGUEL": "810541",
  "TAULER ALSINA NORBERT": "810739",
  "MELLINO CRISTIAN": "729156",
  "PELLEGRINI ANTONIO": "723056",
  "PELLEGRINI A - RUIZ RODRIGUEZ F": "847791",
  "SOLOVYOV PAVLO": "732634",
  "IACO' GIUSEPPE": "765786",
  "SAVANELLI CARMINE": "601326",
  "DI GILIO LUIGI": "727694",
  "SAVANELLI C - DI GILIO L": "741551",
  "RUOPPO VITALE": "765127",
  "CICCARELLI PAOLO": "721977",
  "DI BISCEGLIE ANTONIO": "703722",
  "DI MARO PASQUALE": "715246",
  "CICCARELLI P - RUOPPO V": "848728",
  "BARCA LUIGI": "599066",
  "GRECO LUCIO": "744484",
  "TERZI FABRIZIO": "731861",
  "CICALESE ANTONIO": "772505",
  "CICALESE A - BARCA L": "849530",
  "CICALESE A - GRECO L": "848388",
  "CARRABBA MARCO": "600929",
  "BUONO ANTONIO": "610309",
  "CANITANO ALESSIO": "760359",
  "DE SIMONE JACOPO": "761169",
  "CANITANO A - DE SIMONE J": "848770",
  "BRIGNOLA GIUSEPPE": "592187",
  "RUSSO MARCO": "769203",
  "LOTTI GUGLIELMO": "811835",
  "BRIGNOLA G - RUSSO M": "818295",
  "FABOZZI GIOVANNI": "588905",
  "MALLARDO DOMENICO": "726428",
  "PALMA DANIELE": "734676",
  "MALLARDO D - PALMA D": "848769",
  "FALANGA BRUNO": "605914",
  "MANFREVOLA GENNARO": "721220",
  "PAPA FRANCESCO": "720637",
  "ZOTTI LUIGI": "612618",
  "BIFULCO SALVATORE": "752437",
  "ZOTTI CRESCENZO": "612617",
  "MANFREVOLA G - PAPA F": "848578",
  "ZOTTI L - FALANGA B": "849529",
  "LENTO FRANCESCO": "592297",
  "ZAZZARO ALFREDO": "592314",
  "BRUNO STEFANO": "748392",
  "MEDOLLA CARMINE": "592315",
  "ZAZZARO A - LENTO F": "837340",
  "BRUNO S - LENTO F": "849818",
  "COLETTA FERDINANDO": "610913",
  "SCHIATTARELLA PIERLUIGI": "610929",
  "MICILLO CRESCENZO": "610889",
  "FIORETTI FRANCESCO": "774454",
  "ISAIA GIUSEPPE": "766367",
  "FIORETTI F - COLETTA F": "849501",
  "ISAIA G - SCHIATTARELLA P": "848729",
  "GAMBACORTA LAURA": "606600",
  "SHMIGELSKAYA ANNA": "741002",
  "CANFORA MASSIMO": "738096",
  "CANFORA M - SHMIGELSKAYA A": "848730",
  "GAMBACORTA L - SHMIGELSKAYA A": "838773",
  "BALDINO ALESSANDRO": "701732",
  "MINGIONE NICOLA": "714460",
  "D'AMICO GAETANO": "713430",
  "MAZZARELLA GIOVANNI": "705299",
  "D'AMICO G - MINGIONE N": "750803",
  "CIAMBRIELLO SIMONE": "763513",
  "DE MAIO ANTONIO": "722774",
  "IACULO GIOVANNI": "716146",
  "DE SIMONE MATTIA": "742636",
  "DE MAIO ALESSANDRO": "767469",
  "DE MAIO A - DE SIMONE M": "848391",
  "DE MAIO A - IACULO G": "849803",
  "DE ROSA MICHELE": "588950",
  "ALBANO ANDREA": "745458",
  "ZANNELLA ANTONIO": "758533",
  "DE DOMINICIS FRANCESCO": "697661",
  "DE DOMINICIS F - ZANNELLA A": "849406",
  "ALBANO A - ZANNELLA A": "848579",
  "DE MAIO MARIO": "670299",
  "AGGRESSORE CLAUDIO": "701925",
  "NEMOLATO MATTEO": "769200",
  "NEMOLATO ROSARIO": "599072",
  "AGGRESSORE C - NEMOLATO R": "849405",
  "NEMOLATO M - ANIELLO V": "847721",
  "DI LAURO GIANLUCA": "727695",
  "ARCOPINTO LUIGI": "713782",
  "CERQUA CIRO": "732607",
  "CERQUA C - ARCOPINTO L": "803701",
  "DI LAURO G - CERQUA C": "818301",
  "DI MARINO SIGISMONDO": "588963",
  "CALVANESE ELIO": "774409",
  "CINELLI MICHELE": "743786",
  "CALVANESE E - DI MARINO S": "847722",
  "DE ROSA ANDREA": "738442",
  "BARONE FERDINANDO": "795417",
  "SANTORIELLO ARIANNA": "731646",
  "AURIEMMA SIMONE": "770339",
  "LA CORTE GIOVAMBATTISTA": "713032",
  "AURIEMMA S - LA CORTE G": "848416",
  "RAGO ANGELO": "760722",
  "ABATE GIOSUE'": "697934",
  "DE BARTOLOMEIS CLAUDIO": "736486",
  "ABATE MASSIMILIANO": "697930",
  "ABATE M - PONTECORVO C": "848027",
  "RAGO A - ABATE M": "849494",
  "TREROTOLA MAURO": "706386",
  "VIETRI FRANCESCO": "767335",
  "VITALE SARA": "794175",
  "TREROTOLA M - VITALE M": "848026",
  "TURNER FRANCESCO": "600924",
  "PAGLIARULO GIANMARCO": "794047",
  "BIGLIARDO ROSARIO": "611083",
  "BIGLIARDO R - TURNER F": "731602",
  "COZZOLINO LUIGI": "731342",
  "IOZZINO GIUSEPPE": "772887",
  "VULTERINI ALFREDO": "728143",
  "BALZANO L - IOZZINO G": "849448",
  "ACCARINO TIZIANO": "810467",
  "MONTAGNANI ANTONIO": "604600",
  "SABATINO ESPEDITO": "612633",
  "SCATTARETICO CORRADO": "655072",
  "ACCARINO T - CHIANCONE F": "849302",
  "ACCARINO T - SABATINO E": "848046",
  "CARBONE RAFFAELE": "777730",
  "COMPIERCHIO SIMONE": "720457",
  "LANDI ANTONIO": "732096",
  "SARNO MARIO": "709400",
  "CARBONE R - COMPIERCHIO S": "849450",
  "CARBONE R - SARNO M": "848418",
  "SANTARSIERE ANTONIO": "706681",
  "GIELLA GAETANO": "794583",
  "CALICCHIO ANTONIO": "773467",
  "GIELLA G - SANTARSIERE A": "848735",
  "DELLA GLORIA FILOMENA": "709195",
  "GRADINETTI ALESSANDRO": "774414",
  "GRADINETTI FRANCESCO": "774415",
  "PIROZZI CIRO": "815834",
  "DELLA GLORIA F - ASTARITA FRANCESCO P": "849421",
  "DELLA GLORIA F - PIROZZI C": "848427",
  "BERRITTO RAFFAELE": "709931",
  "DI LAURO GIUSEPPE": "763846",
  "D'AMBROSIO GIOVANNI": "611172",
  "DI LAURO G - BERRITTO R": "848748",
  "LOMBARDI GIUSEPPE": "758628",
  "TORTORELLA ANDREA": "811122",
  "RIZZUTI ANDREA": "772562",
  "BOVIENZO MICHAEL": "824912",
  "DELLA MORTE BRUNO": "721047",
  "DELLA MORTE B - TORTORELLA A": "848426",
  "CILLO GIANFELICE": "709402",
  "NAPODANO FABIO": "707878",
  "SANTANIELLO MARTINO": "730631",
  "RICCIARDI RAFFAELE": "598208",
  "MUSMARRA PAOLO": "764340",
  "RICCIARDI R - NAPODANO F": "849500",
  "RICCIARDI R - MUSMARRA P": "848749",
  "FRANCONIERO DANILO": "810968",
  "LEPORE MASSIMO": "810481",
  "PAPPALARDO SEBASTIANO": "774044",
  "SATERIALE MARIACHIARA": "775309",
  "PAPPALARDO S - LEPORE M": "847614",
  "SAUTTO DANIELE": "823132",
  "GERMINO NICOLA": "834265",
  "BISOGNO VINCENZO": "587638",
  "D'ACUNTO GIUSEPPE": "793461",
  "D'ACUNTO G - BISOGNO V": "847612",
  "PELLECCHIA SIMONE": "765732",
  "MANGANIELLO RAIMONDO": "598218",
  "ESPOSITO LA ROSSA RENATO": "791294",
  "PETRILLO FERNANDO": "727484",
  "RUSSO FRANCESCO": "767280",
  "TAURISANO SILVIO": "716075",
  "MANGANIELLO R - ESPOSITO LA R": "849498",
  "MANGANIELLO R - PELLECCHIA S": "848736",
  "CAIAZZO FRANCESCO MARIA": "703302",
  "CASCONE RAFFAELE": "772332",
  "CAFIERO ANDREA": "811488",
  "FABIANI EUGENIO": "769638",
  "CAIAZZO FRANCESCO M - CASCONE R": "848772",
  "RINALDI AGOSTINO": "588957",
  "GIACOBELLI GINEVRA": "719369",
  "ALBANO GABRIELE": "741262",
  "MIGLIACCIO LUIGI": "588956",
  "ZANNELLA LUIGI": "765413",
  "GIACOBELLI G - RINALDI A": "848367",
  "RINALDI A - MIGLIACCIO L": "849410",
  "MURANO SALVATORE": "772333",
  "SPIEZIO MARCELLO": "810780",
  "LO MORIELLO LUIGI": "610318",
  "LUBRANO EDUARDO": "810779",
  "LUBRANO E - MURANO S": "848771",
  "CASERTANO VINCENZO": "723465",
  "RUSSO UMBERTO": "824592",
  "AULICINO GIOVANNI": "814823",
  "RAGOZZINO MASSIMO": "631099",
  "AULICINO G - CASERTANO V": "848394",
  "AULICINO G - RUSSO U": "849820",
  "MARINO GIANLUCA": "736489",
  "CAPURRO FABIO": "708887",
  "CIPOLLETTA GASPARE": "768366",
  "DI BIASE GIULIO": "765220",
  "NETTO EUGENIO": "765119",
  "CAPURRO F - MARINO G": "848732",
  "DI BIASE G - CAPURRO F": "849516",
  "FARINA BRUNO": "600752",
  "ARIENZO CARMINE": "613241",
  "D'ONOFRIO EMANUELE": "713764",
  "ARIENZO C - FARINA B": "849517",
  "FARINA B - DI MAURO G": "716310",
  "DE FRANCISCIS PASQUALE FRANCESCO": "613075",
  "COMUNE ELIANA": "613411",
  "GALLINA GAETANO": "592292",
  "GRECO CARLOTTA": "772231",
  "TARTAGLIONE ERNESTO": "701488",
  "DE FRANCISCIS P - PIERNO A": "849558",
  "GRECO C - COMUNE E": "848396",
  "DI NAPOLI ERRICO": "772900",
  "MIRAGLIA MARCELLO": "719094",
  "DI NAPOLI ANTONIO": "772899",
  "GIROTTO GAETANO": "820702",
  "DI NAPOLI E - GIROTTO G": "848731",
  "BORGHETTO CLAUDIO": "600404",
  "BORGHETTO GIANPAOLO": "736923",
  "VESCIO GAIA": "729103",
  "MILANO VALENTINA": "729098",
  "BORGHETTO C - BORGHETTO G": "849488",
  "BORGHETTO C - MILANO V": "848766",
  "ALBANESE RAFFAELE": "727691",
  "GUARNIERI LUIGI": "723904",
  "DI MEO SIMONA": "747661",
  "ALBANESE R - GUARNIERI L": "735104",
  "ANIELLO FABIO": "749299",
  "CIMMINO SIMONA": "716226",
  "DEL SANTO LUDOVICO": "764252",
  "ANIELLO F - CIMMINO S": "849826",
  "SILVESTRI FILIPPO": "600421",
  "BALESTRIERI CLAUDIO": "727928",
  "IACONO AGOSTINO": "723848",
  "SILVESTRI F - BALESTRIERI C": "849607",
  "DE SIMONE CASTRESE": "762748",
  "SACCHETTI GIUSEPPE": "592197",
  "ESPOSITO GIANPAOLO": "600923",
  "DE SIMONE C - SACCHETTI G": "849487",
  "VOLPE GENNARO": "796421",
  "FABIANI FRANCESCO DANIELE": "810347",
  "CORNO CARMINE": "774014",
  "DI RUSSO VITTORIO": "796391",
  "FABIANI FRANCESCO D - CORNO C": "848768",
  "BOCCANFUSO ANTONIO": "778535",
  "CRISCUOLO ANTONIO MARIA": "786088",
  "CRISCUOLO LUIGI MARIA": "786089",
  "CRISCUOLO ANTONIO M - BOCCANFUSO A": "849690",
  "BENFORTE ANTONIO": "610341",
  "CARRIERI VINCENZO": "599067",
  "RUSSO PAOLO": "795319",
  "BENFORTE A - CARRIERI V": "849609",
  "CRISPO M": "605901",
  "CUBONI EMANUELE": "736529",
  "AGNELLO IVAN": "706212",
  "TACCINI ROBERTO": "704074",
  "RUSSO GIOVANNI": "814909",
  "AGNELLO I - TACCINI R": "848642",
  "BUSALACCHI GUGLIELMO": "727814",
  "RINI NICOLO' MARIO": "696072",
  "SCARDAMAGLIA GIUSEPPE": "810494",
  "BUSALACCHI G - RINI N": "848867",
  "RESTIVO DOMENICO": "724519",
  "SIMONTE ANDREA": "761831",
  "DATTOLO DANIELE": "759653",
  "ROSSELLI GIOVANNI BATTISTA": "758079",
  "TRAPOLINO PASQUALE": "846076",
  "SIMONTE A - ROSSELLI GIOVANNI B": "781503",
  "CACIOLI MARCO": "728448",
  "MIDOLO ERASMO": "774380",
  "FIUMARELLI STEFANO": "710903",
  "BUCCA SAMUELE": "610868",
  "CACIOLI M - MIDOLO E": "849900",
  "BUCCA S - MIDOLO E": "848706",
  "GANDOLFO FRANCESCO": "612204",
  "SALADINO MICHELE": "743501",
  "ARRIGO GIULIA": "764279",
  "CINA' ANTONIO": "825527",
  "ARRIGO G - GANDOLFO F": "848422",
  "LUCCHESE SALVATORE": "774767",
  "CARROCCIO BENEDETTO": "774764",
  "LIGAMMARI ROSARIO": "764255",
  "CARROCCIO B - LIGAMMARI R": "816390",
  "CARROCCIO B - LUCCHESE S": "798264",
  "GIACALONE ANDREA": "803755",
  "BONAFEDE GABRIELE": "767615",
  "DI GIROLAMO VINCENZA": "729514",
  "QUINCI GINO": "764637",
  "DI GIROLAMO V - GIACALONE A": "849899",
  "QUINCI G - GIACALONE A": "820699",
  "BARONE VITA": "758101",
  "SCALABRINO ANTONINA DEBORAH": "758083",
  "MILAZZO BENEDETTO": "743634",
  "ALTESI MARIKA": "768189",
  "D'ANTONI GABRIELE": "846844",
  "LA LUCE SALVATORE LUCIANO": "736314",
  "ALTESI M - MILAZZO B": "848641",
  "GENTILE FRANCESCO": "612399",
  "CAFISO VINCENZO": "743031",
  "GRIMALDI ALESSIO GAETANO": "704797",
  "CAFISO V - GENTILE F": "832522",
  "GIANNETTO FRANCESCO": "601665",
  "MARINO GAETANO": "711234",
  "GIANNINO ANDREA": "710826",
  "SPANO' ANGELO": "697488",
  "GIANNETTO F - MARINO G": "848063",
  "GIUFFRIDA ANTONINO": "699763",
  "RUSSO GABRIELE": "698255",
  "D'AMICO DANIELE": "710763",
  "D'AMICO PIETRO": "696604",
  "SPAMPINATO GESSICA": "719162",
  "D'AMICO D - RUSSO G": "848669",
  "GIARDINA MICHELE": "599331",
  "INGEGNERI DIEGO": "707909",
  "CIRRITO DAMIANO": "698448",
  "CAMARDA FRANCESCO": "734678",
  "GIARDINA M - INGEGNERI D": "848668",
  "GIARDINA M - CAMARDA F": "849705",
  "D'AMICO LUCA": "601664",
  "GIORDANO VALERIO": "765296",
  "D'ANTONIO FABRIZIO": "599251",
  "MACRI' GIOVANNI": "772376",
  "GIORDANO V - MACRI' G": "849215",
  "D'AMICO L - GIORDANO V": "847590",
  "RAGUSA DIEGO": "593249",
  "CAMPIONE CARMELO": "592742",
  "VALENTI GIANROSARIO": "718652",
  "RAGUSA D - VALENTI G": "847589",
  "BIANCO GABRIELE": "846187",
  "AMATO GIUSEPPE": "606326",
  "GRILLO CHRISTIAN": "762211",
  "LO FARO GIULIANO": "776231",
  "VENUTO MATILDE": "738824",
  "AMATO G - BIANCO G": "848496",
  "LO FARO G - GRILLO C": "815056",
  "DI PIETRO ENRICO": "764692",
  "SABATINO DOMENICO": "599328",
  "CALABRESE ADRIANO": "765478",
  "CALABRESE A - DI PIETRO E": "770422",
  "PAVEL MAYA ANDREEA": "768518",
  "PARMIGIANI LUDOVICA": "768136",
  "THAI KIM LAN ELENA": "716869",
  "BUSNARDO MILENA": "726000",
  "NIKOLIC MARINA": "741853",
  "SERCER INES": "598693",
  "MACCALLI MILENA": "728748",
  "PERCHINENNA VALENTINA": "719075",
  "DEMONTE STEFANIA": "713327",
  "MURAWSKA SANDRA": "846218",
  "CAIANI ISOTTA": "726199",
  "ARMANINI ELISA": "709835",
  "SARTORI GINEVRA": "735754",
  "BERNARDINELLO SUSANNA": "789690",
  "YAVORIVSKA EVELINA": "759637",
  "OVELAR JARA LUCERO ARAMI": "767129",
  "FRANZOI SARA": "743327",
  "LAVORATTI CARLOTTA": "739574",
  "CAPUANO NICOLE": "763065",
  "AVESANI FRANCESCA": "595275",
  "GINI BEATRICE": "696097",
  "SILVESTRI FRANCA": "633845",
  "ABBASI MONJEZI AMIREZZA": "846496",
  "GALVANO NICOLAS DANIEL": "811124",
  "FANTONI MATTEO": "728594",
  "TOMASI STEFANO": "596611",
  "ABBASI MONJEZI A - FANTONI M": "847627",
  "DURAN GIRALT MARC": "827167",
  "PICIULIN GABRIELE": "707200",
  "RAGNI LORENZO": "587923",
  "DURAN GIRALT M - PICIULIN G": "849712",
  "DURAN GIRALT M - RAGNI L": "849180",
  "BELIK SIMON": "828281",
  "PAVAN FEDERICO": "591339",
  "MORO GIACOMO": "597344",
  "PAVAN F - BELIK S": "848809",
  "FELKEL GRZEGORZ ADAM": "846467",
  "BACIOCCHI ALESSANDRO": "601698",
  "MIRO' I LLORENTE MARC": "826666",
  "LUCESOLI FRANCESCO": "590354",
  "BACIOCCHI A - FELKEL GRZEGORZ A": "848808",
  "BACIOCCHI A - MIRO' I L": "849802",
  "VOVK PETROVSKI BRIN": "823196",
  "SANCHI TOMAS": "772105",
  "PAULINA ERIK": "735744",
  "SANCHI T - VOVK PETROVSKI B": "847745",
  "FELIPPI LUCCA VINCENZO": "825520",
  "SPINICCHIA SIMONE": "600387",
  "LOMBARDI ANDREA": "748809",
  "CAPELLETTI CARLO": "669956",
  "FELIPPI LUCCA V - SPINICCHIA S": "849713",
  "LOMBARDI A - SPINICCHIA S": "848375",
  "ALLEGRANZA GIACOMO": "725893",
  "CAMPAGNA GIULIO": "747105",
  "MERZLIKIN TARAS": "767250",
  "ALLEGRANZA G - CAMPAGNA G": "847744",
  "ALLEGRANZA G - MERZLIKIN T": "849727",
  "RINIOTIS ANASTASIOS": "765607",
  "GARELLO SIMONE": "728034",
  "SERETTI DAMIANO": "594736",
  "RINIOTIS A - SERETTI D": "849179",
  "COSIMI GABRIELE": "824599",
  "DE BERNARDO LUIGI": "737670",
  "DI SARRO ROBERTO": "707622",
  "COSIMI G - DE BERNARDO L": "847753",
  "DI LISIO GIOVANNI": "731084",
  "AMOROSO TIZIANO": "761870",
  "PRIGIONIERO MATTEO": "834335",
  "RUSCITTO MARINELLI JOSE' RAFAEL": "612548",
  "DI LISIO G - AMOROSO T": "848411",
  "DI LISIO G - RUSCITTO MARINELLI J": "731271",
  "IANNETTA ARTURO": "589402",
  "MANNA LEONARDO": "589405",
  "MAURIELLO MASSIMO": "589445",
  "PETRELLA FRANCESCO": "611869",
  "IANNETTA A - PETRELLA F": "848743",
  "DI CESARE EUGENIO": "723877",
  "COSIMI BERNARDO": "594962",
  "MINERVINI MAURO PASQUALINO": "805574",
  "DI CESARE E - MINERVINI MAURO P": "847751",
  "GIANNINI FRANCESCO": "600524",
  "LANDOLFI POMPEI MARIO": "595050",
  "ROSA MICHELE": "718234",
  "GIANNINI F - ROSA M": "738146",
  "TAMBURRI RICCARDO": "846665",
  "CICCHINO VINCENZO": "721263",
  "CIFELLI AMBRA": "828899",
  "IARUSSI NICOLA": "831579",
  "CICCHINO V - IARUSSI N": "848744",
  "IARUSSI N - TAMBURRI R": "849561",
  "MASTROGIUSEPPE NICOLO'": "751292",
  "PRIGIONIERO DANIELE": "613388",
  "RUSCITTO MARINELLI ADRIANA": "701082",
  "CAPOCEFALO GIOVANNI": "827295",
  "RUSCITTO MARINELLI A - PRIGIONIERO D": "849560",
  "LORETO DARIO": "697946",
  "BALDERI LORENZO": "710834",
  "CANTELLA FILIPPO": "711731",
  "ZOCCATELLI TOMMASO": "736787",
  "VENDRAMIN FABRIZIO": "772550",
  "FLAMINIO MATTEO": "824622",
  "SARONNI DANIELE LUIGI": "747134",
  "COLLI LEONARDO": "590702",
  "SEGATTA MICHELE": "777712",
  "ARLIA NICOLE": "725242",
  "DRAGOMAN ANDREEA": "767319",
  "STEFANOVA NIKOLETA": "594841",
  "SZOCS BERNADETTE CYNTHIA": "767065",
  "KRZYSIEK PAULINA ALEKSANDRA": "831562",
  "KOLISH ANASTASIIA": "810643",
  "TOFANT ANA": "741711",
  "JOARDAR OISHIKI": "846602",
  "CERRITELLI MARGHERITA": "732943",
  "CLAPA ANDREEA TEODORA": "758270",
  "MONFARDINI GAIA": "701714",
  "VIVARELLI DEBORA": "597808",
  "OPRANDI MELISSA": "749220",
  "CIOBANU IRINA": "825113",
  "RONCALLO VALENTINA": "711608",
  "SIMON TEODORA": "810679",
  "CRISCIONE NICOLETTA": "730274",
  "MINURRI SOFIA": "735898",
  "SEU FRANCESCA": "731341",
  "CHASSELIN PAULINE CARINNE OLIVIA": "827817",
  "PLAIAN TANIA MARIA": "765375",
  "CARNOVALE MIRIAM BENEDETTA": "721848",
  "FONTANA ROBERTO": "593082",
  "MELONI SIRIO": "742767",
  "CEREA GIACOMO": "655182",
  "SIMI TOMMASO": "773696",
  "AUGUSTINE EMMANUEL DAMILARE": "816711",
  "BISI PAOLO": "587915",
  "MALPASSI RICCARDO": "607455",
  "INDINO GIULIA": "725608",
  "PUGNO LEONARDO NAOYA": "774557",
  "AUSTRIA GIANLUCA": "718453",
  "SCHINELLA NOEMI": "822267",
  "GALLINGANI GABRIELE": "746856",
  "CASTALDO MARCO": "758326",
  "ZILIANI LUCA": "587881",
  "PASSARO MATTEO": "743676",
  "LAZZARATO FRANCESCO": "759029",
  "PIERPAOLI NICOLO'": "734717",
  "RETTIGHIERI LORENZO": "760897",
  "NITA PETRICA": "606234",
  "FOGLIA MATTIA": "750141",
  "MARRA ANGELA": "808985",
  "CHIRULLI JOSED": "723058",
  "DI CARLO VINCENZO": "731988",
  "ZOLLINO SIMONE": "796056",
  "GIOVANNINI NICCOLO'": "801279",
  "FERRAIUOLO VINCENZO": "707671",
  "IASI LUCA": "775420",
  "PANUNZIO GABRIELE": "799170",
  "TRINCHERA RICCARDO": "782799",
  "MASTROIANNI MARIA GRAZIA": "591887",
  "GREPPI MASSIMO": "587498",
  "LIBERTO PIERPAOLO": "597746",
  "OLIVA FRANCO ANTONIO": "734165",
  "ZINGONE GIANFRANCO": "768335",
  "OLIVA PASQUALE FLAVIO MARIA": "714854",
  "MIRANDA GENNARO": "599494",
  "VUKELAJ KLEVIN": "824525",
  "PIGNATARO PIERO SALVATORE": "611591",
  "DORONZO MICHELE": "847458",
  "DI GIOIA WALTER": "824207",
  "DE BARI MICHELE": "814704",
  "LATERZA PASQUALE": "825374",
  "SALLUSTIO DANIELE": "811503",
  "ZUCARO MARIO": "714084",
  "CORVELLI ANGELO": "750110",
  "ROSSI DANIELE": "838404",
  "BARANI ARIANNA": "711597",
  "ENCEA MIHAELA-SUZANA": "727102",
  "SAIU FRANCESCA": "588400",
  "CHUNG RHEANN JACINTA": "846391",
  "FRISONE STELLA": "719621",
  "SERENO REGIS EMMA": "729517",
  "DANIELE MANUELA": "610610",
  "HAN VUKELJA XUE": "822286",
  "JAR ISABELLA MARIA": "762651",
  "DONETTI GINEVRA": "769688",
  "CAVALLI GIULIA": "599043",
  "COATES ANNA": "703736",
  "ALESSANDRINI ANGELA": "596861",
  "BECCARIA VALERIA": "591684",
  "RICUPITO ANDREA GIULIA": "714725",
  "ORLANDO VALENTINA": "595203",
  "XU YI YAN": "600037",
  "ZAMPONI FABIO": "816796",
  "MAZZUCCO GIORGIO": "769026",
  "LENZONI ANDREA": "767503",
  "PATERNOSTRO MATILDE": "794013"
};

// server/services/athleteResolver.ts
var AthleteResolver = class {
  staticMappingFile;
  runtimeMappingFile;
  mapping;
  constructor() {
    this.mapping = { ...athlete_mapping_default };
    this.staticMappingFile = path2.resolve(process.cwd(), "server", "data", "athlete_mapping.json");
    this.runtimeMappingFile = path2.resolve(process.cwd(), "node_modules", ".cache", "fitet_cache", "athlete_mapping.json");
    this.loadMapping();
  }
  loadMapping() {
    try {
      if (fs2.existsSync(this.staticMappingFile)) {
        const content = fs2.readFileSync(this.staticMappingFile, "utf8");
        this.mapping = { ...this.mapping, ...JSON.parse(content) };
      }
      if (fs2.existsSync(this.runtimeMappingFile)) {
        const content = fs2.readFileSync(this.runtimeMappingFile, "utf8");
        this.mapping = { ...this.mapping, ...JSON.parse(content) };
      }
    } catch {
      this.mapping = { ...athlete_mapping_default };
    }
  }
  saveMapping() {
    try {
      const dir = path2.dirname(this.runtimeMappingFile);
      if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
      fs2.writeFileSync(this.runtimeMappingFile, JSON.stringify(this.mapping, null, 2), "utf8");
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
      let results = await FitetClient.searchAtleta(cleanName);
      const norm = (s) => s.replace(/[^a-zA-Z]/g, "").toUpperCase();
      const target = norm(cleanName);
      let exact = results.find(
        (r) => norm(r.value) === target || norm(r.value).includes(target) || target.includes(norm(r.value))
      );
      if (!exact && cleanName.includes(" ")) {
        const surname = cleanName.split(" ")[0];
        results = await FitetClient.searchAtleta(surname);
        exact = results.find(
          (r) => norm(r.value) === target || norm(r.value).includes(target) || target.includes(norm(r.value))
        );
      }
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
  /**
   * Resolves all athlete IDs for a given championship by crawling percentuali.php of its teams
   */
  async resolveAthletesForChampionship(cam, squadraIds) {
    if (!squadraIds || squadraIds.length === 0) return this.getMapping();
    let newFound = 0;
    await Promise.all(
      squadraIds.map(async (sqId) => {
        try {
          const res = await fetch(`https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${sqId}&CAM=${cam}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const text = new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
          const $p = cheerio.load(text);
          $p('a[href*="IDA="]').each((_, a) => {
            const href = $p(a).attr("href") || "";
            const m = href.match(/IDA=(\d+)/i);
            const name = $p(a).text().replace(/\s+/g, " ").trim().toUpperCase();
            if (m && name) {
              if (!this.mapping[name]) {
                this.mapping[name] = m[1];
                newFound++;
              }
            }
          });
        } catch (err) {
          console.warn(`Error resolving athletes from team ${sqId} in CAM ${cam}:`, err);
        }
      })
    );
    if (newFound > 0) {
      this.saveMapping();
      console.log(`[AthleteResolver] Auto-indexed ${newFound} new athletes for CAM ${cam}. Total indexed: ${Object.keys(this.mapping).length}`);
    }
    return this.getMapping();
  }
};
var athleteResolver = new AthleteResolver();

// server/services/teamResolver.ts
import fs3 from "fs";
import path3 from "path";
import * as cheerio2 from "cheerio";
var TeamResolver = class {
  staticFilePath = path3.resolve(process.cwd(), "server", "data", "team_logos.json");
  runtimeFilePath = path3.resolve(process.cwd(), "node_modules", ".cache", "fitet_cache", "team_logos.json");
  logos = {
    "ASD TENNISTAVOLO NUOVA LUZZI": "https://portale.fitet.org/images/societa/3260.jpg",
    "TENNISTAVOLO CASTROVILLARI": "https://portale.fitet.org/images/societa/3164.jpg",
    "TT PETROLO COSENZA": "https://portale.fitet.org/images/societa/2904.jpg",
    "PIROSSIGENO COSENZA": "https://portale.fitet.org/images/societa/2904.jpg"
  };
  constructor() {
    this.loadFromDisk();
  }
  loadFromDisk() {
    try {
      if (fs3.existsSync(this.staticFilePath)) {
        const raw = fs3.readFileSync(this.staticFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object") {
          this.logos = { ...this.logos, ...parsed };
        }
      }
      if (fs3.existsSync(this.runtimeFilePath)) {
        const raw = fs3.readFileSync(this.runtimeFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object") {
          this.logos = { ...this.logos, ...parsed };
        }
      }
    } catch (e) {
      console.error("Error loading team_logos.json:", e);
    }
  }
  saveToDisk() {
    try {
      const dir = path3.dirname(this.runtimeFilePath);
      if (!fs3.existsSync(dir)) fs3.mkdirSync(dir, { recursive: true });
      fs3.writeFileSync(this.runtimeFilePath, JSON.stringify(this.logos, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving team_logos.json:", e);
    }
  }
  getLogo(teamName) {
    const norm = teamName.toUpperCase().trim();
    if (this.logos[norm]) return this.logos[norm];
    for (const [k, url] of Object.entries(this.logos)) {
      if (norm.includes(k) || k.includes(norm)) return url;
    }
    return void 0;
  }
  /**
   * Resolves logos for a list of teams from a championship by scraping DatiSquadra.asp
   */
  async resolveLogosForTeams(teams, cam, anno = 41) {
    const toFetch = teams.filter((t) => !this.getLogo(t.nome) && t.squadraId);
    if (toFetch.length === 0) return { ...this.logos };
    await Promise.all(
      toFetch.map(async (t) => {
        try {
          const url = `https://portale.fitet.org/risultati/campionati/DatiSquadra.asp?SQUADRA=${t.squadraId}&CAM=${cam}&ANNO=${anno}`;
          const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
          const text = new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
          const $ = cheerio2.load(text);
          const img = $('img[src*="/societa/"]').first().attr("src");
          if (img) {
            const clean = img.replace(/^(\.\.\/)+/, "");
            const fullUrl = clean.startsWith("http") ? clean : `https://portale.fitet.org/${clean}`;
            this.logos[t.nome.toUpperCase().trim()] = fullUrl;
          } else {
            const tableText = $("table").text().replace(/\s+/g, " ");
            const alboMatch = tableText.match(/Albo Federale Prima Affiliazione\s*([^\d]*)\s*(\d{2,6})/i);
            if (alboMatch && alboMatch[2]) {
              const fullUrl = `https://portale.fitet.org/images/societa/${alboMatch[2]}.jpg`;
              this.logos[t.nome.toUpperCase().trim()] = fullUrl;
            }
          }
        } catch (err) {
          console.warn(`Failed to resolve logo for team ${t.nome}:`, err);
        }
      })
    );
    this.saveToDisk();
    return { ...this.logos };
  }
};
var teamResolver = new TeamResolver();

// server/services/championshipCatalog.ts
import fs4 from "fs";
import path4 from "path";
import * as cheerio4 from "cheerio";

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
      posizione: atleti.length + 1,
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

// server/services/championshipCatalog.ts
var REGIONI = [
  { id: 19, nome: "Calabria" },
  { id: 14, nome: "Abruzzo" },
  { id: 7, nome: "Alto Adige" },
  { id: 17, nome: "Basilicata" },
  { id: 16, nome: "Campania" },
  { id: 9, nome: "Emilia Romagna" },
  { id: 8, nome: "Friuli Venezia Giulia" },
  { id: 13, nome: "Lazio" },
  { id: 3, nome: "Liguria" },
  { id: 4, nome: "Lombardia" },
  { id: 11, nome: "Marche" },
  { id: 15, nome: "Molise" },
  { id: 2, nome: "Piemonte" },
  { id: 18, nome: "Puglia" },
  { id: 21, nome: "Sardegna" },
  { id: 20, nome: "Sicilia" },
  { id: 10, nome: "Toscana" },
  { id: 6, nome: "Trentino" },
  { id: 12, nome: "Umbria" },
  { id: 1, nome: "Valle d'Aosta" },
  { id: 5, nome: "Veneto" }
];
var NAZIONALI = [
  { cid: 2, nome: "Serie A" },
  { cid: 3, nome: "Serie B" },
  { cid: 4, nome: "Serie C1" },
  { cid: 6, nome: "Master Naz." },
  { cid: 7, nome: "Paralimpici Naz." }
];
var ChampionshipCatalog = class {
  staticCacheFilePath = path4.resolve(process.cwd(), "server", "data", "campionati.json");
  runtimeCacheFilePath = path4.resolve(process.cwd(), "node_modules", ".cache", "fitet_cache", "campionati.json");
  memoryCache = null;
  lastFetched = 0;
  TTL = 24 * 60 * 60 * 1e3;
  // 24 hours
  constructor() {
    this.loadFromDisk();
  }
  loadFromDisk() {
    try {
      const targetPath = fs4.existsSync(this.runtimeCacheFilePath) ? this.runtimeCacheFilePath : this.staticCacheFilePath;
      if (fs4.existsSync(targetPath)) {
        const raw = fs4.readFileSync(targetPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.memoryCache = parsed;
          const stat = fs4.statSync(targetPath);
          this.lastFetched = stat.mtimeMs;
        }
      }
    } catch (e) {
      console.error("Error loading campionati.json from disk:", e);
    }
  }
  saveToDisk(data) {
    try {
      const dir = path4.dirname(this.runtimeCacheFilePath);
      if (!fs4.existsSync(dir)) fs4.mkdirSync(dir, { recursive: true });
      fs4.writeFileSync(this.runtimeCacheFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Error saving campionati.json to disk:", e);
    }
  }
  async getAllCampionati(forceRefresh = false) {
    if (!forceRefresh && this.memoryCache && Date.now() - this.lastFetched < this.TTL) {
      return this.memoryCache;
    }
    try {
      const items = await this.scrapeFromFitet();
      if (items.length > 0) {
        this.memoryCache = items;
        this.lastFetched = Date.now();
        this.saveToDisk(items);
        return items;
      }
    } catch (e) {
      console.error("Failed to scrape championships from FITeT:", e);
    }
    return this.memoryCache || [];
  }
  async getChampionship(id) {
    const list = await this.getAllCampionati();
    return list.find((c) => c.id === id);
  }
  /**
   * Risolve istantaneamente in memoria (0ms) l'ID numerico del campionato
   * a partire dalla stringa testuale estratta dalla scheda ranking dell'atleta e dalla regione.
   */
  resolveChampionship(campName, regione) {
    if (!campName) return void 0;
    if (!this.memoryCache || this.memoryCache.length === 0) {
      this.loadFromDisk();
    }
    const items = this.memoryCache || [];
    if (items.length === 0) return void 0;
    const clean = (s) => (s || "").toLowerCase().replace(/girone/g, "gir").replace(/serie/g, "").replace(/maschile/g, "").replace(/femminile/g, "").replace(/[^a-z0-9]/g, "");
    const normReg = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cClean = clean(campName);
    if (!cClean) return void 0;
    const targetRegNorm = normReg(regione);
    let bestItem;
    let highestScore = -1;
    for (const item of items) {
      const itemClean = clean(item.nome);
      if (!itemClean) continue;
      const itemRegNorm = normReg(item.regione);
      const isSameReg = Boolean(targetRegNorm && itemRegNorm === targetRegNorm);
      const isNazionale = itemRegNorm === "nazionale";
      let score = 0;
      if (itemClean === cClean) {
        score = isSameReg ? 100 : isNazionale ? 90 : 60;
      } else if (itemClean.includes(cClean) || cClean.includes(itemClean)) {
        score = isSameReg ? 80 : isNazionale ? 70 : 50;
      }
      if (score > highestScore) {
        highestScore = score;
        bestItem = item;
      }
    }
    return highestScore >= 50 ? bestItem : void 0;
  }
  /**
   * Cerca attivamente il campionato attuale della stagione corrente per un atleta
   * controllando le statistiche dei campionati regionali (e se necessario nazionali).
   * Risultato memorizzato in cache per risposta istantanea.
   */
  async findAthleteChampionship(atletaId, atletaNome, regione) {
    if (!atletaId && !atletaNome) return void 0;
    const cacheKey = `athlete_champ_${atletaId || atletaNome}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
    const allCamps = await this.getAllCampionati();
    if (!allCamps || allCamps.length === 0) return void 0;
    const cleanNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetRegNorm = cleanNorm(regione);
    const targetNomeNorm = cleanNorm(atletaNome);
    const targetIdStr = String(atletaId || "").trim();
    const regionalCamps = targetRegNorm ? allCamps.filter((c) => cleanNorm(c.regione) === targetRegNorm) : [];
    const nationalCamps = allCamps.filter((c) => cleanNorm(c.regione) === "nazionale");
    const searchPool = [...regionalCamps, ...nationalCamps];
    for (const camp of searchPool) {
      const statsCached = cacheService.get(`statistiche_${camp.id}`);
      if (statsCached && Array.isArray(statsCached)) {
        const found = statsCached.find(
          (s) => targetIdStr && String(s.atletaId || "").trim() === targetIdStr || targetNomeNorm && cleanNorm(s.atleta) === targetNomeNorm
        );
        if (found) {
          const res = { ...camp, squadra: found.squadra };
          cacheService.set(cacheKey, res, 24 * 60 * 60 * 1e3);
          return res;
        }
      }
    }
    const mapping = athleteResolver.getMapping();
    const batchSize = 6;
    for (let i = 0; i < searchPool.length; i += batchSize) {
      const batch = searchPool.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (camp) => {
          try {
            const statKey = `statistiche_${camp.id}`;
            let stats = cacheService.get(statKey);
            if (!stats) {
              const html = await FitetClient.fetchStatisticheAtleti(String(camp.id));
              stats = parseStatisticheAtleti(html, mapping);
              if (stats && stats.length > 0) {
                cacheService.set(statKey, stats, 60 * 60 * 1e3);
              }
            }
            if (stats && Array.isArray(stats)) {
              const found = stats.find(
                (s) => targetIdStr && String(s.atletaId || "").trim() === targetIdStr || targetNomeNorm && cleanNorm(s.atleta) === targetNomeNorm
              );
              if (found) {
                return { camp, squadra: found.squadra };
              }
            }
          } catch {
          }
          return null;
        })
      );
      const foundMatch = batchResults.find(Boolean);
      if (foundMatch) {
        const res = { ...foundMatch.camp, squadra: foundMatch.squadra };
        cacheService.set(cacheKey, res, 24 * 60 * 60 * 1e3);
        return res;
      }
    }
    return void 0;
  }
  async scrapeFromFitet() {
    const all = [];
    for (const nat of NAZIONALI) {
      try {
        const res = await fetch(`https://portale.fitet.org/risultati/campionati/elenco_campionati.php?ID_CAMP=${nat.cid}`, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        const text = new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
        const $ = cheerio4.load(text);
        $("tr").each((_, tr) => {
          const rowText = $(tr).find("td").first().text().trim().toLowerCase();
          const isFem = rowText.includes("femminil");
          $(tr).find('a[href*="CAM="]').each((_2, el) => {
            const href = $(el).attr("href") || "";
            const m = href.match(/CAM=(\d+)/i);
            if (m) {
              const id = parseInt(m[1], 10);
              const name = $(el).text().replace(/\s+/g, " ").trim();
              if (id && name) {
                all.push({
                  id,
                  nome: `${nat.nome}${isFem ? " Femminile" : ""} - ${name}`,
                  categoria: nat.nome,
                  regione: "Nazionale",
                  anno: 41,
                  formula: 19,
                  sesso: isFem ? "F" : "M"
                });
              }
            }
          });
        });
      } catch (e) {
        console.error(`Error scraping national ${nat.nome}:`, e);
      }
    }
    for (let i = 0; i < REGIONI.length; i += 5) {
      const batch = REGIONI.slice(i, i + 5);
      await Promise.all(batch.map(async (reg) => {
        try {
          const res = await fetch(`https://portale.fitet.org/risultati/regioni/menu_reg.php?REG=${reg.id}`, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          const text = new TextDecoder("iso-8859-1").decode(await res.arrayBuffer());
          const $ = cheerio4.load(text);
          $('a[href*="CAM="]').each((_, el) => {
            const href = $(el).attr("href") || "";
            const m = href.match(/CAM=(\d+)/i);
            if (m) {
              const id = parseInt(m[1], 10);
              const name = $(el).text().replace(/\s+/g, " ").trim();
              if (id && name) {
                let cat = "Regionale";
                const firstPart = name.split(" ")[0];
                if (firstPart.includes("/") || firstPart.length <= 4) {
                  cat = firstPart;
                }
                const isFem = /femm|femminil/i.test(name) || /femm|femminil/i.test(cat);
                all.push({
                  id,
                  nome: name,
                  categoria: cat,
                  regione: reg.nome,
                  regioneId: reg.id,
                  anno: 41,
                  formula: 19,
                  sesso: isFem ? "F" : "M"
                });
              }
            }
          });
        } catch (e) {
          console.error(`Error scraping region ${reg.nome}:`, e);
        }
      }));
    }
    return all;
  }
};
var championshipCatalog = new ChampionshipCatalog();

// server/parsers/classificaParser.ts
import * as cheerio5 from "cheerio";
function parseClassifica(html) {
  const $ = cheerio5.load(html);
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
import * as cheerio6 from "cheerio";
function parseCalendario(html) {
  const $ = cheerio6.load(html);
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
        let formula = void 0;
        if (link) {
          const m = link.match(/INCONTRO=(\d+)/i);
          if (m) incontroId = m[1];
          const f = link.match(/FORMULA=(\d+)/i);
          if (f) formula = parseInt(f[1], 10);
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
          vincitore,
          formula
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

// server/parsers/atletaParser.ts
import * as cheerio7 from "cheerio";
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
function extractRankingIframeUrl(html) {
  const $ = cheerio7.load(html);
  const rawSrc = $("#fragment-3 iframe").attr("src");
  if (!rawSrc) return null;
  const cleanSrc = rawSrc.replace(/\s+/g, "");
  if (!cleanSrc) return null;
  try {
    return new URL(cleanSrc, "https://portale.fitet.org/risultati/new_rank/dettaglioatleta_unica.php").href;
  } catch {
    return null;
  }
}
function formatDateItalian(val) {
  const clean = val.trim();
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return clean;
}
function isCurrentSeasonDate(dateStr) {
  if (!dateStr) return true;
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/) || dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = parseInt(m[3] && m[3].length === 4 ? m[3] : m[1], 10);
    const month = parseInt(m[3] && m[3].length === 4 ? m[2] : m[2], 10);
    if (year < 2026) return false;
    if (year === 2026 && month < 7) return false;
    if (year > 2027) return false;
    if (year === 2027 && month > 6) return false;
    return true;
  }
  return true;
}
function parsePartiteRanking(html, atletaId) {
  const $ = cheerio7.load(html);
  let $p = $(`#player_${atletaId}`);
  if (!$p.length) $p = $(".player").first();
  const result = {
    campionato: [],
    tornei: []
  };
  if (!$p.length) return result;
  const subtleText = $p.find(".subtle").text().trim();
  result.rawSubtle = subtleText;
  if (subtleText) {
    const parseSubVal = (regex) => {
      const m = subtleText.match(regex);
      return m ? parseItalianNumber(m[1]) : void 0;
    };
    result.dettaglioPunti = {
      puntiIniziali: parseSubVal(/iniziali\s*<b>?([\d\.,]+)/i),
      campionato: parseSubVal(/campionato\s*<b>?([\d\.,]+)/i),
      tornei: parseSubVal(/tornei\s*<b>?([\d\.,]+)/i),
      vittorieTornei: parseSubVal(/vittorie\s*tornei\s*<b>?([\d\.,]+)/i),
      protezione: parseSubVal(/protezione\s*<b>?([\d\.,]+)/i),
      finali: parseSubVal(/finali\s*<b>?([\d\.,]+)/i)
    };
  }
  $p.find("h3").each((_, h3) => {
    const text = $(h3).text().replace(/\s+/g, " ").toLowerCase();
    const table = $(h3).nextAll("table").first();
    if (!table.length) return;
    const headerText = table.find("th, tr:first-child td").text().toLowerCase();
    if (!headerText.includes("avversario")) return;
    if (text.includes("campionato") && !text.includes("punti") && !text.includes("posizionamento")) {
      table.find("tbody tr").each((_2, tr) => {
        const cells = $(tr).find("td");
        if (cells.length < 4) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes("totale")) return;
        const rawData = $(cells[0]).text().trim();
        if (!rawData || !rawData.includes("/") && !rawData.includes("-")) return;
        const data = formatDateItalian(rawData);
        if (!isCurrentSeasonDate(data)) return;
        let campionato = "";
        let punti = 0;
        let ris = "";
        let sesso = void 0;
        let stato = void 0;
        let avversario = "";
        let avversarioId = void 0;
        if (cells.length === 5) {
          campionato = $(cells[1]).text().trim();
          stato = $(cells[2]).text().trim();
          const $avvCell = $(cells[3]);
          avversario = $avvCell.text().trim();
          const $link = $avvCell.find("a");
          const href = $link.attr("href") || $link.attr("onclick") || "";
          const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
          avversarioId = idMatch ? idMatch[1] : void 0;
          ris = $(cells[4]).text().trim();
        } else {
          campionato = $(cells[1]).text().trim();
          punti = parseItalianNumber($(cells[2]).text().trim());
          ris = $(cells[3]).text().trim();
          sesso = cells.length >= 5 ? $(cells[4]).text().trim() : void 0;
          stato = cells.length >= 6 ? $(cells[5]).text().trim() : void 0;
          const $avvCell = cells.length >= 7 ? $(cells[6]) : $(cells[cells.length - 1]);
          avversario = $avvCell.text().trim();
          const $link = $avvCell.find("a");
          const href = $link.attr("href") || $link.attr("onclick") || "";
          const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
          avversarioId = idMatch ? idMatch[1] : void 0;
        }
        const isVittoria = ris.toUpperCase() === "V" || ris.toLowerCase() === "win";
        result.campionato.push({
          data,
          campionato,
          punti,
          risultato: ris,
          isVittoria,
          avversario,
          avversarioId,
          sesso,
          stato
        });
      });
    } else if (text.includes("torne") && !text.includes("punti") && !text.includes("posizionamento") && !text.includes("vinti nei gironi")) {
      table.find("tbody tr").each((_2, tr) => {
        const cells = $(tr).find("td");
        if (cells.length < 5) return;
        const rowText = $(tr).text().trim();
        if (rowText.toLowerCase().includes("totale")) return;
        const rawData = $(cells[0]).text().trim();
        if (!rawData || !rawData.includes("/") && !rawData.includes("-")) return;
        const data = formatDateItalian(rawData);
        if (!isCurrentSeasonDate(data)) return;
        const torneo = $(cells[1]).text().trim();
        const gara = $(cells[2]).text().trim();
        const stato = $(cells[3]).text().trim();
        const $avvCell = $(cells[4]);
        const avversario = $avvCell.text().trim();
        const $link = $avvCell.find("a");
        const href = $link.attr("href") || $link.attr("onclick") || "";
        const idMatch = href.match(/AVVERSARIO=(\d+)/i) || href.match(/ATLETA=(\d+)/i) || href.match(/atleti\/(\d+)/i) || href.match(/(\d{4,})/);
        const avversarioId = idMatch ? idMatch[1] : void 0;
        const fase = cells.length >= 6 ? $(cells[5]).text().trim() : void 0;
        const ris = cells.length >= 7 ? $(cells[6]).text().trim() : $(cells[cells.length - 1]).text().trim();
        if (ris.toUpperCase() !== "V" && ris.toUpperCase() !== "S" && ris.toLowerCase() !== "win" && ris.toLowerCase() !== "loss") return;
        const isVittoria = ris.toUpperCase() === "V" || ris.toLowerCase() === "win";
        const isDiscarded = $(tr).hasClass("discarded") || ris.toUpperCase() === "S";
        result.tornei.push({
          data,
          torneo,
          gara,
          stato,
          avversario,
          avversarioId,
          fase,
          risultato: ris,
          isVittoria,
          isDiscarded
        });
      });
    }
  });
  return result;
}
function parseDettaglioAtleta(html, atletaId, partiteRanking) {
  const $ = cheerio7.load(html);
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
  const fotoId = photoMatch ? photoMatch[1] : atletaId || "";
  const fotoUrl = fotoId && /^\d+$/.test(fotoId) ? `https://portale.fitet.org/images/atleti/${fotoId}.jpg` : "";
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
  const regione = getFieldValue("Regione") || "";
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
      const headerCells = $(rows[0]).find("td, th");
      const dataCells = $(rows[1]).find("td");
      const headers = headerCells.map((_, c) => $(c).text().replace(/\s+/g, " ").trim().toUpperCase()).get();
      const findCol = (re, fallback) => {
        const i = headers.findIndex((h) => re.test(h));
        return i >= 0 ? i : fallback;
      };
      const hasProtezione = headers.some((h) => /PROTEZIONE/.test(h));
      const offset = hasProtezione ? 1 : 0;
      const colIniziali = findCol(/INIZIALI/, 0);
      const colTotali = findCol(/PUNTI TOTALI/, 1);
      const colFinale = findCol(/PUNTEGGIO FINALE/, 2 + offset);
      const colGiocate = findCol(/GIOCATE/, 3 + offset);
      const colVinte = findCol(/VINTE/, 4 + offset);
      const colPerse = findCol(/PERSE/, 5 + offset);
      const colPerc = findCol(/%/, 6 + offset);
      if (dataCells.length >= 7) {
        const initText = $(dataCells[colIniziali]).text().trim();
        const initMatch = initText.match(/([\d\.,]+)\s*\[?\s*(\d{2}\/\d{2}\/\d{4})?/);
        if (initMatch) {
          puntiIniziali = parseItalianNumber(initMatch[1]);
          puntiInizialiData = initMatch[2] || "";
        }
        puntiTotali = parseItalianNumber($(dataCells[colTotali]).text().trim());
        punteggioFinale = parseItalianNumber($(dataCells[colFinale]).text().trim()) || punti;
        partiteGiocate = parseInt($(dataCells[colGiocate]).text().trim(), 10) || 0;
        partiteVinte = parseInt($(dataCells[colVinte]).text().trim(), 10) || 0;
        partitePerse = parseInt($(dataCells[colPerse]).text().trim(), 10) || 0;
        percentualePositiva = parseItalianNumber($(dataCells[colPerc]).text().trim().replace("%", ""));
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
    storicoClassifica,
    partiteRanking
  };
}

// server/parsers/headToHeadParser.ts
import * as cheerio8 from "cheerio";
function parseHeadToHead(html, atleta1Id, atleta2Id, fallbackAtleta1Nome, fallbackAtleta2Nome) {
  const $ = cheerio8.load(html);
  const rows = $("table tr");
  let atleta1Nome = fallbackAtleta1Nome || `Atleta ${atleta1Id}`;
  let atleta2Nome = fallbackAtleta2Nome || `Atleta ${atleta2Id}`;
  const nomi = $("p.nomi");
  if (nomi.length >= 2) {
    const n1 = $(nomi[0]).text().trim();
    const n2 = $(nomi[1]).text().trim();
    if (n1 && !n1.toLowerCase().includes("incontrati")) atleta1Nome = n1;
    if (n2 && !n2.toLowerCase().includes("incontrati")) atleta2Nome = n2;
  }
  const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const target1 = norm(atleta1Nome);
  const target2 = norm(atleta2Nome);
  let v1 = 0;
  let v2 = 0;
  const incontri = [];
  rows.slice(2).each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) return;
    const anno = $(tds[0]).text().trim();
    const data = $(tds[1]).text().trim();
    const gara = $(tds[2]).text().trim();
    const vincente = $(tds[3]).text().trim();
    if (!data || !data.includes("/")) return;
    const sWin = parseInt($(tds[4]).text().trim(), 10) || 3;
    const sLose = parseInt($(tds[6]).text().trim(), 10) || 0;
    const vincenteNorm = norm(vincente);
    const isV1 = vincenteNorm.includes(target1) || target1.includes(vincenteNorm) || !vincenteNorm.includes(target2) && !target2.includes(vincenteNorm) && vincenteNorm.length > 0;
    if (isV1) {
      v1++;
    } else {
      v2++;
    }
    const setAtleta1 = isV1 ? sWin : sLose;
    const setAtleta2 = isV1 ? sLose : sWin;
    incontri.push({
      anno,
      data,
      gara,
      vincente,
      punteggio: `${setAtleta1} - ${setAtleta2}`,
      setAtleta1,
      setAtleta2,
      isVittoriaAtleta1: isV1
    });
  });
  return {
    atleta1: {
      id: atleta1Id,
      nome: atleta1Nome,
      vittorie: v1,
      fotoUrl: `https://portale.fitet.org/images/atleti/${atleta1Id}.jpg`
    },
    atleta2: {
      id: atleta2Id,
      nome: atleta2Nome,
      vittorie: v2,
      fotoUrl: `https://portale.fitet.org/images/atleti/${atleta2Id}.jpg`
    },
    totaleIncontri: incontri.length,
    incontri
  };
}

// server/services/headToHeadService.ts
var TTL_HEAD_TO_HEAD = 24 * 60 * 60 * 1e3;
var DEFAULT_ID_CLASS = 248;
var HeadToHeadService = class {
  /**
   * Recupera il confronto diretto (Testa a Testa) tra due atleti
   * Supporta sia ID federali che nomi atleti (risolti automaticamente)
   */
  async getHeadToHead(atleta1, atleta2, idClass = DEFAULT_ID_CLASS) {
    let id1 = atleta1.trim();
    let id2 = atleta2.trim();
    let name1 = "";
    let name2 = "";
    if (!/^\d+$/.test(id1)) {
      name1 = id1;
      const resolved = await athleteResolver.resolveAthleteId(id1);
      if (resolved) id1 = resolved;
    }
    if (!/^\d+$/.test(id2)) {
      name2 = id2;
      const resolved = await athleteResolver.resolveAthleteId(id2);
      if (resolved) id2 = resolved;
    }
    const cacheKey = `h2h_${id1}_${id2}_${idClass}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
    if (!/^\d+$/.test(id1) || !/^\d+$/.test(id2)) {
      return {
        atleta1: { id: id1, nome: name1 || id1, vittorie: 0 },
        atleta2: { id: id2, nome: name2 || id2, vittorie: 0 },
        totaleIncontri: 0,
        incontri: []
      };
    }
    try {
      const url = `https://portale.fitet.org/risultati/new_rank/head_head.php?ATLETA=${id1}&AVVERSARIO=${id2}&ZU=1&ID_CLASS=${idClass}`;
      const html = await FitetClient.fetchHtml(url, false);
      const data = parseHeadToHead(html, id1, id2, name1, name2);
      cacheService.set(cacheKey, data, TTL_HEAD_TO_HEAD);
      return data;
    } catch (err) {
      console.warn(`[HeadToHeadService] Errore fetch testa a testa ${id1} vs ${id2}:`, err);
      return {
        atleta1: { id: id1, nome: name1 || id1, vittorie: 0 },
        atleta2: { id: id2, nome: name2 || id2, vittorie: 0 },
        totaleIncontri: 0,
        incontri: []
      };
    }
  }
  /**
   * Arricchisce gli incontri ranking (soprattutto gare di torneo)
   * incrociando i risultati dei set dal Testa a Testa
   */
  async enrichRankingMatches(atletaId, partite, idClass = DEFAULT_ID_CLASS) {
    if (!partite) return partite;
    const neededOpponents = /* @__PURE__ */ new Map();
    if (Array.isArray(partite.tornei)) {
      for (const t of partite.tornei) {
        if (!t.risultatoSet && t.avversario) {
          const key = t.avversario.toUpperCase().trim();
          if (!neededOpponents.has(key)) {
            neededOpponents.set(key, { id: t.avversarioId, name: t.avversario });
          } else if (t.avversarioId && !neededOpponents.get(key).id) {
            neededOpponents.get(key).id = t.avversarioId;
          }
        }
      }
    }
    if (Array.isArray(partite.campionato)) {
      for (const c of partite.campionato) {
        if (!c.risultatoSet && c.avversario) {
          const key = c.avversario.toUpperCase().trim();
          if (!neededOpponents.has(key)) {
            neededOpponents.set(key, { id: c.avversarioId, name: c.avversario });
          } else if (c.avversarioId && !neededOpponents.get(key).id) {
            neededOpponents.get(key).id = c.avversarioId;
          }
        }
      }
    }
    if (neededOpponents.size === 0) return partite;
    const opponentsList = Array.from(neededOpponents.entries()).slice(0, 15);
    const batchSize = 5;
    const h2hMap = /* @__PURE__ */ new Map();
    const normDate = (d) => {
      if (!d) return "";
      const parts = d.trim().split(/[\/\-\.]/);
      if (parts.length === 3) {
        let [day, month, year] = parts;
        day = String(parseInt(day, 10));
        month = String(parseInt(month, 10));
        if (year.length === 2) year = `20${year}`;
        return `${day}/${month}/${year}`;
      }
      return d.trim();
    };
    for (let i = 0; i < opponentsList.length; i += batchSize) {
      const chunk = opponentsList.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async ([key, opp]) => {
          try {
            const target = opp.id || opp.name;
            const h2h = await this.getHeadToHead(atletaId, target, idClass);
            if (h2h && h2h.incontri.length > 0) {
              h2hMap.set(key, h2h);
              if (opp.id) h2hMap.set(opp.id, h2h);
              if (h2h.atleta2.id) h2hMap.set(h2h.atleta2.id, h2h);
              if (h2h.atleta2.nome) h2hMap.set(h2h.atleta2.nome.toUpperCase().trim(), h2h);
            }
          } catch (err) {
          }
        })
      );
    }
    if (Array.isArray(partite.tornei)) {
      for (const t of partite.tornei) {
        if (t.risultatoSet) continue;
        const oppName = t.avversario.toUpperCase().trim();
        const h2h = t.avversarioId && h2hMap.get(t.avversarioId) || h2hMap.get(oppName);
        if (!h2h) continue;
        if (h2h.atleta2.id) t.avversarioId = h2h.atleta2.id;
        const targetDate = normDate(t.data);
        const enc = h2h.incontri.find((e) => normDate(e.data) === targetDate) || (h2h.incontri.length === 1 ? h2h.incontri[0] : void 0);
        if (enc) {
          t.risultatoSet = enc.punteggio;
        }
      }
    }
    if (Array.isArray(partite.campionato)) {
      for (const c of partite.campionato) {
        if (c.risultatoSet) continue;
        const oppName = c.avversario.toUpperCase().trim();
        const h2h = c.avversarioId && h2hMap.get(c.avversarioId) || h2hMap.get(oppName);
        if (!h2h) continue;
        if (h2h.atleta2.id) c.avversarioId = h2h.atleta2.id;
        const targetDate = normDate(c.data);
        const enc = h2h.incontri.find((e) => normDate(e.data) === targetDate) || (h2h.incontri.length === 1 ? h2h.incontri[0] : void 0);
        if (enc) {
          c.risultatoSet = enc.punteggio;
        }
      }
    }
    return partite;
  }
};
var headToHeadService = new HeadToHeadService();

// server/parsers/squadraParser.ts
import * as cheerio9 from "cheerio";
function parseDettaglioSquadra(html, squadraId, camId, logoUrl) {
  const $ = cheerio9.load(html);
  const titleText = $("table tr:first-child").text().replace(/\s+/g, " ").trim();
  const teamNameMatch = titleText.match(/Atleti della squadra:\s*(.+)$/i);
  const nome = teamNameMatch ? teamNameMatch[1].trim() : "Squadra " + squadraId;
  const atleti = [];
  $("table tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    if (cells.length < 10) return;
    const rowText = $row.text();
    if (rowText.includes("Atleta") && rowText.includes("PaV")) return;
    const athleteLink = $row.find('a[href*="dettaglio_percentuali.php"], a[href*="IDA="]');
    if (athleteLink.length === 0) return;
    const athleteName = athleteLink.text().replace(/\s+/g, " ").trim();
    if (!athleteName) return;
    const href = athleteLink.attr("href") || "";
    const idaMatch = href.match(/IDA=(\d+)/i);
    const atletaId = idaMatch ? idaMatch[1] : "";
    const hasScheda = $row.find('a[onclick*="getScheda"]').length > 0;
    const isDoppio = !hasScheda && athleteName.includes(" - ");
    const rankText = $(cells[2]).text().replace(/\s+/g, " ").trim();
    let rankPosizione = null;
    let rankPunti = null;
    const rankPosMatch = rankText.match(/rank\.\s*(\d+)/i);
    if (rankPosMatch) {
      rankPosizione = parseInt(rankPosMatch[1], 10);
    }
    const rankPuntiMatch = rankText.match(/\((\d+)\)/);
    if (rankPuntiMatch) {
      rankPunti = parseInt(rankPuntiMatch[1], 10);
    }
    const getInt = (cellIdx) => {
      const val = $(cells[cellIdx]).text().trim().replace(/[^\d-]/g, "");
      return parseInt(val, 10) || 0;
    };
    const partiteDisputate = getInt(3);
    const partiteVinte = getInt(4);
    const partitePerse = getInt(5);
    const setVinti = getInt(6);
    const setPersi = getInt(7);
    const puntiVinti = getInt(8);
    const puntiPersi = getInt(9);
    const percentualeVittorie = getInt(10);
    atleti.push({
      atletaId,
      nome: athleteName,
      isDoppio,
      rankText,
      rankPosizione,
      rankPunti,
      partiteDisputate,
      partiteVinte,
      partitePerse,
      setVinti,
      setPersi,
      puntiVinti,
      puntiPersi,
      percentualeVittorie,
      fotoUrl: !isDoppio && atletaId ? `https://portale.fitet.org/images/atleti/${atletaId}.jpg` : null
    });
  });
  return {
    squadraId,
    camId,
    nome,
    logoUrl,
    atleti
  };
}

// server/parsers/refertoParser.ts
import * as cheerio10 from "cheerio";
function resolveFitetUrl(src) {
  if (!src) return void 0;
  if (src.startsWith("http")) return src;
  const clean = src.replace(/^(\.\.\/)+/, "");
  return `https://portale.fitet.org/${clean}`;
}
function parseRefertoIncontro(html, incontroId, camId, formulaId) {
  const $ = cheerio10.load(html);
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
  const $ = cheerio10.load(html);
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

// server/parsers/rankingParser.ts
import * as cheerio11 from "cheerio";
function parseRankingHtml(html, sesso = "M", currentPage = 1, comitId) {
  const $ = cheerio11.load(html);
  const titleText = $("td.style2 p.titoli, p.titoli").first().text().replace(/\s+/g, " ").trim();
  const titleClean = titleText.replace(/\(Atleti:.*?\)/i, "").trim();
  let totalAthletes = 0;
  const atletiMatch = titleText.match(/Atleti:\s*(\d+)/i);
  if (atletiMatch) {
    totalAthletes = parseInt(atletiMatch[1], 10);
  }
  let totalPages = 1;
  const scriptContent = $("script").text();
  const pagesMatch = scriptContent.match(/totalPages:\s*(\d+)/);
  if (pagesMatch) {
    totalPages = parseInt(pagesMatch[1], 10);
  } else if (totalAthletes > 0) {
    totalPages = Math.ceil(totalAthletes / 100);
  }
  const isRegionale = !!comitId && comitId > 0;
  const athletes = [];
  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    if ($tr.find("td.style2, td.style1, th").length > 0) return;
    const athleteLink = $tr.find('a[onclick*="getScheda"]');
    if (athleteLink.length === 0) return;
    const athleteName = athleteLink.text().replace(/\s+/g, " ").trim();
    const onclickAttr = athleteLink.attr("onclick") || "";
    const idMatch = onclickAttr.match(/getScheda\s*\(\s*(\d+)/);
    const atletaId = idMatch ? idMatch[1] : "";
    const cells = [];
    $tr.find("td").each((_2, td) => {
      cells.push($(td).text().replace(/\s+/g, " ").trim());
    });
    if (cells.length >= 7) {
      const rankNum = parseInt(cells[0].replace(/\D/g, ""), 10) || athletes.length + 1;
      const dataNascita = cells[2] || "";
      const settore = cells[3] || "";
      const punti = parseFloat(cells[4].replace(",", ".")) || 0;
      const posNazOrVariazione = cells[5] || "";
      const provinciaOrRegione = cells[6] || "";
      const categoria = cells[7] || "";
      athletes.push({
        rank: rankNum,
        atletaId,
        nome: athleteName,
        dataNascita,
        settore,
        punti,
        posNazOrVariazione,
        provinciaOrRegione,
        categoria
      });
    }
  });
  if (totalAthletes === 0) {
    totalAthletes = athletes.length;
  }
  return {
    title: titleClean || "Classifica Ufficiale FITeT",
    sesso,
    isRegionale,
    comitId,
    totalAthletes,
    totalPages: Math.max(totalPages, 1),
    currentPage,
    athletes
  };
}

// server/parsers/sceltaAtletaParser.ts
import * as cheerio12 from "cheerio";
function parseSceltaAtleta(html) {
  if (!html) return [];
  const $ = cheerio12.load(html);
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  $('a[href*="head_head.php"]').each((_, element) => {
    const href = $(element).attr("href") || "";
    const idMatch = href.match(/[?&]AVVERSARIO=(\d+)/i);
    if (!idMatch) return;
    const id = idMatch[1];
    if (!id || seen.has(id)) return;
    const nome = $(element).text().replace(/\s+/g, " ").trim();
    if (!nome) return;
    const dateText = $(element).closest("tr").find("td").last().text().trim();
    const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    seen.add(id);
    results.push({
      id,
      nome,
      dataNascita: dateMatch ? `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}` : null
    });
  });
  return results;
}

// server/app.ts
import * as cheerio13 from "cheerio";
var app = express();
app.use(cors());
app.use(express.json());
var DEFAULT_CAM_ID = 794;
var DEFAULT_ANNO_ID = 41;
var TTL_CLASSIFICA = 30 * 60 * 1e3;
var TTL_CALENDARIO = 30 * 60 * 1e3;
var TTL_STATISTICHE = 60 * 60 * 1e3;
var TTL_ATLETA = 24 * 60 * 60 * 1e3;
var TTL_REFERTO = 12 * 60 * 60 * 1e3;
var TTL_RICERCA_ATLETA = 10 * 60 * 1e3;
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
async function getClassifica(camId = DEFAULT_CAM_ID, annoId = DEFAULT_ANNO_ID, forceRefresh = false) {
  const cacheKey = `classifica_${camId}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  const html = await FitetClient.fetchClassifica(camId);
  const data = parseClassifica(html);
  try {
    const teamsToResolve = data.map((t) => ({ nome: t.nome, squadraId: t.squadraId }));
    await teamResolver.resolveLogosForTeams(teamsToResolve, camId, annoId);
  } catch (err) {
    console.warn(`[TeamResolver] Warning resolving team logos for CAM ${camId}:`, err);
  }
  const withLogos = data.map((t) => ({
    ...t,
    logoUrl: teamResolver.getLogo(t.nome)
  }));
  cacheService.set(cacheKey, withLogos, TTL_CLASSIFICA);
  return withLogos;
}
async function getCalendario(camId = DEFAULT_CAM_ID, annoId = DEFAULT_ANNO_ID, forceRefresh = false) {
  const cacheKey = `calendario_${camId}_${annoId}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  const html = await FitetClient.fetchCalendario(camId, annoId);
  const data = parseCalendario(html);
  cacheService.set(cacheKey, data, TTL_CALENDARIO);
  return data;
}
async function getStatistiche(camId = DEFAULT_CAM_ID, forceRefresh = false, squadraIds = []) {
  const cacheKey = `statistiche_${camId}`;
  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);
    if (cached) return cached;
  }
  try {
    if (squadraIds.length > 0) {
      await athleteResolver.resolveAthletesForChampionship(camId, squadraIds);
    }
  } catch (err) {
    console.warn(`[AthleteResolver] Warning resolving athletes for CAM ${camId}:`, err);
  }
  const html = await FitetClient.fetchStatisticheAtleti(camId);
  const mapping = athleteResolver.getMapping();
  const data = parseStatisticheAtleti(html, mapping);
  cacheService.set(cacheKey, data, TTL_STATISTICHE);
  return data;
}
app.get("/api/campionati", async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const campionati = await championshipCatalog.getAllCampionati(forceRefresh);
    res.json(campionati);
  } catch (error) {
    console.error("Error fetching championship catalog:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/dashboard", async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === "true";
  try {
    const [rawClassifica, calendario, champMeta] = await Promise.all([
      getClassifica(cam, anno, forceRefresh),
      getCalendario(cam, anno, forceRefresh),
      championshipCatalog.getChampionship(cam)
    ]);
    const squadraIds = rawClassifica.map((s) => s.squadraId).filter(Boolean);
    const statisticheAtleti = await getStatistiche(cam, forceRefresh, squadraIds);
    const classifica = computeTeamForm(rawClassifica, calendario);
    const payload = {
      classifica,
      calendario,
      statisticheAtleti,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      championship: {
        id: cam,
        anno,
        nome: champMeta?.nome || `Campionato ${cam}`,
        girone: champMeta?.nome || "",
        regione: champMeta?.regione || "Nazionale"
      }
    };
    res.json(payload);
  } catch (error) {
    console.error(`Error fetching dashboard data for CAM=${cam}:`, error);
    res.status(500).json({ error: "Errore durante il recupero dei dati FITeT", details: error.message });
  }
});
app.get("/api/classifica", async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === "true";
  try {
    const data = await getClassifica(cam, anno, forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/calendario", async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === "true";
  try {
    const data = await getCalendario(cam, anno, forceRefresh);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/statistiche", async (req, res) => {
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : DEFAULT_CAM_ID;
  const forceRefresh = req.query.refresh === "true";
  try {
    const classifica = await getClassifica(cam, DEFAULT_ANNO_ID, false);
    const squadraIds = classifica.map((s) => s.squadraId).filter(Boolean);
    const data = await getStatistiche(cam, forceRefresh, squadraIds);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/ranking", async (req, res) => {
  const sesso = req.query.sesso === "F" ? "F" : "M";
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const comit = req.query.comit ? String(req.query.comit).trim() : "";
  const forceRefresh = req.query.refresh === "true";
  const isRegionale = !!comit && comit !== "0" && comit !== "all";
  const comitId = isRegionale ? parseInt(comit, 10) : void 0;
  const cacheKey = `ranking_${sesso}_${isRegionale ? `comit_${comitId}` : "naz"}_p${page}`;
  try {
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }
    let url = "";
    if (isRegionale) {
      url = `https://portale.fitet.org/risultati/new_rank/ranking_unica_comit.php?COMIT=${comitId}&SESSO=${sesso}&ID_CLASS=248&ZU=1&TIPO=1&SETT=0&page=${page}&S=0&FQ=0&G=0&V=0`;
    } else {
      url = `https://portale.fitet.org/risultati/new_rank/ranking_unica.php?SESSO=${sesso}&ID_CLASS=248&ZU=1&TIPO=1&SETT=0&page=${page}&S=0&FQ=0&G=0&V=0`;
    }
    const html = await FitetClient.fetchHtml(url, true);
    const result = parseRankingHtml(html, sesso, page, comitId);
    cacheService.set(cacheKey, result, 60 * 60 * 1e3);
    res.json(result);
  } catch (error) {
    console.error("Error fetching ranking:", error);
    res.status(500).json({ error: "Errore nel recupero della classifica", details: error.message });
  }
});
app.get("/api/atleta/:id", async (req, res) => {
  let { id } = req.params;
  const forceRefresh = req.query.refresh === "true" || req.query.force === "true";
  if (!id || id === "null" || id === "undefined") {
    return res.status(400).json({ error: "ID atleta non valido" });
  }
  if (!/^\d+$/.test(id)) {
    let cleanName = id;
    try {
      cleanName = decodeURIComponent(id);
    } catch {
    }
    cleanName = cleanName.trim();
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
      const isHollow2 = !cached || !cached.anagrafica || cached.anagrafica.nome?.startsWith("Atleta ") || cached.anagrafica.punti === 0 && (!cached.storicoClassifica || cached.storicoClassifica.length === 0);
      if (cached && !isHollow2 && cached.partiteRanking) return res.json(cached);
    }
    const html = await FitetClient.fetchSchedaAtleta(id);
    let partiteRanking = void 0;
    let iframeUrl = extractRankingIframeUrl(html);
    let resolvedIdClass = 248;
    if (iframeUrl) {
      try {
        const iframeHtml = await FitetClient.fetchHtml(iframeUrl, false);
        partiteRanking = parsePartiteRanking(iframeHtml, id);
        const idClassMatch = iframeUrl.match(/\/html\/(\d+)\//i);
        if (idClassMatch) resolvedIdClass = parseInt(idClassMatch[1], 10);
      } catch (iframeErr) {
        console.warn(`Could not fetch ranking matches iframe for athlete ${id}:`, iframeErr);
      }
    }
    const atleta = parseDettaglioAtleta(html, id, partiteRanking);
    const campRanking = partiteRanking?.campionato || [];
    const uniqueCampNames = [];
    for (const m of campRanking) {
      const trimmed = m.campionato?.trim();
      if (trimmed && !uniqueCampNames.includes(trimmed)) {
        uniqueCampNames.push(trimmed);
      }
    }
    const playedCamps = [];
    for (const cName of uniqueCampNames) {
      const resolved = championshipCatalog.resolveChampionship(cName, atleta.anagrafica?.regione);
      if (resolved && !playedCamps.some((pc) => pc.camId === resolved.id)) {
        playedCamps.push({
          camId: resolved.id,
          nome: resolved.nome,
          categoria: resolved.categoria,
          regione: resolved.regione
        });
      }
    }
    if (playedCamps.length === 0) {
      const fallback = await championshipCatalog.findAthleteChampionship(id, atleta.anagrafica?.nome, atleta.anagrafica?.regione);
      if (fallback && !playedCamps.some((pc) => pc.camId === fallback.id)) {
        playedCamps.push({
          camId: fallback.id,
          nome: fallback.nome,
          categoria: fallback.categoria,
          regione: fallback.regione,
          squadra: fallback.squadra
        });
      }
    }
    if (playedCamps.length > 0) {
      atleta.campionatoAttuale = playedCamps[0];
      atleta.campionatiGiocati = playedCamps;
    }
    const isHollow = !atleta || !atleta.anagrafica || atleta.anagrafica.nome?.startsWith("Atleta ") || atleta.anagrafica.punti === 0 && (!atleta.storicoClassifica || atleta.storicoClassifica.length === 0);
    if (!isHollow) {
      cacheService.set(cacheKey, atleta, TTL_ATLETA);
    }
    if (partiteRanking && (partiteRanking.campionato.length > 0 || partiteRanking.tornei.length > 0)) {
      headToHeadService.enrichRankingMatches(id, partiteRanking, resolvedIdClass).then((enriched) => {
        if (enriched && !isHollow) {
          atleta.partiteRanking = enriched;
          cacheService.set(cacheKey, atleta, TTL_ATLETA);
        }
      }).catch(() => {
      });
    }
    res.json(atleta);
  } catch (error) {
    console.error(`Error fetching athlete ${id}:`, error);
    res.status(500).json({ error: "Errore nel recupero della scheda atleta", details: error.message });
  }
});
app.get("/api/head-to-head", async (req, res) => {
  const atleta1 = req.query.atleta1;
  const atleta2 = req.query.atleta2;
  const idClass = req.query.idClass ? parseInt(req.query.idClass, 10) : 248;
  if (!atleta1 || !atleta2) {
    return res.status(400).json({ error: "Parametri atleta1 e atleta2 obbligatori" });
  }
  try {
    const data = await headToHeadService.getHeadToHead(atleta1, atleta2, idClass);
    res.json(data);
  } catch (error) {
    console.error(`Error in head-to-head ${atleta1} vs ${atleta2}:`, error);
    res.status(500).json({ error: "Errore nel recupero del testa a testa", details: error.message });
  }
});
app.post("/api/atleta/:id/view", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID atleta mancante" });
  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "127.0.0.1";
  console.log(`[VIEW HIT] ID Atleta: ${id} | Client IP: ${clientIp}`);
  const count = await viewsService.incrementViews(id, clientIp);
  res.json({ id, views: count });
});
app.get("/api/atleta/:id/views", async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID atleta mancante" });
  const count = await viewsService.getViews(id);
  res.json({ id, views: count });
});
app.get("/api/search-atleta", async (req, res) => {
  const query = req.query.q || "";
  if (!query || query.length < 2) {
    return res.json([]);
  }
  try {
    const results = await FitetClient.searchAtleta(query);
    const enriched = results.map((r) => {
      const dateMatch = r.label ? r.label.match(/\((\d{2}\/\d{2}\/\d{4})\)/) : null;
      const tesseraMatch = r.label ? r.label.match(/\[(\d+)\]/) : null;
      return {
        id: r.id,
        value: r.value,
        label: r.label,
        dataNascita: dateMatch ? dateMatch[1] : null,
        tessera: tesseraMatch ? tesseraMatch[1] : null,
        fotoUrl: `https://portale.fitet.org/images/atleti/${r.id}.jpg`
      };
    });
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/search-atleta-scelta", async (req, res) => {
  const query = (req.query.q || "").trim();
  const excludeId = (req.query.excludeId || "0").trim() || "0";
  const idClass = req.query.idClass ? parseInt(req.query.idClass, 10) || 248 : 248;
  if (query.length < 2) {
    return res.json([]);
  }
  const cacheKey = `scelta_atleta_${query.toUpperCase()}_${excludeId}_${idClass}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const html = await FitetClient.fetchSceltaAtleta(query, excludeId, idClass);
    const parsed = parseSceltaAtleta(html);
    const enriched = parsed.map((atleta) => ({
      id: atleta.id,
      value: atleta.nome,
      label: atleta.nome,
      dataNascita: atleta.dataNascita,
      tessera: null,
      fotoUrl: `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`
    }));
    cacheService.set(cacheKey, enriched, TTL_RICERCA_ATLETA);
    res.json(enriched);
  } catch (error) {
    console.warn(`[search-atleta-scelta] Fallback autocomplete per "${query}":`, error?.message || error);
    try {
      const fallback = await FitetClient.searchAtleta(query);
      const enriched = fallback.filter((atleta) => atleta.id !== excludeId).map((atleta) => {
        const dateMatch = atleta.label ? atleta.label.match(/\((\d{2}\/\d{2}\/\d{4})\)/) : null;
        const tesseraMatch = atleta.label ? atleta.label.match(/\[(\d+)\]/) : null;
        return {
          id: atleta.id,
          value: atleta.value,
          label: atleta.label,
          dataNascita: dateMatch ? dateMatch[1] : null,
          tessera: tesseraMatch ? tesseraMatch[1] : null,
          fotoUrl: `https://portale.fitet.org/images/atleti/${atleta.id}.jpg`
        };
      });
      res.json(enriched);
    } catch (fallbackError) {
      res.status(500).json({
        error: "Errore nella ricerca atleti",
        details: fallbackError?.message
      });
    }
  }
});
app.get("/api/referto/:incontroId", async (req, res) => {
  const { incontroId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : 0;
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
app.get("/api/squadra/:squadraId", async (req, res) => {
  const { squadraId } = req.params;
  const cam = req.query.cam ? parseInt(req.query.cam, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno ? parseInt(req.query.anno, 10) : DEFAULT_ANNO_ID;
  const forceRefresh = req.query.refresh === "true";
  if (!squadraId || squadraId === "null" || squadraId === "undefined") {
    return res.status(400).json({ error: "ID squadra non valido" });
  }
  try {
    let targetSquadraId = squadraId;
    if (!/^\d+$/.test(targetSquadraId)) {
      const decodedName = decodeURIComponent(targetSquadraId).trim().toUpperCase();
      let rawClassifica = cacheService.get(`classifica_${cam}_${anno}`);
      if (!rawClassifica) {
        rawClassifica = await getClassifica(cam, anno);
      }
      if (Array.isArray(rawClassifica)) {
        const found = rawClassifica.find(
          (sq) => sq.nome.toUpperCase().trim() === decodedName || sq.nome.toUpperCase().includes(decodedName) || decodedName.includes(sq.nome.toUpperCase())
        );
        if (found && found.squadraId) {
          targetSquadraId = found.squadraId;
        }
      }
    }
    const cacheKey = `squadra_${targetSquadraId}_${cam}_${anno}`;
    if (!forceRefresh) {
      const cached = cacheService.get(cacheKey);
      if (cached) return res.json(cached);
    }
    const url = `https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${targetSquadraId}&CAM=${cam}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("iso-8859-1").decode(buffer);
    const parsed = parseDettaglioSquadra(html, targetSquadraId, cam);
    let logoUrl = teamResolver.getLogo(parsed.nome);
    if (!logoUrl && targetSquadraId) {
      const resolved = await teamResolver.resolveLogosForTeams([{ nome: parsed.nome, squadraId: targetSquadraId }], cam, anno);
      logoUrl = resolved[parsed.nome.toUpperCase().trim()] || teamResolver.getLogo(parsed.nome);
    }
    parsed.logoUrl = logoUrl;
    cacheService.set(cacheKey, parsed, 60 * 60 * 1e3);
    res.json(parsed);
  } catch (error) {
    console.error(`Error fetching team ${squadraId} in CAM ${cam}:`, error);
    res.status(500).json({ error: "Errore nel recupero della scheda squadra", details: error.message });
  }
});
app.get("/api/atleta-campionato-partite", async (req, res) => {
  let atletaId = req.query.atletaId;
  let cam = req.query.cam;
  let squadraId = req.query.squadraId;
  let atletaNome = req.query.atletaNome;
  if (!atletaId) {
    return res.json({ matches: [], squadra: null });
  }
  if (!cam || cam === "auto" || cam === "null" || cam === "undefined") {
    const autoCamp = await championshipCatalog.findAthleteChampionship(atletaId, atletaNome);
    if (autoCamp) {
      cam = String(autoCamp.id);
    } else {
      return res.json({ matches: [], squadra: null });
    }
  }
  if (!/^\d+$/.test(atletaId)) {
    let cleanName = atletaId;
    try {
      cleanName = decodeURIComponent(atletaId);
    } catch {
    }
    cleanName = cleanName.trim();
    if (!atletaNome) atletaNome = cleanName;
    const resolved = await athleteResolver.resolveAthleteId(cleanName);
    if (resolved) {
      atletaId = resolved;
    }
  }
  if (!atletaNome && /^\d+$/.test(atletaId)) {
    const mapping = athleteResolver.getMapping();
    for (const [name, id] of Object.entries(mapping)) {
      if (String(id) === String(atletaId)) {
        atletaNome = name;
        break;
      }
    }
  }
  const force = req.query.force === "true";
  const cacheKey = `atleta_camp_partite_${cam}_${atletaId}_${squadraId || "auto"}_v3`;
  const cached = cacheService.get(cacheKey);
  if (cached && !force && !cached.error && cached.matches && cached.matches.length > 0) {
    return res.json(cached);
  }
  try {
    let squadraNome;
    const mapping = athleteResolver.getMapping();
    if (!squadraId) {
      try {
        const statHtml = await FitetClient.fetchStatisticheAtleti(cam);
        const stats = parseStatisticheAtleti(statHtml, mapping);
        const normName = (s) => (s || "").toUpperCase().replace(/[^A-Z]/g, "");
        const targetNorm = normName(atletaNome);
        const found = stats.find(
          (s) => s.atletaId && String(s.atletaId) === String(atletaId) || targetNorm && normName(s.atleta) === targetNorm || targetNorm && (normName(s.atleta).includes(targetNorm) || targetNorm.includes(normName(s.atleta)))
        );
        if (found) {
          squadraNome = found.squadra;
          const classHtml = await FitetClient.fetchClassifica(cam);
          const $c = cheerio13.load(classHtml);
          const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          const foundNorm = norm(found.squadra);
          $c('a[href*="SQUADRA="]').each((_, el) => {
            const text = $c(el).text().trim();
            const textNorm = norm(text);
            if (textNorm.length >= 3 && (textNorm === foundNorm || textNorm.includes(foundNorm) || foundNorm.includes(textNorm))) {
              const href = $c(el).attr("href") || "";
              const m = href.match(/SQUADRA=(\d+)/i);
              if (m && !squadraId) {
                squadraId = m[1];
                squadraNome = text;
              }
            }
          });
        }
      } catch (statErr) {
        console.warn("[PartiteCampionato] Statistiche look-up error:", statErr);
      }
      if (!squadraId) {
        try {
          const classHtml = await FitetClient.fetchClassifica(cam);
          const $c = cheerio13.load(classHtml);
          const candidateTeams = [];
          $c('a[href*="SQUADRA="]').each((_, el) => {
            const href = $c(el).attr("href") || "";
            const m = href.match(/SQUADRA=(\d+)/i);
            const text = $c(el).text().trim();
            if (m && !candidateTeams.some((t) => t.id === m[1])) {
              candidateTeams.push({ id: m[1], name: text });
            }
          });
          for (const team of candidateTeams) {
            try {
              const testUrl = `https://portale.fitet.org/risultati/campionati/percentuali.php?SQUADRA=${team.id}&CAM=${cam}`;
              const testHtml = await FitetClient.fetchHtml(testUrl);
              const normName = (s) => (s || "").toUpperCase().replace(/[^A-Z]/g, "");
              const targetNorm = normName(atletaNome);
              if (testHtml.includes(`IDA=${atletaId}`) || targetNorm && normName(testHtml).includes(targetNorm)) {
                squadraId = team.id;
                squadraNome = team.name || squadraNome;
                break;
              }
            } catch {
            }
          }
        } catch {
        }
      }
    }
    if (!squadraId) {
      const responsePayload2 = {
        camId: cam,
        matches: [],
        error: "Atleta non presente tra le squadre o le statistiche del campionato selezionato"
      };
      cacheService.set(cacheKey, responsePayload2, 15 * 1e3);
      return res.json(responsePayload2);
    }
    const url = `https://portale.fitet.org/risultati/campionati/dettaglio_percentuali.php?IDA=${atletaId}&CAM=${cam}&SQUADRA=${squadraId}`;
    const html = await FitetClient.fetchHtml(url);
    const $p = cheerio13.load(html);
    const matches = [];
    const headerText = $p("table tr").first().text();
    if (!squadraNome) {
      const sqMatch = headerText.match(/Squadra:\s*([^\n\t\-]+)/i);
      if (sqMatch) {
        squadraNome = sqMatch[1].trim();
      }
    }
    let targetAthleteName = atletaNome;
    const atMatch = headerText.match(/Atleta:\s*([^\n\t\-]+)/i);
    if (atMatch) {
      targetAthleteName = atMatch[1].trim();
    }
    const normTarget = (targetAthleteName || "").toUpperCase().replace(/[^A-Z]/g, "");
    $p("table tr").each((i, tr) => {
      if (i < 2) return;
      const cells = $p(tr).find("td").map((_, td) => $p(td).text().trim()).get();
      if (cells.length < 15) return;
      const giornata = parseInt(cells[0], 10) || 0;
      const atleta1 = cells[1].trim();
      const atleta2 = cells[2].trim();
      const setsRaw = [];
      for (let s = 0; s < 5; s++) {
        const a = parseInt(cells[3 + s * 2], 10);
        const b = parseInt(cells[4 + s * 2], 10);
        if ((a > 0 || b > 0) && !isNaN(a) && !isNaN(b)) {
          setsRaw.push(`${a}-${b}`);
        }
      }
      const set1 = parseInt(cells[13], 10) || 0;
      const set2 = parseInt(cells[14], 10) || 0;
      const norm1 = atleta1.toUpperCase().replace(/[^A-Z]/g, "");
      const norm2 = atleta2.toUpperCase().replace(/[^A-Z]/g, "");
      let isPlayer1 = true;
      if (normTarget) {
        if (norm1 === normTarget || norm1.includes(normTarget) || normTarget.includes(norm1)) {
          isPlayer1 = true;
        } else if (norm2 === normTarget || norm2.includes(normTarget) || normTarget.includes(norm2)) {
          isPlayer1 = false;
        }
      }
      const avversario = isPlayer1 ? atleta2 : atleta1;
      const setVinti = isPlayer1 ? set1 : set2;
      const setPersi = isPlayer1 ? set2 : set1;
      const isVittoria = setVinti > setPersi;
      const setsFormatted = setsRaw.map((s) => {
        const [a, b] = s.split("-").map(Number);
        return isPlayer1 ? `${a}-${b}` : `${b}-${a}`;
      });
      matches.push({
        giornata,
        avversario,
        squadra: squadraNome || "",
        setVinti,
        setPersi,
        risultatoSet: `${setVinti}-${setPersi}`,
        sets: setsFormatted,
        isVittoria
      });
    });
    const responsePayload = {
      camId: cam,
      squadra: squadraNome,
      matches
    };
    cacheService.set(cacheKey, responsePayload, 30 * 60 * 1e3);
    res.json(responsePayload);
  } catch (err) {
    console.error("Errore nel recupero partite campionato per atleta:", err);
    res.status(500).json({ error: "Errore durante la lettura delle partite dal portale FITeT", details: err.message });
  }
});
app.post("/api/refresh", async (req, res) => {
  const cam = req.query.cam || req.body?.cam ? parseInt(req.query.cam || req.body?.cam, 10) : DEFAULT_CAM_ID;
  const anno = req.query.anno || req.body?.anno ? parseInt(req.query.anno || req.body?.anno, 10) : DEFAULT_ANNO_ID;
  try {
    cacheService.clear();
    athleteResolver.reloadMapping();
    const [rawClassifica, calendario, statisticheAtleti] = await Promise.all([
      getClassifica(cam, anno, true),
      getCalendario(cam, anno, true),
      getStatistiche(cam, true)
    ]);
    const classifica = computeTeamForm(rawClassifica, calendario);
    res.json({ success: true, timestamp: (/* @__PURE__ */ new Date()).toISOString(), classifica, calendario, statisticheAtleti });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
if (!process.env.VERCEL) {
  const distPath = path5.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get(["/player/:id", "/atleta/:id"], async (req, res, next) => {
    const { id } = req.params;
    const indexFile = path5.join(distPath, "index.html");
    if (!fs5.existsSync(indexFile)) return next();
    try {
      let html = await fs5.promises.readFile(indexFile, "utf8");
      let athleteName = `Atleta #${id}`;
      let photoUrl = "https://portale.fitet.org/images/atleti/" + encodeURIComponent(id) + ".jpg";
      let description = "Visualizza la scheda atleta, ranking e storico incontri sul Portale Risultati FITeT.";
      const cached = cacheService.get(`atleta_${id}`);
      if (cached?.anagrafica?.nome) {
        athleteName = cached.anagrafica.nome;
        if (cached.anagrafica.societa) {
          description = `${athleteName} (${cached.anagrafica.societa}) - Scheda ranking, risultati e statistiche sul Portale Risultati FITeT.`;
        }
        if (cached.anagrafica.fotoUrl) {
          photoUrl = cached.anagrafica.fotoUrl;
        }
      }
      const title = `${athleteName} | Scheda Ranking Portale Risultati FITeT`;
      const currentUrl = `${req.protocol}://${req.get("host")}/player/${encodeURIComponent(id)}`;
      const ogMeta = `
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${photoUrl}" />
  <meta property="og:url" content="${currentUrl}" />
  <meta property="og:type" content="profile" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${photoUrl}" />
`;
      html = html.replace(/<title>.*?<\/title>/i, ogMeta);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch {
      return next();
    }
  });
  app.get(["/campionato/:id", "/cam/:id"], async (req, res, next) => {
    const { id } = req.params;
    const indexFile = path5.join(distPath, "index.html");
    if (!fs5.existsSync(indexFile)) return next();
    try {
      let html = await fs5.promises.readFile(indexFile, "utf8");
      const champ = await championshipCatalog.getChampionship(parseInt(id, 10));
      const champName = champ ? champ.nome : `Campionato #${id}`;
      const region = champ?.regione || "Nazionale";
      const title = `${champName} (${region}) | Portale Risultati FITeT`;
      const description = `Consulta classifica, calendario andata/ritorno e risultati di ${champName} sul Portale Risultati FITeT.`;
      const currentUrl = `${req.protocol}://${req.get("host")}/campionato/${id}`;
      const ogMeta = `
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="/fitet-icon.png" />
  <meta property="og:url" content="${currentUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="/fitet-icon.png" />
`;
      html = html.replace(/<title>.*?<\/title>/i, ogMeta);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch {
      return next();
    }
  });
  app.get("/sitemap.xml", (req, res) => {
    const sitemapFile = path5.resolve(process.cwd(), "public", "sitemap.xml");
    if (fs5.existsSync(sitemapFile)) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      return res.sendFile(sitemapFile);
    }
    res.status(404).send("Not Found");
  });
  app.get("/robots.txt", (req, res) => {
    const robotsFile = path5.resolve(process.cwd(), "public", "robots.txt");
    if (fs5.existsSync(robotsFile)) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.sendFile(robotsFile);
    }
    res.status(404).send("Not Found");
  });
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const indexFile = path5.join(distPath, "index.html");
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
