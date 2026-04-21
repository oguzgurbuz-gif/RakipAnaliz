'use client'

import * as React from 'react'

interface SliderProps {
  value: number[]
  onValueChange: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  className?: string
  disabled?: boolean
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className = '',
  disabled = false,
}: SliderProps) {
  const percentage = ((value[0] - min) / (max - min)) * 100

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const updateValue = (clientX: number) => {
      const x = clientX - rect.left
      const percent = Math.max(0, Math.min(1, x / rect.width))
      const rawValue = min + percent * (max - min)
      const steppedValue = Math.round(rawValue / step) * step
      const clampedValue = Math.max(min, Math.min(max, steppedValue))
      onValueChange([clampedValue])
    }
    
    updateValue(e.clientX)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateValue(moveEvent.clientX)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      className={`relative h-2 w-full cursor-pointer rounded-full bg-gray-200 ${disabled ? 'opacity-50' : ''} ${className}`}
      onMouseDown={handleMouseDown}
    >
      <div
        className="absolute h-full rounded-full bg-primary"
        style={{ width: `${percentage}%` }}
      />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-white shadow"
        style={{ left: `${percentage}%` }}
      />
    </div>
  )
}
