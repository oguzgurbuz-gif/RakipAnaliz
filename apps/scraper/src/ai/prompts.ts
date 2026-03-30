export interface DateExtractionTemplateData {
  reference_date: string;
  title: string;
  body: string;
  raw_date_text: string;
}

export interface ContentAnalysisTemplateData {
  title: string;
  body: string;
  valid_from: string | null;
  valid_to: string | null;
  site_name: string;
  min_deposit?: number | null;
  max_bonus?: number | null;
  bonus_amount?: number | null;
  bonus_percentage?: number | null;
  free_bet_amount?: number | null;
  cashback_percent?: number | null;
  turnover?: string | null;
}

export interface WeeklyReportTemplateData {
  weekly_dataset_json: string;
}

export const DATE_EXTRACTION_SYSTEM_PROMPT = `Sen Türkçe kampanya metinlerinden tarih aralığı çıkaran bir bilgi çıkarım motorusun.
Sadece geçerli JSON üret.
Yorum yazma. Markdown kullanma.
Belirsizsen confidence değerini düşür.
Uydurma tarih üretme.`;

export const DATE_EXTRACTION_USER_PROMPT_TEMPLATE = `Aşağıdaki kampanya metninden başlangıç ve bitiş tarihini çıkar.

Kurallar:
1. Çıktı yalnızca JSON olsun.
2. Şema tam olarak şu yapıda olsun:
{
  "valid_from": string or null,
  "valid_to": string or null,
  "confidence": number,
  "reasoning_short": string
}
3. Tarihler ISO-8601 formatında olsun.
4. Türkiye saat dilimi esas alınsın.
5. Tarih açık değilse null döndür.
6. Tahmin yapman gerekiyorsa confidence düşür.
7. Referans tarih: {{reference_date}}

Kampanya başlığı:
{{title}}

Kampanya metni:
{{body}}

Ham tarih metni:
{{raw_date_text}}`;

export const CONTENT_ANALYSIS_SYSTEM_PROMPT = `Sen bir kampanya analiz motorusun. Sadece geçerli JSON çıktısı ver. Markdown veya yorum kullanma.
Türkçe metinlerden aşağıdaki bonus detaylarını çıkar:
- min_deposit: Minimum yatırım tutarı (TL cinsinden)
- max_bonus: Maksimum bonus tutarı (TL cinsinden)
- turnover: Çevrim şartı (örneğin "5x", "10x")
- free_bet_amount: Bedava bahis tutarı (TL cinsinden)
- cashback_percent: Kayıp iadesi yüzdesi (örneğin 10, 20)
- bonus_amount: Sabit bonus miktarı (TL cinsinden)
- bonus_percentage: Bonus yüzdesi (örneğin 100, 200)
Belirsiz veya bulunamayan değerler için null kullan.`;

export const CONTENT_ANALYSIS_USER_PROMPT_TEMPLATE = `Analyze this campaign. Respond with JSON only.

Output format:
{
  "category": "hoş-geldin-bonusu|ek-kazanç|yüksek-oran|freebet|spesifik-bahis|sadakat|turnuva|spor-bonus|casino-bonus|slot-bonus|diğer",
  "sentiment": "positive|neutral|negative",
  "summary": "2-3 kelimelik özet",
  "key_points": ["nokta1", "nokta2"],
  "min_deposit": number or null,
  "max_bonus": number or null,
  "turnover": string or null,
  "free_bet_amount": number or null,
  "cashback_percent": number or null,
  "bonus_amount": number or null,
  "bonus_percentage": number or null
}

Category examples:
- hoş-geldin-bonusu: "Hoş geldin bonusu 500 TL", "Yeni üyelere %100 bonus"
- ek-kazanç: "Kayıp iadesi %20", "Cashback bonus", "Rebat kazan"
- yüksek-oran: "Oran artışı", "Boosted odds", "Yüksek oran garantisi"
- freebet: "Bedava bahis", "Free bet 100 TL", "Ücretsiz kupon"
- spesifik-bahis: "Ganyan bonus", "At yarışı", "Plors özel"
- sadakat: "VIP puan", "Sadakat programı", "Club üyesi"
- turnuva: "Slot turnuva", "Leaderboard yarışması", "Haftalık tournament"
- spor-bonus: "Futbol bonusu", "Basketbol kampanyası", "Spor bahisleri"
- casino-bonus: "Casino bonus", "Rulet bonus", "Blackjack ödül"
- slot-bonus: "Slot free spin", "Makine bonusu", "Freespin 50"
- diğer: Only if nothing else fits

Bonus detail extraction rules:
- min_deposit: "minimum yatırım", "en az yatırım", "min 100 TL" → 100
- max_bonus: "maksimum bonus 5000 TL", "en yüksek 5000" → 5000
- turnover: "5x çevrim", "10 kez çevrim", "10x wagering" → "5x", "10x"
- free_bet_amount: "100 TL bedava bahis", "freebet 50" → 100, 50
- cashback_percent: "%20 kayıp iadesi", "cashback 15" → 20, 15
- bonus_amount: "500 TL bonus" → 500
- bonus_percentage: "%100 bonus", "%200" → 100, 200

Kampanya başlığı:
{{title}}

Kampanya metni:
{{body}}

Site:
{{site_name}}`;

