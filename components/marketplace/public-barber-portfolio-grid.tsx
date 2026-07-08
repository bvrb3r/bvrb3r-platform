"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { BarberPortfolioAsset } from "@/types/domain";

export function PublicBarberPortfolioGrid({
  assets,
  barberName
}: {
  assets: BarberPortfolioAsset[];
  barberName: string;
}) {
  const [selectedAsset, setSelectedAsset] = useState<BarberPortfolioAsset | null>(null);

  if (!assets.length) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-5 text-sm leading-6 text-white/58">
        No work posted yet.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2" data-testid="barber-portfolio-grid">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-white/8 bg-white/[0.035] text-left"
            onClick={() => setSelectedAsset(asset)}
          >
            {asset.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.imageUrl}
                alt={asset.caption || `${barberName} portfolio work`}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex h-full items-center justify-center px-2 text-center text-xs text-white/48">
                Work preview
              </span>
            )}
            {asset.featured ? (
              <span className="absolute left-2 top-2 rounded-md border border-[#c4f24e]/30 bg-black/70 px-2 py-1 text-[10px] font-bold text-[#e4f9b8]">
                Featured
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {selectedAsset ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Portfolio image"
          data-testid="portfolio-lightbox"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close portfolio image"
            onClick={() => setSelectedAsset(null)}
          />
          <section className="relative z-10 grid max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-white/10 bg-[#080808] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white transition hover:border-[#c4f24e]/35 hover:text-[#e4f9b8]"
              aria-label="Close"
              onClick={() => setSelectedAsset(null)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {selectedAsset.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedAsset.imageUrl}
                alt={selectedAsset.caption || `${barberName} portfolio work`}
                className="max-h-[72vh] w-full object-contain bg-black"
              />
            ) : null}
            <div className="border-t border-white/8 p-4">
              <p className="text-sm font-semibold text-white">{selectedAsset.caption || "Fresh work from this barber."}</p>
              {selectedAsset.styleTagIds?.length ? (
                <p className="mt-2 text-xs text-white/50">{selectedAsset.styleTagIds.join(" - ")}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
