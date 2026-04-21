import { Page } from 'puppeteer';
import { BaseAdapter } from './base';
import { RawCampaignCard, NormalizedCampaignInput } from '../types';
import { buildFingerprint, buildRawFingerprint } from '../normalizers/fingerprint';
import { extractNumericValue, isLikelyRealCampaignTitle } from '../normalizers/text';
import { extractDatesFromCampaignText } from '../date-extraction/parser';

interface ApiCampaign {
  id: number;
  name: string;
  title_abbreviated: string;
  photo: string;
  mobile_photo: string;
  is_valid: boolean;
  status: string;
  create_date: string;
}

interface ApiCampaignDetail {
  slug: string;
  description: string;
  participation_requirement: string;
}

export class ForNalaAdapter extends BaseAdapter {
  private static readonly SITE_CODE = '4nala';
  private static readonly BASE_URL = 'https://www.4nala.com';
  private static readonly API_BASE = 'https://api.4nala.com';
  private static readonly API_LIST_URL = 'https://api.4nala.com/misc/api/campaign/list/';
  private static readonly API_DETAIL_URL = 'https://api.4nala.com/misc/api/campaign/detail/';
  public readonly campaignsUrl = 'https://www.4nala.com/kampanyalar';

  constructor() {
    super(ForNalaAdapter.SITE_CODE, ForNalaAdapter.BASE_URL);
  }

  canHandle(url: string): boolean {
    const hostname = new URL(url).hostname;
    return hostname.includes('4nala') || hostname.includes('4nala.com');
  }

