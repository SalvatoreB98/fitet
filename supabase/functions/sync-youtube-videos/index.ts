// Supabase Edge Function: sync-youtube-videos
// Eseguibile su Deno / Supabase Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

interface ChannelConfig {
  name: string;
  handle: string;
  channelId: string;
  channelUrl: string;
}

const CHANNELS: ChannelConfig[] = [
  {
    name: 'Giacomo Cerea',
    handle: '@GiacomoCerea',
    channelId: 'UCcA-SldiAGIwc2ymdU0XZ0A',
    channelUrl: 'https://www.youtube.com/@GiacomoCerea',
  },
  {
    name: 'FITeT Official',
    handle: '@Fitetofficial',
    channelId: 'UCEMruyCuhXSrAqkA-LkLUSg',
    channelUrl: 'https://www.youtube.com/@Fitetofficial',
  },
  {
    name: 'Filippo Cantella TT',
    handle: '@FilippoCantellaTT',
    channelId: 'UC1rRzhu89B1x25cgAWdLOxw',
    channelUrl: 'https://www.youtube.com/@FilippoCantellaTT',
  },
];

interface ParsedMatchInfo {
  league: string | null;
  matchDay: number | null;
  teamHome: string | null;
  teamAway: string | null;
}

function parseMatchTitle(title: string): ParsedMatchInfo {
  const clean = title.replace(/\s+/g, ' ').trim();

  // 1. Serie / League (es. A1, A2, B1, B2, C1, C2, D1)
  let league: string | null = null;
  const leagueMatch = clean.match(/\b(?:Serie\s+)?([ABCD][1-2])(?:\s*([FM]|Femminile|Maschile))?\b/i);
  if (leagueMatch) {
    league = leagueMatch[1].toUpperCase();
    if (leagueMatch[2]) {
      const g = leagueMatch[2].toUpperCase().startsWith('F') ? 'F' : 'M';
      league += ` ${g}`;
    }
  }

  // 2. Giornata / Match Day (es. "recupero 1ª giornata", "3ª giornata", "4 giornata")
  let matchDay: number | null = null;
  const dayMatch = clean.match(/(?:recupero\s+)?(\d+)\s*[ªa°\^e]?\s*giornata/i) || clean.match(/giornata\s*(\d+)/i);
  if (dayMatch) {
    matchDay = parseInt(dayMatch[1], 10);
  }

  // 3. Squadre coinvolte
  let teamHome: string | null = null;
  let teamAway: string | null = null;

  // Parentesi come in: "Arlia-Istrate (Castel Goffredo-Muravera)"
  const parenMatch = clean.match(/\(([^()]+?)\s*(?:-|–|vs\.?)\s*([^()]+?)\)/i);
  if (parenMatch) {
    teamHome = parenMatch[1].trim();
    teamAway = parenMatch[2].trim();
  } else {
    // Delimitatore dopo virgola o pipe: "... - 3ª giornata, TT Vigevano - Villa Romanó"
    const delimiterMatch = clean.match(/(?:[,|]\s*)([A-Za-z0-9À-ÿ\s.'’]+?)\s*(?:-|–|vs\.?)\s*([A-Za-z0-9À-ÿ\s.'’]+?)(?:\s+\d+\s*[-–:]\s*\d+.*)?$/i);
    if (delimiterMatch) {
      teamHome = delimiterMatch[1].trim();
      teamAway = delimiterMatch[2].trim().replace(/\s+\d+\s*[-–:]\s*\d+.*$/, '').trim();
    } else {
      const vsMatch = clean.match(/([A-Za-z0-9À-ÿ\s.'’]+?)\s+(?:vs\.?)\s+([A-Za-z0-9À-ÿ\s.'’]+?)(?:\s*[|,]|$)/i);
      if (vsMatch) {
        teamHome = vsMatch[1].trim();
        teamAway = vsMatch[2].trim();
      }
    }
  }

  return { league, matchDay, teamHome, teamAway };
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch RSS in parallelo
    const fetchPromises = CHANNELS.map(async (ch) => {
      try {
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`);
        if (!res.ok) return [];
        const xml = await res.text();

        const entries: Array<{
          video_id: string;
          channel_name: string;
          channel_id: string;
          channel_url: string;
          title: string;
          published_at: string;
          league: string | null;
          match_day: number | null;
          team_home: string | null;
          team_away: string | null;
          video_url: string;
        }> = [];

        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(xml)) !== null) {
          const entryXml = match[1];
          const videoIdMatch = entryXml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
          const titleMatch = entryXml.match(/<title>(.*?)<\/title>/);
          const publishedMatch = entryXml.match(/<published>(.*?)<\/published>/);

          if (videoIdMatch && titleMatch) {
            const rawTitle = titleMatch[1]
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>');

            const { league, matchDay, teamHome, teamAway } = parseMatchTitle(rawTitle);
            const videoId = videoIdMatch[1];

            entries.push({
              video_id: videoId,
              channel_name: ch.name,
              channel_id: ch.channelId,
              channel_url: ch.channelUrl,
              title: rawTitle,
              published_at: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
              league,
              match_day: matchDay,
              team_home: teamHome,
              team_away: teamAway,
              video_url: `https://www.youtube.com/watch?v=${videoId}`,
            });
          }
        }
        return entries;
      } catch (err) {
        console.error(`Errore fetch feed ${ch.name}:`, err);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allVideos = results.flat();

    if (allVideos.length > 0) {
      const { error } = await supabase
        .from('match_videos')
        .upsert(allVideos, { onConflict: 'video_id' });

      if (error) {
        throw error;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: allVideos.length,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

