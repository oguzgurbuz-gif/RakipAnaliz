'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchCampaigns } from '@/lib/api'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { getCampaignTypeLabel } from '@/lib/campaign-presentation'
import { getCategoryLabel } from '@/lib/category-labels'
import Link from 'next/link'
import { ExternalLink, Image as ImageIcon, X } from 'lucide-react'

export default function GalleryPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [selectedSite, setSelectedSite] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { limit: 100 }],
    queryFn: () => fetchCampaigns({ limit: 100 }),
  })

  const campaignsWithImages = (data?.data || []).filter((campaign) => {
    if (!campaign.primaryImage) return false
    if (selectedSite && campaign.site?.code !== selectedSite) return false
    if (selectedCategory && getCampaignTypeLabel(campaign) !== getCategoryLabel(selectedCategory)) return false
    if (selectedStatus && campaign.status !== selectedStatus) return false
    return true
  })
  const selectedCampaign = campaignsWithImages.find((campaign) => campaign.id === selectedCampaignId) || null
  const siteOptions = Array.from(new Set((data?.data || []).map((campaign) => campaign.site).filter(Boolean).map((site) => `${site!.code}|${site!.name}`)))
  const categoryOptions = Array.from(new Set((data?.data || []).map((campaign) => (campaign.metadata as any)?.ai_analysis?.campaign_type || campaign.category).filter(Boolean)))

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Görsel Galeri"
        description="Kampanya kreatiflerini site, tür ve durum bazında süzerek keşfedin."
        actions={<span className="text-sm text-muted-foreground">{campaignsWithImages.length} görsel</span>}
      >
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
          >
            <option value="">Tüm Siteler</option>
            {siteOptions.map((siteEntry) => {
              const [code, name] = siteEntry.split('|')
              return <option key={siteEntry} value={code}>{name}</option>
            })}
          </select>
          <select
            className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">Tüm Türler</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>{getCategoryLabel(category)}</option>
            ))}
          </select>
          <select
            className="rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="ended">Bitmiş</option>
            <option value="changed">Değişmiş</option>
            <option value="passive">Pasif</option>
          </select>
        </div>
      </PageHeader>

      <main className="p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : campaignsWithImages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            Görsel bulunamadı
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {campaignsWithImages.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => setSelectedCampaignId(campaign.id)}
                className="group aspect-square rounded-2xl overflow-hidden border bg-card hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40 transition-all"
              >
                <img
                  src={campaign.primaryImage!}
                  alt={campaign.title}
                  className="w-full h-full object-cover"
                />
                <div className="hidden p-3 text-left group-hover:block">
                  <div className="line-clamp-1 text-sm font-medium">{campaign.title}</div>
                  <div className="text-xs text-muted-foreground">{campaign.site?.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedCampaign && (
        <Modal isOpen={!!selectedCampaign} onClose={() => setSelectedCampaignId(null)} className="max-w-5xl p-0">
          <div className="relative max-w-4xl max-h-[90vh] mx-auto">
            <button
              onClick={() => setSelectedCampaignId(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="grid gap-0 overflow-hidden rounded-2xl bg-background lg:grid-cols-[1.4fr_0.9fr]">
              <div className="bg-muted/30 p-4">
                <img
                  src={selectedCampaign.primaryImage!}
                  alt="Campaign image"
                  className="max-h-[75vh] w-full rounded-xl object-contain"
                />
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <div className="text-sm text-muted-foreground">{selectedCampaign.site?.name}</div>
                  <h2 className="mt-1 text-xl font-semibold">{selectedCampaign.title}</h2>
                </div>
                <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Tür</div>
                    <div className="font-medium">{getCampaignTypeLabel(selectedCampaign)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Durum</div>
                    <div className="font-medium">{selectedCampaign.status}</div>
                  </div>
                </div>
                <Link href={`/campaigns/${selectedCampaign.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                  Kampanya detayına git
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
