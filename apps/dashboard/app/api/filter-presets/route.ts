/**
 * FE-6 — Kayıtlı filtre preset'leri API taslağı.
 *
 * MEVCUT DURUM (faz 1, 2026-04-27):
 *   - Frontend localStorage'da tutuyor (anahtar: `rakip-analiz:filter-presets`).
 *   - Bu route MEVCUT KULLANILMIYOR. Kullanıcı/tenant tablomuz ve auth
 *     katmanımız yok; sunucu tarafında "kim için sakladığımız" belirsiz.
 *   - 501 Not Implemented döndürüyoruz, dashboard fallback'i bunu yutar
 *     ve localStorage davranışı bozulmaz.
 *
 * İLERIDE (faz 2 — auth katmanı geldikten sonra):
 *   - GET   /api/filter-presets        → kullanıcı id'sine göre tüm preset'ler
 *   - POST  /api/filter-presets        → { name, filters } body, oluşturur
 *   - DELETE /api/filter-presets?id=X  → preset siler
 *   - (opsiyonel) PATCH /api/filter-presets?id=X { name } → yeniden adlandırır
 *
 *   Şema önerisi (db/migrations/000XX_filter_presets.sql):
 *     CREATE TABLE filter_presets (
 *       id          BIGINT AUTO_INCREMENT PRIMARY KEY,
 *       user_id     VARCHAR(64) NOT NULL,    -- auth katmanı subject id
 *       scope       VARCHAR(64) NOT NULL,    -- 'campaigns' | 'competition' | ...
 *       name        VARCHAR(255) NOT NULL,
 *       filters     JSON NOT NULL,
 *       created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 *       updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 *       INDEX (user_id, scope)
 *     );
 *
 *   Sync stratejisi:
 *     - Client mount'ta GET /api/filter-presets → server preset'leri
 *     - localStorage'daki yerel preset'lerle merge (id collision yoksa
 *       client tarafta POST ile sunucuya yükle).
 *     - Sonraki tüm CRUD operasyonları hem localStorage hem API'ye yazsın
 *       (offline-first).
 *
 * TODO(FE-6 phase 2):
 *   - Bu dosyayı gerçekten implemente et (auth + DB)
 *   - `apps/dashboard/components/campaign/filter-presets.tsx` içine sync hook'u ekle
 *   - `db/migrations/` klasörüne migration ekle
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/response';

const NOT_IMPLEMENTED_BODY = {
  success: false,
  error: 'filter_presets_api_not_implemented',
  message:
    'Filter presetleri şimdilik yalnızca tarayıcı localStorage üzerinden saklanıyor. ' +
    'API sync auth katmanı eklendikten sonra etkinleştirilecek.',
  data: [],
};

export async function GET(request: NextRequest) {
  return NextResponse.json(NOT_IMPLEMENTED_BODY, {
    status: 501,
    headers: getCorsHeaders(request),
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json(NOT_IMPLEMENTED_BODY, {
    status: 501,
    headers: getCorsHeaders(request),
  });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json(NOT_IMPLEMENTED_BODY, {
    status: 501,
    headers: getCorsHeaders(request),
  });
}

export async function PATCH(request: NextRequest) {
  return NextResponse.json(NOT_IMPLEMENTED_BODY, {
    status: 501,
    headers: getCorsHeaders(request),
  });
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