  async extractCards(page: Page): Promise<RawCampaignCard[]> {
    const cards: RawCampaignCard[] = [];

    try {
      // Fetch campaign list from API
      const response = await fetch(ForNalaAdapter.API_LIST_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`API request failed: ${response.status} ${response.statusText}`);
        return cards;
      }

      const apiData = await response.json();
      
      // API returns array directly or wrapped in object
      const campaigns: ApiCampaign[] = Array.isArray(apiData) 
        ? apiData 
        : apiData.results ?? apiData.data ?? apiData.campaigns ?? [];

      // Filter only valid (active) campaigns
      const validCampaigns = campaigns.filter((c: ApiCampaign) => c.is_valid === true);

      if (validCampaigns.length === 0) {
        console.log('No valid (is_valid=true) campaigns found in API response');
        return cards;
      }

      // Process each valid campaign
      for (const campaign of validCampaigns) {
        try {
          // Fetch detail for additional data (description, participation_requirement)
          let detail: ApiCampaignDetail | null = null;
          try {
            const detailResponse = await fetch(
              `${ForNalaAdapter.API_DETAIL_URL}${campaign.id}/`,
              {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              }
            );

            if (detailResponse.ok) {
              detail = await detailResponse.json();
            }
          } catch (detailError) {
            console.warn(`Failed to fetch detail for campaign ${campaign.id}: ${detailError}`);
          }

          // Build campaign URL
          const campaignUrl = detail?.slug 
            ? `${ForNalaAdapter.BASE_URL}/kampanya/${detail.slug}`
            : `${ForNalaAdapter.BASE_URL}/kampanya/${campaign.id}`;

          // Extract description from HTML
          let description: string | null = null;
          if (detail?.description) {
            // Strip HTML tags for plain text description
            description = detail.description.replace(/<[^>]*>/g, '').trim().slice(0, 500);
          }

          // Extract requirements text from HTML
          let requirements: string | null = null;
          if (detail?.participation_requirement) {
            requirements = detail.participation_requirement.replace(/<[^>]*>/g, '').trim();
          }

          // Build image URL
          const imageUrl = campaign.mobile_photo || campaign.photo || null;

          // Extract numeric values from description/requirements for bonus amount
          let bonusAmount: string | null = null;
          let bonusPercentage: number | null = null;

          const textToSearch = `${description || ''} ${requirements || ''}`;
          
          // Try to find percentage (e.g., "100%", "%100", "yüzde 100")
          const percentMatch = textToSearch.match(/(\d+)\s*%/);
          if (percentMatch) {
            bonusPercentage = parseInt(percentMatch[1], 10);
          }

          // Try to find amount (e.g., "500 TL", "500₺", "500 TL bonus")
          const amountMatch = textToSearch.match(/(\d[\d.,]*)\s*(?:TL|₺|lira)/i);
          if (amountMatch) {
            bonusAmount = amountMatch[1].replace(',', '.');
          }

          const card: RawCampaignCard = {
            siteCode: this.siteCode,
            rawId: String(campaign.id),
            title: campaign.name || campaign.title_abbreviated || `Kampanya ${campaign.id}`,
            description,
            bonusAmount,
            bonusPercentage,
            minDeposit: null,
            maxBonus: null,
            code: null,
            url: campaignUrl,
            imageUrl: imageUrl ? this.normalizeImageUrl(imageUrl) : null,
            startDate: campaign.create_date || null,
            endDate: null,
            termsUrl: null,
            category: null,
            badge: campaign.status ? this.normalizeStatus(campaign.status) : null,
            isFeatured: false,
            isExclusive: false,
            rawData: {
              apiResponse: campaign,
              detailResponse: detail,
              requirements,
            },
            scrapedAt: new Date(),
          };

          cards.push(card);
        } catch (campaignError) {
          console.error(`Error processing campaign ${campaign.id}: ${campaignError}`);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch campaigns from API: ${error}`);
    }

    return cards;
  }

  private normalizeStatus(status: string): string | null {
    if (!status) return null;
    const lower = status.toLowerCase();
    if (lower.includes('yeni') || lower.includes('new')) return 'Yeni';
    if (lower.includes('hot') || lower.includes('popüler')) return 'Popüler';
    if (lower.includes('expired') || lower.includes('sona eren')) return 'Sona Erdi';
    return status;
  }

  private normalizeImageUrl(url: string): string | null {
    if (!url) return null;
    // If already absolute URL, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // If starts with // (protocol relative), add https:
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    // Otherwise prepend base URL
    return `${ForNalaAdapter.BASE_URL}${url}`;
  }

  normalize(card: RawCampaignCard): NormalizedCampaignInput | null {
    // Safety check: validate title quality
    if (!isLikelyRealCampaignTitle(card.title)) {
      return null;
    }

    const bonusAmount = extractNumericValue(card.bonusAmount);
    const bonusPercentage = card.bonusPercentage;
    const minDeposit = extractNumericValue(card.minDeposit);

    let bonusType: 'amount' | 'percentage' | 'freebet' | 'cashback' | 'mixed' = 'amount';
    if (bonusPercentage !== null && bonusPercentage > 0) {
      bonusType = 'percentage';
    }
    if (card.title.toLowerCase().includes('freebet') || card.title.toLowerCase().includes('free bet')) {
      bonusType = 'freebet';
    }
    if (card.title.toLowerCase().includes('cashback') || card.title.toLowerCase().includes('kesin iade')) {
      bonusType = 'cashback';
    }
    if (bonusAmount !== null && bonusPercentage !== null) {
      bonusType = 'mixed';
    }

    const dateResult = extractDatesFromCampaignText(card.title, card.description ?? null);
    const startDate = dateResult.startDate;
    const endDate = dateResult.endDate;

    const titleLower = card.title.toLowerCase();
    let visibility: 'visible' | 'hidden' | 'expired' | 'pending' = 'visible';
    if (endDate && endDate < new Date()) {
      visibility = 'expired';
    }
    if (startDate && startDate > new Date()) {
      visibility = 'pending';
    }
    if (titleLower.includes('hidden') || titleLower.includes('gizli')) {
      visibility = 'hidden';
    }

    const rawFingerprint = buildRawFingerprint({
      siteCode: card.siteCode,
      rawId: card.rawId,
      title: card.title,
      url: card.url,
    });

    const fingerprint = buildFingerprint({
      siteCode: card.siteCode,
      title: card.title,
      bonusType,
      bonusAmount,
      bonusPercentage,
      minDeposit,
      code: card.code,
      category: card.category,
    });

    return {
      siteCode: card.siteCode,
      fingerprint,
      title: card.title,
      description: card.description,
      bonusType,
      bonusAmount,
      bonusPercentage,
      minDeposit,
      maxBonus: extractNumericValue(card.maxBonus),
      code: card.code,
      url: card.url,
      imageUrl: card.imageUrl,
      startDate,
      endDate,
      termsUrl: card.termsUrl,
      category: card.category ?? 'genel',
      isFeatured: card.isFeatured,
      isExclusive: card.isExclusive,
      visibility,
      rawFingerprint,
    };
  }
}

export default ForNalaAdapter;