export const WEEKLY_REPORT_SYSTEM_PROMPT = `Sen haftalık kampanya değişimini analiz eden bir yönetim raporu motorusun.
Sadece verilen veriye dayan ve sadece geçerli JSON döndür.`;

export const WEEKLY_REPORT_USER_PROMPT_TEMPLATE = `Aşağıdaki haftalık veri setine göre rapor oluştur.

Kurallar:
1. Çıktı sadece JSON olsun.
2. Uydurma bilgi üretme.
3. Aşağıdaki bölümleri oluştur:
- executive_summary
- started_campaigns_summary
- ended_campaigns_summary
- active_during_range_summary
- changed_campaigns_summary
- passive_transitions_summary
- top_categories
- top_sites
- risks
- recommendations

JSON şeması:
{
  "title": string,
  "executive_summary": string,
  "started_campaigns_summary": string,
  "ended_campaigns_summary": string,
  "active_during_range_summary": string,
  "changed_campaigns_summary": string,
  "passive_transitions_summary": string,
  "top_categories": [{"code": string, "count": number}],
  "top_sites": [{"site": string, "count": number}],
  "risks": string[],
  "recommendations": string[]
}

Haftalık veri seti:
{{weekly_dataset_json}}`;

export function buildDateExtractionPrompt(data: DateExtractionTemplateData): {
  system: string;
  user: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const userPrompt = DATE_EXTRACTION_USER_PROMPT_TEMPLATE
    .replace('{{reference_date}}', data.reference_date)
    .replace('{{title}}', data.title || '')
    .replace('{{body}}', data.body || '')
    .replace('{{raw_date_text}}', data.raw_date_text || '');

  return {
    system: DATE_EXTRACTION_SYSTEM_PROMPT,
    user: userPrompt,
    messages: [
      { role: 'system', content: DATE_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };
}

export function buildContentAnalysisPrompt(data: ContentAnalysisTemplateData): {
  system: string;
  user: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const userPrompt = CONTENT_ANALYSIS_USER_PROMPT_TEMPLATE
    .replace('{{title}}', data.title || '')
    .replace('{{body}}', data.body || '')
    .replace('{{valid_from}}', data.valid_from || 'Bilgi yok')
    .replace('{{valid_to}}', data.valid_to || 'Bilgi yok')
    .replace('{{site_name}}', data.site_name || '');

  return {
    system: CONTENT_ANALYSIS_SYSTEM_PROMPT,
    user: userPrompt,
    messages: [
      { role: 'system', content: CONTENT_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };
}

export function buildWeeklyReportPrompt(data: WeeklyReportTemplateData): {
  system: string;
  user: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const userPrompt = WEEKLY_REPORT_USER_PROMPT_TEMPLATE
    .replace('{{weekly_dataset_json}}', data.weekly_dataset_json);

  return {
    system: WEEKLY_REPORT_SYSTEM_PROMPT,
    user: userPrompt,
    messages: [
      { role: 'system', content: WEEKLY_REPORT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };
}

export const CATEGORY_CODES = [
  'hoş-geldin-bonusu',
  'ek-kazanç',
  'yüksek-oran',
  'freebet',
  'spesifik-bahis',
  'sadakat',
  'turnuva',
  'spor-bonus',
  'casino-bonus',
  'slot-bonus',
  'diğer',
] as const;

export const SENTIMENT_LABELS = [
  'positive',
  'neutral',
  'negative',
] as const;

export type CategoryCode = typeof CATEGORY_CODES[number];
export type SentimentLabel = typeof SENTIMENT_LABELS[number];

export interface ComprehensiveExtractionResult {
  valid_from: string | null;
  valid_to: string | null;
  date_confidence: number;
  date_reasoning: string;
  
  campaign_type: string;
  type_confidence: number;
  type_reasoning: string;
  
  conditions: {
    min_deposit: number | null;
    min_bet: number | null;
    max_bet: number | null;
    max_bonus: number | null;
    bonus_percentage: number | null;
    freebet_amount: number | null;
    cashback_percentage: number | null;
    turnover: string | null;
    required_actions: string[];
    excluded_games: string[];
    time_restrictions: string | null;
    membership_requirements: string[];
  };
  
  summary: string;
  key_points: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  risk_flags: string[];
  extraction_confidence: number;
}

export const COMPREHENSIVE_EXTRACTION_SYSTEM_PROMPT = `Sen Türk bahis/kumar platformlarındaki kampanya metinlerini analiz eden bir yapay zeka motorusun.
Amacın kampanyalardan yapılandırılmış veri çıkarmaktır.

Çıkarım kuralları:
1. Sadece kesin olarak belirtilen değerleri çıkar, tahmin yapma
2. Tarihleri ISO 8601 formatında çıkar (YYYY-MM-DD)
3. Türkiye saat dilimi (Europe/Istanbul) kullan
4. Çevrim şartı varsa "5x", "10x" formatında çıkar
5. Belirsiz bilgi için null kullan
6. Güven skoru 0-1 arası olsun

Kampanya Tipleri (campaign_type):
- "hoş-geldin-bonusu": Yeni üyelere özel bonus
- "depozit-bonusu": Yatırım bonusu
- "freebet": Bedava bahis
- "cashback": Kayıp iadesi/komisyon iadesi
- "oran-artışı": Enhanced odds/boosted odds
- "çekiliş-lottery": Çekiliş/piyango
- "spending-reward": Harcama ödülü/tiered bonus
- "ek-kazanç": Ek kazanç/fazladan kazanç
- "sadakat-vip": Sadakat/VIP programı
- "turnuva-yarışma": Tournament/leaderboard
- "spesifik-oyun": Belirli oyunlara özel
- "genel-promosyon": Genel promosyon
- "diğer": Hiçbirine uymuyorsa`;

export const COMPREHENSIVE_EXTRACTION_USER_PROMPT_TEMPLATE = `Aşağıdaki kampanya metnini analiz et ve yapılandırılmış veri çıkar.

Kampanya başlığı:
{{title}}

Kampanya metni:
{{body}}

Tarih ipucu (varsa):
{{raw_date_text}}

Çıktı formatı (sadece JSON):
{
  "valid_from": "YYYY-MM-DD" or null,
  "valid_to": "YYYY-MM-DD" or null,
  "date_confidence": 0.0-1.0,
  "date_reasoning": "Tarih çıkarım mantığı",
  
  "campaign_type": "campaign_type kodu",
  "type_confidence": 0.0-1.0,
  "type_reasoning": "Tip belirleme mantığı",
  
  "conditions": {
    "min_deposit": number or null,
    "min_bet": number or null,
    "max_bet": number or null,
    "max_bonus": number or null,
    "bonus_percentage": number or null,
    "freebet_amount": number or null,
    "cashback_percentage": number or null,
    "turnover": "Nx" or null,
    "required_actions": ["action1", "action2"],
    "excluded_games": ["game1", "game2"],
    "time_restrictions": "restriction or null",
    "membership_requirements": ["req1", "req2"]
  },
  
  "summary": "Kampanyanın 2-3 cümlelik özeti",
  "key_points": ["Önemli nokta 1", "Önemli nokta 2"],
  "sentiment": "positive|neutral|negative",
  "risk_flags": ["Risk 1", "Risk 2"],
  "extraction_confidence": 0.0-1.0
}

Önemli çıkarım kuralları:
- "100 TL ve üzeri yatırım" → min_deposit: 100
- "Minimum 500 TL'lik kupon" → min_bet: 500
- "Günlük 1000 TL'ye kadar bonus" → max_bonus: 1000
- "%25 ek kazanç" → bonus_percentage: 25
- "5x çevrim şartı" → turnover: "5x"
- "Bedava 50 TL bahis" → freebet_amount: 50
- "%10 cashback" → cashback_percentage: 10
- "Sadece yeni üyeler" → membership_requirements: ["yeni üye"]
- "At yarışı ve Spor bahisleri hariç" → excluded_games: ["At yarışı", "Spor bahisleri"]
- "00:00-23:59 arası geçerli" → time_restrictions: "Günlük 00:00-23:59"

Sadece JSON çıktı ver, yorum yazma.`;

export function buildComprehensiveExtractionPrompt(data: {
  title: string;
  body: string;
  rawDateText?: string | null;
}): {
  system: string;
  user: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
} {
  const userPrompt = COMPREHENSIVE_EXTRACTION_USER_PROMPT_TEMPLATE
    .replace('{{title}}', data.title || '')
    .replace('{{body}}', data.body || '')
    .replace('{{raw_date_text}}', data.rawDateText || 'Yok');

  return {
    system: COMPREHENSIVE_EXTRACTION_SYSTEM_PROMPT,
    user: userPrompt,
    messages: [
      { role: 'system', content: COMPREHENSIVE_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };
}
