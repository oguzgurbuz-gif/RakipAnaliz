'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { fetchCampaigns } from '@/lib/api'
import { Modal } from '@/components/ui/modal'
import { X } from 'lucide-react'
import Image from 'next/image'

export default function GalleryPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { limit: 100 }],
    queryFn: () => fetchCampaigns({ limit: 100 }),
  })

  const campaignsWithImages = data?.data.filter(c => c.primaryImage) || []

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Görsel Galeri</h1>
        <span className="text-sm text-muted-foreground ml-auto">
          {campaignsWithImages.length} görsel
        </span>
      </header>

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
                onClick={() => setSelectedImage(campaign.primaryImage)}
                className="aspect-square rounded-lg overflow-hidden border bg-card hover:ring-2 hover:ring-primary/50 transition-all"
              >
                <img
                  src={campaign.primaryImage!}
                  alt={campaign.title}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedImage && (
        <Modal isOpen={!!selectedImage} onClose={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] mx-auto">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={selectedImage}
              alt="Campaign image"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
