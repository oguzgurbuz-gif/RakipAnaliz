import 'dotenv/config';
import { getDb } from '../src/db';
import { extractComprehensiveCampaignData } from '../src/ai/comprehensive-extraction';
import { logger } from '../src/utils/logger';

async function reprocessAllCampaigns() {
  const db = getDb();
  
  const result = await db.query(`
    SELECT c.id, c.title, c.body, c.raw_date_text
    FROM campaigns c
    WHERE c.body IS NOT NULL 
    AND length(c.body) > 50
    ORDER BY c.created_at DESC
  `);
  
  const campaigns = result.rows;
  logger.info(`Found ${campaigns.length} campaigns to process`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const campaign of campaigns) {
    try {
      logger.info(`Processing campaign ${campaign.id}: ${campaign.title.substring(0, 50)}...`);
      
      const aiResult = await extractComprehensiveCampaignData({
        title: campaign.title,
        body: campaign.body,
        rawDateText: campaign.raw_date_text,
      });
      
      if (aiResult.success && aiResult.data) {
        const data = aiResult.data;
        
        // Build the AI analysis object
        const aiAnalysis = {
          campaign_type: data.campaign_type,
          type_confidence: data.type_confidence,
          type_reasoning: data.type_reasoning,
          extractedTags: {
            min_deposit: data.conditions.min_deposit,
            min_bet: data.conditions.min_bet,
            max_bonus: data.conditions.max_bonus,
            bonus_percentage: data.conditions.bonus_percentage,
            turnover: data.conditions.turnover,
            promo_code: data.conditions.promo_code,
            eligible_products: data.conditions.eligible_products,
            deposit_methods: data.conditions.deposit_methods,
            target_segment: data.conditions.target_segment,
            max_uses_per_user: data.conditions.max_uses_per_user,
            free_bet_amount: data.conditions.freebet_amount,
            freebet_amount: data.conditions.freebet_amount,
            cashback_percent: data.conditions.cashback_percentage,
            required_actions: data.conditions.required_actions,
            excluded_games: data.conditions.excluded_games,
            membership_requirements: data.conditions.membership_requirements,
            time_restrictions: data.conditions.time_restrictions,
          },
          conditions: {
            min_deposit: data.conditions.min_deposit,
            min_bet: data.conditions.min_bet,
            max_bet: data.conditions.max_bet,
            max_bonus: data.conditions.max_bonus,
            bonus_percentage: data.conditions.bonus_percentage,
            freebet_amount: data.conditions.freebet_amount,
            cashback_percentage: data.conditions.cashback_percentage,
            turnover: data.conditions.turnover,
            promo_code: data.conditions.promo_code,
            eligible_products: data.conditions.eligible_products,
            deposit_methods: data.conditions.deposit_methods,
            target_segment: data.conditions.target_segment,
            max_uses_per_user: data.conditions.max_uses_per_user,
            required_actions: data.conditions.required_actions,
            excluded_games: data.conditions.excluded_games,
            membership_requirements: data.conditions.membership_requirements,
            time_restrictions: data.conditions.time_restrictions,
          },
          keyPoints: data.key_points,
          key_points: data.key_points,
          riskFlags: data.risk_flags,
          risk_flags: data.risk_flags,
          sentiment: data.sentiment,
          summary: data.summary,
          extraction_confidence: data.extraction_confidence,
          date_confidence: data.date_confidence,
          date_reasoning: data.date_reasoning || null,
        };

        // Update using a single JSON parameter
        await db.query(`
          UPDATE campaigns SET
            metadata = jsonb_set(
              COALESCE(metadata, '{}'),
              '{ai_analysis}',
              $2::jsonb
            ),
            updated_at = NOW()
          WHERE id = $1
        `, [campaign.id, JSON.stringify(aiAnalysis)]);

        // Update dates separately
        if (data.valid_from || data.valid_to) {
          await db.query(`
            UPDATE campaigns SET
              valid_from = COALESCE($2::timestamptz, valid_from),
              valid_to = COALESCE($3::timestamptz, valid_to),
              updated_at = NOW()
            WHERE id = $1
          `, [campaign.id, data.valid_from, data.valid_to]);
        }
        
        successCount++;
        logger.info(`✓ Success: ${campaign.id}`);
      } else {
        failCount++;
        logger.warn(`✗ Failed: ${campaign.id} - ${aiResult.error}`);
      }
      
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      failCount++;
      logger.error(`✗ Error processing ${campaign.id}: ${error}`);
    }
  }
  
  logger.info(`\n========================================`);
  logger.info(`Completed: ${successCount} success, ${failCount} failed`);
  logger.info(`========================================`);
  
  process.exit(failCount > 0 ? 1 : 0);
}

reprocessAllCampaigns().catch(console.error);
